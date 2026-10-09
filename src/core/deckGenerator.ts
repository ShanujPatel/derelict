import { createRng, type Rng } from './rng';
import { hashString } from './seed';
import { bfsDistances } from './pathing';
import { BARREL } from './fieldkit';
import { Tile, type Point, type Room, type ShipType, type Spawn, type SpawnKind } from './types';

export interface SpawnRule {
  count: number;
  /** Minimum walking distance (tiles) from the start. Negative = fraction of the deck's furthest tile. */
  minDistance: number;
  /** Salvage or oxygen value range; [0, 0] for enemies. */
  value: [number, number];
  /** Only place against a wall (turrets). */
  againstWall?: boolean;
}

export interface DeckOptions {
  ship: ShipType;
  width: number;
  height: number;
  maxRooms: number;
  minRoomSize: number;
  maxRoomSize: number;
  maxWeakWalls: number;
  /** Placed in this order, so the list order is part of the seed's layout. */
  spawns: [SpawnKind, SpawnRule][];
  /** Health packs: how many, and how much health each restores. */
  medkits: { count: number; heal: number };
  /** Explosive fuel drums. */
  drums: number;
}

const enemy = (count: number, minDistance: number, againstWall = false): SpawnRule => ({
  count,
  minDistance,
  value: [0, 0],
  againstWall,
});

export const DECK_OPTIONS: Record<ShipType, DeckOptions> = {
  freighter: {
    ship: 'freighter',
    width: 64,
    height: 48,
    maxRooms: 12,
    minRoomSize: 5,
    maxRoomSize: 11,
    maxWeakWalls: 8,
    spawns: [
      ['drone', enemy(9, 12)],
      ['oxygen', { count: 4, minDistance: 1, value: [35, 35] }],
      ['salvage', { count: 8, minDistance: 1, value: [5, 25] }],
      ['turret', enemy(3, 14, true)],
      ['cache', { count: 2, minDistance: 10, value: [30, 50] }],
      ['datalog', { count: 1, minDistance: -0.6, value: [0, 0] }],
    ],
    medkits: { count: 3, heal: 35 },
    drums: BARREL.count.freighter,
  },
  research: {
    ship: 'research',
    width: 60,
    height: 48,
    maxRooms: 15,
    minRoomSize: 5,
    maxRoomSize: 9,
    maxWeakWalls: 8,
    spawns: [
      ['crawler', enemy(7, 12)],
      ['spitter', enemy(4, 14)],
      ['egg', enemy(4, 16)],
      ['oxygen', { count: 5, minDistance: 1, value: [35, 35] }],
      ['salvage', { count: 9, minDistance: 1, value: [8, 30] }],
      ['cache', { count: 2, minDistance: 10, value: [40, 60] }],
      ['datalog', { count: 1, minDistance: -0.6, value: [0, 0] }],
    ],
    medkits: { count: 3, heal: 35 },
    drums: BARREL.count.research,
  },
};

/** Kept for older callers and tests: the freighter layout. */
export const DEFAULT_DECK_OPTIONS = DECK_OPTIONS.freighter;
export const MIN_ENEMY_DISTANCE = 12;

export interface Deck {
  seed: string;
  width: number;
  height: number;
  tiles: Tile[][];
  rooms: Room[];
  start: Point;
  extraction: Point;
  spawns: Spawn[];
  ship: ShipType;
  /** Thin walls the cutting torch can open to make shortcuts. */
  weakWalls: Point[];
}

/** Builds one ship deck. Pure and deterministic: same seed + ship + options = same deck. */
export function generateDeck(seed: string, ship: ShipType = 'freighter', options: Partial<DeckOptions> = {}): Deck {
  const opts = { ...DECK_OPTIONS[ship], ...options, ship };
  // Freighters keep the original seed hash so v0.1/v0.2 seeds still give the same layout.
  const rng = createRng(hashString(ship === 'freighter' ? seed : `${seed}:${ship}`));
  const { width, height } = opts;

  const tiles: Tile[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, (): Tile => Tile.Wall),
  );
  const setFloor = (x: number, y: number) => {
    // Keep a solid one-tile border round the deck.
    if (x >= 1 && y >= 1 && x <= width - 2 && y <= height - 2) tiles[y][x] = Tile.Floor;
  };

  const rooms = placeRooms(rng, opts);
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) setFloor(x, y);
  }

  connectRooms(rng, rooms, setFloor);

  const start = centre(rooms[0]);
  const dist = bfsDistances(tiles, start);

  // Extraction goes in the room furthest (by walking distance) from the start.
  let extraction = start;
  for (const r of rooms.slice(1)) {
    const c = centre(r);
    if (dist[c.y][c.x] > dist[extraction.y][extraction.x]) extraction = c;
  }

  const weakWalls = placeWeakWalls(rng, tiles, dist, opts.maxWeakWalls);
  const spawns = placeSpawns(rng, rooms, tiles, dist, start, extraction, opts);
  spawns.push(...placeMedkits(seed, ship, rooms, tiles, dist, spawns, [start, extraction], opts.medkits));
  spawns.push(...placeDrums(seed, ship, rooms, tiles, dist, spawns, [start, extraction], opts.drums));

  return { seed, ship, width, height, tiles, rooms, start, extraction, spawns, weakWalls };
}

