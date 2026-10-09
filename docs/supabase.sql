-- Derelict: Daily Derelict leaderboard schema for Supabase (Postgres).
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again; it replaces the functions and keeps existing scores.
--
-- Design:
--   * One row per player per day; only their best extracted score is kept.
--   * Names are unique: each player reserves one in the players table, and
--     the board always shows a player's current name.
--   * Hall of fame (v0.9): every finished run adds to the player's all-time
--     totals (player_totals), checked by submit_run; get_hall_of_fame ranks one
--     stat and get_hall_table returns every stat, sorted by the one you pick.
--   * v1.0: a weekly board (weekly_scores, same idea per ISO week), ghost
--     replays (the path of each player's best daily run, so others can race
--     it), and mining haulers on every board.
--   * The browser can't touch the table directly. It can only call the two
--     functions below, which check every submission (same limits as
--     src/core/leaderboard.ts) and never reveal other players' ids.

create table if not exists public.daily_scores (
  day          date        not null,
  player_id    uuid        not null,
  callsign     text        not null check (callsign ~ '^[A-Z0-9 _-]{3,16}$'),
  ship         text        not null check (ship in ('freighter', 'research')),
  crew         text        not null check (crew in ('salvager', 'robot')),
  score        integer     not null check (score between 0 and 1500),
  kills        integer     not null default 0 check (kills between 0 and 500),
  duration_ms  integer     not null check (duration_ms between 20000 and 7200000),
  attempts     integer     not null default 1,
  updated_at   timestamptz not null default now(),
  primary key (day, player_id)
);

create index if not exists daily_scores_board on public.daily_scores (day, score desc, duration_ms asc);

-- Lock the table down: row level security on, no policies, no grants.
alter table public.daily_scores enable row level security;
revoke all on public.daily_scores from anon, authenticated;

-- One name per player, and no two players share a name.
create table if not exists public.players (
  player_id   uuid        primary key,
  callsign    text        not null unique check (callsign ~ '^[A-Z0-9 _-]{3,16}$'),
  updated_at  timestamptz not null default now()
);

alter table public.players enable row level security;
revoke all on public.players from anon, authenticated;

-- Players who posted scores before names were unique keep their latest name
-- (first come, first served if two picked the same one).
insert into public.players (player_id, callsign)
select distinct on (player_id) player_id, callsign
from public.daily_scores
order by player_id, updated_at desc
on conflict do nothing;

