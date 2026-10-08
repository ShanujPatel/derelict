import { describe, expect, it } from 'vitest';
import {
  createOxygen,
  isOxygenEmpty,
  refillOxygen,
  spendOxygen,
  tickOxygen,
} from '../src/core/oxygen';
import { WEAPONS, pelletAngles } from '../src/core/weapons';

describe('oxygen', () => {
  it('drains over time', () => {
    const o = tickOxygen(createOxygen(100, 2), 10);
    expect(o.current).toBe(80);
  });

  it('never goes below zero or above max', () => {
    expect(tickOxygen(createOxygen(10, 5), 100).current).toBe(0);
    expect(refillOxygen(createOxygen(100), 50).current).toBe(100);
    expect(spendOxygen(createOxygen(10), 50).current).toBe(0);
  });

  it('reports empty', () => {
    expect(isOxygenEmpty(createOxygen())).toBe(false);
    expect(isOxygenEmpty(tickOxygen(createOxygen(1, 1), 2))).toBe(true);
  });

  it('does not mutate the original state', () => {
    const o = createOxygen();
    tickOxygen(o, 5);
    expect(o.current).toBe(100);
  });
});

describe('pelletAngles', () => {
  it('fires a single shot straight for the blaster', () => {
    expect(pelletAngles(WEAPONS.blaster, 1.2)).toEqual([1.2]);
  });

  it('spreads scattergun pellets evenly around the aim', () => {
    const angles = pelletAngles(WEAPONS.scattergun, 0);
    expect(angles).toHaveLength(WEAPONS.scattergun.pellets);
    expect(angles[0]).toBeCloseTo(-WEAPONS.scattergun.spread / 2);
    expect(angles[angles.length - 1]).toBeCloseTo(WEAPONS.scattergun.spread / 2);
    expect(angles.reduce((a, b) => a + b, 0)).toBeCloseTo(0);
  });
});
