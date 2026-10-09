import { createRng } from './rng';
import { hashString } from './seed';
import type { ShipType } from './types';

/**
 * The Weekly Challenge: one ship per ISO week, the same for everyone, with two
 * mutators that change the rules. Pure, so it's unit-tested.
 */
export type MutatorId = 'glass' | 'thin-air' | 'swarm' | 'bloodthirsty' | 'jackpot' | 'lights-out';

export interface MutatorEffects {
  /** Multiplies damage you deal. */
  damageOut: number;
  /** Multiplies damage you take. */
  damageIn: number;
  /** Multiplies oxygen / battery drain. */
  drain: number;
  /** Multiplies salvage on the ship. */
  salvage: number;
  /** Multiplies enemy movement speed. */
  enemySpeed: number;
  /** Health back for every kill. */
  healOnKill: number;
  /** Chance an enemy is elite (the highest of this and the ship condition is used). */
  eliteChance: number;
  /** Added darkness; lamps off when above zero. */
  darkness: number;
}

export interface Mutator {
  id: MutatorId;
  name: string;
  blurb: string;
  effects: Partial<MutatorEffects>;
}

export const MUTATORS: Record<MutatorId, Mutator> = {
  glass: { id: 'glass', name: 'Glass cannon', blurb: 'You deal double damage, and take double damage.', effects: { damageOut: 2, damageIn: 2 } },
  'thin-air': {
    id: 'thin-air',
    name: 'Thin air',
    blurb: 'Oxygen drains 60% faster, but salvage is worth 50% more.',
    effects: { drain: 1.6, salvage: 1.5 },
  },
  swarm: { id: 'swarm', name: 'Swarm', blurb: 'Hostiles move 25% faster.', effects: { enemySpeed: 1.25 } },
  bloodthirsty: { id: 'bloodthirsty', name: 'Bloodthirsty', blurb: 'Every kill patches you up for 5 health.', effects: { healOnKill: 5 } },
  jackpot: { id: 'jackpot', name: 'Jackpot', blurb: 'Elites everywhere: tougher hostiles, much better loot.', effects: { eliteChance: 0.4 } },
  'lights-out': { id: 'lights-out', name: 'Lights out', blurb: 'Main power is dead: pitch-dark decks.', effects: { darkness: 0.2 } },
};

export const NO_EFFECTS: MutatorEffects = {
  damageOut: 1,
  damageIn: 1,
  drain: 1,
  salvage: 1,
  enemySpeed: 1,
  healOnKill: 0,
  eliteChance: 0,
  darkness: 0,
};

/** Combines mutators: multipliers multiply, bonuses add, chances take the highest. */
export function combineMutators(list: readonly Mutator[]): MutatorEffects {
  const out = { ...NO_EFFECTS };
  for (const m of list) {
    const e = m.effects;
    out.damageOut *= e.damageOut ?? 1;
    out.damageIn *= e.damageIn ?? 1;
    out.drain *= e.drain ?? 1;
    out.salvage *= e.salvage ?? 1;
    out.enemySpeed *= e.enemySpeed ?? 1;
    out.healOnKill += e.healOnKill ?? 0;
    out.eliteChance = Math.max(out.eliteChance, e.eliteChance ?? 0);
    out.darkness += e.darkness ?? 0;
  }
  return out;
}

/** ISO 8601 week, e.g. "2026-W41". Weeks start on Monday (UTC). */
export function isoWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export const weeklySeed = (date: Date) => `weekly-${isoWeek(date)}`;

export function weekFromSeed(seed: string): string | null {
  const m = /^weekly-(\d{4}-W\d{2})$/.exec(seed);
  return m ? m[1] : null;
}

export const MINING_WEEKLY_FROM = '2026-W42';

/** This week's ship type and two different mutators, from the seed. */
export function weeklySetup(seed: string): { ship: ShipType; mutators: Mutator[] } {
  const rng = createRng(hashString(`weekly:${seed}`));
  // From week 42 of 2026 the weekly can be any of the three ship types; earlier weeks keep theirs.
  const roll = rng.next();
  const three = (weekFromSeed(seed) ?? '') >= MINING_WEEKLY_FROM;
  const ship: ShipType = three
    ? roll < 1 / 3
      ? 'freighter'
      : roll < 2 / 3
        ? 'research'
        : 'mining'
    : roll < 0.5
      ? 'freighter'
      : 'research';
  const ids = Object.keys(MUTATORS) as MutatorId[];
  const first = ids[rng.int(0, ids.length - 1)];
  const rest = ids.filter((id) => id !== first);
  const second = rest[rng.int(0, rest.length - 1)];
  return { ship, mutators: [MUTATORS[first], MUTATORS[second]] };
}
