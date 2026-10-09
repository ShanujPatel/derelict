// Runs docs/supabase.sql against a real Postgres engine (PGlite, in-process)
// so the leaderboard rules are tested in CI without a Supabase account.
import { PGlite } from '@electric-sql/pglite';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import SQL from '../docs/supabase.sql?raw';
const today = new Date().toISOString().slice(0, 10);
const P1 = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';

let db: PGlite;

type Run = { day?: string; seed?: string; player?: string; callsign?: string; score?: number; durationMs?: number };

const submit = async (r: Run = {}) => {
  const day = r.day ?? today;
  const res = await db.query<{ rank: number; total: number; best: number }>(
    'select * from submit_score($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [day, r.seed ?? `daily-${day}`, r.player ?? P1, r.callsign ?? 'nova', 'freighter', 'salvager', r.score ?? 200, 5, r.durationMs ?? 180_000],
  );
  return res.rows[0];
};

beforeAll(async () => {
  db = new PGlite();
  // Supabase's built-in API roles.
  await db.exec(`create role anon nologin; create role authenticated nologin;`);
  await db.exec(SQL);
  // Running the script twice must be harmless.
  await db.exec(SQL);
}, 60_000);

beforeEach(async () => {
  await db.exec('reset role; delete from daily_scores;');
  await db.exec('set role anon');
});

describe('supabase.sql', () => {
  it('accepts a run and returns the rank', async () => {
    const r = await submit();
    expect(Number(r.rank)).toBe(1);
    expect(Number(r.total)).toBe(1);
    expect(r.best).toBe(200);
  });

  it('keeps only the best score per player per day', async () => {
    await submit({ score: 200 });
    const lower = await submit({ score: 120 });
    expect(lower.best).toBe(200);
    const higher = await submit({ score: 260 });
    expect(higher.best).toBe(260);
  });

  it('ranks by score, then faster time', async () => {
    await submit({ player: P1, score: 300, durationMs: 200_000 });
    await submit({ player: P2, callsign: 'ace', score: 300, durationMs: 150_000 });
    const board = await db.query<{ rank: number; callsign: string; is_you: boolean }>(
      'select * from get_daily_board($1, $2, 20)',
      [today, P1],
    );
    expect(board.rows.map((r) => [Number(r.rank), r.callsign, r.is_you])).toEqual([
      [1, 'ACE', false],
      [2, 'NOVA', true],
    ]);
  });

  it.each([
    [{ day: '2020-01-01' }, 'day is not open'],
    [{ seed: 'HULK42' }, 'not a daily seed'],
    [{ durationMs: 5_000 }, 'run too short'],
    [{ score: 900, durationMs: 30_000 }, 'score too fast'],
    [{ score: 5000, durationMs: 3_600_000 }, 'check'],
    [{ callsign: '<b>hi' }, 'check'],
  ] as [Run, string][])('rejects %o', async (run, message) => {
    await expect(submit(run)).rejects.toThrow(message);
  });

  it('limits attempts per day', async () => {
    for (let i = 0; i < 30; i++) await submit({ score: 100 + i });
    await expect(submit({ score: 500 })).rejects.toThrow('too many attempts');
    // The rejected attempt didn't change the stored score.
    await db.exec('reset role');
    const row = await db.query<{ score: number }>('select score from daily_scores');
    expect(row.rows[0].score).toBe(129);
  });

  it('hides the table and player ids from the public role', async () => {
    await submit();
    await expect(db.query('select * from daily_scores')).rejects.toThrow(/permission denied/);
    const board = await db.query<Record<string, unknown>>('select * from get_daily_board($1)', [today]);
    expect(Object.keys(board.rows[0])).not.toContain('player_id');
  });

  it('caps the board size and always includes you', async () => {
    await db.exec('reset role');
    for (let i = 0; i < 30; i++) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      await db.query(
        `insert into daily_scores (day, player_id, callsign, ship, crew, score, kills, duration_ms)
         values ($1, $2, $3, 'freighter', 'salvager', $4, 0, 100000)`,
        [today, id, `P${String(i).padStart(2, '0')}X`, 1000 - i],
      );
    }
    await db.exec('set role anon');
    await submit({ player: P1, score: 10 });
    const board = await db.query<{ is_you: boolean }>('select * from get_daily_board($1, $2, 5)', [today, P1]);
    expect(board.rows).toHaveLength(6);
    expect(board.rows.at(-1)!.is_you).toBe(true);
  });
});
