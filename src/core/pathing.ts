import { Tile, type Point } from './types';

export function isWalkable(tile: Tile | undefined): boolean {
  return tile === Tile.Floor;
}

const DIRS: readonly Point[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

/** Walking distance (in tiles) from start to every tile; -1 if unreachable. */
export function bfsDistances(tiles: readonly Tile[][], start: Point): number[][] {
  const dist = tiles.map((row) => row.map(() => -1));
  if (!isWalkable(tiles[start.y]?.[start.x])) return dist;

  const queue: Point[] = [start];
  dist[start.y][start.x] = 0;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const d of DIRS) {
      const nx = cur.x + d.x;
      const ny = cur.y + d.y;
      if (isWalkable(tiles[ny]?.[nx]) && dist[ny][nx] === -1) {
        dist[ny][nx] = dist[cur.y][cur.x] + 1;
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return dist;
}

/**
 * True if nothing solid sits on the straight line between two tiles
 * (Bresenham). The end tiles themselves are not checked.
 */
export function hasLineOfSight(tiles: readonly Tile[][], a: Point, b: Point): boolean {
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;

  while (x !== b.x || y !== b.y) {
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    if ((x !== b.x || y !== b.y) && !isWalkable(tiles[y]?.[x])) return false;
  }
  return true;
}

/**
 * Shortest walking route from one tile to another (4-way BFS).
 * Returns the tiles to step through, not including the start, or null if unreachable.
 */
export function findPath(tiles: readonly Tile[][], from: Point, to: Point, maxNodes = 4000): Point[] | null {
  if (!isWalkable(tiles[from.y]?.[from.x]) || !isWalkable(tiles[to.y]?.[to.x])) return null;
  if (from.x === to.x && from.y === to.y) return [];
  const w = tiles[0].length;
  const key = (p: Point) => p.y * w + p.x;
  const parent = new Map<number, number>([[key(from), -1]]);
  const queue: Point[] = [from];
  for (let head = 0; head < queue.length && head < maxNodes; head++) {
    const cur = queue[head];
    for (const d of DIRS) {
      const n = { x: cur.x + d.x, y: cur.y + d.y };
      const k = key(n);
      if (parent.has(k) || !isWalkable(tiles[n.y]?.[n.x])) continue;
      parent.set(k, key(cur));
      if (n.x === to.x && n.y === to.y) {
        const path: Point[] = [];
        for (let at = k; at !== key(from); at = parent.get(at)!) path.push({ x: at % w, y: Math.floor(at / w) });
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return null;
}

/** The target reachable in the fewest steps, with its distance; null if none can be reached. */
export function nearestByWalking(
  tiles: readonly Tile[][],
  from: Point,
  targets: readonly Point[],
): { index: number; steps: number } | null {
  if (targets.length === 0) return null;
  const dist = bfsDistances(tiles, from);
  let best: { index: number; steps: number } | null = null;
  targets.forEach((t, index) => {
    const steps = dist[t.y]?.[t.x] ?? -1;
    if (steps >= 0 && (!best || steps < best.steps)) best = { index, steps };
  });
  return best;
}
