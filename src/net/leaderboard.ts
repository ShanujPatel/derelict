import {
  checkSubmission,
  checkWeeklySubmission,
  type BoardEntry,
  type ScoreSubmission,
  type WeeklySubmission,
} from '../core/leaderboard';
import { GHOST, decodeGhost, type Ghost } from '../core/ghost';
import {
  checkClanName,
  checkClanTag,
  parseMyClan,
  type ClanBoardRow,
  type ClanRunSummary,
  type MyClan,
  type OpenClan,
} from '../core/clans';
import { BOARD_IDS, checkRunReport, type BoardId, type HallEntry, type HallRow, type RunReport } from '../core/hallOfFame';

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
  /** Adds a finished run to the player's all-time totals. */
  /** Adds a finished run to your totals; returns what it added to your clan, if you're in one. */
  submitRun(playerId: string, report: RunReport): Promise<ClanRunSummary | null>;
  /** One all-time board: the top players plus your row. */
  hallOfFame(board: BoardId, playerId: string, limit?: number): Promise<HallEntry[]>;
  /** The RANKS table: every stat per player, sorted by one column. */
  hallTable(sort: BoardId, playerId: string, limit?: number): Promise<HallRow[]>;
  /** Posts a Weekly Challenge run; returns your rank for the week. */
  submitWeekly(s: WeeklySubmission): Promise<SubmitResult>;
  weeklyBoard(week: string, playerId: string, limit?: number): Promise<BoardEntry[]>;
  /** Stores the path of your best daily run, for others to race. */
  submitGhost(day: string, playerId: string, score: number, durationMs: number, ghost: string): Promise<boolean>;
  /** The ghost to race today: the best run that has one. */
  dailyGhost(day: string): Promise<DailyGhost | null>;
  // ---- clans (v1.1)
  myClan(playerId: string): Promise<MyClan | null>;
  createClan(playerId: string, name: string, tag: string, open: boolean): Promise<MyClan>;
  /** Join by invite code, or an open clan by id. */
  joinClan(playerId: string, by: { code: string } | { id: number }): Promise<MyClan>;
  leaveClan(playerId: string): Promise<void>;
  manageClan(
    playerId: string,
    action: { kind: 'kick' | 'leader'; callsign: string } | { kind: 'open'; open: boolean } | { kind: 'code' },
  ): Promise<MyClan>;
  clanBoard(scope: 'week' | 'all', playerId: string, limit?: number): Promise<ClanBoardRow[]>;
  browseClans(query?: string): Promise<OpenClan[]>;
  /** Clan tags for names shown on a board. */
  clanTags(callsigns: string[]): Promise<Record<string, string>>;
}

export interface DailyGhost {
  callsign: string;
  score: number;
  durationMs: number;
  ghost: Ghost;
}

