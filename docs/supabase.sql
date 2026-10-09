-- Derelict: Daily Derelict leaderboard schema for Supabase (Postgres).
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run again; it replaces the functions and keeps existing scores.
--
-- Design:
--   * One row per player per day; only their best extracted score is kept.
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
    select s.*, rank() over (order by s.score desc, s.duration_ms asc) as rank
    from daily_scores s
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
grant execute on function public.submit_score(date, text, uuid, text, text, text, integer, integer, integer) to anon, authenticated;
grant execute on function public.get_daily_board(date, uuid, integer) to anon, authenticated;
