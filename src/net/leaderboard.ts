import { checkSubmission, type BoardEntry, type ScoreSubmission } from '../core/leaderboard';

/**
 * Tiny client for the Supabase leaderboard functions in docs/supabase.sql.
 * Talks to the REST API with fetch, so the game doesn't need the Supabase SDK.
 * Configured with VITE_SUPABASE_URL and VITE_SUPABASE_KEY at build time;
 * without them the leaderboard is simply switched off.
 */
export interface LeaderboardConfig {
  url: string;
  key: string;
}

export interface SubmitResult {
  rank: number;
  total: number;
  best: number;
}

export class LeaderboardError extends Error {}

export interface LeaderboardClient {
  readonly enabled: boolean;
  submit(s: ScoreSubmission): Promise<SubmitResult>;
  board(day: string, playerId: string, limit?: number): Promise<BoardEntry[]>;
  /** Reserves a name for this player. False if someone else already has it. */
  claimName(playerId: string, name: string): Promise<boolean>;
}

export function createLeaderboardClient(
  config: LeaderboardConfig | null,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
  timeoutMs = 8000,
): LeaderboardClient {
  const call = async <T>(fn: string, body: Record<string, unknown>): Promise<T> => {
    if (!config) throw new LeaderboardError('Leaderboard is offline');
    const headers: Record<string, string> = { apikey: config.key, 'Content-Type': 'application/json' };
    // Legacy anon keys are JWTs and also go in Authorization; new publishable keys must not.
    if (config.key.startsWith('eyJ')) headers.Authorization = `Bearer ${config.key}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${config.url.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        let message = `Leaderboard error (${res.status})`;
        try {
          const err = (await res.json()) as { message?: string };
          if (err.message) message = err.message;
        } catch {
          /* not JSON */
        }
        throw new LeaderboardError(message);
      }
      return (await res.json()) as T;
    } catch (e) {
      if (e instanceof LeaderboardError) throw e;
      throw new LeaderboardError(controller.signal.aborted ? 'Leaderboard timed out' : 'Leaderboard unreachable');
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    enabled: config !== null,

    async submit(s) {
      const check = checkSubmission(s);
      if (!check.ok) throw new LeaderboardError(check.reason);
      const rows = await call<{ rank: number; total: number; best: number }[]>('submit_score', {
        p_day: s.day,
        p_seed: s.seed,
        p_player: s.playerId,
        p_callsign: s.callsign,
        p_ship: s.ship,
        p_crew: s.character,
        p_score: s.score,
        p_kills: s.kills,
        p_duration_ms: Math.round(s.durationMs),
      });
      const row = rows[0];
      if (!row) throw new LeaderboardError('No rank returned');
      return { rank: Number(row.rank), total: Number(row.total), best: Number(row.best) };
    },

    async claimName(playerId, name) {
      const result = await call<boolean>('claim_callsign', { p_player: playerId, p_callsign: name });
      return result === true;
    },

    async board(day, playerId, limit = 20) {
      const rows = await call<
        { rank: number; callsign: string; score: number; kills: number; duration_ms: number; crew: string; is_you: boolean }[]
      >('get_daily_board', { p_day: day, p_player: playerId || null, p_limit: limit });
      return rows.map((r) => ({
        rank: Number(r.rank),
        callsign: r.callsign,
        score: r.score,
        kills: r.kills,
        durationMs: r.duration_ms,
        character: r.crew,
        isYou: r.is_you,
      }));
    },
  };
}

function configFromEnv(): LeaderboardConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
  return url && key ? { url, key } : null;
}

/** The game's shared client, built from the deploy's environment variables. */
export const leaderboard = createLeaderboardClient(configFromEnv());
