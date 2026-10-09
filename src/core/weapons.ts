export type WeaponId = 'blaster' | 'scattergun' | 'railgun' | 'arc';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  /** One-line description for the hub. */
  blurb: string;
  cooldownMs: number;
  pellets: number;
  /** Total cone width in radians, shared across pellets. */
  spread: number;
  bulletSpeed: number;
  damage: number;
  lifetimeMs: number;
  /** Passes through enemies instead of stopping at the first hit. */
  pierce: boolean;
  /** Arc caster: an instant bolt that jumps between this many targets instead of firing bullets. */
  chain?: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  blaster: {
    id: 'blaster',
    name: 'Blaster',
    blurb: 'Reliable rapid fire.',
    cooldownMs: 170,
    pellets: 1,
    spread: 0,
    bulletSpeed: 320,
    damage: 1,
    lifetimeMs: 900,
    pierce: false,
  },
  scattergun: {
    id: 'scattergun',
    name: 'Scattergun',
    blurb: 'Five-pellet spread. Brutal up close.',
    cooldownMs: 650,
    pellets: 5,
    spread: 0.6,
    bulletSpeed: 280,
    damage: 1,
    lifetimeMs: 320,
    pierce: false,
  },
  railgun: {
    id: 'railgun',
    name: 'Railgun',
    blurb: 'Slow, heavy slug that pierces a whole line of drones.',
    cooldownMs: 950,
    pellets: 1,
    spread: 0,
    bulletSpeed: 560,
    damage: 3,
    lifetimeMs: 700,
    pierce: true,
  },
  arc: {
    id: 'arc',
    name: 'Arc caster',
    blurb: 'Instant lightning that jumps between up to 4 nearby hostiles. Short range.',
    cooldownMs: 520,
    pellets: 1,
    spread: 0,
    bulletSpeed: 0,
    damage: 2,
    lifetimeMs: 0,
    pierce: false,
    chain: 4,
  },
};

export const ARC = {
  /** How far the first bolt reaches, and how wide a cone it searches. */
  range: 130,
  cone: 0.6,
  /** How far each jump can travel. */
  hop: 80,
} as const;

export interface ArcTarget {
  x: number;
  y: number;
}

/**
 * Who an arc bolt hits, in order: the nearest target inside the aim cone,
 * then repeatedly the nearest unhit target within a hop of the last one.
 * `canReach` lets the game rule out targets behind walls.
 */
export function chainTargets(
  from: ArcTarget,
  aim: number,
  targets: readonly ArcTarget[],
  max: number,
  canReach: (a: ArcTarget, b: ArcTarget) => boolean = () => true,
): number[] {
  const hit: number[] = [];
  const angleDiff = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  let best = -1;
  let bestDist = Infinity;
  targets.forEach((t, i) => {
    const d = Math.hypot(t.x - from.x, t.y - from.y);
    if (d > ARC.range || d >= bestDist) return;
    if (angleDiff(Math.atan2(t.y - from.y, t.x - from.x), aim) > ARC.cone) return;
    if (!canReach(from, t)) return;
    best = i;
    bestDist = d;
  });
  if (best < 0) return hit;
  hit.push(best);
  while (hit.length < max) {
    const last = targets[hit[hit.length - 1]];
    let next = -1;
    let nextDist = Infinity;
    targets.forEach((t, i) => {
      if (hit.includes(i)) return;
      const d = Math.hypot(t.x - last.x, t.y - last.y);
      if (d <= ARC.hop && d < nextDist && canReach(last, t)) {
        next = i;
        nextDist = d;
      }
    });
    if (next < 0) break;
    hit.push(next);
  }
  return hit;
}

/** Angles for each pellet, spread evenly across the cone centred on the aim. */
export function pelletAngles(weapon: WeaponDef, aim: number): number[] {
  if (weapon.pellets <= 1) return [aim];
  const step = weapon.spread / (weapon.pellets - 1);
  return Array.from({ length: weapon.pellets }, (_, i) => aim - weapon.spread / 2 + i * step);
}
