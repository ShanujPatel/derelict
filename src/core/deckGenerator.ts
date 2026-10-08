import { createRng, type Rng } from './rng';
import { hashString } from './seed';
import { bfsDistances } from './pathing';
import { Tile, type Point, type Room, type Spawn } from './types';

export interface DeckOptions {
  width: number;
  height: number;
  maxRooms: number;
  minRoomSize: number;
  maxRoomSize: number;
  drones: number;
  oxygen: number;
  salvage: number;
  maxWeakWalls: number;
  /** Drones never spawn closer than this (walking tiles) to the start. */
  minDroneDistance: number;
}

export const DEFAULT_DECK_OPTIONS: DeckOptions = {
  width: 64,
  height: 48,
  maxRooms: 12,
  minRoomSize: 5,
  maxRoomSize: 11,
  drones: 10,
  oxygen: 4,
  salvage: 8,
  maxWeakWalls: 8,
  minDroneDistance: 12,
};

export interface Deck {
  seed: string;
  width: number;
  height: number;
  tiles: Tile[][];
  rooms: Room[];
  start: Point;
  extraction: Point;
  spawns: Spawn[];
  /** Thin walls the cutting torch can open to make shortcuts. */
  weakWalls: Point[];
}

/** Builds one ship deck. Pure and deterministic: same seed + options = same deck. */
export function generateDeck(seed: string, options: Partial<DeckOptions> = {}): Deck {
  const opts = { ...DEFAULT_DECK_OPTIONS, ...options };
  const rng = createRng(hashString(seed));
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

  return { seed, width, height, tiles, rooms, start, extraction, spawns, weakWalls };
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

  const place = (kind: Spawn['kind'], count: number, value: () => number, minDist: number) => {
    let placed = 0;
    for (let attempt = 0; attempt < count * 30 && placed < count; attempt++) {
      const r = rng.pick(otherRooms);
      const p = { x: rng.int(r.x, r.x + r.w - 1), y: rng.int(r.y, r.y + r.h - 1) };
      const key = `${p.x},${p.y}`;
      if (taken.has(key) || tiles[p.y][p.x] !== Tile.Floor || dist[p.y][p.x] < minDist) continue;
      taken.add(key);
      spawns.push({ ...p, kind, value: value() });
      placed++;
    }
  };

  place('drone', o.drones, () => 0, o.minDroneDistance);
  place('oxygen', o.oxygen, () => 35, 1);
  place('salvage', o.salvage, () => rng.int(5, 25), 1);
  return spawns;
}
