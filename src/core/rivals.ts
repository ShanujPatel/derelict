import { createRng } from './rng';
import { hashString } from './seed';
import type { EnemyKind, ShipType } from './types';

/**
 * Gravecutters: a rival salvage crew that docks partway through a run, heads
 * for loose salvage and fights anyone in the way. Timing is seeded so the
 * Daily Derelict is the same for everyone.
 */
export interface RivalEvent {
  /** Seconds after boarding that the rivals dock. */
  arrivesAfter: number;
  party: EnemyKind[];
}

export const RIVAL_CARRY_LIMIT = 3;

export function rivalEvent(seed: string, ship: ShipType): RivalEvent {
  const rng = createRng(hashString(`${seed}:${ship}:gravecutters`));
  const arrivesAfter = rng.int(45, 75);
  const party: EnemyKind[] = ['raider', 'raider', 'brute'];
  if (rng.chance(0.35)) party.push('raider');
  return { arrivesAfter, party };
}

/**
 * Bullets from within this many radians of the brute's facing hit its shield.
 * Piercing shots (railgun) go straight through.
 */
export const SHIELD_ARC = Math.PI / 3;

export function hitsShield(facing: number, bulletAngle: number, pierce: boolean): boolean {
  if (pierce) return false;
  // The bullet travels towards the brute, so it hits the front when it's heading the opposite way.
  const incoming = bulletAngle + Math.PI;
  const diff = Math.abs(Math.atan2(Math.sin(incoming - facing), Math.cos(incoming - facing)));
  return diff <= SHIELD_ARC;
}

/** Grav pulse geometry: does a point sit inside the cone in front of the player? */
export const GRAV_RANGE = 96;
export const GRAV_CONE = Math.PI / 4; // half-angle

export function inGravCone(px: number, py: number, aim: number, tx: number, ty: number): boolean {
  const dx = tx - px;
  const dy = ty - py;
  const dist = Math.hypot(dx, dy);
  if (dist > GRAV_RANGE || dist < 1) return dist < 1;
  const angle = Math.atan2(dy, dx);
  const diff = Math.abs(Math.atan2(Math.sin(angle - aim), Math.cos(angle - aim)));
  return diff <= GRAV_CONE;
}
