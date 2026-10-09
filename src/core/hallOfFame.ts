import type { BossId } from './bosses';
import { formatDuration } from './leaderboard';
import type { EnemyKind } from './types';

/**
 * The all-time hall of fame: every finished run adds to each player's totals
 * on the server (docs/supabase.sql: submit_run), and these boards rank them.
 * The same limits are checked here before sending and again in the database.
 */
export type BoardId =
  | 'banked'
  | 'haul'
  | 'extractions'
  | 'depth'
  | 'streak'
  | 'foreman'
  | 'mother'
  | 'kills'
  | 'elite'
  | 'bounty'
  | 'drone'
  | 'turret'
  | 'crawler'
  | 'spitter'
  | 'egg'
  | 'raider'
  | 'brute'
  | 'mimic'
  | 'stalker';

export type BoardGroup = 'Salvage' | 'Records' | 'Bosses' | 'Kills';

export interface BoardDef {
  id: BoardId;
  label: string;
  group: BoardGroup;
  /** How a value reads, e.g. "1,240 salvage", "Depth 4", "2:31". */
  format: (value: number) => string;
}

const n = (v: number) => v.toLocaleString('en-GB');
const kills = (v: number) => `${n(v)} destroyed`;

export const BOARDS: BoardDef[] = [
  { id: 'banked', label: 'Total salvage banked', group: 'Salvage', format: (v) => `${n(v)} salvage` },
  { id: 'haul', label: 'Biggest single haul', group: 'Salvage', format: (v) => `${n(v)} salvage` },
  { id: 'extractions', label: 'Ships cleared (extractions)', group: 'Records', format: (v) => `${n(v)} ships` },
  { id: 'depth', label: 'Deepest dive', group: 'Records', format: (v) => `Depth ${v}` },
  { id: 'streak', label: 'Longest daily streak', group: 'Records', format: (v) => `${v} day${v === 1 ? '' : 's'}` },
  { id: 'foreman', label: 'Fastest Foreman kill', group: 'Bosses', format: (v) => formatDuration(v) },
  { id: 'mother', label: 'Fastest Bloom Mother kill', group: 'Bosses', format: (v) => formatDuration(v) },
  { id: 'kills', label: 'All hostiles', group: 'Kills', format: kills },
  { id: 'elite', label: 'Elites', group: 'Kills', format: kills },
  { id: 'bounty', label: 'Bounties', group: 'Kills', format: (v) => `${n(v)} claimed` },
  { id: 'drone', label: 'Patrol drones', group: 'Kills', format: kills },
  { id: 'turret', label: 'Wall turrets', group: 'Kills', format: kills },
  { id: 'mimic', label: 'Mimic crates', group: 'Kills', format: kills },
  { id: 'crawler', label: 'Crawlers', group: 'Kills', format: kills },
  { id: 'stalker', label: 'Stalkers', group: 'Kills', format: kills },
  { id: 'spitter', label: 'Spitters', group: 'Kills', format: kills },
  { id: 'egg', label: 'Egg sacs', group: 'Kills', format: kills },
  { id: 'raider', label: 'Gravecutter raiders', group: 'Kills', format: kills },
  { id: 'brute', label: 'Gravecutter brutes', group: 'Kills', format: kills },
];

export const BOARD_IDS = BOARDS.map((b) => b.id);
export const boardDef = (id: BoardId) => BOARDS.find((b) => b.id === id)!;

/** What a finished run sends to the hall of fame. */
export interface RunReport {
  extracted: boolean;
  salvage: number;
  durationMs: number;
  depth: number;
  kills: Partial<Record<EnemyKind, number>>;
  elites: number;
  bounties: number;
  boss: BossId | null;
  bossMs: number | null;
}

export const RUN_LIMITS = {
  minDurationMs: 10_000,
  maxDurationMs: 3 * 60 * 60 * 1000,
  maxDepth: 5,
  salvagePerDepth: 1500,
  salvagePerSecond: 12,
  maxKillsPerKind: 400,
  killsPerSecond: 2,
  minBossMs: 10_000,
} as const;

export function checkRunReport(r: RunReport): { ok: true } | { ok: false; reason: string } {
  const secs = r.durationMs / 1000;
  if (r.durationMs < RUN_LIMITS.minDurationMs || r.durationMs > RUN_LIMITS.maxDurationMs) return { ok: false, reason: 'Run length out of range' };
  if (!Number.isInteger(r.depth) || r.depth < 1 || r.depth > RUN_LIMITS.maxDepth) return { ok: false, reason: 'Depth out of range' };
  if (r.salvage < 0 || r.salvage > RUN_LIMITS.salvagePerDepth * r.depth || r.salvage / secs > RUN_LIMITS.salvagePerSecond) {
    return { ok: false, reason: 'Salvage out of range' };
  }
  const counts = Object.values(r.kills) as number[];
  if (counts.some((k) => !Number.isInteger(k) || k < 0 || k > RUN_LIMITS.maxKillsPerKind)) return { ok: false, reason: 'Kills out of range' };
  const total = counts.reduce((a, b) => a + b, 0);
  if (total > Math.floor(secs) * RUN_LIMITS.killsPerSecond + 5) return { ok: false, reason: 'Kills too fast' };
  if (r.elites < 0 || r.elites > total || r.bounties < 0 || r.bounties > r.depth) return { ok: false, reason: 'Elites or bounties out of range' };
  if (r.boss && (r.bossMs === null || r.bossMs < RUN_LIMITS.minBossMs || r.bossMs > r.durationMs)) return { ok: false, reason: 'Boss time out of range' };
  return { ok: true };
}

export interface HallEntry {
  rank: number;
  callsign: string;
  value: number;
  isYou: boolean;
}
