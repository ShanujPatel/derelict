/** Tile values used by the deck grid. Index order matches the generated tileset. */
export const Tile = {
  Wall: 0,
  Floor: 1,
  WeakWall: 2,
  /** Display-only: wall tiles far from any floor, drawn as open space. */
  Void: 3,
} as const;
export type Tile = (typeof Tile)[keyof typeof Tile];

export interface Point {
  x: number;
  y: number;
}

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SpawnKind = 'drone' | 'oxygen' | 'salvage';

export interface Spawn extends Point {
  kind: SpawnKind;
  /** Salvage credits or oxygen amount; unused for drones. */
  value: number;
}
