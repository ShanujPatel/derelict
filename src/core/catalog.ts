import type { WeaponId } from './weapons';

/** Everything that can be bought in the hub, with prices. Pure data. */

export type CharacterId = 'salvager' | 'robot';
export type StatId = 'health' | 'capacity' | 'speed';
export type PerkId =
  | 'scavenger'
  | 'cold-cutter'
  | 'scrapper'
  | 'second-wind'
  | 'adrenaline'
  | 'demolitionist'
  | 'field-medic'
  | 'self-repair';
export type ToolId = 'torch' | 'hacker' | 'grav' | 'sentry';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  blurb: string;
  cost: number;
  baseHp: number;
  /** Fraction of incoming damage ignored. */
  armour: number;
  resource: 'oxygen' | 'battery';
  baseCapacity: number;
  drainPerSecond: number;
  speedMultiplier: number;
  /** Seconds to finish a hack. */
  hackSeconds: number;
}

export const CHARACTERS: Record<CharacterId, CharacterDef> = {
  salvager: {
    id: 'salvager',
    name: 'Salvager',
    blurb: 'Human scavenger. Tough, quick, breathes oxygen.',
    cost: 0,
    baseHp: 100,
    armour: 0,
    resource: 'oxygen',
    baseCapacity: 100,
    drainPerSecond: 0.8,
    speedMultiplier: 1,
    hackSeconds: 1.4,
  },
  robot: {
    id: 'robot',
    name: 'Robot',
    blurb: 'Armoured salvage unit. Shrugs off hits, hacks twice as fast, slower, runs on battery.',
    cost: 150,
    baseHp: 80,
    armour: 0.3,
    resource: 'battery',
    baseCapacity: 130,
    drainPerSecond: 0.8,
    speedMultiplier: 0.92,
    hackSeconds: 0.7,
  },
};

export interface StatDef {
  id: StatId;
  name: string;
  /** Cost of each tier, in order. Length = number of tiers. */
  costs: number[];
  perTier: number;
  describe: (character: CharacterDef) => string;
}

export const STATS: Record<StatId, StatDef> = {
  health: {
    id: 'health',
    name: 'Hull plating',
    costs: [60, 120, 200],
    perTier: 15,
    describe: () => '+15 max HP per tier',
  },
  capacity: {
    id: 'capacity',
    name: 'Life support',
    costs: [60, 120, 200],
    perTier: 20,
    describe: (c) => `+20 max ${c.resource === 'oxygen' ? 'oxygen' : 'battery'} per tier`,
  },
  speed: {
    id: 'speed',
    name: 'Servo boots',
    costs: [80, 160, 260],
    perTier: 0.06,
    describe: () => '+6% move speed per tier',
  },
};

export interface PerkDef {
  id: PerkId;
  name: string;
  blurb: string;
  cost: number;
}

export const PERKS: Record<PerkId, PerkDef> = {
  scavenger: { id: 'scavenger', name: 'Scavenger', blurb: '+25% salvage from every pickup.', cost: 90 },
  'cold-cutter': { id: 'cold-cutter', name: 'Cold cutter', blurb: 'Torch cuts cost almost nothing.', cost: 90 },
  scrapper: { id: 'scrapper', name: 'Scrapper', blurb: 'Every destroyed drone drops salvage.', cost: 110 },
  'second-wind': { id: 'second-wind', name: 'Second wind', blurb: 'Survive one lethal hit per run.', cost: 140 },
  adrenaline: { id: 'adrenaline', name: 'Adrenaline', blurb: 'Dodge roll recharges twice as fast.', cost: 120 },
  demolitionist: { id: 'demolitionist', name: 'Demolitionist', blurb: 'Fuel drum blasts are 40% bigger and never hurt you.', cost: 120 },
  'self-repair': {
    id: 'self-repair',
    name: 'Self-repair (robot)',
    blurb: 'Robot only: out of combat for 4 seconds, it turns battery into hull repairs.',
    cost: 130,
  },
  'field-medic': { id: 'field-medic', name: 'Field medic', blurb: 'Health packs and repair kits heal 60% more.', cost: 100 },
};

export const WEAPON_COSTS: Record<WeaponId, number> = {
  blaster: 0,
  scattergun: 0,
  railgun: 180,
  arc: 220,
};

export interface ToolDef {
  id: ToolId;
  name: string;
  blurb: string;
  cost: number;
}

export const TOOLS: Record<ToolId, ToolDef> = {
  torch: { id: 'torch', name: 'Cutting torch', blurb: 'Cuts through cracked walls to make shortcuts.', cost: 0 },
  hacker: {
    id: 'hacker',
    name: 'Hacking tool',
    blurb: 'Turns turrets to your side and opens locked caches. Stand close and hold still.',
    cost: 160,
  },
  sentry: {
    id: 'sentry',
    name: 'Sentry drone',
    blurb: 'Deploys a little auto-turret that shoots nearby hostiles for 12 seconds. One at a time.',
    cost: 220,
  },
  grav: {
    id: 'grav',
    name: 'Grav tool',
    blurb: 'Cone-shaped push: shoves and stuns enemies, swats incoming shots aside.',
    cost: 200,
  },
};

export interface ColourOption {
  id: string;
  name: string;
  cost: number;
  /** Palette overrides applied to the character sprite. */
  colours: Record<string, string>;
  /** Trophy colours can't be bought: they unlock with an achievement. */
  trophy?: { achievement: string; label: string };
}

