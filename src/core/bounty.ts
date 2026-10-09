import { createRng } from './rng';
import { hashString } from './seed';
import type { EnemyKind, ShipType } from './types';

/**
 * Bounties: on every ordinary run, one hostile is a named target worth extra
 * salvage. Picked from the seed, so a shared ship has the same bounty.
 */
export const BOUNTY = {
  hpMultiplier: 3,
  scale: 1.35,
  reward: [40, 70] as [number, number],
} as const;

/** Kinds that can carry a bounty: things that move and fight. */
export const BOUNTY_KINDS: readonly EnemyKind[] = ['drone', 'crawler', 'spitter'];

const NAMES = [
  'RUSTJAW',
  'OLD SPARKY',
  'THE WIDOW',
  'KNUCKLES',
  'HALF-LIFE',
  'GRINDER',
  'MOTHBALL',
  'STATIC',
  'LOCKJAW',
  'SIXTEEN',
  'THE AUDITOR',
  'GRUDGE',
];

export interface Bounty {
  /** Which eligible hostile (in spawn order) carries the bounty. */
  index: number;
  name: string;
  reward: number;
}

export function bountyFor(seed: string, ship: ShipType, eligible: number): Bounty | null {
  if (eligible <= 0) return null;
  const rng = createRng(hashString(`bounty:${seed}:${ship}`));
  return { index: rng.int(0, eligible - 1), name: rng.pick(NAMES), reward: rng.int(BOUNTY.reward[0], BOUNTY.reward[1]) };
}
