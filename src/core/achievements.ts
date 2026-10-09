import type { BossId } from './bosses';
import type { ShipType } from './types';

/**
 * Run achievements: one-off goals that pay salvage the first time you hit
 * them. Checked once at the end of a run against a summary of what happened.
 */
export interface RunSummary {
  extracted: boolean;
  ship: ShipType;
  daily: boolean;
  salvage: number;
  kills: number;
  durationMs: number;
  damageTaken: number;
  dodges: number;
  blastKills: number;
  /** Share of the ship's floor you mapped, 0–1. */
  explored: number;
  eggsDestroyed: number;
  /** Rivals killed, and how many boarded (0 if they hadn't arrived yet). */
  rivalsKilled: number;
  rivalsBoarded: number;
  hacks: number;
  elitesKilled: number;
  /** The boss you beat this run, if any. */
  bossKilled: BossId | null;
  /** A weekly challenge run. */
  weekly: boolean;
  bounties: number;
  /** Longest salvage combo chain. */
  bestCombo: number;
  /** Deck you ended on (deep dives). */
  depth: number;
  /** Ore veins cut open on a mining hauler. */
  oreVeins?: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  reward: number;
  earned: (r: RunSummary) => boolean;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'first-extract',
    name: 'Clean getaway',
    description: 'Extract from a derelict.',
    reward: 25,
    earned: (r) => r.extracted,
  },
  {
    id: 'ghost',
    name: 'Ghost',
    description: 'Extract with at least 50 salvage without destroying anything.',
    reward: 80,
    earned: (r) => r.extracted && r.kills === 0 && r.salvage >= 50,
  },
  {
    id: 'untouchable',
    name: 'Untouchable',
    description: 'Extract with at least 50 salvage without taking any damage.',
    reward: 100,
    earned: (r) => r.extracted && r.damageTaken === 0 && r.salvage >= 50,
  },
  {
    id: 'demolitions',
    name: 'Demolitions',
    description: 'Destroy 3 hostiles with fuel drum blasts in one run.',
    reward: 60,
    earned: (r) => r.blastKills >= 3,
  },
  {
    id: 'cartographer',
    name: 'Cartographer',
    description: 'Map 90% of a ship and extract.',
    reward: 60,
    earned: (r) => r.extracted && r.explored >= 0.9,
  },
  {
    id: 'in-and-out',
    name: 'In and out',
    description: 'Extract within 90 seconds carrying at least 60 salvage.',
    reward: 70,
    earned: (r) => r.extracted && r.durationMs <= 90_000 && r.salvage >= 60,
  },
  {
    id: 'heavy-hauler',
    name: 'Heavy hauler',
    description: 'Extract with 300 salvage or more.',
    reward: 100,
    earned: (r) => r.extracted && r.salvage >= 300,
  },
  {
    id: 'cutters-cut',
    name: 'Cutting the cutters',
    description: 'Destroy every Gravecutter in a boarding party.',
    reward: 80,
    earned: (r) => r.rivalsBoarded > 0 && r.rivalsKilled >= r.rivalsBoarded,
  },
  {
    id: 'acrobat',
    name: 'Acrobat',
    description: 'Dodge roll 15 times in one run and extract.',
    reward: 40,
    earned: (r) => r.extracted && r.dodges >= 15,
  },
  {
    id: 'weed-killer',
    name: 'Weed killer',
    description: 'Destroy 3 egg sacs on a research vessel in one run.',
    reward: 60,
    earned: (r) => r.ship === 'research' && r.eggsDestroyed >= 3,
  },
  {
    id: 'systems-admin',
    name: 'Systems admin',
    description: 'Complete 3 hacks in one run.',
    reward: 50,
    earned: (r) => r.hacks >= 3,
  },
  {
    id: 'big-game',
    name: 'Big game',
    description: 'Destroy 3 elite hostiles in one run.',
    reward: 70,
    earned: (r) => r.elitesKilled >= 3,
  },
  {
    id: 'fired',
    name: 'Fired',
    description: 'Defeat the Foreman.',
    reward: 60,
    earned: (r) => r.bossKilled === 'foreman',
  },
  {
    id: 'root-and-branch',
    name: 'Root and branch',
    description: 'Defeat the Bloom Mother.',
    reward: 60,
    earned: (r) => r.bossKilled === 'mother',
  },
  {
    id: 'mutiny',
    name: 'Mutiny',
    description: 'Defeat the Hollow Captain.',
    reward: 70,
    earned: (r) => r.bossKilled === 'captain',
  },
  {
    id: 'prospector',
    name: 'Prospector',
    description: 'Cut open 5 ore veins on a mining hauler and extract.',
    reward: 60,
    earned: (r) => r.extracted && r.ship === 'mining' && (r.oreVeins ?? 0) >= 5,
  },
  {
    id: 'bounty-hunter',
    name: 'Bounty hunter',
    description: 'Claim a bounty and extract.',
    reward: 50,
    earned: (r) => r.extracted && r.bounties > 0,
  },
  {
    id: 'hoover',
    name: 'Hoover',
    description: 'Chain 6 salvage pickups into a ×1.5 combo.',
    reward: 50,
    earned: (r) => r.bestCombo >= 6,
  },
  {
    id: 'deep-diver',
    name: 'Deep diver',
    description: 'Take the lift down to depth 3 and extract.',
    reward: 80,
    earned: (r) => r.extracted && r.depth >= 3,
  },
  {
    id: 'mutant',
    name: 'Mutant',
    description: 'Extract from a Weekly Challenge.',
    reward: 60,
    earned: (r) => r.weekly && r.extracted,
  },
  {
    id: 'clan-podium',
    name: 'Podium crew',
    description: 'Be in a clan that finishes a weekly season in the top 3.',
    reward: 80,
    // Awarded from the clan card in the hub, not by a run.
    earned: () => false,
  },
  {
    id: 'daily-driver',
    name: 'Daily driver',
    description: 'Extract from a Daily Derelict.',
    reward: 40,
    earned: (r) => r.daily && r.extracted,
  },
];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

/** Achievements this run earned that you didn't already have. */
export function newAchievements(summary: RunSummary, have: readonly string[]): Achievement[] {
  return ACHIEVEMENTS.filter((a) => !have.includes(a.id) && a.earned(summary));
}
