import { BOSSES, BOSS_IDS, type BossId } from './bosses';
import { SHIP_TYPES, type ShipType } from './types';
import { weeklySeed, weeklySetup } from './weekly';
import type { Carry } from './depth';

/** FNV-1a 32-bit hash: turns a seed string into a number for the RNG. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Seed shared by every player on the same UTC day. */
export function dailySeed(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `daily-${y}-${m}-${d}`;
}

// No 0/O or 1/I so seeds are easy to read out and share.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomSeed(random: () => number = Math.random, length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return out;
}

export type SeedMode = 'daily' | 'weekly' | 'custom' | 'random' | 'boss';

export interface ResolvedSeed {
  seed: string;
  mode: SeedMode;
  ship: ShipType;
  /** Set for boss contracts: the run is that boss's arena. */
  boss?: BossId;
  /** Deep dive: what you carried down the lift (depth 2+). */
  carry?: Carry;
}

/** From this day the Daily Derelict rotates through all three ship types (earlier days keep theirs). */
export const MINING_DAILY_FROM = '2026-10-12';

/** The Daily Derelict picks a ship type from the date, the same for everyone. */
export function dailyShip(seed: string): ShipType {
  const day = seed.replace(/^daily-/, '');
  if (day >= MINING_DAILY_FROM) return (['freighter', 'research', 'mining'] as const)[hashString(seed) % 3];
  return hashString(seed) % 2 === 0 ? 'freighter' : 'research';
}

const parseShip = (value: string | null): ShipType =>
  SHIP_TYPES.includes(value as ShipType) ? (value as ShipType) : 'freighter';

/**
 * Picks the run seed from the page URL:
 *   ?daily                     -> today's Daily Derelict
 *   ?weekly                    -> this week's challenge (ship + two mutators)
 *   ?seed=ABC123[&ship=research] -> a specific ship
 *   ?boss=foreman[&seed=ABC123]  -> a boss contract arena
 *   (nothing)                  -> a random freighter
 */
export function resolveSeed(
  search: string,
  now: Date = new Date(),
  random: () => number = Math.random,
): ResolvedSeed {
  const params = new URLSearchParams(search);
  if (params.has('daily')) {
    const seed = dailySeed(now);
    return { seed, mode: 'daily', ship: dailyShip(seed) };
  }
  if (params.has('weekly')) {
    const seed = weeklySeed(now);
    return { seed, mode: 'weekly', ship: weeklySetup(seed).ship };
  }
  const boss = params.get('boss') as BossId | null;
  if (boss && BOSS_IDS.includes(boss)) {
    const seed = params.get('seed')?.trim().slice(0, 32) || randomSeed(random);
    return { seed, mode: 'boss', ship: BOSSES[boss].ship, boss };
  }
  const ship = parseShip(params.get('ship'));
  const custom = params.get('seed')?.trim();
  if (custom) return { seed: custom.slice(0, 32), mode: 'custom', ship };
  return { seed: randomSeed(random), mode: 'random', ship };
}

/** Query string that reproduces a run, for the address bar and sharing. */
export function seedQuery(run: ResolvedSeed): string {
  if (run.mode === 'daily') return '?daily';
  if (run.mode === 'weekly') return '?weekly';
  if (run.boss) return `?boss=${run.boss}&seed=${run.seed}`;
  return run.ship === 'freighter' ? `?seed=${run.seed}` : `?seed=${run.seed}&ship=${run.ship}`;
}
