import { Tile, type Point, type Room } from './types';

/**
 * Rules for the v0.6 "Field kit" features: dodge roll, loot drops,
 * explosive barrels and the scanner map. Pure, so they're unit-tested;
 * GameScene only applies them.
 */

// ---------------------------------------------------------------- dodge roll

export const DODGE = {
  /** Pixels per second during the roll. */
  speed: 300,
  durationMs: 170,
  /** Can't be hit for this long after starting a roll (a little longer than the roll). */
  invulnerableMs: 260,
  cooldownMs: 900,
  /** Robots are heavier: shorter roll, longer cooldown. */
  robot: { speed: 260, cooldownMs: 1150 },
  /**
   * The roll covers a fixed distance (speed × duration), so it's the same on a
   * slow phone; it gives up after this long if a wall stops it.
   */
  maxMs: 400,
} as const;

export const dodgeDistance = (robot: boolean) =>
  ((robot ? DODGE.robot.speed : DODGE.speed) * DODGE.durationMs) / 1000;

export function dodgeCooldown(robot: boolean): number {
  return robot ? DODGE.robot.cooldownMs : DODGE.cooldownMs;
}

/** 0 just after a roll, 1 when you can roll again. */
export function dodgeReadiness(now: number, lastDodgeAt: number, robot = false): number {
  if (lastDodgeAt <= 0) return 1;
  return Math.max(0, Math.min(1, (now - lastDodgeAt) / dodgeCooldown(robot)));
}

/** Roll the way you're moving; standing still, roll the way you're aiming. */
export function dodgeDirection(moveX: number, moveY: number, aim: number): { x: number; y: number } {
  const len = Math.hypot(moveX, moveY);
  if (len > 0.05) return { x: moveX / len, y: moveY / len };
  return { x: Math.cos(aim), y: Math.sin(aim) };
}

// ---------------------------------------------------------------- loot drops

export type DropKind = 'oxygen' | 'medkit';

export const DROP_RULES = {
  /** Chance an enemy drops a supply (on top of any salvage drop). */
  baseChance: 0.12,
  /** Extra chance when you're running low, so a bad run can recover. */
  lowBonus: 0.18,
  low: 0.35,
  oxygenAmount: 20,
  healAmount: 20,
} as const;

/**
 * What supply (if any) a killed enemy leaves. `roll` and `pick` are 0–1
 * random numbers; health and oxygen are fractions of their maximum.
 * Leans towards whatever you're shortest of.
 */
export function rollSupplyDrop(roll: number, pick: number, hpFraction: number, oxygenFraction: number): DropKind | null {
  const low = Math.min(hpFraction, oxygenFraction) < DROP_RULES.low;
  const chance = DROP_RULES.baseChance + (low ? DROP_RULES.lowBonus : 0);
  if (roll >= chance) return null;
  const hpNeed = 1 - hpFraction;
  const o2Need = 1 - oxygenFraction;
  const total = hpNeed + o2Need;
  // Both full: a coin flip.
  const medkitShare = total <= 0 ? 0.5 : hpNeed / total;
  return pick < medkitShare ? 'medkit' : 'oxygen';
}

// ---------------------------------------------------------------- explosive barrels

export const BARREL = {
  /** Shots it takes to set one off. */
  hp: 2,
  radius: 44,
  /** Damage to enemies at the centre; falls off to a third at the edge. */
  enemyDamage: 6,
  /** Damage to you at the centre. */
  playerDamage: 30,
  /** Barrels in the blast go off this long afterwards, for chain reactions. */
  chainDelayMs: 140,
  count: { freighter: 4, research: 3 },
  minDistance: 6,
} as const;

/** Blast damage at a distance from the barrel: full at the centre, a third at the edge, none beyond. */
export function blastDamage(distance: number, max: number, radius: number = BARREL.radius): number {
  if (distance >= radius) return 0;
  const falloff = 1 - (distance / radius) * (2 / 3);
  return Math.max(1, Math.round(max * falloff));
}

// ---------------------------------------------------------------- scanner map

export const SCAN_RADIUS = 5;

/** Tiles you've seen, as a flat array (1 = seen). */
export function createExplored(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height);
}

/**
 * Marks what you can see from a tile: everything within SCAN_RADIUS, plus the
 * whole room you're standing in (and its walls). Returns how many tiles were new.
 */
export function reveal(
  explored: Uint8Array,
  grid: Tile[][],
  rooms: Room[],
  at: Point,
  radius: number = SCAN_RADIUS,
): number {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  let added = 0;
  const mark = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (!explored[i]) {
      explored[i] = 1;
      added++;
    }
  };
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= radius * radius) mark(at.x + dx, at.y + dy);
    }
  }
  const room = rooms.find((r) => at.x >= r.x && at.x < r.x + r.w && at.y >= r.y && at.y < r.y + r.h);
  if (room) {
    for (let y = room.y - 1; y <= room.y + room.h; y++) for (let x = room.x - 1; x <= room.x + room.w; x++) mark(x, y);
  }
  return added;
}

export function isExplored(explored: Uint8Array, width: number, p: Point): boolean {
  return explored[p.y * width + p.x] === 1;
}

/** Share of the ship's walkable floor you've seen, 0–1. */
export function exploredFraction(explored: Uint8Array, grid: Tile[][]): number {
  const width = grid[0]?.length ?? 0;
  let floor = 0;
  let seen = 0;
  grid.forEach((row, y) =>
    row.forEach((t, x) => {
      if (t !== Tile.Floor) return;
      floor++;
      if (explored[y * width + x]) seen++;
    }),
  );
  return floor ? seen / floor : 0;
}
