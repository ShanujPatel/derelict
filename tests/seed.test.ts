import { describe, expect, it } from 'vitest';
import { MINING_DAILY_FROM, dailySeed, dailyShip, hashString, randomSeed, resolveSeed, seedQuery } from '../src/core/seed';

describe('hashString', () => {
  it('is stable', () => {
    expect(hashString('derelict')).toBe(hashString('derelict'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });

  it('returns an unsigned 32-bit integer', () => {
    const h = hashString('any seed at all');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(2 ** 32);
  });
});

describe('dailySeed', () => {
  it('uses the UTC date', () => {
    expect(dailySeed(new Date('2026-10-08T23:30:00Z'))).toBe('daily-2026-10-08');
    expect(dailySeed(new Date('2026-01-02T00:00:00Z'))).toBe('daily-2026-01-02');
  });
});

describe('randomSeed', () => {
  it('avoids look-alike characters', () => {
    const seed = randomSeed(() => 0.999, 12);
    expect(seed).toHaveLength(12);
    expect(seed).not.toMatch(/[01IO]/);
  });
});

describe('resolveSeed', () => {
  const now = new Date('2026-10-08T12:00:00Z');
  const fixed = () => 0;

  it('handles ?daily', () => {
    expect(resolveSeed('?daily', now, fixed)).toEqual({
      seed: 'daily-2026-10-08',
      mode: 'daily',
      ship: dailyShip('daily-2026-10-08'),
    });
  });

  it('handles ?seed=', () => {
    expect(resolveSeed('?seed=HULK42', now, fixed)).toEqual({ seed: 'HULK42', mode: 'custom', ship: 'freighter' });
    expect(resolveSeed('?seed=HULK42&ship=research', now, fixed).ship).toBe('research');
    expect(resolveSeed('?seed=HULK42&ship=castle', now, fixed).ship).toBe('freighter');
  });

  it('falls back to a random seed', () => {
    expect(resolveSeed('', now, fixed)).toEqual({ seed: 'AAAAAA', mode: 'random', ship: 'freighter' });
    expect(resolveSeed('?seed=', now, fixed).mode).toBe('random');
  });

  it('caps custom seed length', () => {
    expect(resolveSeed(`?seed=${'x'.repeat(100)}`, now, fixed).seed).toHaveLength(32);
  });
});

describe('dailyShip', () => {
  it('alternates freighters and research vessels before mining haulers joined', () => {
    const ships = new Set(
      Array.from({ length: 11 }, (_, i) => dailyShip(dailySeed(new Date(Date.UTC(2026, 9, 1 + i))))),
    );
    expect(ships).toEqual(new Set(['freighter', 'research']));
  });

  it('rotates through all three ship types from 12 October 2026', () => {
    expect(MINING_DAILY_FROM).toBe('2026-10-12');
    const ships = new Set(
      Array.from({ length: 30 }, (_, i) => dailyShip(dailySeed(new Date(Date.UTC(2026, 9, 12 + i))))),
    );
    expect(ships).toEqual(new Set(['freighter', 'research', 'mining']));
  });
});

describe('seedQuery', () => {
  it('round-trips through resolveSeed', () => {
    for (const run of [
      { seed: 'ABC', mode: 'custom' as const, ship: 'freighter' as const },
      { seed: 'XYZ', mode: 'random' as const, ship: 'research' as const },
    ]) {
      const back = resolveSeed(seedQuery(run));
      expect(back.seed).toBe(run.seed);
      expect(back.ship).toBe(run.ship);
    }
    expect(seedQuery({ seed: 'daily-2026-10-09', mode: 'daily', ship: 'research' })).toBe('?daily');
  });
});
