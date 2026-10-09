import { DEPTH, baseSeed, deeperSeed, depthMods, placeLift } from '../src/core/depth';
import { bfsDistances } from '../src/core/pathing';
import { describe, expect, it } from 'vitest';
import { CONDITIONS, conditionFor, isElite } from '../src/core/conditions';
import { generateDeck } from '../src/core/deckGenerator';
import {
  BARREL,
  DODGE,
  DROP_RULES,
  blastDamage,
  createExplored,
  dodgeDirection,
  dodgeDistance,
  dodgeReadiness,
  exploredFraction,
  isExplored,
  reveal,
  rollSupplyDrop,
  POWERUPS,
  rollPowerup,
  SHOCK,
  onHazard,
  shockState,
} from '../src/core/fieldkit';
import { Tile } from '../src/core/types';

describe('dodge roll', () => {
  it('is ready at the start and recharges over the cooldown', () => {
    expect(dodgeReadiness(5000, 0)).toBe(1);
    expect(dodgeReadiness(1000, 1000)).toBe(0);
    expect(dodgeReadiness(1000 + DODGE.cooldownMs / 2, 1000)).toBeCloseTo(0.5);
    expect(dodgeReadiness(1000 + DODGE.cooldownMs, 1000)).toBe(1);
  });

  it('recharges slower for the robot', () => {
    expect(dodgeReadiness(1000 + DODGE.cooldownMs, 1000, true)).toBeLessThan(1);
  });

  it('rolls the way you move, or the way you aim when standing still', () => {
    expect(dodgeDirection(3, 4, 0)).toEqual({ x: 0.6, y: 0.8 });
    const d = dodgeDirection(0, 0, Math.PI / 2);
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeCloseTo(1);
  });

  it('covers about three tiles, a little less for the robot', () => {
    expect(dodgeDistance(false)).toBeCloseTo(51, 0);
    expect(dodgeDistance(true)).toBeLessThan(dodgeDistance(false));
  });

  it("can't be hit for the whole roll", () => {
    expect(DODGE.invulnerableMs).toBeGreaterThanOrEqual(DODGE.durationMs);
  });
});

describe('supply drops', () => {
  it('drops nothing on a high roll', () => {
    expect(rollSupplyDrop(0.99, 0, 0.1, 0.1)).toBeNull();
    expect(rollSupplyDrop(DROP_RULES.baseChance, 0, 1, 1)).toBeNull();
  });

  it('drops more often when you are running low', () => {
    const roll = DROP_RULES.baseChance + 0.05;
    expect(rollSupplyDrop(roll, 0, 1, 1)).toBeNull();
    expect(rollSupplyDrop(roll, 0, 0.2, 1)).not.toBeNull();
  });

  it('leans towards what you need most', () => {
    expect(rollSupplyDrop(0, 0.7, 0.2, 1)).toBe('medkit');
    expect(rollSupplyDrop(0, 0.3, 1, 0.2)).toBe('oxygen');
    expect(rollSupplyDrop(0, 0.4, 1, 1)).toBe('medkit');
    expect(rollSupplyDrop(0, 0.6, 1, 1)).toBe('oxygen');
  });
});

describe('barrel blasts', () => {
  it('hurts most at the centre and nothing outside the radius', () => {
    expect(blastDamage(0, 30)).toBe(30);
    expect(blastDamage(BARREL.radius - 0.01, 30)).toBe(10);
    expect(blastDamage(BARREL.radius, 30)).toBe(0);
    expect(blastDamage(BARREL.radius / 2, 30)).toBeLessThan(30);
  });
});

describe('scanner map', () => {
  const deck = generateDeck('SCANME');
  const w = deck.width;

  it('reveals the room you start in and a circle round you', () => {
    const explored = createExplored(w, deck.height);
    const added = reveal(explored, deck.tiles, deck.rooms, deck.start);
    expect(added).toBeGreaterThan(0);
    const r = deck.rooms[0];
    expect(isExplored(explored, w, { x: r.x, y: r.y })).toBe(true);
    expect(isExplored(explored, w, { x: r.x + r.w - 1, y: r.y + r.h - 1 })).toBe(true);
    expect(isExplored(explored, w, deck.extraction)).toBe(false);
    // Nothing new the second time.
    expect(reveal(explored, deck.tiles, deck.rooms, deck.start)).toBe(0);
  });

  it('counts how much of the floor is mapped', () => {
    const explored = createExplored(w, deck.height);
    expect(exploredFraction(explored, deck.tiles)).toBe(0);
    explored.fill(1);
    expect(exploredFraction(explored, deck.tiles)).toBe(1);
    const tiny = [[Tile.Floor, Tile.Wall], [Tile.Floor, Tile.Floor]];
    const half = createExplored(2, 2);
    half[0] = 1;
    expect(exploredFraction(half, tiny)).toBeCloseTo(1 / 3);
  });

  it('stays inside the deck at the edges', () => {
    const explored = createExplored(w, deck.height);
    expect(() => reveal(explored, deck.tiles, deck.rooms, { x: 0, y: 0 })).not.toThrow();
  });
});

