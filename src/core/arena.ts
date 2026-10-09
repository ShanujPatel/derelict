import { BOSSES, type BossId } from './bosses';
import type { Deck } from './deckGenerator';
import { createRng } from './rng';
import { hashString } from './seed';
import { Tile, type Point, type Room, type Spawn } from './types';

/**
 * Boss arenas: handcrafted three-part layouts, with a little seeded variety.
 *
 *   VAULT     exit pad and the big loot, behind a sealed bulkhead
 *     ‖       the bulkhead (two wall tiles) opens when the boss dies
 *   ARENA     a big room with cover pillars and the boss's weak points
 *     |
 *   STAGING   where you board: supplies and a few guards
 *
 * Everything is mirrored about the middle, so neither side is the "easy" one.
 */
export const ARENA_WIDTH = 44;
export const ARENA_HEIGHT = 50;

export const SECTIONS = {
  vault: { x: 15, y: 2, w: 14, h: 8 },
  arena: { x: 5, y: 13, w: 34, h: 21 },
  staging: { x: 13, y: 38, w: 18, h: 9 },
} as const satisfies Record<string, Room>;

/** The two tiles that seal the vault until the boss is dead. */
export const DOOR: readonly Point[] = [
  { x: 21, y: 11 },
  { x: 22, y: 11 },
];

export type FeatureKind = 'coupling' | 'root' | 'pylon';

export interface ArenaFeature extends Point {
  kind: FeatureKind;
}

export interface ArenaDeck extends Deck {
  boss: BossId;
  sections: typeof SECTIONS;
  door: readonly Point[];
  /** The boss stands between this tile and the one to its right. */
  bossSpawn: Point;
  features: ArenaFeature[];
  /** Which cover layout this seed got (for tests and debugging). */
  pattern: number;
}

/** Cover pillars (2×2, left half only; mirrored to the right). */
const PILLAR_PATTERNS: readonly (readonly [number, number])[][] = [
  [[9, 19], [9, 27], [15, 23]],
  [[10, 17], [10, 29], [16, 21]],
  [[8, 23], [14, 17], [14, 29]],
];

const mirror = (x: number) => ARENA_WIDTH - 1 - x;

export function generateArena(seed: string, boss: BossId): ArenaDeck {
  const ship = BOSSES[boss].ship;
  const rng = createRng(hashString(`arena:${boss}:${seed}`));
  const tiles: Tile[][] = Array.from({ length: ARENA_HEIGHT }, () =>
    Array.from({ length: ARENA_WIDTH }, (): Tile => Tile.Wall),
  );
  const carve = (r: Room) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[y][x] = Tile.Floor;
  };
  carve(SECTIONS.vault);
  carve(SECTIONS.arena);
  carve(SECTIONS.staging);
  carve({ x: 21, y: 10, w: 2, h: 3 }); // vault corridor (door in the middle)
  carve({ x: 21, y: 34, w: 2, h: 4 }); // staging corridor
  for (const d of DOOR) tiles[d.y][d.x] = Tile.Wall;

  const pattern = rng.int(0, PILLAR_PATTERNS.length - 1);
  for (const [px, py] of PILLAR_PATTERNS[pattern]) {
    for (const x of [px, mirror(px) - 1]) {
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) tiles[py + dy][x + dx] = Tile.Wall;
    }
  }

  const spawns: Spawn[] = [];
  const taken = new Set<string>();
  const put = (x: number, y: number, kind: Spawn['kind'], value = 0) => {
    const key = `${x},${y}`;
    if (taken.has(key) || tiles[y]?.[x] !== Tile.Floor) return false;
    taken.add(key);
    spawns.push({ x, y, kind, value });
    return true;
  };
  const scatter = (room: Room, kind: Spawn['kind'], count: number, value: [number, number], margin = 1) => {
    for (let placed = 0, tries = 0; placed < count && tries < 200; tries++) {
      const x = rng.int(room.x + margin, room.x + room.w - 1 - margin);
      const y = rng.int(room.y + margin, room.y + room.h - 1 - margin);
      if (put(x, y, kind, rng.int(value[0], value[1]))) placed++;
    }
  };

  const start = { x: 21, y: 45 };
  const extraction = { x: 21, y: 4 };
  taken.add(`${start.x},${start.y}`);
  taken.add(`${extraction.x},${extraction.y}`);

  // Staging bay: supplies to start with, and a few guards.
  put(14, 45, 'medkit', 35);
  put(29, 45, 'oxygen', 35);
  scatter(SECTIONS.staging, 'salvage', 3, [6, 16]);
  const guard = ship === 'freighter' ? 'drone' : ship === 'mining' ? 'sapper' : 'crawler';
  for (const x of ship === 'research' ? [15, 21, 28] : [15, 28]) put(x, 39, guard);

  // The arena itself.
  const features: ArenaFeature[] = [];
  const bossSpawn = { x: 21, y: ship === 'research' ? 16 : ship === 'mining' ? 19 : 18 };
  const reserve = (x: number, y: number) => taken.add(`${x},${y}`);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) reserve(bossSpawn.x + dx, bossSpawn.y + dy);
  if (ship === 'freighter') {
    for (const [x, y] of [[7, 15], [36, 15], [7, 31], [36, 31]]) {
      features.push({ x, y, kind: 'coupling' });
      reserve(x, y);
    }
    for (const [x, y] of [[5, 21], [38, 21], [5, 25], [38, 25]]) put(x, y, 'drum');
  } else if (ship === 'mining') {
    // Shield pylons in a wide triangle, so you have to cross the hold to reach them all.
    for (const [x, y] of [[8, 15], [35, 15], [21, 31]]) {
      features.push({ x, y, kind: 'pylon' });
      reserve(x, y);
    }
    for (const [x, y] of [[5, 22], [38, 22], [17, 25], [26, 25]]) put(x, y, 'drum');
  } else {
    for (const [x, y] of [[13, 20], [30, 20], [21, 27]]) {
      features.push({ x, y, kind: 'root' });
      reserve(x, y);
    }
    for (const [x, y] of [[19, 14], [24, 14]]) put(x, y, 'drum');
    for (const [x, y] of [[8, 16], [35, 16]]) put(x, y, 'egg');
  }
  put(5, 33, 'oxygen', 30);
  put(38, 33, 'oxygen', 30);
  put(rng.chance(0.5) ? 12 : 31, 32, 'medkit', 35);

  // The vault: what you came for.
  put(17, 4, 'cache', rng.int(60, 90));
  put(26, 4, 'cache', rng.int(60, 90));
  scatter(SECTIONS.vault, 'salvage', 4, [12, 28]);

  return {
    seed,
    ship,
    width: ARENA_WIDTH,
    height: ARENA_HEIGHT,
    tiles,
    rooms: [SECTIONS.staging, SECTIONS.arena, SECTIONS.vault],
    start,
    extraction,
    spawns,
    weakWalls: [],
    boss,
    sections: SECTIONS,
    door: DOOR,
    bossSpawn,
    features,
    pattern,
  };
}

/** Opens the bulkhead in a tile grid (used when the boss dies, and in tests). */
export function openDoor(tiles: Tile[][], door: readonly Point[] = DOOR) {
  for (const d of door) tiles[d.y][d.x] = Tile.Floor;
}
