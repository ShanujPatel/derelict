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
  await db.exec('reset role; delete from daily_scores; delete from players; delete from player_totals; delete from weekly_scores; delete from clans; delete from clan_members; delete from clan_scores;');
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
    [{ callsign: '<b>hi' }, 'invalid name'],
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

  describe('unique names', () => {
    const claim = async (player: string, name: string) =>
      (await db.query<{ ok: boolean }>('select claim_callsign($1, $2) as ok', [player, name])).rows[0].ok;

    it('gives each name to one player only, ignoring case and spacing', async () => {
      expect(await claim(P1, 'Nyx  Harrow')).toBe(true);
      expect(await claim(P1, 'NYX HARROW')).toBe(true);
      expect(await claim(P2, 'nyx harrow')).toBe(false);
      await expect(claim(P2, '<b>')).rejects.toThrow('invalid name');
    });

    it('frees your old name when you rename', async () => {
      await claim(P1, 'COLD COMET');
      await claim(P1, 'VOSS-27');
      expect(await claim(P2, 'COLD COMET')).toBe(true);
    });

    it("won't post a score under someone else's name", async () => {
      await claim(P2, 'ACE');
      await expect(submit({ player: P1, callsign: 'ace' })).rejects.toThrow('name taken');
    });

    it('shows your current name on the board after a rename', async () => {
      await submit({ player: P1, callsign: 'nova' });
      await claim(P1, 'RUST MOTH');
      const board = await db.query<{ callsign: string }>('select callsign from get_daily_board($1)', [today]);
      expect(board.rows[0].callsign).toBe('RUST MOTH');
    });

    it('hides the players table from the public role', async () => {
      await expect(db.query('select * from players')).rejects.toThrow(/permission denied/);
    });
  });

  describe('hall of fame', () => {
    const claim = (player: string, name: string) => db.query('select claim_callsign($1, $2)', [player, name]);
    const run = (player: string, patch: Record<string, unknown> = {}) =>
      db.query('select submit_run($1, $2)', [
        player,
        JSON.stringify({ extracted: true, salvage: 200, durationMs: 180_000, depth: 1, kills: { drone: 4, turret: 1 }, elites: 1, bounties: 0, ...patch }),
      ]);
    const board = async (name: string, player = P1, limit = 20) =>
      (await db.query<{ rank: number; callsign: string; value: number; is_you: boolean }>('select * from get_hall_of_fame($1, $2, $3)', [name, player, limit])).rows.map(
        (r) => [Number(r.rank), r.callsign, Number(r.value), r.is_you],
      );

    it('adds runs up into all-time totals and ranks them', async () => {
      await claim(P1, 'NOVA');
      await claim(P2, 'ACE');
      await run(P1);
      await run(P1, { salvage: 300, kills: { crawler: 7 } });
      await run(P2, { salvage: 450, kills: { drone: 1 } });
      await run(P2, { extracted: false, salvage: 900, durationMs: 600_000 });
      expect(await board('banked')).toEqual([
        [1, 'NOVA', 500, true],
        [2, 'ACE', 450, false],
      ]);
      expect(await board('haul')).toEqual([
        [1, 'ACE', 450, false],
        [2, 'NOVA', 300, true],
      ]);
      expect(await board('kills')).toEqual([
        [1, 'NOVA', 12, true],
        // Lost runs still count kills: 1 + 5.
        [2, 'ACE', 6, false],
      ]);
      expect(await board('crawler')).toEqual([[1, 'NOVA', 7, true]]);
      expect(await board('extractions', P2)).toEqual([
        [1, 'NOVA', 2, false],
        [2, 'ACE', 1, true],
      ]);
    });

    it('ranks boss boards by the fastest kill, extracted runs only', async () => {
      await claim(P1, 'NOVA');
      await claim(P2, 'ACE');
      await run(P1, { boss: 'foreman', bossMs: 90_000 });
      await run(P1, { boss: 'foreman', bossMs: 120_000 });
      await run(P2, { boss: 'foreman', bossMs: 60_000, extracted: false });
      await run(P2, { boss: 'foreman', bossMs: 80_000 });
      expect(await board('foreman')).toEqual([
        [1, 'ACE', 80_000, false],
        [2, 'NOVA', 90_000, true],
      ]);
      expect(await board('mother')).toEqual([]);
    });

    it('works out the longest daily streak from daily scores', async () => {
      await db.exec('reset role');
      await claim(P1, 'NOVA');
      for (const day of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05']) {
        await db.query(
          `insert into daily_scores (day, player_id, callsign, ship, crew, score, kills, duration_ms) values ($1, $2, 'NOVA', 'freighter', 'salvager', 10, 0, 100000)`,
          [day, P1],
        );
      }
      await db.exec('set role anon');
      expect(await board('streak')).toEqual([[1, 'NOVA', 3, true]]);
    });

    it.each([
      [{ durationMs: 5_000 }, 'run length'],
      [{ depth: 9 }, 'depth'],
      [{ salvage: 5000, durationMs: 3_600_000 }, 'salvage'],
      [{ salvage: 900, durationMs: 30_000 }, 'salvage'],
      [{ kills: { dragon: 1 } }, 'unknown hostile'],
      [{ kills: { drone: -1 } }, 'kills out of range'],
      [{ kills: { drone: 300 }, durationMs: 60_000, salvage: 0 }, 'kills too fast'],
      [{ elites: 99 }, 'elites'],
      [{ boss: 'foreman', bossMs: 5 }, 'boss time'],
      [{ boss: 'kraken', bossMs: 50_000 }, 'boss time'],
    ] as [Record<string, unknown>, string][])('rejects %o', async (patch, message) => {
      await claim(P1, 'NOVA');
      await expect(run(P1, patch)).rejects.toThrow(message);
    });

    it('needs a claimed name, rejects unknown boards, and hides the table', async () => {
      await expect(run(P2)).rejects.toThrow('pick a name first');
      await expect(board('lol')).rejects.toThrow('unknown board');
      await expect(db.query('select * from player_totals')).rejects.toThrow(/permission denied/);
    });

    it('returns every stat in one table, sorted by the column you pick', async () => {
      const table = async (sort: string | null, player = P1) =>
        (await db.query<Record<string, unknown>>('select * from get_hall_table($1, $2, $3)', [sort, player, 25])).rows;
      await claim(P1, 'NOVA');
      await claim(P2, 'ACE');
      await run(P1);
      await run(P1, { salvage: 300, kills: { crawler: 7 } });
      await run(P2, { salvage: 450, kills: { drone: 1 }, boss: 'foreman', bossMs: 80_000 });
      // Default sort: total salvage banked.
      const byBanked = await table(null);
      expect(byBanked.map((r) => [Number(r.rank), r.callsign, Number(r.banked), r.is_you])).toEqual([
        [1, 'NOVA', 500, true],
        [2, 'ACE', 450, false],
      ]);
      expect(byBanked[0]).toMatchObject({ extractions: 2, kills: 12, crawler: 7, drone: 4, foreman: null });
      expect(byBanked[1]).toMatchObject({ haul: 450, foreman: 80_000, kills: 1 });
      expect((await table('haul')).map((r) => r.callsign)).toEqual(['ACE', 'NOVA']);
      // Only players with something in the sort column are ranked.
      expect((await table('foreman')).map((r) => [Number(r.rank), r.callsign])).toEqual([[1, 'ACE']]);
      expect(await table('mother')).toEqual([]);
      await expect(table('lol')).rejects.toThrow('unknown board');
    });

    it('caps runs per day', async () => {
      await claim(P1, 'NOVA');
      await db.exec('reset role');
      await db.query(`insert into player_totals (player_id, day, runs_today) values ($1, (now() at time zone 'utc')::date, 200)`, [P1]);
      await db.exec('set role anon');
      await expect(run(P1)).rejects.toThrow('too many runs');
    });
  });

  describe('v1.0', () => {
    const isoWeek = (d: Date) => {
      const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
      const start = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
      const n = Math.ceil(((t.getTime() - start.getTime()) / 86400000 + 1) / 7);
      return `${t.getUTCFullYear()}-W${String(n).padStart(2, '0')}`;
    };
    const week = isoWeek(new Date());
    const weekly = (player: string, name: string, score: number, ms = 200_000, w = week, ship = 'mining') =>
      db.query<{ rank: number; total: number; best: number }>('select * from submit_weekly($1, $2, $3, $4, $5, $6, $7, $8, $9)', [
        w,
        `weekly-${w}`,
        player,
        name,
        ship,
        'salvager',
        score,
        4,
        ms,
      ]);

    it('accepts mining haulers on the daily board', async () => {
      await db.query('select * from submit_score($1, $2, $3, $4, $5, $6, $7, $8, $9)', [
        today, `daily-${today}`, P1, 'nova', 'mining', 'salvager', 150, 3, 120_000,
      ]);
      await expect(
        db.query('select * from submit_score($1, $2, $3, $4, $5, $6, $7, $8, $9)', [today, `daily-${today}`, P2, 'ace', 'yacht', 'salvager', 150, 3, 120_000]),
      ).rejects.toThrow(/check/);
    });

    it('ranks the weekly board and keeps each best', async () => {
      await weekly(P1, 'nova', 400);
      await weekly(P2, 'ace', 600);
      const again = (await weekly(P1, 'nova', 300)).rows[0];
      expect(again.best).toBe(400);
      const board = await db.query<{ rank: number; callsign: string; score: number; is_you: boolean }>('select * from get_weekly_board($1, $2, 10)', [week, P1]);
      expect(board.rows.map((r) => [Number(r.rank), r.callsign, r.score, r.is_you])).toEqual([
        [1, 'ACE', 600, false],
        [2, 'NOVA', 400, true],
      ]);
    });

    it('rejects weekly runs for other weeks, wrong seeds and impossible scores', async () => {
      await expect(weekly(P1, 'nova', 100, 200_000, '2020-W01')).rejects.toThrow('week is not open');
      await expect(
        db.query('select * from submit_weekly($1, $2, $3, $4, $5, $6, $7, $8, $9)', [week, 'weekly-nope', P1, 'nova', 'mining', 'salvager', 10, 1, 60_000]),
      ).rejects.toThrow('not a weekly seed');
      await expect(weekly(P1, 'nova', 2000, 30_000)).rejects.toThrow(/too fast|check/);
      await expect(db.query('select * from weekly_scores')).rejects.toThrow(/permission denied/);
    });

    it('stores a ghost for your best daily run and serves the leader', async () => {
      await submit({ player: P1, callsign: 'nova', score: 300, durationMs: 200_000 });
      await submit({ player: P2, callsign: 'ace', score: 200, durationMs: 150_000 });
      const g1 = 'G1.100.AAAAAAEB';
      // Wrong score: not your board run, so it's ignored.
      const wrong = await db.query<{ submit_ghost: boolean }>('select submit_ghost($1, $2, $3, $4, $5)', [today, P1, 250, 200_000, g1]);
      expect(wrong.rows[0].submit_ghost).toBe(false);
      const ok = await db.query<{ submit_ghost: boolean }>('select submit_ghost($1, $2, $3, $4, $5)', [today, P2, 200, 150_000, g1]);
      expect(ok.rows[0].submit_ghost).toBe(true);
      let ghost = await db.query<{ callsign: string; ghost: string }>('select * from get_daily_ghost($1)', [today]);
      // The leader has no ghost yet, so the best run that has one is served.
      expect(ghost.rows[0]).toMatchObject({ callsign: 'ACE', ghost: g1 });
      await db.query('select submit_ghost($1, $2, $3, $4, $5)', [today, P1, 300, 200_000, 'G1.100.AAAAAAAA']);
      ghost = await db.query<{ callsign: string; ghost: string }>('select * from get_daily_ghost($1)', [today]);
      expect(ghost.rows[0].callsign).toBe('NOVA');
      await expect(db.query('select submit_ghost($1, $2, $3, $4, $5)', [today, P1, 300, 200_000, 'drop table'])).rejects.toThrow('invalid ghost');
      await expect(db.query('select submit_ghost($1, $2, $3, $4, $5)', [today, P1, 300, 200_000, `G1.100.${'A'.repeat(30000)}`])).rejects.toThrow('invalid ghost');
    });

    it('counts sappers, sweepers and the Hollow Captain in the hall of fame', async () => {
      await db.query('select claim_callsign($1, $2)', [P1, 'NOVA']);
      await db.query('select submit_run($1, $2)', [
        P1,
        JSON.stringify({ extracted: true, salvage: 200, durationMs: 180_000, depth: 1, kills: { sapper: 3, sweeper: 2 }, elites: 0, bounties: 0, boss: 'captain', bossMs: 95_000 }),
      ]);
      const rows = (await db.query<Record<string, unknown>>('select * from get_hall_table($1, $2, 25)', ['captain', P1])).rows;
      expect(rows[0]).toMatchObject({ callsign: 'NOVA', sapper: 3, sweeper: 2, captain: 95_000, kills: 5 });
    });
  });

  describe('v1.1 clans', () => {
    const P3 = '33333333-3333-4333-8333-333333333333';
    const q = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) => (await db.query<T>(sql, args)).rows;
    const one = async (sql: string, args: unknown[] = []) => Object.values((await q(sql, args))[0] ?? {})[0] as Record<string, unknown> | null;
    const claim = (player: string, name: string) => db.query('select claim_callsign($1, $2)', [player, name]);
    const create = (player: string, name: string, tag: string, open: boolean | null = true) =>
      one('select create_clan($1, $2, $3, $4)', [player, name, tag, open]);
    const join = (player: string, code: string | null, clan: number | null = null) => one('select join_clan($1, $2, $3)', [player, code, clan]);
    const run = (player: string, salvage: number, extracted = true) =>
      one('select submit_run($1, $2)', [
        player,
        JSON.stringify({ extracted, salvage, durationMs: 180_000, depth: 1, kills: { drone: 2 }, elites: 0, bounties: 0 }),
      ]);
    const backdateLeave = async (player: string) => {
      await db.exec('reset role');
      await db.query(`update players set clan_left_at = now() - interval '2 days' where player_id = $1`, [player]);
      await db.exec('set role anon');
    };

    it('creates a clan, joins by code and by the open list, and scores everyone', async () => {
      await claim(P1, 'NOVA');
      await claim(P2, 'ACE');
      await claim(P3, 'VEX');
      const mine = (await create(P1, 'Rust Raiders', 'rust', true))!;
      expect(mine).toMatchObject({ name: 'Rust Raiders', tag: 'RUST', open: true, isLeader: true });
      expect(mine.inviteCode).toMatch(/^RUST-[A-Z2-9]{4}$/);
      await join(P2, String(mine.inviteCode).toLowerCase());
      await join(P3, null, Number(mine.id));
      // Before joining, nothing counted; from now on every member's salvage does.
      const summary = (await run(P2, 300))!;
      expect(summary).toMatchObject({ tag: 'RUST', added: 300, weekSalvage: 300, weekRank: 1 });
      await run(P1, 200);
      await run(P3, 999, false); // a lost run adds no salvage
      const clan = (await one('select get_my_clan($1)', [P3]))!;
      expect(clan).toMatchObject({ weekSalvage: 500, allSalvage: 500, isLeader: false });
      const members = clan.members as { callsign: string; weekSalvage: number; leader: boolean; you: boolean }[];
      expect(members.map((m) => [m.callsign, m.weekSalvage, m.leader, m.you])).toEqual([
        ['ACE', 300, false, false],
        ['NOVA', 200, true, false],
        ['VEX', 0, false, true],
      ]);
      const tags = await q<{ callsign: string; tag: string }>('select * from get_clan_tags($1)', [['NOVA', 'ACE', 'NOBODY']]);
      expect(tags.map((t) => t.callsign).sort()).toEqual(['ACE', 'NOVA']);
    });

    it('ranks clans by the total of all their members, this week and all time', async () => {
      await claim(P1, 'NOVA');
      await claim(P2, 'ACE');
      await claim(P3, 'VEX');
      const a = (await create(P1, 'Alpha', 'AA'))!;
      await create(P2, 'Bravo', 'BB', false);
      await join(P3, String(a.inviteCode));
      await run(P1, 150);
      await run(P3, 150);
      await run(P2, 250);
      const board = await q<{ rank: number; tag: string; salvage: number; members: number; is_yours: boolean }>('select * from get_clan_board($1, $2, 25)', [
        'week',
        P2,
      ]);
      expect(board.map((r) => [Number(r.rank), r.tag, Number(r.salvage), Number(r.members), r.is_yours])).toEqual([
        [1, 'AA', 300, 2, false],
        [2, 'BB', 250, 1, true],
      ]);
      expect((await q('select * from get_clan_board($1, $2, 25)', ['all', null])).length).toBe(2);
      await expect(q('select * from get_clan_board($1, $2, 25)', ['month', null])).rejects.toThrow('unknown scope');
      // Only open clans with room are listed.
      const open = await q<{ tag: string }>('select * from browse_clans($1, 20)', [null]);
      expect(open.map((r) => r.tag)).toEqual(['AA']);
    });

    it('enforces names, tags, one clan each, a choice of open or invite only, and the 15 limit', async () => {
      await claim(P1, 'NOVA');
      await claim(P2, 'ACE');
      await expect(create(P1, 'X', 'XX')).rejects.toThrow('clan name');
      await expect(create(P1, 'Good Name', 'TOOLONG')).rejects.toThrow('tag');
      await expect(create(P1, 'Shitty Crew', 'SC')).rejects.toThrow('different name');
      await expect(create(P1, 'Good Name', 'GN', null)).rejects.toThrow('choose open or invite only');
      await expect(create('44444444-4444-4444-8444-444444444444', 'Nameless', 'NL')).rejects.toThrow('pick a name first');
      const c = (await create(P1, 'Good Name', 'GN', false))!;
      await expect(create(P2, 'good name', 'G2')).rejects.toThrow('taken');
      await expect(create(P2, 'Other', 'GN')).rejects.toThrow('taken');
      await expect(create(P1, 'Second', 'S2')).rejects.toThrow('leave your clan first');
      await expect(join(P2, null, Number(c.id))).rejects.toThrow('invite only');
      await expect(join(P2, 'NOPE-0000')).rejects.toThrow('no clan with that invite code');
      // Fill it to 15.
      await db.exec('reset role');
      for (let i = 0; i < 14; i++) {
        const id = `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`;
        await db.query('insert into players (player_id, callsign) values ($1, $2)', [id, `FILL${i}`]);
        await db.query('insert into clan_members (player_id, clan_id) values ($1, $2)', [id, c.id]);
      }
      await db.exec('set role anon');
      await expect(join(P2, String(c.inviteCode))).rejects.toThrow('full');
      await expect(q('select * from clans')).rejects.toThrow(/permission denied/);
      await expect(q('select * from clan_scores')).rejects.toThrow(/permission denied/);
    });

    it('lets the leader kick, hand over, switch to open and change the code', async () => {
      await claim(P1, 'NOVA');
      await claim(P2, 'ACE');
      await claim(P3, 'VEX');
      const c = (await create(P1, 'Crew', 'CRW', false))!;
      await join(P2, String(c.inviteCode));
      await join(P3, String(c.inviteCode));
      await expect(one('select manage_clan($1, $2, $3, $4)', [P2, 'kick', 'VEX', null])).rejects.toThrow('only the clan leader');
      let after = (await one('select manage_clan($1, $2, $3, $4)', [P1, 'kick', 'vex', null]))!;
      expect((after.members as unknown[]).length).toBe(2);
      // Kicked players can join another clan straight away.
      await create(P3, 'Solo', 'SOLO', true);
      after = (await one('select manage_clan($1, $2, $3, $4)', [P1, 'code', null, null]))!;
      expect(after.inviteCode).not.toBe(c.inviteCode);
      after = (await one('select manage_clan($1, $2, $3, $4)', [P1, 'open', null, true]))!;
      expect(after.open).toBe(true);
      after = (await one('select manage_clan($1, $2, $3, $4)', [P1, 'leader', 'ACE', null]))!;
      expect(after.isLeader).toBe(false);
      expect(((await one('select get_my_clan($1)', [P2]))!).isLeader).toBe(true);
    });

    it('passes leadership on when the leader leaves, deletes empty clans, and keeps what members earned', async () => {
      await claim(P1, 'NOVA');
      await claim(P2, 'ACE');
      const c = (await create(P1, 'Crew', 'CRW'))!;
      await join(P2, String(c.inviteCode));
      await run(P1, 400);
      await db.query('select leave_clan($1)', [P1]);
      const left = (await one('select get_my_clan($1)', [P2]))!;
      expect(left.isLeader).toBe(true);
      // NOVA's 400 stays with the clan.
      expect(left.weekSalvage).toBe(400);
      // A day's wait before joining again.
      await expect(join(P1, String(c.inviteCode))).rejects.toThrow('wait a day');
      await backdateLeave(P1);
      await join(P1, String(c.inviteCode));
      // Runs while not in a clan don't count anywhere.
      await db.query('select leave_clan($1)', [P1]);
      expect(await run(P1, 100)).toBeNull();
      await db.query('select leave_clan($1)', [P2]);
      expect(await q('select * from get_clan_board($1, $2, 25)', ['all', null])).toEqual([]);
      await expect(db.query('select leave_clan($1)', [P2])).rejects.toThrow('not in a clan');
    });
  });
});
