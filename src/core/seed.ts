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
}

/**
 * Picks the run seed from the page URL:
 *   ?daily        -> today's Daily Derelict
 *   ?seed=ABC123  -> a specific ship
 *   (nothing)     -> a random ship
 */
export function resolveSeed(
  search: string,
  now: Date = new Date(),
  random: () => number = Math.random,
): ResolvedSeed {
  const params = new URLSearchParams(search);
  if (params.has('daily')) return { seed: dailySeed(now), mode: 'daily' };
  const custom = params.get('seed')?.trim();
  if (custom) return { seed: custom.slice(0, 32), mode: 'custom' };
  return { seed: randomSeed(random), mode: 'random' };
}