describe('ship conditions and elites', () => {
  it('are fixed per seed and ship', () => {
    expect(conditionFor('daily-2026-10-09', 'research')).toBe(conditionFor('daily-2026-10-09', 'research'));
  });

  it('come up in roughly their intended mix', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const c = conditionFor(`s${i}`, 'freighter').id;
      counts[c] = (counts[c] ?? 0) + 1;
    }
    expect(Object.keys(counts).sort()).toEqual(Object.keys(CONDITIONS).sort());
    expect(counts.calm / 2000).toBeGreaterThan(0.2);
    expect(counts.calm / 2000).toBeLessThan(0.4);
  });

  it('only change modifiers that make sense', () => {
    for (const c of Object.values(CONDITIONS)) {
      expect(c.oxygenDrain).toBeGreaterThanOrEqual(1);
      expect(c.salvage).toBeGreaterThanOrEqual(1);
      expect(c.eliteChance).toBeGreaterThan(0);
      expect(c.eliteChance).toBeLessThan(0.5);
    }
  });

  it('pick elites from the seed, more often on hardened ships', () => {
    expect(isElite('X', 'freighter', 3, 0.3)).toBe(isElite('X', 'freighter', 3, 0.3));
    const share = (chance: number) => Array.from({ length: 1000 }, (_, i) => isElite('Y', 'freighter', i, chance)).filter(Boolean).length / 1000;
    expect(share(0.08)).toBeGreaterThan(0.04);
    expect(share(0.08)).toBeLessThan(0.13);
    expect(share(0.3)).toBeGreaterThan(share(0.08));
  });
});

describe('shock floors', () => {
  it('cycle live, off, then warn before going live again', () => {
    expect(shockState(0, 0)).toBe('on');
    expect(shockState(SHOCK.onMs + 10, 0)).toBe('off');
    expect(shockState(SHOCK.periodMs - 10, 0)).toBe('warn');
    expect(shockState(SHOCK.periodMs, 0)).toBe('on');
    expect(shockState(0, SHOCK.periodMs - 10)).toBe('warn');
  });

  it('know which tiles they cover', () => {
    const h = { x: 2, y: 3, w: 3, h: 2, phaseMs: 0 };
    expect(onHazard(h, 2, 3)).toBe(true);
    expect(onHazard(h, 4, 4)).toBe(true);
    expect(onHazard(h, 5, 4)).toBe(false);
    expect(onHazard(h, 2, 5)).toBe(false);
  });
});

describe('deep dive', () => {
  it('gets harder and richer each level down, up to the cap', () => {
    expect(depthMods(1)).toEqual({ eliteBonus: 0, salvage: 1, enemySpeed: 1 });
    expect(depthMods(3).salvage).toBeCloseTo(1.5);
    expect(depthMods(99)).toEqual(depthMods(DEPTH.max));
  });

  it('names deeper decks after the first', () => {
    expect(deeperSeed('ABC', 2)).toBe('ABC-D2');
    expect(deeperSeed('ABC-D2', 3)).toBe('ABC-D3');
    expect(baseSeed('ABC-D4')).toBe('ABC');
  });

  it('puts the lift far from the start, off the exit room and any spawn', () => {
    let placed = 0;
    for (let i = 0; i < 60; i++) {
      const deck = generateDeck(`lift-${i}`);
      const dist = bfsDistances(deck.tiles, deck.start);
      const lift = placeLift(deck, dist);
      if (!lift) continue;
      placed++;
      expect(deck.tiles[lift.y][lift.x]).toBe(Tile.Floor);
      expect(dist[lift.y][lift.x]).toBeGreaterThanOrEqual(Math.max(...dist.flat()) * 0.5);
      expect(deck.spawns.some((s) => s.x === lift.x && s.y === lift.y)).toBe(false);
      expect(lift).not.toEqual(deck.extraction);
    }
    expect(placed).toBeGreaterThan(50);
  });
});

describe('power-ups', () => {
  it('always drop from elites and bounties, rarely otherwise', () => {
    expect(rollPowerup(0.99, 0.2, true)).toBe('overdrive');
    expect(rollPowerup(0.99, 0.8, true)).toBe('aegis');
    expect(rollPowerup(0.99, 0.2, false)).toBeNull();
    expect(rollPowerup(POWERUPS.chance / 2, 0.2, false)).toBe('overdrive');
  });
});
