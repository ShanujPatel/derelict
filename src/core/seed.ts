import { SHIP_TYPES, type ShipType } from './types';

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

export type SeedMode = 'daily' | 'custom' | 'random';

export interface ResolvedSeed {
  seed: string;
  mode: SeedMode;
  ship: ShipType;
}

/** The Daily Derelict alternates ship types by date, the same for everyone. */
export function dailyShip(seed: string): ShipType {
  return hashString(seed) % 2 === 0 ? 'freighter' : 'research';
}

const parseShip = (value: string | null): ShipType =>
  SHIP_TYPES.includes(value as ShipType) ? (value as ShipType) : 'freighter';

/**
 * Picks the run seed from the page URL:
 *   ?daily                     -> today's Daily Derelict
 *   ?seed=ABC123[&ship=research] -> a specific ship
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
  const ship = parseShip(params.get('ship'));
  const custom = params.get('seed')?.trim();
  if (custom) return { seed: custom.slice(0, 32), mode: 'custom', ship };
  return { seed: randomSeed(random), mode: 'random', ship };
}

/** Query string that reproduces a run, for the address bar and sharing. */
export function seedQuery(run: ResolvedSeed): string {
  if (run.mode === 'daily') return '?daily';
  return run.ship === 'freighter' ? `?seed=${run.seed}` : `?seed=${run.seed}&ship=${run.ship}`;
}
