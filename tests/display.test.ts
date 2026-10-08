import { describe, expect, it } from 'vitest';
import { generateDeck } from '../src/core/deckGenerator';
import {
  DisplayTile,
  SOLID_DISPLAY_TILES,
  buildDisplayMap,
  displayTileAt,
  lampPositions,
} from '../src/core/display';
import { hashString } from '../src/core/seed';
import { Tile } from '../src/core/types';

const FLOOR_TILES: DisplayTile[] = [
  DisplayTile.Floor,
  DisplayTile.Grate,
  DisplayTile.Vent,
  DisplayTile.Hazard,
  DisplayTile.FloorShadow,
];

describe('buildDisplayMap', () => {
  const seeds = ['A', 'B', 'HULK42', 'daily-2026-10-08'];

  it('is deterministic', () => {
    const deck = generateDeck('HULK42');
    expect(buildDisplayMap(deck.tiles, 1)).toEqual(buildDisplayMap(deck.tiles, 1));
  });

  it.each(seeds)('%s: walkable tiles look walkable and solid tiles look solid', (seed) => {
    const deck = generateDeck(seed);
    const display = buildDisplayMap(deck.tiles, hashString(seed));
    deck.tiles.forEach((row, y) =>
      row.forEach((t, x) => {
        const d = display[y][x];
        if (t === Tile.Floor) expect(FLOOR_TILES).toContain(d);
        else expect(SOLID_DISPLAY_TILES).toContain(d);
      }),
    );
  });

  it.each(seeds)('%s: wall faces sit directly above floor', (seed) => {
    const deck = generateDeck(seed);
    const display = buildDisplayMap(deck.tiles, hashString(seed));
    display.forEach((row, y) =>
      row.forEach((d, x) => {
        if (d === DisplayTile.WallFace) expect(deck.tiles[y + 1][x]).toBe(Tile.Floor);
        if (d === DisplayTile.FloorShadow) expect(deck.tiles[y - 1][x]).not.toBe(Tile.Floor);
      }),
    );
  });

  it('uses some floor variety', () => {
    const deck = generateDeck('variety');
    const used = new Set(buildDisplayMap(deck.tiles, 7).flat());
    expect(used.has(DisplayTile.Grate) || used.has(DisplayTile.Vent)).toBe(true);
  });
});

describe('displayTileAt', () => {
  it('turns a cut weak wall into floor and the wall above into a face', () => {
    const W = Tile.Wall;
    const F = Tile.Floor;
    const tiles: Tile[][] = [
      [W, W, W],
      [W, W, W],
      [W, Tile.WeakWall, W],
      [F, F, F],
    ];
    expect(displayTileAt(tiles, 1, 1, 0)).toBe(DisplayTile.Wall);
    tiles[2][1] = F;
    expect(displayTileAt(tiles, 1, 2, 0)).toBe(DisplayTile.FloorShadow);
    expect(displayTileAt(tiles, 1, 1, 0)).toBe(DisplayTile.WallFace);
  });
});

describe('lampPositions', () => {
  it('only places lamps on wall faces', () => {
    const deck = generateDeck('lamps');
    const display = buildDisplayMap(deck.tiles, 3);
    const lamps = lampPositions(display, 3, 50);
    expect(lamps.length).toBeGreaterThan(0);
    for (const p of lamps) expect(display[p.y][p.x]).toBe(DisplayTile.WallFace);
  });
});
