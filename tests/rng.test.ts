import { describe, expect, it } from 'vitest';
import { createRng } from '../src/core/rng';

describe('createRng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 50 }, a.next)).toEqual(Array.from({ length: 50 }, b.next));
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(Array.from({ length: 10 }, a.next)).not.toEqual(Array.from({ length: 10 }, b.next));
  });

  it('keeps next() within [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const n = rng.next();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });

  it('int() is inclusive and hits both ends', () => {
    const rng = createRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 5_000; i++) {
      const n = rng.int(3, 6);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(6);
      seen.add(n);
    }
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });

  it('shuffle() keeps every item and leaves the input alone', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = createRng(5).shuffle(input);
    expect(out).not.toBe(input);
    expect([...out].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('pick() throws on an empty array', () => {
    expect(() => createRng(1).pick([])).toThrow(RangeError);
  });
});
