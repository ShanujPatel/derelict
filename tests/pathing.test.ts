import { describe, expect, it } from 'vitest';
import { bfsDistances, hasLineOfSight } from '../src/core/pathing';
import { Tile } from '../src/core/types';

// '#' wall, '.' floor
const grid = (rows: string[]): Tile[][] =>
  rows.map((r) => [...r].map((c) => (c === '.' ? Tile.Floor : Tile.Wall)));

describe('bfsDistances', () => {
  const tiles = grid([
    '#######',
    '#...#.#',
    '#.#.#.#',
    '#.#...#',
    '#######',
  ]);

  it('measures walking distance round walls', () => {
    const d = bfsDistances(tiles, { x: 1, y: 1 });
    expect(d[1][1]).toBe(0);
    expect(d[1][3]).toBe(2);
    expect(d[1][5]).toBe(8);
  });

  it('marks walls as unreachable', () => {
    expect(bfsDistances(tiles, { x: 1, y: 1 })[2][2]).toBe(-1);
  });

  it('returns all -1 when starting in a wall', () => {
    expect(bfsDistances(tiles, { x: 0, y: 0 }).flat().every((v) => v === -1)).toBe(true);
  });
});

describe('hasLineOfSight', () => {
  const tiles = grid([
    '#######',
    '#.....#',
    '#..#..#',
    '#.....#',
    '#######',
  ]);

  it('sees along an open row', () => {
    expect(hasLineOfSight(tiles, { x: 1, y: 1 }, { x: 5, y: 1 })).toBe(true);
  });

  it('is blocked by a wall in the way', () => {
    expect(hasLineOfSight(tiles, { x: 1, y: 2 }, { x: 5, y: 2 })).toBe(false);
  });

  it('is symmetric for these cases', () => {
    expect(hasLineOfSight(tiles, { x: 5, y: 2 }, { x: 1, y: 2 })).toBe(false);
    expect(hasLineOfSight(tiles, { x: 5, y: 3 }, { x: 1, y: 1 })).toBe(
      hasLineOfSight(tiles, { x: 1, y: 1 }, { x: 5, y: 3 }),
    );
  });

  it('a tile can always see itself', () => {
    expect(hasLineOfSight(tiles, { x: 2, y: 2 }, { x: 2, y: 2 })).toBe(true);
  });
});
