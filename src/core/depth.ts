import type { Deck } from './deckGenerator';
import { createRng } from './rng';
import { hashString } from './seed';
import type { EnemyKind, Point } from './types';

/**
 * Deep dive: ordinary runs have a lift down to a deeper deck. Each level down
 * is harder and richer; you carry your health, oxygen and salvage with you.
 * Push your luck, or take the exit and bank what you have.
 */
export const DEPTH = {
  max: 5,
  /** Per level below the first. */
  eliteChance: 0.07,
  salvage: 0.25,
  enemySpeed: 0.05,
} as const;

export interface DepthMods {
  eliteBonus: number;
  salvage: number;
  enemySpeed: number;
}

export function depthMods(depth: number): DepthMods {
  const d = Math.max(0, Math.min(DEPTH.max, depth) - 1);
  return { eliteBonus: DEPTH.eliteChance * d, salvage: 1 + DEPTH.salvage * d, enemySpeed: 1 + DEPTH.enemySpeed * d };
}

/** Seed for the deck below: "ABC123" -> "ABC123-D2" -> "ABC123-D3". */
export function deeperSeed(seed: string, nextDepth: number): string {
  return `${seed.replace(/-D\d+$/, '')}-D${nextDepth}`;
}

export function baseSeed(seed: string): string {
  return seed.replace(/-D\d+$/, '');
}

/**
 * Where the lift goes: the centre of a room well away from the start (at
 * least half the deck's walking distance), never the exit's room. Its own
 * random stream, so the rest of the layout doesn't move.
 */
export function placeLift(deck: Deck, dist: number[][]): Point | null {
  const rng = createRng(hashString(`${deck.seed}:${deck.ship}:lift`));
  const furthest = Math.max(...dist.flat());
  const inRoom = (p: Point, r: { x: number; y: number; w: number; h: number }) =>
    p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
  const taken = new Set(deck.spawns.map((s) => `${s.x},${s.y}`));
  const options = deck.rooms
    .slice(1)
    .filter((r) => !inRoom(deck.extraction, r))
    .map((r) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) }))
    .filter((p) => dist[p.y][p.x] >= furthest * 0.5 && !taken.has(`${p.x},${p.y}`));
  if (!options.length) return null;
  return options[rng.int(0, options.length - 1)];
}

/** What you carry down the lift. */
export interface Carry {
  depth: number;
  hp: number;
  oxygen: number;
  salvage: number;
  kills: number;
  logsFound: string[];
  /** When the dive started, so the run clock covers every deck. */
  elapsedMs: number;
  /** Hall of fame tallies from the decks above. */
  tally?: { kills: Partial<Record<EnemyKind, number>>; elites: number; bounties: number };
}
