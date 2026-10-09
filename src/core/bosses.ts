import type { ShipType } from './types';

/**
 * Boss contracts: three bosses, each fought in its own arena (see arena.ts).
 * Pure numbers and rules here; the fights themselves live in scenes/boss.ts.
 */
export type BossId = 'foreman' | 'mother' | 'captain';
export const BOSS_IDS: readonly BossId[] = ['foreman', 'mother', 'captain'];

export interface BossDef {
  id: BossId;
  name: string;
  /** Shown under the name on the health bar. */
  title: string;
  ship: ShipType;
  arena: string;
  hp: number;
  /** Paid once, the first time you beat it. */
  firstKillReward: number;
  blurb: string;
  /** How to win, for the contract card. */
  tips: string[];
}

export const BOSSES: Record<BossId, BossDef> = {
  foreman: {
    id: 'foreman',
    name: 'THE FOREMAN',
    title: 'Rogue cargo loader',
    ship: 'freighter',
    arena: 'Cargo bay',
    hp: 70,
    firstKillReward: 200,
    blurb: 'A heavy loader that never stopped working. Its armour shrugs off normal fire.',
    tips: [
      'Bait its charge, then roll aside: it stuns itself on walls and pillars.',
      'Shoot the 4 power couplings. Each one stuns it; lose them all and its armour is gone.',
      'Fuel drums stun it. The railgun gets through armour at half damage.',
    ],
  },
  mother: {
    id: 'mother',
    name: 'THE BLOOM MOTHER',
    title: 'Root of the infestation',
    ship: 'research',
    arena: 'Hatchery',
    hp: 80,
    firstKillReward: 220,
    blurb: 'Everything aboard grew from her. Her carapace turns aside your shots.',
    tips: [
      'Her core is only exposed while her mouth is open to spit. Hit it then.',
      'Three feeder roots heal her. Shoot or torch them; they grow back if you wait.',
      'Drums beside her hit straight through the carapace.',
    ],
  },
  captain: {
    id: 'captain',
    name: 'THE HOLLOW CAPTAIN',
    title: 'Rook Brannick, Gravecutter',
    ship: 'mining',
    arena: 'Ore hold 4',
    hp: 90,
    firstKillReward: 240,
    blurb: 'The Gravecutter captain, wired into stolen AI cores. A deflector shield turns your shots away.',
    tips: [
      'Three pylons power his shield. Break all three and it drops for a few seconds.',
      'Use the grav tool on his grenades to throw them back: they hit him through the shield.',
      'Drum blasts get through too. In phase two he blinks around and calls raiders.',
    ],
  },
};

/** You need this many extractions before a contract opens up. */
export const BOSS_UNLOCK_EXTRACTIONS = 3;

/** Phase 2 starts at half health. */
export function bossPhase(hp: number, max: number): 1 | 2 {
  return hp <= max / 2 ? 2 : 1;
}

// ---------------------------------------------------------------- the Foreman

export const FOREMAN = {
  couplings: 4,
  couplingHp: 5,
  walkSpeed: [34, 48] as const,
  /** Wind-up before a charge, with a warning line, then a straight dash. */
  chargeWindupMs: [900, 650] as const,
  chargeSpeed: 270,
  chargeMaxMs: 1800,
  chargeEveryMs: [4200, 3000] as const,
  /** Stuns: hitting a wall mid-charge, losing a coupling, or a drum blast. */
  wallStunMs: 3000,
  couplingStunMs: 2200,
  blastStunMs: 1800,
  contactDamage: 18,
  chargeDamage: 28,
  /** Rivet spray: a fan of shots. */
  sprayEveryMs: [3200, 2000] as const,
  sprayShots: [5, 9] as const,
  sprayDamage: 9,
  /** Phase 2 calls in drones through floor hatches. */
  droneEveryMs: 9000,
  maxDrones: 3,
  /** Share of a pierce (railgun) hit that gets through intact armour. */
  pierceThrough: 0.5,
  blastDamage: 8,
} as const;

