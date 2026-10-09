import type { ShipType } from './types';

/**
 * Shared rules for the Daily Derelict leaderboard. The same limits are
 * enforced again by the database function in docs/supabase.sql.
 */
export const SCORE_LIMITS = {
  maxScore: 1500,
  /** Nobody clears a ship this fast. */
  minDurationMs: 20_000,
  maxDurationMs: 2 * 60 * 60 * 1000,
  /** Salvage per second of play. */
  maxRate: 12,
  maxAttemptsPerDay: 30,
} as const;

export const CALLSIGN_PATTERN = /^[A-Za-z0-9 _-]{3,16}$/;

/** Tidies a typed callsign; null if it still isn't valid. */
export function cleanCallsign(raw: string): string | null {
  const s = raw.replace(/\s+/g, ' ').trim().toUpperCase();
  return CALLSIGN_PATTERN.test(s) ? s : null;
}

/** 'daily-2026-10-09' -> '2026-10-09'; null for any other seed. */
export function dayFromDailySeed(seed: string): string | null {
  const m = /^daily-(\d{4}-\d{2}-\d{2})$/.exec(seed);
  return m ? m[1] : null;
}

export interface ScoreSubmission {
  day: string;
  seed: string;
  ship: ShipType;
  callsign: string;
  score: number;
  kills: number;
  durationMs: number;
  character: string;
  playerId: string;
}

export type Plausibility = { ok: true } | { ok: false; reason: string };

export function checkSubmission(s: ScoreSubmission): Plausibility {
  if (dayFromDailySeed(s.seed) !== s.day) return { ok: false, reason: 'Not a daily seed' };
  if (!CALLSIGN_PATTERN.test(s.callsign)) return { ok: false, reason: 'Invalid callsign' };
  if (!/^[0-9a-f-]{36}$/i.test(s.playerId)) return { ok: false, reason: 'Invalid player id' };
  if (!Number.isInteger(s.score) || s.score < 0 || s.score > SCORE_LIMITS.maxScore) {
    return { ok: false, reason: 'Score out of range' };
  }
  if (s.durationMs < SCORE_LIMITS.minDurationMs || s.durationMs > SCORE_LIMITS.maxDurationMs) {
    return { ok: false, reason: 'Run length out of range' };
  }
  if (s.score / (s.durationMs / 1000) > SCORE_LIMITS.maxRate) return { ok: false, reason: 'Score too fast' };
  return { ok: true };
}

/** The weekly board allows a bit more: mutators like Jackpot make salvage richer. */
export const WEEKLY_LIMITS = {
  maxScore: 2500,
  minDurationMs: 20_000,
  maxDurationMs: 2 * 60 * 60 * 1000,
  maxRate: 18,
} as const;

/** 'weekly-2026-W41' -> '2026-W41'; null for any other seed. */
export function weekFromWeeklySeed(seed: string): string | null {
  const m = /^weekly-(\d{4}-W\d{2})$/.exec(seed);
  return m ? m[1] : null;
}

export interface WeeklySubmission extends Omit<ScoreSubmission, 'day'> {
  week: string;
}

export function checkWeeklySubmission(s: WeeklySubmission): Plausibility {
  if (weekFromWeeklySeed(s.seed) !== s.week) return { ok: false, reason: 'Not a weekly seed' };
  if (!CALLSIGN_PATTERN.test(s.callsign)) return { ok: false, reason: 'Invalid callsign' };
  if (!/^[0-9a-f-]{36}$/i.test(s.playerId)) return { ok: false, reason: 'Invalid player id' };
  if (!Number.isInteger(s.score) || s.score < 0 || s.score > WEEKLY_LIMITS.maxScore) return { ok: false, reason: 'Score out of range' };
  if (s.durationMs < WEEKLY_LIMITS.minDurationMs || s.durationMs > WEEKLY_LIMITS.maxDurationMs) {
    return { ok: false, reason: 'Run length out of range' };
  }
  if (s.score / (s.durationMs / 1000) > WEEKLY_LIMITS.maxRate) return { ok: false, reason: 'Score too fast' };
  return { ok: true };
}

export interface BoardEntry {
  rank: number;
  callsign: string;
  score: number;
  kills: number;
  durationMs: number;
  character: string;
  isYou?: boolean;
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
