import {
  CHARACTERS,
  COSMETICS,
  PERKS,
  STATS,
  TOOLS,
  WEAPON_COSTS,
  cosmeticKey,
  findCosmetic,
  type CharacterDef,
  type CharacterId,
  type PerkDef,
  type PerkId,
  type StatId,
  type ToolDef,
  type ToolId,
} from './catalog';
import { CHAPTERS, CODEX, chapterProgress, isResearchUnlocked } from './codex';
import { SHIP_TYPES, type ShipType } from './types';
import { hashString } from './seed';
import { WEAPONS, type WeaponDef, type WeaponId } from './weapons';

/**
 * Permanent progress between runs. All functions are pure: they return a new
 * SaveData and never mutate the one passed in.
 */
export interface SaveData {
  version: 1;
  credits: number;
  characters: CharacterId[];
  weapons: WeaponId[];
  perks: PerkId[];
  tools: ToolId[];
  /** Crew log ids found, in the order they were found. */
  codex: string[];
  /** Chapter rewards already paid out, e.g. 'chapter-1'. */
  rewards: string[];
  /** Bought cosmetics, as cosmeticKey() strings. Free options are always owned. */
  cosmetics: string[];
  upgrades: Record<StatId, number>;
  loadout: {
    character: CharacterId;
    guns: [WeaponId, WeaponId];
    perk: PerkId | null;
    tool: ToolId;
    destination: ShipType;
    looks: Record<CharacterId, { body: string; accent: string }>;
  };
  stats: {
    runs: number;
    extractions: number;
    bestHaul: number;
    totalBanked: number;
    dronesDestroyed: number;
  };
}

export type ShopItem =
  | { kind: 'character'; id: CharacterId }
  | { kind: 'stat'; id: StatId }
  | { kind: 'weapon'; id: WeaponId }
  | { kind: 'perk'; id: PerkId }
  | { kind: 'tool'; id: ToolId }
  | { kind: 'cosmetic'; character: CharacterId; slot: 'body' | 'accent'; id: string };

export type PurchaseResult = { ok: true; save: SaveData } | { ok: false; reason: string };

export function defaultSave(): SaveData {
  return {
    version: 1,
    credits: 0,
    characters: ['salvager'],
    weapons: ['blaster', 'scattergun'],
    perks: [],
    tools: ['torch'],
    codex: [],
    rewards: [],
    cosmetics: [],
    upgrades: { health: 0, capacity: 0, speed: 0 },
    loadout: {
      character: 'salvager',
      guns: ['blaster', 'scattergun'],
      perk: null,
      tool: 'torch',
      destination: 'freighter',
      looks: {
        salvager: { body: 'orange', accent: 'cyan' },
        robot: { body: 'steel', accent: 'cyan' },
      },
    },
    stats: { runs: 0, extractions: 0, bestHaul: 0, totalBanked: 0, dronesDestroyed: 0 },
  };
}

const clone = (s: SaveData): SaveData => JSON.parse(JSON.stringify(s)) as SaveData;

// ------------------------------------------------------------------ ownership & prices

export function owns(save: SaveData, item: ShopItem): boolean {
  switch (item.kind) {
    case 'character':
      return save.characters.includes(item.id);
    case 'weapon':
      return save.weapons.includes(item.id);
    case 'perk':
      return save.perks.includes(item.id);
    case 'tool':
      return save.tools.includes(item.id);
    case 'stat':
      return save.upgrades[item.id] >= STATS[item.id].costs.length;
    case 'cosmetic':
      return (
        findCosmetic(item.character, item.slot, item.id).cost === 0 ||
        save.cosmetics.includes(cosmeticKey(item.character, item.slot, item.id))
      );
  }
}

/** Price of the next purchase of this item, or null if owned / maxed / unknown. */
export function priceOf(save: SaveData, item: ShopItem): number | null {
  if (owns(save, item)) return null;
  switch (item.kind) {
    case 'character':
      return CHARACTERS[item.id]?.cost ?? null;
    case 'weapon':
      return WEAPON_COSTS[item.id] ?? null;
    case 'perk':
      return PERKS[item.id]?.cost ?? null;
    case 'tool':
      return TOOLS[item.id]?.cost ?? null;
    case 'stat':
      return STATS[item.id].costs[save.upgrades[item.id]] ?? null;
    case 'cosmetic': {
      const option = COSMETICS[item.character][item.slot].find((c) => c.id === item.id);
      return option ? option.cost : null;
    }
  }
}