/** Damage a hit on the Foreman actually does. */
export function foremanDamage(
  amount: number,
  s: { stunned: boolean; armourGone: boolean; pierce: boolean },
): number {
  if (s.stunned || s.armourGone) return amount;
  if (s.pierce) return Math.ceil(amount * FOREMAN.pierceThrough);
  return 0;
}

// ---------------------------------------------------------------- the Bloom Mother

export const MOTHER = {
  roots: 3,
  rootHp: 6,
  /** A destroyed root grows back after this long. */
  rootRegrowMs: 20000,
  /** Health per second each living root gives her. */
  healPerRoot: 0.4,
  /** Her mouth opens every so often for this long: the only time she can be hurt. */
  openEveryMs: [5200, 3900] as const,
  openMs: 2200,
  /** Warning wobble before the mouth opens. */
  tellMs: 600,
  acidShots: [5, 7] as const,
  acidDamage: 11,
  acidSpeed: 120,
  crawlerEveryMs: [8000, 6000] as const,
  maxCrawlers: 4,
  /** Phase 2: slow rings of spores you have to roll through or dodge between. */
  sporeEveryMs: 6500,
  sporeShots: 14,
  sporeDamage: 8,
  sporeSpeed: 70,
  blastDamage: 10,
  contactDamage: 20,
} as const;

export function motherDamage(amount: number, s: { open: boolean }): number {
  return s.open ? amount : 0;
}

/** Healing from the living feeder roots over a stretch of time, capped at full health. */
export function motherHeal(hp: number, max: number, livingRoots: number, seconds: number): number {
  return Math.min(max, hp + livingRoots * MOTHER.healPerRoot * seconds);
}

/** Evenly spaced angles for a fan of `count` shots centred on `aim`. */
export function fanAngles(aim: number, count: number, spread: number): number[] {
  if (count <= 1) return [aim];
  const step = spread / (count - 1);
  return Array.from({ length: count }, (_, i) => aim - spread / 2 + i * step);
}

/** A full ring of `count` shots, rotated by `offset`. */
export function ringAngles(count: number, offset = 0): number[] {
  return Array.from({ length: count }, (_, i) => offset + (i / count) * Math.PI * 2);
}

// ---------------------------------------------------------------- the Hollow Captain

export const CAPTAIN = {
  pylons: 3,
  pylonHp: 6,
  /** Breaking every pylon drops the shield for this long; then they reboot. */
  shieldDownMs: 7000,
  walkSpeed: [44, 60] as const,
  /** He keeps his distance: backs off inside the first, closes in beyond the second. */
  range: [100, 170] as const,
  burstEveryMs: [2600, 1900] as const,
  burstShots: [4, 6] as const,
  burstDamage: 7,
  bulletSpeed: 230,
  grenadeEveryMs: [5600, 4000] as const,
  grenades: [1, 3] as const,
  /** A grenade flies for this long, then sits on its warning circle for the fuse. */
  grenadeFlightMs: 900,
  grenadeFuseMs: 500,
  grenadeRadius: 34,
  grenadeDamage: 20,
  /** His own grenade landing on him (thrown back with the grav tool) ignores the shield. */
  grenadeSelfDamage: 9,
  /** Phase 2: blinks to a new spot, and calls in raiders. */
  blinkEveryMs: 7000,
  raiderEveryMs: 11000,
  maxRaiders: 2,
  blastDamage: 8,
  contactDamage: 14,
} as const;

/** Damage a hit on the Captain does: nothing while his shield is up. */
export function captainDamage(amount: number, s: { shielded: boolean }): number {
  return s.shielded ? 0 : amount;
}

// ---------------------------------------------------------------- records

export interface BossRecord {
  kills: number;
  /** Fastest win in ms; 0 if never beaten. */
  bestMs: number;
}

export const emptyBossRecords = (): Record<BossId, BossRecord> => ({
  foreman: { kills: 0, bestMs: 0 },
  mother: { kills: 0, bestMs: 0 },
  captain: { kills: 0, bestMs: 0 },
});

/** Seed for a boss contract run: random, but marked so the arena knows which boss. */
export const bossSeedPrefix = (id: BossId) => `boss-${id}-`;
