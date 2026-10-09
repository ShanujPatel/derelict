import { createRng } from './rng';
import { hashString } from './seed';
import type { ShipType } from './types';

/**
 * Every derelict is in some state when you board it: a power failure, a
 * leaking hull, a rich cargo manifest... Picked from the seed (so the daily
 * ship has the same condition for everyone) and applied as modifiers; the
 * layout itself never changes.
 */
export type ConditionId = 'calm' | 'blackout' | 'breach' | 'rich' | 'hardened' | 'jammed';

export interface Condition {
  id: ConditionId;
  name: string;
  /** One line for the boarding screen and daily card. */
  blurb: string;
  /** Added to the darkness overlay's opacity. */
  darkness: number;
  oxygenDrain: number;
  salvage: number;
  /** Chance each enemy on the ship is an elite. */
  eliteChance: number;
  /** Lamps on the bulkheads stay off. */
  lampsOff: boolean;
  /** The scanner map only shows the room you're in. */
  scannerJammed: boolean;
}

const BASE: Omit<Condition, 'id' | 'name' | 'blurb'> = {
  darkness: 0,
  oxygenDrain: 1,
  salvage: 1,
  eliteChance: 0.08,
  lampsOff: false,
  scannerJammed: false,
};

export const CONDITIONS: Record<ConditionId, Condition> = {
  calm: { ...BASE, id: 'calm', name: 'Quiet', blurb: 'Nothing unusual aboard. Probably.' },
  blackout: {
    ...BASE,
    id: 'blackout',
    name: 'Power failure',
    blurb: 'Main power is out: darker decks, no warning lamps.',
    darkness: 0.15,
    lampsOff: true,
  },
  breach: {
    ...BASE,
    id: 'breach',
    name: 'Hull breach',
    blurb: 'Venting atmosphere: oxygen and power drain 35% faster.',
    oxygenDrain: 1.35,
  },
  rich: {
    ...BASE,
    id: 'rich',
    name: 'Rich manifest',
    blurb: 'Valuable cargo aboard: salvage is worth 30% more.',
    salvage: 1.3,
  },
  hardened: {
    ...BASE,
    id: 'hardened',
    name: 'Hardened security',
    blurb: 'More elite hostiles: tougher, but they drop more.',
    eliteChance: 0.3,
  },
  jammed: {
    ...BASE,
    id: 'jammed',
    name: 'Scanner jammed',
    blurb: 'Interference: your scanner only maps the room you are in.',
    scannerJammed: true,
  },
};

/** How often each condition comes up, out of the total. */
const WEIGHTS: [ConditionId, number][] = [
  ['calm', 4],
  ['blackout', 2],
  ['breach', 2],
  ['rich', 2],
  ['hardened', 2],
  ['jammed', 1],
];

export function conditionFor(seed: string, ship: ShipType): Condition {
  const rng = createRng(hashString(`condition:${seed}:${ship}`));
  const total = WEIGHTS.reduce((n, [, w]) => n + w, 0);
  let roll = rng.next() * total;
  for (const [id, w] of WEIGHTS) {
    roll -= w;
    if (roll < 0) return CONDITIONS[id];
  }
  return CONDITIONS.calm;
}

export const ELITE = {
  hpMultiplier: 2,
  speedMultiplier: 1.12,
  /** Extra salvage an elite always drops. */
  bonus: [10, 20] as [number, number],
} as const;

/** Whether the n-th enemy placed on this ship is an elite. Seeded, so it's the same every time. */
export function isElite(seed: string, ship: ShipType, index: number, chance: number): boolean {
  return createRng(hashString(`elite:${seed}:${ship}:${index}`)).next() < chance;
}