function centre(r: Room): Point {
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

function placeRooms(rng: Rng, o: DeckOptions): Room[] {
  const rooms: Room[] = [];
  const gap = 2;
  for (let attempt = 0; attempt < 300 && rooms.length < o.maxRooms; attempt++) {
    const w = rng.int(o.minRoomSize, o.maxRoomSize);
    const h = rng.int(o.minRoomSize, o.maxRoomSize);
    const room = { x: rng.int(2, o.width - w - 2), y: rng.int(2, o.height - h - 2), w, h };
    const overlaps = rooms.some(
      (r) =>
        room.x - gap < r.x + r.w &&
        room.x + room.w + gap > r.x &&
        room.y - gap < r.y + r.h &&
        room.y + room.h + gap > r.y,
    );
    if (!overlaps) rooms.push(room);
  }
  if (rooms.length < 2) throw new Error('Deck too small to place two rooms');
  return rooms;
}

/** Joins every room to its nearest already-connected room, then adds a few loops. */
function connectRooms(rng: Rng, rooms: Room[], setFloor: (x: number, y: number) => void) {
  const carve = (a: Point, b: Point) => {
    // Two-tile-wide L-shaped corridor.
    const h = (x1: number, x2: number, y: number) => {
      for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) {
        setFloor(x, y);
        setFloor(x, y + 1);
      }
    };
    const v = (y1: number, y2: number, x: number) => {
      for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) {
        setFloor(x, y);
        setFloor(x + 1, y);
      }
    };
    if (rng.chance(0.5)) {
      h(a.x, b.x, a.y);
      v(a.y, b.y, b.x);
    } else {
      v(a.y, b.y, a.x);
      h(a.x, b.x, b.y);
    }
  };

  const connected: Room[] = [rooms[0]];
  for (const room of rooms.slice(1)) {
    const c = centre(room);
    let nearest = connected[0];
    let best = Infinity;
    for (const other of connected) {
      const oc = centre(other);
      const d = Math.abs(oc.x - c.x) + Math.abs(oc.y - c.y);
      if (d < best) {
        best = d;
        nearest = other;
      }
    }
    carve(centre(nearest), c);
    connected.push(room);
  }

  const loops = Math.floor(rooms.length / 4);
  for (let i = 0; i < loops; i++) {
    const a = rng.pick(rooms);
    const b = rng.pick(rooms);
    if (a !== b) carve(centre(a), centre(b));
  }
}

/**
 * Finds walls one or two tiles thick whose two sides are far apart on foot,
 * and turns some into weak walls. Returns every weak wall tile.
 */
function placeWeakWalls(rng: Rng, tiles: Tile[][], dist: number[][], max: number): Point[] {
  const floor = (x: number, y: number) => tiles[y]?.[x] === Tile.Floor;
  const wall = (x: number, y: number) => tiles[y]?.[x] === Tile.Wall;
  const candidates: Point[][] = [];

  for (let y = 1; y < tiles.length - 1; y++) {
    for (let x = 1; x < tiles[0].length - 1; x++) {
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        // Floor tile on the near side of a wall run in this direction.
        if (!floor(x - dx, y - dy)) continue;
        for (const thickness of [1, 2]) {
          const segment = Array.from({ length: thickness }, (_, i) => ({
            x: x + dx * i,
            y: y + dy * i,
          }));
          const far = { x: x + dx * thickness, y: y + dy * thickness };
          // Walls along the segment must not touch floor sideways, so the cut is a clean doorway.
          const clean = segment.every(
            (p) => wall(p.x, p.y) && !floor(p.x + dy, p.y + dx) && !floor(p.x - dy, p.y - dx),
          );
          if (!clean || !floor(far.x, far.y)) continue;
          const saving = Math.abs(dist[y - dy][x - dx] - dist[far.y][far.x]);
          if (saving >= 8) candidates.push(segment);
          break;
        }
      }
    }
  }

  const chosen: Point[][] = [];
  for (const seg of rng.shuffle(candidates)) {
    if (chosen.length >= max) break;
    const tooClose = chosen.some((other) =>
      other.some((p) => seg.some((q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) < 4)),
    );
    if (tooClose) continue;
    for (const p of seg) tiles[p.y][p.x] = Tile.WeakWall;
    chosen.push(seg);
  }
  return chosen.flat();
}

