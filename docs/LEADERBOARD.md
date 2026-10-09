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

This creates one locked-down table and two functions. Browsers can't read or write the table directly: they can only call `submit_score` (which checks every run) and `get_daily_board` (which never reveals player ids).

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
- callsigns are 3–16 letters, numbers, spaces, `-` or `_`
- one row per player per day keeps only their best; at most 30 submissions a day

It's a light, showcase-level defence: a determined cheater could still post a believable fake score. The SQL is tested against a real Postgres engine (PGlite) in `tests/supabase-sql.test.ts`, so it runs in CI on every push.

## Good to know

- Free Supabase projects pause after about a week with no activity. If the board says it's unreachable, open the Supabase dashboard and restore the project.
- To wipe a day's board, run `delete from daily_scores where day = '2026-10-09';` in the SQL Editor.
