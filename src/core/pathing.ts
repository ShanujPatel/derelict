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
