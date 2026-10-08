/**
 * Small deterministic random number generator (mulberry32).
 * The same seed always produces the same sequence, which is what makes
 * seeded runs and the Daily Derelict possible.
 */
export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Returns a new shuffled array; the input is not modified. */
  shuffle<T>(items: readonly T[]): T[];
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (max < min) throw new RangeError(`int(${min}, ${max}): max < min`);
    return min + Math.floor(next() * (max - min + 1));
  };

  return {
    next,
    int,
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new RangeError('pick() from empty array');
      return items[int(0, items.length - 1)];
    },
    shuffle: (items) => {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(0, i);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}
