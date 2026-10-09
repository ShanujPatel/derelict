-- Derelict: Daily Derelict leaderboard schema for Supabase (Postgres).
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again; it replaces the functions and keeps existing scores.
--
-- Design:
--   * One row per player per day; only their best extracted score is kept.
--   * Names are unique: each player reserves one in the players table, and
--     the board always shows a player's current name.
--   * Hall of fame (v0.9): every finished run adds to the player's all-time
--     totals (player_totals), checked by submit_run; get_hall_of_fame ranks them.
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
  elites          integer     not null default 0,
  bounties        integer     not null default 0,
  foreman_ms      integer,
  mother_ms       integer,
  day             date,
  runs_today      integer     not null default 0,
  updated_at      timestamptz not null default now()
);

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
    if v_kind not in ('drone', 'turret', 'crawler', 'spitter', 'egg', 'raider', 'brute', 'mimic', 'stalker') then
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
  if v_boss is not null and (v_boss not in ('foreman', 'mother') or v_boss_ms is null or v_boss_ms < 10000 or v_boss_ms > v_ms) then
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
    elites         = t.elites + v_elites,
    bounties       = t.bounties + v_bounties,
    foreman_ms     = case when v_extracted and v_boss = 'foreman' then least(coalesce(t.foreman_ms, v_boss_ms), v_boss_ms) else t.foreman_ms end,
    mother_ms      = case when v_extracted and v_boss = 'mother'  then least(coalesce(t.mother_ms,  v_boss_ms), v_boss_ms) else t.mother_ms  end,
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
  v_fastest boolean := p_board in ('foreman', 'mother');
begin
  if p_board not in ('banked', 'haul', 'extractions', 'depth', 'streak', 'kills', 'elite', 'bounty',
                     'foreman', 'mother', 'drone', 'turret', 'crawler', 'spitter', 'egg', 'raider', 'brute', 'mimic', 'stalker') then
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
        when 'drone'       then t.k_drone
        when 'turret'      then t.k_turret
        when 'crawler'     then t.k_crawler
        when 'spitter'     then t.k_spitter
        when 'egg'         then t.k_egg
        when 'raider'      then t.k_raider
        when 'brute'       then t.k_brute
        when 'mimic'       then t.k_mimic
        when 'stalker'     then t.k_stalker
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
