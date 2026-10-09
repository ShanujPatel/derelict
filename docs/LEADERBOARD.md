# Setting up the Daily Derelict leaderboard

The game works without this; the DAILY tab just shows your personal best. These steps switch on the shared online board. They take about 10 minutes, and Supabase's free tier is plenty.

## 1. Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com) (GitHub sign-in is fine).
2. **New project**: name it `derelict`, pick the region nearest your players (e.g. London), and set a strong database password. You won't need the password for this.
3. Wait a minute or two for the project to start.

## 2. Create the table and functions

1. In the project, open **SQL Editor → New query**.
2. Paste the whole of [`docs/supabase.sql`](supabase.sql) and click **Run**.
3. You should see *Success. No rows returned*. Running it again later is safe and keeps existing scores.

This creates seven locked-down tables (daily scores, weekly scores, player names, all-time totals, and clans, clan members and clan scores) and the functions the game calls. Browsers can't read or write the tables directly: they can only call `submit_score` (which checks every daily run), `claim_callsign` (which reserves a unique name), `get_daily_board` (which never reveals player ids), `submit_run` (which adds a finished run to your all-time totals) `get_hall_of_fame` (which ranks one all-time stat), `get_hall_table` (the RANKS table: every stat for each player, sorted by the column you pick), `submit_weekly` and `get_weekly_board` (the Weekly Challenge board), `submit_ghost` and `get_daily_ghost` (the path of each player's best daily run, for others to race), and the clan functions: `create_clan`, `join_clan`, `leave_clan`, `manage_clan` (leader tools), `get_my_clan`, `get_clan_board`, `browse_clans` and `get_clan_tags`.

**Updating from an older version:** paste and run the latest `docs/supabase.sql` again whenever it changes. v0.5.1 added unique names; until you re-run it, the game can't reserve names and posting a score fails. v0.9 added the hall of fame; until you re-run it, the hall of fame shows an error and runs aren't counted (the daily board still works). **v1.0** added the weekly board, ghosts and mining haulers: until you re-run it, mining-hauler dailies (from 12 October 2026) can't be posted, the weekly board shows an error, and runs with sappers, sweepers or the Hollow Captain aren't counted in the hall of fame.

## 3. Copy the project URL and publishable key

Click **Connect** at the top of the project (or open **Project Settings → API Keys**) and copy:

- the **Project URL**, like `https://abcdefgh.supabase.co`
- the **publishable key**, starting `sb_publishable_` (an older project may show an `anon` key starting `eyJ`, which also works)

The publishable key is designed to be public. **Never** use the secret or `service_role` key in the game.

## 4. Give them to GitHub

In your repository go to **Settings → Secrets and variables → Actions → Variables** and add two **repository variables**:

| Name | Value |
|---|---|
| `SUPABASE_URL` | your Project URL |
| `SUPABASE_KEY` | your publishable key |

Then push any commit, or open the **Actions** tab, pick the latest CI run and choose **Re-run all jobs**. The DAILY tab on the live site will now show the board.

## Trying it locally

Copy `.env.example` to `.env.local`, fill in the same two values, and run `npm run dev`. `.env.local` is git-ignored.

## How scores are protected

Checks happen in the browser (`src/core/leaderboard.ts`) and again in the database (`docs/supabase.sql`), so a modified browser can't skip them:

- only today's (or, just after midnight UTC, yesterday's) Daily Derelict seed is accepted
- score between 0 and 1,500 salvage, run length at least 20 seconds, and no more than 12 salvage per second
- names are 3–16 letters, numbers, spaces, `-` or `_`, and unique: each player reserves one, nobody can post under a name someone else holds, and the board always shows a player's current name
- one row per player per day keeps only their best; at most 30 submissions a day
- weekly runs: this ISO week's seed only (or last week's, just after midnight on Sunday), at least 20 seconds, at most 2,500 salvage and 18 per second (mutators make salvage richer), 60 submissions a week
- ghosts: at most 24,000 characters in the game's own format, and only stored against the exact score and time already on the daily board, so a ghost can't replace a better run
- clans: names 3–20 letters, numbers, spaces, `_ - '` and unique ignoring case; tags 2–4 letters or numbers and unique; a short blocked-words list for both; one clan per player, 15 members, a day's wait after leaving; only the leader can kick, hand over, switch open or invite only, or make a new code; only salvage from runs posted while you're a member counts (through `submit_run`, so the hall of fame limits below apply)
- hall of fame runs need a claimed name and must be 10 seconds to 3 hours long, depth 1–5, at most 1,500 salvage per depth and 12 per second, at most 400 kills of any one type and 2 kills per second overall, no more elites than kills, at most one bounty per deck, and a boss time inside the run; at most 200 runs per player a day

It's a light, showcase-level defence: a determined cheater could still post a believable fake score. The SQL is tested against a real Postgres engine (PGlite) in `tests/supabase-sql.test.ts`, so it runs in CI on every push.

## Good to know

- Free Supabase projects pause after about a week with no activity. If the board says it's unreachable, open the Supabase dashboard and restore the project.
- To wipe a week's board, run `delete from weekly_scores where week = '2026-W41';`.
- To rename or remove a clan: `update clans set name = 'New Name', tag = 'NEW' where tag = 'OLD';` or `delete from clans where tag = 'OLD';` (its members and scores go with it).
- To wipe the hall of fame, run `delete from player_totals;` in the SQL Editor.
- To wipe a day's board, run `delete from daily_scores where day = '2026-10-09';` in the SQL Editor.
