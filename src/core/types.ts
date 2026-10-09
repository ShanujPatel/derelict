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

export type ShipType = 'freighter' | 'research';

export const SHIP_TYPES: readonly ShipType[] = ['freighter', 'research'];

/**
 * Hostiles: drones and turrets on freighters, aliens on research vessels,
 * and Gravecutter rivals (raider, brute) who board mid-run on any ship.
 */
export type EnemyKind = 'drone' | 'turret' | 'crawler' | 'spitter' | 'egg' | 'raider' | 'brute' | 'mimic' | 'stalker';
/** Things to pick up or open. */
export type ItemKind = 'oxygen' | 'salvage' | 'cache' | 'datalog' | 'medkit' | 'overdrive' | 'aegis';
/** Hazards: explosive fuel drums (v0.6). */
export type HazardKind = 'drum';
export type SpawnKind = EnemyKind | ItemKind | HazardKind;

export const ENEMY_KINDS: readonly EnemyKind[] = ['drone', 'turret', 'crawler', 'spitter', 'egg', 'raider', 'brute', 'mimic', 'stalker'];

export interface Spawn extends Point {
  kind: SpawnKind;
  /** Salvage credits, oxygen or health amount; 0 for enemies and data logs. */
  value: number;
}
