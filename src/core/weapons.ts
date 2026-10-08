export type WeaponId = 'blaster' | 'scattergun';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  cooldownMs: number;
  pellets: number;
  /** Total cone width in radians, shared across pellets. */
  spread: number;
  bulletSpeed: number;
  damage: number;
  lifetimeMs: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  blaster: {
    id: 'blaster',
    name: 'Blaster',
    cooldownMs: 170,
    pellets: 1,
    spread: 0,
    bulletSpeed: 320,
    damage: 1,
    lifetimeMs: 900,
  },
  scattergun: {
    id: 'scattergun',
    name: 'Scattergun',
    cooldownMs: 650,
    pellets: 5,
    spread: 0.6,
    bulletSpeed: 280,
    damage: 1,
    lifetimeMs: 320,
  },
};

/** Angles for each pellet, spread evenly across the cone centred on the aim. */
export function pelletAngles(weapon: WeaponDef, aim: number): number[] {
  if (weapon.pellets <= 1) return [aim];
  const step = weapon.spread / (weapon.pellets - 1);
  return Array.from({ length: weapon.pellets }, (_, i) => aim - weapon.spread / 2 + i * step);
}
