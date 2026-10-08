import { describe, expect, it } from 'vitest';
import { DEFAULT_DECK_OPTIONS, generateDeck, toDisplayTiles } from '../src/core/deckGenerator';
import { bfsDistances } from '../src/core/pathing';
import { Tile } from '../src/core/types';

const SEEDS = Array.from({ length: 150 }, (_, i) => `test-seed-${i}`);

describe('generateDeck', () => {
  it('is deterministic for the same seed', () => {
    expect(generateDeck('HULK42')).toEqual(generateDeck('HULK42'));
  });

  it('produces different ships for different seeds', () => {
    expect(generateDeck('A').tiles).not.toEqual(generateDeck('B').tiles);
  });

  it.each(SEEDS)('%s: every floor tile is reachable from the start', (seed) => {
    const deck = generateDeck(seed);
    const dist = bfsDistances(deck.tiles, deck.start);
    deck.tiles.forEach((row, y) =>
      row.forEach((t, x) => {
        if (t === Tile.Floor) expect(dist[y][x], `tile ${x},${y}`).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it.each(SEEDS)('%s: extraction is reachable and away from the start', (seed) => {
    const deck = generateDeck(seed);
    const dist = bfsDistances(deck.tiles, deck.start);
    expect(dist[deck.extraction.y][deck.extraction.x]).toBeGreaterThan(10);
  });

  it.each(SEEDS)('%s: border is solid and spawns sit on unique floor tiles', (seed) => {
    const deck = generateDeck(seed);
    const { width: w, height: h, tiles } = deck;
    for (let x = 0; x < w; x++) {
      expect(tiles[0][x]).toBe(Tile.Wall);
      expect(tiles[h - 1][x]).toBe(Tile.Wall);
    }
    for (let y = 0; y < h; y++) {
      expect(tiles[y][0]).toBe(Tile.Wall);
      expect(tiles[y][w - 1]).toBe(Tile.Wall);
    }
    const keys = deck.spawns.map((s) => `${s.x},${s.y}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(`${deck.start.x},${deck.start.y}`);
    for (const s of deck.spawns) expect(tiles[s.y][s.x]).toBe(Tile.Floor);
  });

  it.each(SEEDS)('%s: drones never spawn near the start', (seed) => {
    const deck = generateDeck(seed);
    const dist = bfsDistances(deck.tiles, deck.start);
    for (const d of deck.spawns.filter((s) => s.kind === 'drone')) {
      expect(dist[d.y][d.x]).toBeGreaterThanOrEqual(DEFAULT_DECK_OPTIONS.minDroneDistance);
    }
  });

  it.each(SEEDS)('%s: cutting weak walls only ever adds shortcuts', (seed) => {
    const deck = generateDeck(seed);
    for (const w of deck.weakWalls) expect(deck.tiles[w.y][w.x]).toBe(Tile.WeakWall);

    const before = bfsDistances(deck.tiles, deck.start);
    const cut = deck.tiles.map((row) => row.map((t) => (t === Tile.WeakWall ? Tile.Floor : t)));
    const after = bfsDistances(cut, deck.start);
    const { x, y } = deck.extraction;
    expect(after[y][x]).toBeLessThanOrEqual(before[y][x]);
    // Every cut tile joins the existing deck rather than opening a sealed pocket.
    for (const w of deck.weakWalls) expect(after[w.y][w.x]).toBeGreaterThan(0);
  });

  it('places torch shortcuts on most ships', () => {
    const withShortcuts = SEEDS.filter((s) => generateDeck(s).weakWalls.length > 0).length;
    expect(withShortcuts / SEEDS.length).toBeGreaterThan(0.7);
  });

  it('salvage values are deterministic and in range', () => {
    const salvage = generateDeck('loot').spawns.filter((s) => s.kind === 'salvage');
    expect(salvage.length).toBeGreaterThan(0);
    for (const s of salvage) {
      expect(s.value).toBeGreaterThanOrEqual(5);
      expect(s.value).toBeLessThanOrEqual(25);
    }
  });
});

describe('toDisplayTiles', () => {
  it('turns walls with no nearby floor into void, keeping floor and edge walls', () => {
    const deck = generateDeck('display');
    const display = toDisplayTiles(deck.tiles);
    expect(display[0][0]).toBe(Tile.Void);
    deck.tiles.forEach((row, y) =>
      row.forEach((t, x) => {
        if (t === Tile.Floor || t === Tile.WeakWall) expect(display[y][x]).toBe(t);
      }),
    );
  });
});