/**
 * Health packs use their own random stream, so adding them didn't move
 * anything else: every seed from before v0.5.3 keeps the same layout. Each
 * pack goes in a different room, away from the start, on a free floor tile.
 */
export const MEDKIT_MIN_DISTANCE = 8;

function placeMedkits(
  seed: string,
  ship: ShipType,
  rooms: Room[],
  tiles: Tile[][],
  dist: number[][],
  existing: Spawn[],
  reserved: Point[],
  rule: { count: number; heal: number },
): Spawn[] {
  const rng = createRng(hashString(`${seed}:${ship}:medkits`));
  const taken = new Set([...existing, ...reserved].map((p) => `${p.x},${p.y}`));
  const used = new Set<Room>();
  const kits: Spawn[] = [];
  const candidates = rooms.slice(1);
  for (let attempt = 0; attempt < rule.count * 80 && kits.length < rule.count; attempt++) {
    const r = rng.pick(candidates);
    if (used.has(r) && used.size < candidates.length) continue;
    const p = { x: rng.int(r.x, r.x + r.w - 1), y: rng.int(r.y, r.y + r.h - 1) };
    const key = `${p.x},${p.y}`;
    if (taken.has(key) || tiles[p.y][p.x] !== Tile.Floor || dist[p.y][p.x] < MEDKIT_MIN_DISTANCE) continue;
    taken.add(key);
    used.add(r);
    kits.push({ ...p, kind: 'medkit', value: rule.heal });
  }
  return kits;
}

/**
 * Explosive drums, also on their own random stream. They stand against walls
 * (like real cargo), away from the start, with clear floor round them.
 */
function placeDrums(
  seed: string,
  ship: ShipType,
  rooms: Room[],
  tiles: Tile[][],
  dist: number[][],
  existing: Spawn[],
  reserved: Point[],
  count: number,
): Spawn[] {
  const rng = createRng(hashString(`${seed}:${ship}:drums`));
  const near = (p: Point, q: Point, r: number) => Math.abs(p.x - q.x) <= r && Math.abs(p.y - q.y) <= r;
  // Keep drums off the exit and clear of every other spawn.
  const blocked = [...existing, ...reserved];
  const drums: Spawn[] = [];
  const nextToWall = (x: number, y: number) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tiles[y + dy]?.[x + dx] === Tile.Wall);
  const candidates = rooms.slice(1);
  for (let attempt = 0; attempt < count * 100 && drums.length < count; attempt++) {
    const r = rng.pick(candidates);
    const p = { x: rng.int(r.x, r.x + r.w - 1), y: rng.int(r.y, r.y + r.h - 1) };
    if (tiles[p.y][p.x] !== Tile.Floor || dist[p.y][p.x] < BARREL.minDistance || !nextToWall(p.x, p.y)) continue;
    if (blocked.some((q) => near(p, q, 1)) || drums.some((q) => near(p, q, 3))) continue;
    drums.push({ ...p, kind: 'drum', value: 0 });
    // Some drums come in pairs, so one shot can set off a chain.
    if (rng.chance(0.4)) {
      const buddy = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }))
        .find((q) => tiles[q.y]?.[q.x] === Tile.Floor && nextToWall(q.x, q.y) && !blocked.some((b) => near(q, b, 1)));
      if (buddy) drums.push({ ...buddy, kind: 'drum', value: 0 });
    }
  }
  return drums;
}

function placeSpawns(
  rng: Rng,
  rooms: Room[],
  tiles: Tile[][],
  dist: number[][],
  start: Point,
  extraction: Point,
  o: DeckOptions,
): Spawn[] {
  const spawns: Spawn[] = [];
  const taken = new Set([`${start.x},${start.y}`, `${extraction.x},${extraction.y}`]);
  const otherRooms = rooms.slice(1);
  const furthest = Math.max(...dist.flat());
  const nextToWall = (x: number, y: number) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tiles[y + dy]?.[x + dx] === Tile.Wall);

  for (const [kind, rule] of o.spawns) {
    const minDist = rule.minDistance < 0 ? Math.floor(-rule.minDistance * furthest) : rule.minDistance;
    let placed = 0;
    for (let attempt = 0; attempt < rule.count * 60 && placed < rule.count; attempt++) {
      const r = rng.pick(otherRooms);
      const p = { x: rng.int(r.x, r.x + r.w - 1), y: rng.int(r.y, r.y + r.h - 1) };
      const key = `${p.x},${p.y}`;
      if (taken.has(key) || tiles[p.y][p.x] !== Tile.Floor || dist[p.y][p.x] < minDist) continue;
      if (rule.againstWall && !nextToWall(p.x, p.y)) continue;
      taken.add(key);
      spawns.push({ ...p, kind: kind as SpawnKind, value: rng.int(rule.value[0], rule.value[1]) });
      placed++;
    }
  }
  return spawns;
}