export function purchase(save: SaveData, item: ShopItem): PurchaseResult {
  const price = priceOf(save, item);
  if (price === null) return { ok: false, reason: 'Already owned' };
  if (save.credits < price) return { ok: false, reason: `Need ${price - save.credits} more salvage` };

  const next = clone(save);
  next.credits -= price;
  switch (item.kind) {
    case 'character':
      next.characters.push(item.id);
      next.loadout.character = item.id;
      break;
    case 'weapon':
      next.weapons.push(item.id);
      break;
    case 'perk':
      next.perks.push(item.id);
      if (!next.loadout.perk) next.loadout.perk = item.id;
      break;
    case 'tool':
      next.tools.push(item.id);
      next.loadout.tool = item.id;
      break;
    case 'stat':
      next.upgrades[item.id] += 1;
      break;
    case 'cosmetic':
      next.cosmetics.push(cosmeticKey(item.character, item.slot, item.id));
      next.loadout.looks[item.character][item.slot] = item.id;
      break;
  }
  return { ok: true, save: next };
}

// ------------------------------------------------------------------ loadout changes

export function selectCharacter(save: SaveData, id: CharacterId): SaveData {
  if (!save.characters.includes(id)) return save;
  const next = clone(save);
  next.loadout.character = id;
  return next;
}

/** Puts a gun in a slot; if it's already in the other slot, the two swap. */
export function setGun(save: SaveData, slot: 0 | 1, id: WeaponId): SaveData {
  if (!save.weapons.includes(id)) return save;
  const next = clone(save);
  const other = slot === 0 ? 1 : 0;
  if (next.loadout.guns[other] === id) next.loadout.guns[other] = next.loadout.guns[slot];
  next.loadout.guns[slot] = id;
  return next;
}

export function setPerk(save: SaveData, id: PerkId | null): SaveData {
  if (id !== null && !save.perks.includes(id)) return save;
  const next = clone(save);
  next.loadout.perk = id;
  return next;
}

export function setTool(save: SaveData, id: ToolId): SaveData {
  if (!save.tools.includes(id)) return save;
  const next = clone(save);
  next.loadout.tool = id;
  return next;
}

/** Research vessels can only be chosen once their coordinates have been found in the codex. */
export function canBoard(save: SaveData, ship: ShipType): boolean {
  return ship === 'freighter' || isResearchUnlocked(save.codex);
}

export function setDestination(save: SaveData, ship: ShipType): SaveData {
  if (!canBoard(save, ship)) return save;
  const next = clone(save);
  next.loadout.destination = ship;
  return next;
}

export function setLook(save: SaveData, character: CharacterId, slot: 'body' | 'accent', id: string): SaveData {
  if (!owns(save, { kind: 'cosmetic', character, slot, id })) return save;
  const next = clone(save);
  next.loadout.looks[character][slot] = id;
  return next;
}

// ------------------------------------------------------------------ runs

export interface RunResult {
  extracted: boolean;
  salvage: number;
  /** Hostiles destroyed (kept as dronesDestroyed in the save for compatibility). */
  dronesDestroyed: number;
  /** Crew logs picked up. Kept even if the run fails. */
  logsFound?: string[];
}

export function applyRunResult(save: SaveData, result: RunResult): SaveData {
  const next = clone(save);
  const banked = result.extracted ? Math.max(0, Math.floor(result.salvage)) : 0;
  next.credits += banked;
  for (const id of result.logsFound ?? []) {
    if (CODEX.some((e) => e.id === id) && !next.codex.includes(id)) next.codex.push(id);
  }
  for (const chapter of CHAPTERS) {
    const key = `chapter-${chapter.id}`;
    if (chapterProgress(next.codex, chapter.id).complete && !next.rewards.includes(key)) {
      next.rewards.push(key);
      next.credits += chapter.reward;
    }
  }
  next.stats.runs += 1;
  next.stats.dronesDestroyed += Math.max(0, result.dronesDestroyed);
  if (result.extracted) {
    next.stats.extractions += 1;
    next.stats.totalBanked += banked;
    next.stats.bestHaul = Math.max(next.stats.bestHaul, banked);
  }
  return next;
}

/** Everything the game needs to set up a run from the current save. */
export interface RunStats {
  character: CharacterDef;
  maxHp: number;
  capacity: number;
  drainPerSecond: number;
  speedMultiplier: number;
  armour: number;
  guns: WeaponDef[];
  perk: PerkDef | null;
  tool: ToolDef;
  hackSeconds: number;
  colours: Record<string, string>;
}

export function computeRunStats(save: SaveData): RunStats {
  const character = CHARACTERS[save.loadout.character];
  const look = save.loadout.looks[character.id];
  return {
    character,
    maxHp: character.baseHp + save.upgrades.health * STATS.health.perTier,
    capacity: character.baseCapacity + save.upgrades.capacity * STATS.capacity.perTier,
    drainPerSecond: character.drainPerSecond,
    speedMultiplier: character.speedMultiplier * (1 + save.upgrades.speed * STATS.speed.perTier),
    armour: character.armour,
    guns: save.loadout.guns.map((id) => WEAPONS[id]),
    perk: save.loadout.perk ? PERKS[save.loadout.perk] : null,
    tool: TOOLS[save.loadout.tool],
    hackSeconds: character.hackSeconds,
    colours: {
      ...findCosmetic(character.id, 'body', look.body).colours,
      ...findCosmetic(character.id, 'accent', look.accent).colours,
    },
  };
}