-- Reserve a name. True if it's now yours, false if someone else has it.
create or replace function public.claim_callsign(p_player uuid, p_callsign text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := upper(btrim(regexp_replace(coalesce(p_callsign, ''), '\s+', ' ', 'g')));
begin
  if p_player is null then
    raise exception 'player id required' using errcode = '22023';
  end if;
  if v_name !~ '^[A-Z0-9 _-]{3,16}$' then
    raise exception 'invalid name' using errcode = '22023';
  end if;
  if exists (select 1 from players where callsign = v_name and player_id <> p_player) then
    return false;
  end if;
  insert into players (player_id, callsign) values (p_player, v_name)
  on conflict (player_id) do update set callsign = excluded.callsign, updated_at = now()
  where players.callsign is distinct from excluded.callsign;
  return true;
exception when unique_violation then
  -- Someone claimed it at the same moment.
  return false;
end;
$$;

-- Submit a finished Daily Derelict run. Returns your rank for the day.
create or replace function public.submit_score(
  p_day         date,
  p_seed        text,
  p_player      uuid,
  p_callsign    text,
  p_ship        text,
  p_crew        text,
  p_score       integer,
  p_kills       integer,
  p_duration_ms integer
)
returns table (rank bigint, total bigint, best integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today    date := (now() at time zone 'utc')::date;
  v_attempts integer;
begin
  -- Today's board only (yesterday allowed for runs that cross midnight UTC).
  if p_day is null or p_day not in (v_today, v_today - 1) then
    raise exception 'day is not open' using errcode = '22023';
  end if;
  if p_seed is distinct from 'daily-' || to_char(p_day, 'YYYY-MM-DD') then
    raise exception 'not a daily seed' using errcode = '22023';
  end if;
  if p_duration_ms is null or p_duration_ms < 20000 then
    raise exception 'run too short' using errcode = '22023';
  end if;
  if p_score::numeric / (p_duration_ms / 1000.0) > 12 then
    raise exception 'score too fast' using errcode = '22023';
  end if;
  if not claim_callsign(p_player, p_callsign) then
    raise exception 'name taken' using errcode = '22023';
  end if;

  insert into daily_scores as d (day, player_id, callsign, ship, crew, score, kills, duration_ms)
  values (p_day, p_player, upper(btrim(p_callsign)), p_ship, p_crew, p_score, p_kills, p_duration_ms)
  on conflict (day, player_id) do update set
    attempts    = d.attempts + 1,
    callsign    = excluded.callsign,
    ship        = excluded.ship,
    crew        = case when excluded.score > d.score then excluded.crew        else d.crew        end,
    kills       = case when excluded.score > d.score then excluded.kills       else d.kills       end,
    duration_ms = case when excluded.score > d.score then excluded.duration_ms else d.duration_ms end,
    score       = greatest(d.score, excluded.score),
    updated_at  = now()
  returning d.attempts into v_attempts;

  if v_attempts > 30 then
    -- Raising here rolls the update back.
    raise exception 'too many attempts today' using errcode = '22023';
  end if;

  return query
    select r.rank, r.total, r.score
    from (
      select s.player_id, s.score,
             rank() over (order by s.score desc, s.duration_ms asc) as rank,
             count(*) over () as total
      from daily_scores s
      where s.day = p_day
    ) r
    where r.player_id = p_player;
end;
$$;

-- Top of the board for a day, plus your own row if you're further down.
create or replace function public.get_daily_board(
  p_day    date,
  p_player uuid    default null,
  p_limit  integer default 20
)
returns table (rank bigint, callsign text, score integer, kills integer, duration_ms integer, crew text, is_you boolean)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select s.player_id, s.score, s.kills, s.duration_ms, s.crew,
           coalesce(p.callsign, s.callsign) as callsign,
           rank() over (order by s.score desc, s.duration_ms asc) as rank
    from daily_scores s
    left join players p on p.player_id = s.player_id
    where s.day = p_day
  )
  select r.rank, r.callsign, r.score, r.kills, r.duration_ms, r.crew,
         coalesce(r.player_id = p_player, false) as is_you
  from ranked r
  where r.rank <= least(greatest(coalesce(p_limit, 20), 1), 100)
     or r.player_id = p_player
  order by r.rank, r.callsign;
$$;

revoke all on function public.submit_score(date, text, uuid, text, text, text, integer, integer, integer) from public;
revoke all on function public.get_daily_board(date, uuid, integer) from public;
revoke all on function public.claim_callsign(uuid, text) from public;
grant execute on function public.submit_score(date, text, uuid, text, text, text, integer, integer, integer) to anon, authenticated;
grant execute on function public.get_daily_board(date, uuid, integer) to anon, authenticated;
grant execute on function public.claim_callsign(uuid, text) to anon, authenticated;


-- ============================================================ hall of fame (v0.9)

-- All-time totals per player. Only submit_run writes here.
create table if not exists public.player_totals (
  player_id       uuid        primary key,
  runs            integer     not null default 0,
  extractions     integer     not null default 0,
  salvage_banked  bigint      not null default 0,
  best_haul       integer     not null default 0,
  deepest_dive    integer     not null default 0,
  kills_total     integer     not null default 0,
  k_drone         integer     not null default 0,
  k_turret        integer     not null default 0,
  k_crawler       integer     not null default 0,
  k_spitter       integer     not null default 0,
  k_egg           integer     not null default 0,
  k_raider        integer     not null default 0,
  k_brute         integer     not null default 0,
  k_mimic         integer     not null default 0,
  k_stalker       integer     not null default 0,
  k_sapper        integer     not null default 0,
  k_sweeper       integer     not null default 0,
  elites          integer     not null default 0,
  bounties        integer     not null default 0,
  foreman_ms      integer,
  mother_ms       integer,
  captain_ms      integer,
  day             date,
  runs_today      integer     not null default 0,
  updated_at      timestamptz not null default now()
);

-- v1.0 added the mining hauler's hostiles and the Hollow Captain; older tables get the new columns here.
alter table public.player_totals add column if not exists k_sapper   integer not null default 0;
alter table public.player_totals add column if not exists k_sweeper  integer not null default 0;
alter table public.player_totals add column if not exists captain_ms integer;

alter table public.player_totals enable row level security;
revoke all on public.player_totals from anon, authenticated;

-- Adds one finished run to your totals. p_run is the run report as JSON:
--   { extracted, salvage, durationMs, depth, kills: { drone: 3, ... }, elites, bounties, boss, bossMs }
-- Same light checks as src/core/hallOfFame.ts.
create or replace function public.submit_run(p_player uuid, p_run jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today     date    := (now() at time zone 'utc')::date;
  v_extracted boolean := coalesce((p_run->>'extracted')::boolean, false);
  v_salvage   integer := coalesce((p_run->>'salvage')::integer, 0);
  v_ms        integer := coalesce((p_run->>'durationMs')::integer, 0);
  v_depth     integer := coalesce((p_run->>'depth')::integer, 1);
  v_elites    integer := coalesce((p_run->>'elites')::integer, 0);
  v_bounties  integer := coalesce((p_run->>'bounties')::integer, 0);
  v_boss      text    := p_run->>'boss';
  v_boss_ms   integer := (p_run->>'bossMs')::integer;
  v_kills     jsonb   := coalesce(p_run->'kills', '{}'::jsonb);
  v_kind      text;
  v_n         integer;
  v_total     integer := 0;
  v_runs      integer;
begin
  if p_player is null or not exists (select 1 from players where player_id = p_player) then
    raise exception 'pick a name first' using errcode = '22023';
  end if;
  if v_ms < 10000 or v_ms > 10800000 then
    raise exception 'run length out of range' using errcode = '22023';
  end if;
  if v_depth < 1 or v_depth > 5 then
    raise exception 'depth out of range' using errcode = '22023';
  end if;
  if v_salvage < 0 or v_salvage > 1500 * v_depth or v_salvage::numeric / (v_ms / 1000.0) > 12 then
    raise exception 'salvage out of range' using errcode = '22023';
  end if;
  for v_kind, v_n in select key, value::integer from jsonb_each_text(v_kills) loop
    if v_kind not in ('drone', 'turret', 'crawler', 'spitter', 'egg', 'raider', 'brute', 'mimic', 'stalker', 'sapper', 'sweeper') then
      raise exception 'unknown hostile %', v_kind using errcode = '22023';
    end if;
    if v_n < 0 or v_n > 400 then
      raise exception 'kills out of range' using errcode = '22023';
    end if;
    v_total := v_total + v_n;
  end loop;
  if v_total > (v_ms / 1000) * 2 + 5 then
    raise exception 'kills too fast' using errcode = '22023';
  end if;
  if v_elites < 0 or v_elites > v_total or v_bounties < 0 or v_bounties > v_depth then
    raise exception 'elites or bounties out of range' using errcode = '22023';
  end if;
  if v_boss is not null and (v_boss not in ('foreman', 'mother', 'captain') or v_boss_ms is null or v_boss_ms < 10000 or v_boss_ms > v_ms) then
    raise exception 'boss time out of range' using errcode = '22023';
  end if;

  insert into player_totals as t (player_id, day, runs_today)
  values (p_player, v_today, 0)
  on conflict (player_id) do nothing;

  update player_totals t set
    runs           = t.runs + 1,
    extractions    = t.extractions + case when v_extracted then 1 else 0 end,
    salvage_banked = t.salvage_banked + case when v_extracted then v_salvage else 0 end,
    best_haul      = greatest(t.best_haul, case when v_extracted then v_salvage else 0 end),
    deepest_dive   = greatest(t.deepest_dive, case when v_extracted then v_depth else 0 end),
    kills_total    = t.kills_total + v_total,
    k_drone        = t.k_drone   + coalesce((v_kills->>'drone')::integer, 0),
    k_turret       = t.k_turret  + coalesce((v_kills->>'turret')::integer, 0),
    k_crawler      = t.k_crawler + coalesce((v_kills->>'crawler')::integer, 0),
    k_spitter      = t.k_spitter + coalesce((v_kills->>'spitter')::integer, 0),
    k_egg          = t.k_egg     + coalesce((v_kills->>'egg')::integer, 0),
    k_raider       = t.k_raider  + coalesce((v_kills->>'raider')::integer, 0),
    k_brute        = t.k_brute   + coalesce((v_kills->>'brute')::integer, 0),
    k_mimic        = t.k_mimic   + coalesce((v_kills->>'mimic')::integer, 0),
    k_stalker      = t.k_stalker + coalesce((v_kills->>'stalker')::integer, 0),
    k_sapper       = t.k_sapper  + coalesce((v_kills->>'sapper')::integer, 0),
    k_sweeper      = t.k_sweeper + coalesce((v_kills->>'sweeper')::integer, 0),
    elites         = t.elites + v_elites,
    bounties       = t.bounties + v_bounties,
    foreman_ms     = case when v_extracted and v_boss = 'foreman' then least(coalesce(t.foreman_ms, v_boss_ms), v_boss_ms) else t.foreman_ms end,
    mother_ms      = case when v_extracted and v_boss = 'mother'  then least(coalesce(t.mother_ms,  v_boss_ms), v_boss_ms) else t.mother_ms  end,
    captain_ms     = case when v_extracted and v_boss = 'captain' then least(coalesce(t.captain_ms, v_boss_ms), v_boss_ms) else t.captain_ms end,
    runs_today     = case when t.day = v_today then t.runs_today + 1 else 1 end,
    day            = v_today,
    updated_at     = now()
  where t.player_id = p_player
  returning t.runs_today into v_runs;

  if v_runs > 200 then
    -- Raising rolls the whole update back.
    raise exception 'too many runs today' using errcode = '22023';
  end if;
end;
$$;

-- One hall of fame board: the top players plus your own row. Boss boards rank
-- the fastest time; the streak board is worked out from your daily scores.
create or replace function public.get_hall_of_fame(
  p_board  text,
  p_player uuid    default null,
  p_limit  integer default 20
)
returns table (rank bigint, callsign text, value bigint, is_you boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fastest boolean := p_board in ('foreman', 'mother', 'captain');
begin
  if p_board not in ('banked', 'haul', 'extractions', 'depth', 'streak', 'kills', 'elite', 'bounty',
                     'foreman', 'mother', 'captain', 'drone', 'turret', 'crawler', 'spitter', 'egg', 'raider', 'brute', 'mimic', 'stalker',
                     'sapper', 'sweeper') then
    raise exception 'unknown board' using errcode = '22023';
  end if;

  return query
  with vals as (
    select t.player_id,
      (case p_board
        when 'banked'      then t.salvage_banked
        when 'haul'        then t.best_haul
        when 'extractions' then t.extractions
        when 'depth'       then t.deepest_dive
        when 'kills'       then t.kills_total
        when 'elite'       then t.elites
        when 'bounty'      then t.bounties
        when 'foreman'     then t.foreman_ms
        when 'mother'      then t.mother_ms
        when 'captain'     then t.captain_ms
        when 'drone'       then t.k_drone
        when 'turret'      then t.k_turret
        when 'crawler'     then t.k_crawler
        when 'spitter'     then t.k_spitter
        when 'egg'         then t.k_egg
        when 'raider'      then t.k_raider
        when 'brute'       then t.k_brute
        when 'mimic'       then t.k_mimic
        when 'stalker'     then t.k_stalker
        when 'sapper'      then t.k_sapper
        when 'sweeper'     then t.k_sweeper
      end)::bigint as value
    from player_totals t
    where p_board <> 'streak'
    union all
    -- Longest run of consecutive days with a Daily Derelict score.
    select g.player_id, max(g.len)::bigint
    from (
      select d.player_id, count(*) as len
      from (
        select s.player_id, s.day - (row_number() over (partition by s.player_id order by s.day))::integer as grp
        from daily_scores s
      ) d
      group by d.player_id, d.grp
    ) g
    where p_board = 'streak'
    group by g.player_id
  ),
  ranked as (
    select v.player_id, v.value,
           rank() over (order by case when v_fastest then v.value else -v.value end) as rank
    from vals v
    where v.value is not null and v.value > 0
  )
  select r.rank, p.callsign, r.value, coalesce(r.player_id = p_player, false)
  from ranked r
  join players p on p.player_id = r.player_id
  where r.rank <= least(greatest(coalesce(p_limit, 20), 1), 100)
     or r.player_id = p_player
  order by r.rank, p.callsign;
end;
$$;

revoke all on function public.submit_run(uuid, jsonb) from public;
revoke all on function public.get_hall_of_fame(text, uuid, integer) from public;
grant execute on function public.submit_run(uuid, jsonb) to anon, authenticated;
grant execute on function public.get_hall_of_fame(text, uuid, integer) to anon, authenticated;

-- The RANKS table: every player's all-time stats in one row each, ranked by
-- the column you sort on (fastest first for boss times). Players with nothing
-- in that column are left out. Top p_limit rows plus your own.
drop function if exists public.get_hall_table(text, uuid, integer);
create or replace function public.get_hall_table(
  p_sort   text    default 'banked',
  p_player uuid    default null,
  p_limit  integer default 25
)
returns table (
  rank bigint, callsign text, is_you boolean,
  banked bigint, haul bigint, extractions bigint, depth bigint, streak bigint,
  foreman bigint, mother bigint, captain bigint, kills bigint, elite bigint, bounty bigint,
  drone bigint, turret bigint, mimic bigint, sapper bigint, sweeper bigint,
  crawler bigint, stalker bigint, spitter bigint, egg bigint, raider bigint, brute bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sort    text    := coalesce(p_sort, 'banked');
  v_fastest boolean := coalesce(p_sort, 'banked') in ('foreman', 'mother', 'captain');
begin
  if v_sort not in ('banked', 'haul', 'extractions', 'depth', 'streak', 'kills', 'elite', 'bounty',
                    'foreman', 'mother', 'captain', 'drone', 'turret', 'crawler', 'spitter', 'egg', 'raider', 'brute', 'mimic', 'stalker',
                     'sapper', 'sweeper') then
    raise exception 'unknown board' using errcode = '22023';
  end if;

  return query
  with streaks as (
    -- Longest run of consecutive days with a Daily Derelict score.
    select g.player_id, max(g.len)::bigint as streak
    from (
      select d.player_id, count(*) as len
      from (
        select s.player_id, s.day - (row_number() over (partition by s.player_id order by s.day))::integer as grp
        from daily_scores s
      ) d
      group by d.player_id, d.grp
    ) g
    group by g.player_id
  ),
  stats as (
    select p.player_id, p.callsign,
      coalesce(t.salvage_banked, 0)::bigint as banked,
      coalesce(t.best_haul, 0)::bigint      as haul,
      coalesce(t.extractions, 0)::bigint    as extractions,
      coalesce(t.deepest_dive, 0)::bigint   as depth,
      coalesce(st.streak, 0)::bigint        as streak,
      t.foreman_ms::bigint                  as foreman,
      t.mother_ms::bigint                   as mother,
      t.captain_ms::bigint                  as captain,
      coalesce(t.kills_total, 0)::bigint    as kills,
      coalesce(t.elites, 0)::bigint         as elite,
      coalesce(t.bounties, 0)::bigint       as bounty,
      coalesce(t.k_drone, 0)::bigint        as drone,
      coalesce(t.k_turret, 0)::bigint       as turret,
      coalesce(t.k_mimic, 0)::bigint        as mimic,
      coalesce(t.k_sapper, 0)::bigint       as sapper,
      coalesce(t.k_sweeper, 0)::bigint      as sweeper,
      coalesce(t.k_crawler, 0)::bigint      as crawler,
      coalesce(t.k_stalker, 0)::bigint      as stalker,
      coalesce(t.k_spitter, 0)::bigint      as spitter,
      coalesce(t.k_egg, 0)::bigint          as egg,
      coalesce(t.k_raider, 0)::bigint       as raider,
      coalesce(t.k_brute, 0)::bigint        as brute
    from players p
    left join player_totals t on t.player_id = p.player_id
    left join streaks st on st.player_id = p.player_id
    where t.player_id is not null or st.player_id is not null
  ),
  keyed as (
    select s.*,
      (case v_sort
        when 'banked' then s.banked when 'haul' then s.haul when 'extractions' then s.extractions
        when 'depth' then s.depth when 'streak' then s.streak when 'foreman' then s.foreman
        when 'mother' then s.mother when 'captain' then s.captain when 'kills' then s.kills when 'elite' then s.elite
        when 'bounty' then s.bounty when 'drone' then s.drone when 'turret' then s.turret
        when 'mimic' then s.mimic when 'crawler' then s.crawler when 'stalker' then s.stalker
        when 'spitter' then s.spitter when 'egg' then s.egg when 'raider' then s.raider
        when 'brute' then s.brute when 'sapper' then s.sapper when 'sweeper' then s.sweeper
      end) as sort_value
    from stats s
  ),
  ranked as (
    select k.*, rank() over (order by case when v_fastest then k.sort_value else -k.sort_value end) as rnk
    from keyed k
    where k.sort_value is not null and k.sort_value > 0
  )
  select r.rnk, r.callsign, coalesce(r.player_id = p_player, false),
         r.banked, r.haul, r.extractions, r.depth, r.streak, r.foreman, r.mother, r.captain,
         r.kills, r.elite, r.bounty, r.drone, r.turret, r.mimic, r.sapper, r.sweeper,
         r.crawler, r.stalker, r.spitter, r.egg, r.raider, r.brute
  from ranked r
  where r.rnk <= least(greatest(coalesce(p_limit, 25), 1), 100)
     or r.player_id = p_player
  order by r.rnk, r.callsign;
end;
$$;

revoke all on function public.get_hall_table(text, uuid, integer) from public;
grant execute on function public.get_hall_table(text, uuid, integer) to anon, authenticated;

-- ============================================================ v1.0: mining haulers, weekly board, ghosts

-- Mining haulers can be the Daily Derelict from 2026-10-12.
alter table public.daily_scores drop constraint if exists daily_scores_ship_check;
alter table public.daily_scores add constraint daily_scores_ship_check check (ship in ('freighter', 'research', 'mining'));

-- Ghosts: the path of each player's best daily run (see src/core/ghost.ts).
alter table public.daily_scores add column if not exists ghost text;

-- Stores the ghost for your best run of the day. Only accepted when the score
-- and time match the run that's on the board, so it can't replace a better one.
create or replace function public.submit_ghost(
  p_day         date,
  p_player      uuid,
  p_score       integer,
  p_duration_ms integer,
  p_ghost       text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  if p_ghost is null or length(p_ghost) > 24000 or p_ghost !~ '^G1\.[0-9]+\.[A-Za-z0-9_-]+$' then
    raise exception 'invalid ghost' using errcode = '22023';
  end if;
  update daily_scores d set ghost = p_ghost
  where d.day = p_day and d.player_id = p_player and d.score = p_score and d.duration_ms = p_duration_ms;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- The ghost to race on a day: the best-ranked run that has one.
create or replace function public.get_daily_ghost(p_day date)
returns table (callsign text, score integer, duration_ms integer, ghost text)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(p.callsign, s.callsign), s.score, s.duration_ms, s.ghost
  from daily_scores s
  left join players p on p.player_id = s.player_id
  where s.day = p_day and s.ghost is not null
  order by s.score desc, s.duration_ms asc
  limit 1;
$$;

-- The Weekly Challenge board: one row per player per ISO week, best run kept.
create table if not exists public.weekly_scores (
  week         text        not null check (week ~ '^[0-9]{4}-W[0-9]{2}$'),
  player_id    uuid        not null,
  callsign     text        not null check (callsign ~ '^[A-Z0-9 _-]{3,16}$'),
  ship         text        not null check (ship in ('freighter', 'research', 'mining')),
  crew         text        not null check (crew in ('salvager', 'robot')),
  score        integer     not null check (score between 0 and 2500),
  kills        integer     not null default 0 check (kills between 0 and 500),
  duration_ms  integer     not null check (duration_ms between 20000 and 7200000),
  attempts     integer     not null default 1,
  updated_at   timestamptz not null default now(),
  primary key (week, player_id)
);

create index if not exists weekly_scores_board on public.weekly_scores (week, score desc, duration_ms asc);
alter table public.weekly_scores enable row level security;
revoke all on public.weekly_scores from anon, authenticated;

-- Submit a finished weekly run. Returns your rank for the week.
create or replace function public.submit_weekly(
  p_week        text,
  p_seed        text,
  p_player      uuid,
  p_callsign    text,
  p_ship        text,
  p_crew        text,
  p_score       integer,
  p_kills       integer,
  p_duration_ms integer
)
returns table (rank bigint, total bigint, best integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now      timestamptz := now() at time zone 'utc';
  v_attempts integer;
begin
  -- This week (or last week, for runs that cross midnight on Sunday).
  if p_week is null or p_week not in (to_char(v_now, 'IYYY-"W"IW'), to_char(v_now - interval '1 day', 'IYYY-"W"IW')) then
    raise exception 'week is not open' using errcode = '22023';
  end if;
  if p_seed is distinct from 'weekly-' || p_week then
    raise exception 'not a weekly seed' using errcode = '22023';
  end if;
  if p_duration_ms is null or p_duration_ms < 20000 then
    raise exception 'run too short' using errcode = '22023';
  end if;
  -- Mutators can make salvage richer than a normal run.
  if p_score::numeric / (p_duration_ms / 1000.0) > 18 then
    raise exception 'score too fast' using errcode = '22023';
  end if;
  if not claim_callsign(p_player, p_callsign) then
    raise exception 'name taken' using errcode = '22023';
  end if;

  insert into weekly_scores as w (week, player_id, callsign, ship, crew, score, kills, duration_ms)
  values (p_week, p_player, upper(btrim(p_callsign)), p_ship, p_crew, p_score, p_kills, p_duration_ms)
  on conflict (week, player_id) do update set
    attempts    = w.attempts + 1,
    callsign    = excluded.callsign,
    crew        = case when excluded.score > w.score then excluded.crew        else w.crew        end,
    kills       = case when excluded.score > w.score then excluded.kills       else w.kills       end,
    duration_ms = case when excluded.score > w.score then excluded.duration_ms else w.duration_ms end,
    score       = greatest(w.score, excluded.score),
    updated_at  = now()
  returning w.attempts into v_attempts;

  if v_attempts > 60 then
    raise exception 'too many attempts this week' using errcode = '22023';
  end if;

  return query
    select r.rank, r.total, r.score
    from (
      select s.player_id, s.score,
             rank() over (order by s.score desc, s.duration_ms asc) as rank,
             count(*) over () as total
      from weekly_scores s
      where s.week = p_week
    ) r
    where r.player_id = p_player;
end;
$$;

-- Top of the weekly board, plus your own row if you're further down.
create or replace function public.get_weekly_board(
  p_week   text,
  p_player uuid    default null,
  p_limit  integer default 10
)
returns table (rank bigint, callsign text, score integer, kills integer, duration_ms integer, crew text, is_you boolean)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select s.player_id, s.score, s.kills, s.duration_ms, s.crew,
           coalesce(p.callsign, s.callsign) as callsign,
           rank() over (order by s.score desc, s.duration_ms asc) as rank
    from weekly_scores s
    left join players p on p.player_id = s.player_id
    where s.week = p_week
  )
  select r.rank, r.callsign, r.score, r.kills, r.duration_ms, r.crew,
         coalesce(r.player_id = p_player, false) as is_you
  from ranked r
  where r.rank <= least(greatest(coalesce(p_limit, 10), 1), 100)
     or r.player_id = p_player
  order by r.rank, r.callsign;
$$;

revoke all on function public.submit_ghost(date, uuid, integer, integer, text) from public;
revoke all on function public.get_daily_ghost(date) from public;
revoke all on function public.submit_weekly(text, text, uuid, text, text, text, integer, integer, integer) from public;
revoke all on function public.get_weekly_board(text, uuid, integer) from public;
grant execute on function public.submit_ghost(date, uuid, integer, integer, text) to anon, authenticated;
grant execute on function public.get_daily_ghost(date) to anon, authenticated;
grant execute on function public.submit_weekly(text, text, uuid, text, text, text, integer, integer, integer) to anon, authenticated;
grant execute on function public.get_weekly_board(text, uuid, integer) to anon, authenticated;
