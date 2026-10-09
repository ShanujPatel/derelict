import { describe, expect, it, vi } from 'vitest';
import { BOARDS, BOARD_IDS, boardDef, checkRunReport, formatCell, type RunReport } from '../src/core/hallOfFame';
import SQL from '../docs/supabase.sql?raw';
import { createLeaderboardClient } from '../src/net/leaderboard';

const PLAYER = '123e4567-e89b-42d3-a456-426614174000';
const report = (patch: Partial<RunReport> = {}): RunReport => ({
  extracted: true,
  salvage: 200,
  durationMs: 180_000,
  depth: 1,
  kills: { drone: 4, turret: 1 },
  elites: 1,
  bounties: 0,
  boss: null,
  bossMs: null,
  ...patch,
});

describe('hall of fame rules', () => {
  it('accepts a normal run', () => {
    expect(checkRunReport(report())).toEqual({ ok: true });
    expect(checkRunReport(report({ boss: 'foreman', bossMs: 60_000 }))).toEqual({ ok: true });
    expect(checkRunReport(report({ depth: 4, salvage: 1800, durationMs: 600_000 }))).toEqual({ ok: true });
  });

  it.each([
    [{ durationMs: 5_000 }, 'Run length'],
    [{ depth: 6 }, 'Depth'],
    [{ salvage: 2000 }, 'Salvage'],
    [{ salvage: 900, durationMs: 30_000 }, 'Salvage'],
    [{ kills: { drone: -1 } }, 'Kills out of range'],
    [{ kills: { drone: 500 } }, 'Kills out of range'],
    [{ kills: { drone: 200 }, durationMs: 60_000, salvage: 0 }, 'Kills too fast'],
    [{ elites: 9 }, 'Elites'],
    [{ bounties: 2 }, 'Elites or bounties'],
    [{ boss: 'mother', bossMs: 200_000 }, 'Boss time'],
  ] as [Partial<RunReport>, string][])('rejects %o', (patch, reason) => {
    const r = checkRunReport(report(patch));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(reason);
  });

  it('has a board for every hostile type, each one known to the database', () => {
    expect(new Set(BOARD_IDS).size).toBe(BOARDS.length);
    for (const id of BOARD_IDS) expect(SQL).toContain(`'${id}'`);
    expect(boardDef('foreman').format(151_000)).toBe('2:31');
    expect(boardDef('depth').format(4)).toBe('Depth 4');
    expect(boardDef('banked').format(12345)).toBe('12,345 salvage');
  });

  it('formats table cells', () => {
    expect(formatCell('banked', 12345)).toBe('12,345');
    expect(formatCell('mother', 151_000)).toBe('2:31');
    expect(formatCell('foreman', null)).toBe('—');
    expect(formatCell('drone', 0)).toBe('—');
  });

  it('has a table column for every board, in the order the database returns them', () => {
    const columns = SQL.match(/returns table \(\s*rank bigint, callsign text, is_you boolean,([^)]*)\)/)![1];
    expect(columns.match(/\w+(?= bigint)/g)).toEqual(BOARD_IDS);
  });
});

describe('hall of fame client', () => {
  const config = { url: 'https://x.supabase.co', key: 'sb_publishable_abc' };

  it('posts a run report to submit_run and copes with an empty reply', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const c = createLeaderboardClient(config, fetchMock);
    await expect(c.submitRun(PLAYER, report())).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/rest/v1/rpc/submit_run');
    expect(JSON.parse(init.body as string)).toMatchObject({ p_player: PLAYER, p_run: { salvage: 200, kills: { drone: 4 } } });
  });

  it('refuses an implausible run before sending it', async () => {
    const fetchMock = vi.fn();
    const c = createLeaderboardClient(config, fetchMock);
    await expect(c.submitRun(PLAYER, report({ depth: 9 }))).rejects.toThrow('Depth');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads a board', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([{ rank: 1, callsign: 'ACE', value: '1200', is_you: false }])));
    const c = createLeaderboardClient(config, fetchMock);
    await expect(c.hallOfFame('banked', PLAYER)).resolves.toEqual([{ rank: 1, callsign: 'ACE', value: 1200, isYou: false }]);
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({
      p_board: 'banked',
      p_player: PLAYER,
      p_limit: 20,
    });
  });

  it('reads the RANKS table', async () => {
    const row = Object.fromEntries(BOARD_IDS.map((id) => [id, 0]));
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify([{ rank: 1, callsign: 'ACE', is_you: true, ...row, banked: 1200, foreman: null }])),
    );
    const c = createLeaderboardClient(config, fetchMock);
    const [r] = await c.hallTable('banked', PLAYER);
    expect(r).toMatchObject({ rank: 1, callsign: 'ACE', isYou: true });
    expect(r.values.banked).toBe(1200);
    expect(r.values.foreman).toBeNull();
    expect(r.values.drone).toBe(0);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/rpc\/get_hall_table$/);
    expect(JSON.parse(init.body as string)).toEqual({ p_sort: 'banked', p_player: PLAYER, p_limit: 25 });
  });
});
