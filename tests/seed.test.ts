import { describe, expect, it } from 'vitest';
import { dailySeed, hashString, randomSeed, resolveSeed } from '../src/core/seed';

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
    expect(resolveSeed('?daily', now, fixed)).toEqual({ seed: 'daily-2026-10-08', mode: 'daily' });
  });

  it('handles ?seed=', () => {
    expect(resolveSeed('?seed=HULK42', now, fixed)).toEqual({ seed: 'HULK42', mode: 'custom' });
  });

  it('falls back to a random seed', () => {
    expect(resolveSeed('', now, fixed)).toEqual({ seed: 'AAAAAA', mode: 'random' });
    expect(resolveSeed('?seed=', now, fixed).mode).toBe('random');
  });

  it('caps custom seed length', () => {
    expect(resolveSeed(`?seed=${'x'.repeat(100)}`, now, fixed).seed).toHaveLength(32);
  });
});