/** Body colours (suit or chassis) and accent colours (visor or eye), per character. */
export const COSMETICS: Record<CharacterId, { body: ColourOption[]; accent: ColourOption[] }> = {
  salvager: {
    body: [
      { id: 'orange', name: 'Hazard orange', cost: 0, colours: { b: '#e07a2e', B: '#f4a259', d: '#a5521d' } },
      { id: 'teal', name: 'Teal', cost: 40, colours: { b: '#2a9d8f', B: '#5cc8b8', d: '#1d6b62' } },
      { id: 'crimson', name: 'Crimson', cost: 40, colours: { b: '#c0392b', B: '#e2685b', d: '#7f241b' } },
      { id: 'ivory', name: 'Ivory', cost: 60, colours: { b: '#cfc8b8', B: '#f4f0e6', d: '#8f897b' } },
      { id: 'gold', name: 'Gold', cost: 120, colours: { b: '#d4a017', B: '#f1c84b', d: '#8f6b0c' } },
      {
        id: 'foreman',
        name: "Foreman's hazard rig",
        cost: 0,
        colours: { b: '#2b2b2b', B: '#ffd166', d: '#121212' },
        trophy: { achievement: 'fired', label: 'Beat the Foreman' },
      },
      {
        id: 'mutant',
        name: 'Mutant violet',
        cost: 0,
        colours: { b: '#7a4fc9', B: '#c9a0ff', d: '#4a2d80' },
        trophy: { achievement: 'mutant', label: 'Extract from a Weekly Challenge' },
      },
      {
        id: 'banner',
        name: 'Clan banner red',
        cost: 0,
        colours: { b: '#9e1f2c', B: '#d94a4a', d: '#5c1018' },
        trophy: { achievement: 'clan-podium', label: 'Clan finishes a week in the top 3' },
      },
    ],
    accent: [
      { id: 'cyan', name: 'Cyan visor', cost: 0, colours: { v: '#3fa7d6', w: '#d8f6ff' } },
      { id: 'lime', name: 'Lime visor', cost: 30, colours: { v: '#4fb83f', w: '#d9ffcf' } },
      { id: 'amber', name: 'Amber visor', cost: 30, colours: { v: '#d9922c', w: '#fff0c9' } },
      { id: 'magenta', name: 'Magenta visor', cost: 50, colours: { v: '#b9409f', w: '#ffd6f5' } },
      {
        id: 'gilded',
        name: 'Gilded visor',
        cost: 0,
        colours: { v: '#f1c84b', w: '#fff8d6' },
        trophy: { achievement: 'heavy-hauler', label: 'Extract with 300+ salvage' },
      },
      {
        id: 'hollow',
        name: 'Hollow visor',
        cost: 0,
        colours: { v: '#c06bff', w: '#f0d8ff' },
        trophy: { achievement: 'mutiny', label: 'Beat the Hollow Captain' },
      },
    ],
  },
  robot: {
    body: [
      { id: 'steel', name: 'Steel', cost: 0, colours: { s: '#8d99ae', d: '#5c6678' } },
      { id: 'olive', name: 'Olive drab', cost: 40, colours: { s: '#7a8450', d: '#4f5634' } },
      { id: 'cobalt', name: 'Cobalt', cost: 40, colours: { s: '#3f6fb5', d: '#284a7d' } },
      { id: 'graphite', name: 'Graphite', cost: 60, colours: { s: '#4a4f5a', d: '#2e3239' } },
      { id: 'rust', name: 'Rust', cost: 80, colours: { s: '#b5653f', d: '#7a3f25' } },
      {
        id: 'bloom',
        name: 'Bloom-grown chassis',
        cost: 0,
        colours: { s: '#5a2a6e', d: '#2f7f6a' },
        trophy: { achievement: 'root-and-branch', label: 'Beat the Bloom Mother' },
      },
      {
        id: 'prospector',
        name: 'Ore-stained chassis',
        cost: 0,
        colours: { s: '#a87a3e', d: '#5a4a3a' },
        trophy: { achievement: 'prospector', label: 'Earn the Prospector achievement' },
      },
      {
        id: 'banner',
        name: 'Clan banner plating',
        cost: 0,
        colours: { s: '#9e1f2c', d: '#5c1018' },
        trophy: { achievement: 'clan-podium', label: 'Clan finishes a week in the top 3' },
      },
    ],
    accent: [
      { id: 'cyan', name: 'Cyan optics', cost: 0, colours: { e: '#5ef2ff', C: '#5ef2ff' } },
      { id: 'red', name: 'Red optics', cost: 30, colours: { e: '#ff3b4e', C: '#ff3b4e' } },
      { id: 'lime', name: 'Lime optics', cost: 30, colours: { e: '#7dff6a', C: '#7dff6a' } },
      { id: 'amber', name: 'Amber optics', cost: 50, colours: { e: '#ffb43b', C: '#ffb43b' } },
      {
        id: 'ghost',
        name: 'Ghost optics',
        cost: 0,
        colours: { e: '#f2f6ff', C: '#f2f6ff' },
        trophy: { achievement: 'ghost', label: 'Earn the Ghost achievement' },
      },
    ],
  },
};

export function findCosmetic(character: CharacterId, slot: 'body' | 'accent', id: string): ColourOption {
  const list = COSMETICS[character][slot];
  return list.find((c) => c.id === id) ?? list[0];
}

/** Stable id for a cosmetic across characters, used in the owned list. */
export const cosmeticKey = (character: CharacterId, slot: 'body' | 'accent', id: string) =>
  `${character}:${slot}:${id}`;
