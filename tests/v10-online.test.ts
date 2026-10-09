import { describe, expect, it, vi } from 'vitest';
import { encodeGhost } from '../src/core/ghost';
import { WEEKLY_LIMITS, checkWeeklySubmission, weekFromWeeklySeed, type WeeklySubmission } from '../src/core/leaderboard';
import { createLeaderboardClient } from '../src/net/leaderboard';

const PLAYER = '123e4567-e89b-42d3-a456-426614174000';
const config = { url: 'https://x.supabase.co', key: 'sb_publishable_abc' };
const weekly = (patch: Partial<WeeklySubmission> = {}): WeeklySubmission => ({
  week: '2026-W41',
  seed: 'weekly-2026-W41',
  ship: 'mining',
  callsign: 'NOVA',
  score: 400,
  kills: 6,
  durationMs: 200_000,
  character: 'salvager',
  playerId: PLAYER,
  ...patch,
});

describe('weekly board rules', () => {
  it('reads the week from the seed', () => {
    expect(weekFromWeeklySeed('weekly-2026-W41')).toBe('2026-W41');
    expect(weekFromWeeklySeed('daily-2026-10-09')).toBeNull();
  });

  it('checks submissions like the database does', () => {
    expect(checkWeeklySubmission(weekly()).ok).toBe(true);
    expect(checkWeeklySubmission(weekly({ seed: 'weekly-2026-W40' })).ok).toBe(false);
    expect(checkWeeklySubmission(weekly({ score: WEEKLY_LIMITS.maxScore + 1, durationMs: 7_000_000 })).ok).toBe(false);
    expect(checkWeeklySubmission(weekly({ score: 1000, durationMs: 30_000 })).ok).toBe(false);
  });
});

describe('weekly and ghost client', () => {
  it('posts a weekly run and reads the board', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ rank: 2, total: 9, best: 400 }])))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ rank: 1, callsign: 'ACE', score: '600', kills: 3, duration_ms: 150000, crew: 'robot', is_you: false }])),
      );
    const c = createLeaderboardClient(config, fetchMock);
    await expect(c.submitWeekly(weekly())).resolves.toEqual({ rank: 2, total: 9, best: 400 });
    expect(fetchMock.mock.calls[0][0]).toMatch(/rpc\/submit_weekly$/);
    const board = await c.weeklyBoard('2026-W41', PLAYER);
    expect(board[0]).toMatchObject({ rank: 1, callsign: 'ACE', score: 600, durationMs: 150000 });
  });

  it('refuses a bad weekly run before sending', async () => {
    const fetchMock = vi.fn();
    const c = createLeaderboardClient(config, fetchMock);
    await expect(c.submitWeekly(weekly({ seed: 'nope' }))).rejects.toThrow('weekly seed');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts and fetches ghosts', async () => {
    const ghost = encodeGhost([{ x: 10, y: 10 }, { x: 12, y: 11 }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('true'))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ callsign: 'ACE', score: 300, duration_ms: 120000, ghost }])))
      .mockResolvedValueOnce(new Response(JSON.stringify([])));
    const c = createLeaderboardClient(config, fetchMock);
    await expect(c.submitGhost('2026-10-09', PLAYER, 300, 120000.4, ghost)).resolves.toBe(true);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({ p_duration_ms: 120000, p_ghost: ghost });
    const g = await c.dailyGhost('2026-10-09');
    expect(g).toMatchObject({ callsign: 'ACE', score: 300, durationMs: 120000 });
    expect(g!.ghost.points).toEqual([{ x: 10, y: 10 }, { x: 12, y: 11 }]);
    await expect(c.dailyGhost('2026-10-10')).resolves.toBeNull();
  });
});