// ------------------------------------------------------------------ validation & export

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : fallback;
const pickIds = <T extends string>(v: unknown, valid: readonly T[], base: readonly T[]): T[] => {
  const list = Array.isArray(v) ? v.filter((x): x is T => valid.includes(x as T)) : [];
  return [...new Set([...base, ...list])];
};

/**
 * Turns anything (old saves, hand-edited data, a pasted code) into a valid
 * SaveData, keeping whatever parts are usable.
 */
export function sanitizeSave(raw: unknown): SaveData {
  const d = defaultSave();
  if (!isObj(raw)) return d;

  const characters = pickIds(raw.characters, Object.keys(CHARACTERS) as CharacterId[], d.characters);
  const weapons = pickIds(raw.weapons, Object.keys(WEAPONS) as WeaponId[], d.weapons);
  const perks = pickIds(raw.perks, Object.keys(PERKS) as PerkId[], []);
  const validCosmetics = (Object.keys(COSMETICS) as CharacterId[]).flatMap((c) =>
    (['body', 'accent'] as const).flatMap((slot) => COSMETICS[c][slot].map((o) => cosmeticKey(c, slot, o.id))),
  );
  const cosmetics = pickIds(raw.cosmetics, validCosmetics, []);
  const tools = pickIds(raw.tools, Object.keys(TOOLS) as ToolId[], d.tools);
  const codex = pickIds(raw.codex, CODEX.map((e) => e.id), []);
  const rewards = pickIds(raw.rewards, CHAPTERS.map((c) => `chapter-${c.id}`), []);

  const up = isObj(raw.upgrades) ? raw.upgrades : {};
  const upgrades = {} as Record<StatId, number>;
  for (const id of Object.keys(STATS) as StatId[]) {
    upgrades[id] = Math.min(num(up[id]), STATS[id].costs.length);
  }

  const save: SaveData = {
    ...d,
    credits: num(raw.credits),
    characters,
    weapons,
    perks,
    tools,
    codex,
    rewards,
    cosmetics,
    upgrades,
  };

  const lo = isObj(raw.loadout) ? raw.loadout : {};
  if (characters.includes(lo.character as CharacterId)) save.loadout.character = lo.character as CharacterId;
  if (Array.isArray(lo.guns) && lo.guns.length === 2) {
    const [a, b] = lo.guns as WeaponId[];
    if (weapons.includes(a) && weapons.includes(b) && a !== b) save.loadout.guns = [a, b];
  }
  if (perks.includes(lo.perk as PerkId)) save.loadout.perk = lo.perk as PerkId;
  if (tools.includes(lo.tool as ToolId)) save.loadout.tool = lo.tool as ToolId;
  if (SHIP_TYPES.includes(lo.destination as ShipType) && canBoard(save, lo.destination as ShipType)) {
    save.loadout.destination = lo.destination as ShipType;
  }
  if (isObj(lo.looks)) {
    for (const c of Object.keys(COSMETICS) as CharacterId[]) {
      const look = lo.looks[c];
      if (!isObj(look)) continue;
      for (const slot of ['body', 'accent'] as const) {
        const id = look[slot];
        if (typeof id === 'string' && owns(save, { kind: 'cosmetic', character: c, slot, id })) {
          save.loadout.looks[c][slot] = id;
        }
      }
    }
  }

  const st = isObj(raw.stats) ? raw.stats : {};
  save.stats = {
    runs: num(st.runs),
    extractions: num(st.extractions),
    bestHaul: num(st.bestHaul),
    totalBanked: num(st.totalBanked),
    dronesDestroyed: num(st.dronesDestroyed),
  };
  return save;
}

const CODE_PREFIX = 'DRL1';

/** Portable save code for moving progress between devices. */
export function exportSave(save: SaveData): string {
  const body = btoa(JSON.stringify(save)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${CODE_PREFIX}.${body}.${hashString(body).toString(36)}`;
}

export function importSave(code: string): SaveData | null {
  const parts = code.trim().split('.');
  if (parts.length !== 3 || parts[0] !== CODE_PREFIX) return null;
  const [, body, check] = parts;
  if (hashString(body).toString(36) !== check) return null;
  try {
    const b64 = body.replace(/-/g, '+').replace(/_/g, '/');
    return sanitizeSave(JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))));
  } catch {
    return null;
  }
}
