import { describe, expect, it } from 'vitest';
import { DECK_OPTIONS, MEDKIT_MIN_DISTANCE, MIN_ENEMY_DISTANCE, generateDeck } from '../src/core/deckGenerator';
import { bfsDistances } from '../src/core/pathing';
import { ENEMY_KINDS, SHIP_TYPES, Tile, type EnemyKind, type ShipType } from '../src/core/types';

const SEEDS = Array.from({ length: 100 }, (_, i) => `test-seed-${i}`);
const CASES: [string, ShipType][] = SHIP_TYPES.flatMap((ship) => SEEDS.map((s): [string, ShipType] => [s, ship]));

const isEnemy = (kind: string): kind is EnemyKind => ENEMY_KINDS.includes(kind as EnemyKind);

describe('generateDeck', () => {
  it('is deterministic for the same seed and ship', () => {
    expect(generateDeck('HULK42')).toEqual(generateDeck('HULK42'));
    expect(generateDeck('HULK42', 'research')).toEqual(generateDeck('HULK42', 'research'));
  });

  it('produces different ships for different seeds and ship types', () => {
    expect(generateDeck('A').tiles).not.toEqual(generateDeck('B').tiles);
    expect(generateDeck('A').tiles).not.toEqual(generateDeck('A', 'research').tiles);
  });

  it.each(CASES)('%s (%s): every floor tile is reachable from the start', (seed, ship) => {
    const deck = generateDeck(seed, ship);
    const dist = bfsDistances(deck.tiles, deck.start);
    deck.tiles.forEach((row, y) =>
      row.forEach((t, x) => {
        if (t === Tile.Floor) expect(dist[y][x], `tile ${x},${y}`).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it.each(CASES)('%s (%s): extraction is reachable and away from the start', (seed, ship) => {
    const deck = generateDeck(seed, ship);
    const dist = bfsDistances(deck.tiles, deck.start);
    expect(dist[deck.extraction.y][deck.extraction.x]).toBeGreaterThan(10);
  });

  it.each(CASES)('%s (%s): border is solid and spawns sit on unique floor tiles', (seed, ship) => {
    const deck = generateDeck(seed, ship);
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

  it.each(CASES)('%s (%s): enemies never spawn near the start', (seed, ship) => {
    const deck = generateDeck(seed, ship);
    const dist = bfsDistances(deck.tiles, deck.start);
    for (const e of deck.spawns.filter((s) => isEnemy(s.kind))) {
      expect(dist[e.y][e.x]).toBeGreaterThanOrEqual(MIN_ENEMY_DISTANCE);
    }
  });

  it.each(CASES)('%s (%s): exactly one data log, deep in the ship', (seed, ship) => {
    const deck = generateDeck(seed, ship);
    const dist = bfsDistances(deck.tiles, deck.start);
    const logs = deck.spawns.filter((s) => s.kind === 'datalog');
    expect(logs).toHaveLength(1);
    const furthest = Math.max(...dist.flat());
    expect(dist[logs[0].y][logs[0].x]).toBeGreaterThanOrEqual(Math.floor(furthest * 0.6));
  });

  it.each(SEEDS)('%s: freighters have drones and wall-mounted turrets, no aliens', (seed) => {
    const deck = generateDeck(seed, 'freighter');
    const kinds = new Set(deck.spawns.map((s) => s.kind));
    expect(kinds.has('drone')).toBe(true);
    for (const alien of ['crawler', 'spitter', 'egg']) expect(kinds.has(alien as EnemyKind)).toBe(false);
    for (const t of deck.spawns.filter((s) => s.kind === 'turret')) {
      const touchesWall = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => deck.tiles[t.y + dy][t.x + dx] === Tile.Wall);
      expect(touchesWall).toBe(true);
    }
  });

  it.each(SEEDS)('%s: research vessels have aliens, no drones or turrets', (seed) => {
    const kinds = new Set(generateDeck(seed, 'research').spawns.map((s) => s.kind));
    expect(kinds.has('crawler')).toBe(true);
    expect(kinds.has('drone')).toBe(false);
    expect(kinds.has('turret')).toBe(false);
  });

  it.each(CASES)('%s (%s): cutting weak walls only ever adds shortcuts', (seed, ship) => {
    const deck = generateDeck(seed, ship);
    for (const w of deck.weakWalls) expect(deck.tiles[w.y][w.x]).toBe(Tile.WeakWall);

    const before = bfsDistances(deck.tiles, deck.start);
    const cut = deck.tiles.map((row) => row.map((t) => (t === Tile.WeakWall ? Tile.Floor : t)));
    const after = bfsDistances(cut, deck.start);
    const { x, y } = deck.extraction;
    expect(after[y][x]).toBeLessThanOrEqual(before[y][x]);
    for (const w of deck.weakWalls) expect(after[w.y][w.x]).toBeGreaterThan(0);
  });

  it('places torch shortcuts on most ships', () => {
    for (const ship of SHIP_TYPES) {
      const withShortcuts = SEEDS.filter((s) => generateDeck(s, ship).weakWalls.length > 0).length;
      expect(withShortcuts / SEEDS.length, ship).toBeGreaterThan(0.6);
    }
  });

  it('item values stay inside their configured ranges', () => {
    for (const ship of SHIP_TYPES) {
      const rules = new Map(DECK_OPTIONS[ship].spawns);
      for (const s of generateDeck('loot', ship).spawns.filter((x) => !['medkit', 'drum', 'mimic', 'stalker'].includes(x.kind))) {
        const [lo, hi] = rules.get(s.kind)!.value;
        expect(s.value).toBeGreaterThanOrEqual(lo);
        expect(s.value).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('places most of the requested spawns', () => {
    for (const ship of SHIP_TYPES) {
      const wanted = DECK_OPTIONS[ship].spawns.reduce((n, [, r]) => n + r.count, 0);
      const counts = SEEDS.slice(0, 30).map((s) => generateDeck(s, ship).spawns.length);
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      expect(avg / wanted, ship).toBeGreaterThan(0.9);
    }
  });

  describe('health packs', () => {
    it('places the full set on every ship, each in a different room away from the start', () => {
      for (const [seed, ship] of CASES) {
        const deck = generateDeck(seed, ship);
        const kits = deck.spawns.filter((s) => s.kind === 'medkit');
        expect(kits, `${seed} ${ship}`).toHaveLength(DECK_OPTIONS[ship].medkits.count);
        const dist = bfsDistances(deck.tiles, deck.start);
        const roomOf = (p: { x: number; y: number }) =>
          deck.rooms.findIndex((r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h);
        expect(new Set(kits.map(roomOf)).size).toBe(kits.length);
        for (const k of kits) {
          expect(deck.tiles[k.y][k.x]).toBe(Tile.Floor);
          expect(dist[k.y][k.x]).toBeGreaterThanOrEqual(MEDKIT_MIN_DISTANCE);
          expect(k.value).toBe(DECK_OPTIONS[ship].medkits.heal);
        }
        const keys = deck.spawns.map((s) => `${s.x},${s.y}`);
        expect(new Set(keys).size, 'no two spawns share a tile').toBe(keys.length);
      }
    });

    it('places explosive drums against walls, apart, away from the start', () => {
      for (const [seed, ship] of CASES) {
        const deck = generateDeck(seed, ship);
        const drums = deck.spawns.filter((s) => s.kind === 'drum');
        expect(drums.length, `${seed} ${ship}`).toBeGreaterThanOrEqual(DECK_OPTIONS[ship].drums - 1);
        const dist = bfsDistances(deck.tiles, deck.start);
        for (const d of drums) {
          expect(deck.tiles[d.y][d.x]).toBe(Tile.Floor);
          expect(dist[d.y][d.x]).toBeGreaterThanOrEqual(6);
          const wall = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => deck.tiles[d.y + dy]?.[d.x + dx] === Tile.Wall);
          expect(wall).toBe(true);
          expect(Math.abs(d.x - deck.extraction.x) > 1 || Math.abs(d.y - deck.extraction.y) > 1).toBe(true);
        }
      }
    });

    it('hide mimic crates on freighters only, away from the start', () => {
      for (const [seed, ship] of CASES) {
        const deck = generateDeck(seed, ship);
        const mimics = deck.spawns.filter((s) => s.kind === 'mimic');
        const stalkers = deck.spawns.filter((s) => s.kind === 'stalker');
        expect(stalkers.length).toBe(ship === 'research' ? DECK_OPTIONS.research.stalkers : 0);
        for (const m of stalkers) expect(bfsDistances(deck.tiles, deck.start)[m.y][m.x]).toBeGreaterThanOrEqual(MIN_ENEMY_DISTANCE);
        if (ship !== 'freighter') expect(mimics).toHaveLength(0);
        else expect(mimics.length, seed).toBe(DECK_OPTIONS.freighter.mimics);
        const dist = bfsDistances(deck.tiles, deck.start);
        for (const m of mimics) expect(dist[m.y][m.x]).toBeGreaterThanOrEqual(MIN_ENEMY_DISTANCE);
      }
    });

    it('put shock floors inside rooms, away from the start and exit rooms', () => {
      for (const [seed, ship] of CASES) {
        const deck = generateDeck(seed, ship);
        expect(deck.hazards!.length).toBeLessThanOrEqual(DECK_OPTIONS[ship].hazards);
        for (const h of deck.hazards!) {
          for (let y = h.y; y < h.y + h.h; y++) for (let x = h.x; x < h.x + h.w; x++) expect(deck.tiles[y][x]).toBe(Tile.Floor);
          const inside = (p: { x: number; y: number }) => p.x >= h.x - 1 && p.x <= h.x + h.w && p.y >= h.y - 1 && p.y <= h.y + h.h;
          expect(inside(deck.start)).toBe(false);
          expect(inside(deck.extraction)).toBe(false);
        }
      }
    });

    it("don't change anything else about a seed's layout", () => {
      for (const ship of SHIP_TYPES) {
        for (const seed of SEEDS.slice(0, 20)) {
          const withKits = generateDeck(seed, ship);
          const without = generateDeck(seed, ship, { medkits: { count: 0, heal: 0 }, drums: 0, mimics: 0, hazards: 0, stalkers: 0 });
          const added = ['medkit', 'drum', 'mimic', 'stalker'];
          expect({ ...withKits, hazards: [], spawns: withKits.spawns.filter((s) => !added.includes(s.kind)) }).toEqual(without);
        }
      }
    });
  });
});
