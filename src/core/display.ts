import { Tile, type Point } from './types';

/**
 * Tileset indices used for drawing. The collision grid (Tile) stays simple;
 * this maps it to richer visuals: wall faces, floor variety, shadows and space.
 */
export const DisplayTile = {
  Wall: 0,
  Floor: 1,
  WeakWall: 2,
  Void: 3,
  WallFace: 4,
  Grate: 5,
  Vent: 6,
  Hazard: 7,
  Void2: 8,
  FloorShadow: 9,
} as const;
export type DisplayTile = (typeof DisplayTile)[keyof typeof DisplayTile];

export const DISPLAY_TILE_COUNT = 10;

/** Display tiles the player and drones collide with. */
export const SOLID_DISPLAY_TILES: readonly DisplayTile[] = [
  DisplayTile.Wall,
  DisplayTile.WeakWall,
  DisplayTile.Void,
  DisplayTile.WallFace,
  DisplayTile.Void2,
];

/** Cheap deterministic hash of a tile position, so decoration is stable per seed. */
export function tileHash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const isFloor = (tiles: readonly Tile[][], x: number, y: number) => tiles[y]?.[x] === Tile.Floor;

/** Picks the display tile for one position based on its neighbours. */
export function displayTileAt(tiles: readonly Tile[][], x: number, y: number, seed: number): DisplayTile {
  const tile = tiles[y][x];
  const roll = tileHash(x, y, seed) % 100;

  if (tile === Tile.WeakWall) return DisplayTile.WeakWall;

  if (tile === Tile.Floor) {
    if (!isFloor(tiles, x, y - 1)) return DisplayTile.FloorShadow;
    if (roll < 5) return DisplayTile.Grate;
    if (roll < 7) return DisplayTile.Vent;
    if (roll < 9) return DisplayTile.Hazard;
    return DisplayTile.Floor;
  }

  // Wall: a face if floor is directly below, a plain wall if floor or a weak wall
  // is nearby, otherwise open space.
  if (isFloor(tiles, x, y + 1)) return DisplayTile.WallFace;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const n = tiles[y + dy]?.[x + dx];
      if (n === Tile.Floor || n === Tile.WeakWall) return DisplayTile.Wall;
    }
  }
  return roll < 50 ? DisplayTile.Void : DisplayTile.Void2;
}

export function buildDisplayMap(tiles: readonly Tile[][], seed: number): DisplayTile[][] {
  return tiles.map((row, y) => row.map((_, x) => displayTileAt(tiles, x, y, seed)));
}

/** Positions on wall faces that get a blinking warning lamp. */
export function lampPositions(display: readonly DisplayTile[][], seed: number, chance = 7): Point[] {
  const out: Point[] = [];
  display.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t === DisplayTile.WallFace && tileHash(x, y, seed ^ 0x9e3779b9) % 100 < chance) {
        out.push({ x, y });
      }
    }),
  );
  return out;
}