type BoardRow = { rank: number; callsign: string; score: number; kills: number; duration_ms: number; crew: string; is_you: boolean };

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
      // Functions that return nothing answer 204 with an empty body.
      const text = await res.text();
      return (text ? JSON.parse(text) : null) as T;
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

    async submitRun(playerId, report) {
      const check = checkRunReport(report);
      if (!check.ok) throw new LeaderboardError(check.reason);
      const r = await call<Record<string, unknown> | null>('submit_run', { p_player: playerId, p_run: report });
      if (!r || typeof r !== 'object' || !r.tag) return null;
      return {
        tag: String(r.tag),
        name: String(r.name ?? ''),
        added: Number(r.added ?? 0),
        weekSalvage: Number(r.weekSalvage ?? 0),
        weekRank: r.weekRank === null || r.weekRank === undefined ? null : Number(r.weekRank),
      };
    },

    async myClan(playerId) {
      return parseMyClan(await call<unknown>('get_my_clan', { p_player: playerId }));
    },

    async createClan(playerId, name, tag, open) {
      const n = checkClanName(name);
      if (!n.ok) throw new LeaderboardError(n.reason);
      const t = checkClanTag(tag);
      if (!t.ok) throw new LeaderboardError(t.reason);
      const clan = parseMyClan(await call<unknown>('create_clan', { p_player: playerId, p_name: n.value, p_tag: t.value, p_open: open }));
      if (!clan) throw new LeaderboardError('Clan not created');
      return clan;
    },

    async joinClan(playerId, by) {
      const body = 'code' in by ? { p_player: playerId, p_code: by.code.trim(), p_clan: null } : { p_player: playerId, p_code: null, p_clan: by.id };
      const clan = parseMyClan(await call<unknown>('join_clan', body));
      if (!clan) throw new LeaderboardError('Could not join');
      return clan;
    },

    async leaveClan(playerId) {
      await call<null>('leave_clan', { p_player: playerId });
    },

    async manageClan(playerId, action) {
      const body = {
        p_player: playerId,
        p_action: action.kind,
        p_target: 'callsign' in action ? action.callsign : null,
        p_open: 'open' in action ? action.open : null,
      };
      const clan = parseMyClan(await call<unknown>('manage_clan', body));
      if (!clan) throw new LeaderboardError('Clan not found');
      return clan;
    },

    async clanBoard(scope, playerId, limit = 25) {
      const rows = await call<Record<string, unknown>[]>('get_clan_board', { p_scope: scope, p_player: playerId || null, p_limit: limit });
      return (rows ?? []).map((r) => ({
        rank: Number(r.rank),
        id: Number(r.clan_id),
        name: String(r.name),
        tag: String(r.tag),
        members: Number(r.members),
        open: r.is_open === true,
        salvage: Number(r.salvage),
        runs: Number(r.runs),
        bosses: Number(r.bosses),
        isYours: r.is_yours === true,
      }));
    },

    async browseClans(query = '') {
      const rows = await call<Record<string, unknown>[]>('browse_clans', { p_query: query || null, p_limit: 20 });
      return (rows ?? []).map((r) => ({
        id: Number(r.clan_id),
        name: String(r.name),
        tag: String(r.tag),
        members: Number(r.members),
        weekSalvage: Number(r.week_salvage),
      }));
    },

    async clanTags(callsigns) {
      const names = [...new Set(callsigns)].slice(0, 120);
      if (!names.length) return {};
      const rows = await call<{ callsign: string; tag: string }[]>('get_clan_tags', { p_callsigns: names });
      return Object.fromEntries((rows ?? []).map((r) => [r.callsign, r.tag]));
    },

    async hallOfFame(board, playerId, limit = 20) {
      const rows = await call<{ rank: number; callsign: string; value: number; is_you: boolean }[]>('get_hall_of_fame', {
        p_board: board,
        p_player: playerId || null,
        p_limit: limit,
      });
      return (rows ?? []).map((r) => ({ rank: Number(r.rank), callsign: r.callsign, value: Number(r.value), isYou: r.is_you }));
    },

    async hallTable(sort, playerId, limit = 25) {
      const rows = await call<Record<string, unknown>[]>('get_hall_table', {
        p_sort: sort,
        p_player: playerId || null,
        p_limit: limit,
      });
      return (rows ?? []).map((r) => ({
        rank: Number(r.rank),
        callsign: String(r.callsign),
        isYou: r.is_you === true,
        values: Object.fromEntries(BOARD_IDS.map((id) => [id, r[id] === null || r[id] === undefined ? null : Number(r[id])])) as Record<
          BoardId,
          number | null
        >,
      }));
    },

    async submitWeekly(s) {
      const check = checkWeeklySubmission(s);
      if (!check.ok) throw new LeaderboardError(check.reason);
      const rows = await call<{ rank: number; total: number; best: number }[]>('submit_weekly', {
        p_week: s.week,
        p_seed: s.seed,
        p_player: s.playerId,
        p_callsign: s.callsign,
        p_ship: s.ship,
        p_crew: s.character,
        p_score: s.score,
        p_kills: s.kills,
        p_duration_ms: Math.round(s.durationMs),
      });
      const row = rows?.[0];
      if (!row) throw new LeaderboardError('No rank returned');
      return { rank: Number(row.rank), total: Number(row.total), best: Number(row.best) };
    },

    async weeklyBoard(week, playerId, limit = 10) {
      const rows = await call<BoardRow[]>('get_weekly_board', { p_week: week, p_player: playerId || null, p_limit: limit });
      return (rows ?? []).map(toEntry);
    },

    async submitGhost(day, playerId, score, durationMs, ghost) {
      if (ghost.length > GHOST.maxLength) return false;
      const ok = await call<boolean>('submit_ghost', {
        p_day: day,
        p_player: playerId,
        p_score: score,
        p_duration_ms: Math.round(durationMs),
        p_ghost: ghost,
      });
      return ok === true;
    },

    async dailyGhost(day) {
      const rows = await call<{ callsign: string; score: number; duration_ms: number; ghost: string }[]>('get_daily_ghost', { p_day: day });
      const row = rows?.[0];
      const ghost = decodeGhost(row?.ghost);
      if (!row || !ghost) return null;
      return { callsign: row.callsign, score: Number(row.score), durationMs: Number(row.duration_ms), ghost };
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

function toEntry(r: BoardRow): BoardEntry {
  return {
    rank: Number(r.rank),
    callsign: r.callsign,
    score: Number(r.score),
    kills: Number(r.kills),
    durationMs: Number(r.duration_ms),
    character: r.crew,
    isYou: r.is_you,
  };
}

function configFromEnv(): LeaderboardConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined;
  return url && key ? { url, key } : null;
}

/** The game's shared client, built from the deploy's environment variables. */
export const leaderboard = createLeaderboardClient(configFromEnv());
