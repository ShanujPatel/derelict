import { describe, expect, it, vi } from 'vitest';
import type { ScoreSubmission } from '../src/core/leaderboard';
import { LeaderboardError, createLeaderboardClient } from '../src/net/leaderboard';

const run: ScoreSubmission = {
  day: '2026-10-09',
  seed: 'daily-2026-10-09',
  ship: 'research',
  callsign: 'NOVA',
  score: 210,
  kills: 9,
  durationMs: 200_000,
  character: 'robot',
  playerId: '123e4567-e89b-42d3-a456-426614174000',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('leaderboard client', () => {
  it('is disabled without config and refuses calls', async () => {
    const c = createLeaderboardClient(null);
    expect(c.enabled).toBe(false);
    await expect(c.board('2026-10-09', '')).rejects.toThrow('offline');
  });

  it('posts a submission to the submit_score function', async () => {
    const fetchMock = vi.fn(async () => json([{ rank: 3, total: 12, best: 210 }]));
    const c = createLeaderboardClient({ url: 'https://x.supabase.co/', key: 'sb_publishable_abc' }, fetchMock);
    await expect(c.submit(run)).resolves.toEqual({ rank: 3, total: 12, best: 210 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/rest/v1/rpc/submit_score');
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe('sb_publishable_abc');
    expect(headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body as string)).toMatchObject({ p_day: '2026-10-09', p_crew: 'robot', p_score: 210 });
  });

  it('sends a Bearer header for legacy JWT anon keys', async () => {
    const fetchMock = vi.fn(async () => json([]));
    const c = createLeaderboardClient({ url: 'https://x.supabase.co', key: 'eyJhbGciOi.legacy' }, fetchMock);
    await c.board('2026-10-09', '');
    const headers = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer eyJhbGciOi.legacy');
  });

  it('checks scores locally before sending', async () => {
    const fetchMock = vi.fn();
    const c = createLeaderboardClient({ url: 'https://x', key: 'k' }, fetchMock);
    await expect(c.submit({ ...run, score: 9000 })).rejects.toThrow('Score out of range');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps board rows', async () => {
    const c = createLeaderboardClient({ url: 'https://x', key: 'k' }, async () =>
      json([{ rank: 1, callsign: 'ACE', score: 300, kills: 4, duration_ms: 150000, crew: 'salvager', is_you: false }]),
    );
    expect(await c.board('2026-10-09', '')).toEqual([
      { rank: 1, callsign: 'ACE', score: 300, kills: 4, durationMs: 150000, character: 'salvager', isYou: false },
    ]);
  });

  it('surfaces database errors and network failures as LeaderboardError', async () => {
    const bad = createLeaderboardClient({ url: 'https://x', key: 'k' }, async () => json({ message: 'score too fast' }, 400));
    await expect(bad.submit(run)).rejects.toThrow(new LeaderboardError('score too fast'));
    const down = createLeaderboardClient({ url: 'https://x', key: 'k' }, async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(down.board('2026-10-09', '')).rejects.toThrow('unreachable');
  });

  it('times out slow requests', async () => {
    const slow = createLeaderboardClient(
      { url: 'https://x', key: 'k' },
      (_url, init) =>
        new Promise((_res, rej) => (init!.signal as AbortSignal).addEventListener('abort', () => rej(new Error('aborted')))),
      20,
    );
    await expect(slow.board('2026-10-09', '')).rejects.toThrow('timed out');
  });
});
