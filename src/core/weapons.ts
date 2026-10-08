export type WeaponId = 'blaster' | 'scattergun' | 'railgun';

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
};

/** Angles for each pellet, spread evenly across the cone centred on the aim. */
export function pelletAngles(weapon: WeaponDef, aim: number): number[] {
  if (weapon.pellets <= 1) return [aim];
  const step = weapon.spread / (weapon.pellets - 1);
  return Array.from({ length: weapon.pellets }, (_, i) => aim - weapon.spread / 2 + i * step);
}
