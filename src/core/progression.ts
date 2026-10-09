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
import { CHAPTERS, CODEX, chapterProgress, isMiningUnlocked, isResearchUnlocked } from './codex';
import { ACHIEVEMENT_IDS, type Achievement } from './achievements';
import { TIP_IDS, type TipId } from './tips';
import { BOSSES, BOSS_IDS, BOSS_UNLOCK_EXTRACTIONS, emptyBossRecords, type BossId, type BossRecord } from './bosses';
import { SHIP_TYPES, type ShipType } from './types';
import { cleanCallsign } from './leaderboard';
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
  /** Achievement ids earned (each pays once). */
  achievements: string[];
  /** Boss contract results. */
  bosses: Record<BossId, BossRecord>;
  /** First-time tips already shown. */
  tips: string[];
  /** Anonymous id for the leaderboard; set by storage on first load. */
  playerId: string;
  /** Your name, shown on the leaderboard. */
  callsign: string;
  /** The name the leaderboard last confirmed is yours; differs from callsign until checked. */
  callsignClaimed: string;
  /** Best extracted score on today's Daily Derelict. */
  daily: { day: string; best: number };
  /** Best extracted score on this week's challenge. */
  weekly: { week: string; best: number };
  /** Your clan's tag and name as last seen online (shown offline, and on the results screen). */
  clan: { tag: string; name: string } | null;
  /** The week whose clan-goal bonus you've already been paid. */
  clanGoalWeek: string;
  /** Training run: not played yet, finished (reward paid), or waved off from the hub. */
  tutorial: 'new' | 'done' | 'skipped';
  /** Consecutive days with a Daily Derelict extraction. */
  streak: { lastDay: string; count: number; best: number };
  settings: Settings;
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
    /** Lifetime counters added in v0.8. */
    dodges: number;
    drumsDetonated: number;
    elitesKilled: number;
    timeAboardMs: number;
    /** Personal bests added in v0.8. */
    deepestDive: number;
    bestCombo: number;
    bountiesClaimed: number;
  };
  /** The most recent runs, newest first (at most HISTORY_LIMIT). */
  history: RunRecord[];
}

export const HISTORY_LIMIT = 10;

export interface RunRecord {
  /** ISO time the run ended. */
  at: string;
  ship: ShipType;
  mode: 'daily' | 'weekly' | 'custom' | 'random' | 'boss';
  seed: string;
  character: CharacterId;
  extracted: boolean;
  salvage: number;
  kills: number;
  durationMs: number;
  boss?: BossId;
  /** Ended by abandoning from the pause menu. */
  abandoned?: boolean;
}

export interface Settings {
  /** Volumes, 0–1. */
  master: number;
  music: number;
  sfx: number;
  screenShake: boolean;
  /** Full-screen colour flashes when hurt. */
  flashes: boolean;
  /** Small always-on map in the corner. */
  minimap: boolean;
  /** Assist mode: more oxygen, half damage; daily runs aren't posted to the board. */
  assist: boolean;
  /** First-time tips during runs. */
  tips: boolean;
  /** Daily runs: race the ghost of the day's best run. */
  ghost: boolean;
}

export const ASSIST = { capacity: 1.5, damage: 0.5 } as const;

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  music: 0.6,
  sfx: 0.8,
  screenShake: true,
  flashes: true,
  minimap: false,
  assist: false,
  tips: true,
  ghost: true,
};

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
    achievements: [],
    bosses: emptyBossRecords(),
    tips: [],
    playerId: '',
    callsign: '',
    callsignClaimed: '',
    daily: { day: '', best: 0 },
    weekly: { week: '', best: 0 },
    clan: null,
    clanGoalWeek: '',
    tutorial: 'new',
    streak: { lastDay: '', count: 0, best: 0 },
    settings: { ...DEFAULT_SETTINGS },
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
    stats: {
      runs: 0,
      extractions: 0,
      bestHaul: 0,
      totalBanked: 0,
      dronesDestroyed: 0,
      dodges: 0,
      drumsDetonated: 0,
      elitesKilled: 0,
      timeAboardMs: 0,
      deepestDive: 0,
      bestCombo: 0,
      bountiesClaimed: 0,
    },
    history: [],
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
    case 'cosmetic': {
      const option = findCosmetic(item.character, item.slot, item.id);
      if (option.trophy) return save.achievements.includes(option.trophy.achievement);
      return option.cost === 0 || save.cosmetics.includes(cosmeticKey(item.character, item.slot, item.id));
    }
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
      // Trophies aren't for sale.
      return option && !option.trophy ? option.cost : null;
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

/**
 * Research vessels can only be chosen once their coordinates have been found
 * in the codex; mining haulers with the ledger log or after a few extractions.
 */
export function canBoard(save: SaveData, ship: ShipType): boolean {
  if (ship === 'research') return isResearchUnlocked(save.codex);
  if (ship === 'mining') return isMiningUnlocked(save.codex, save.stats.extractions);
  return true;
}

export function setDestination(save: SaveData, ship: ShipType): SaveData {
  if (!canBoard(save, ship)) return save;
  const next = clone(save);
  next.loadout.destination = ship;
  return next;
}

/** Sets the leaderboard callsign; returns the same save if the name isn't allowed. */
export function setCallsign(save: SaveData, raw: string): SaveData {
  const callsign = cleanCallsign(raw);
  if (!callsign) return save;
  return { ...clone(save), callsign };
}

/** Records that the leaderboard has confirmed this name belongs to you. */
export function setClaimedName(save: SaveData, name: string): SaveData {
  return { ...clone(save), callsign: name, callsignClaimed: name };
}

export function updateSettings(save: SaveData, patch: Partial<Settings>): SaveData {
  return { ...clone(save), settings: sanitizeSettings({ ...save.settings, ...patch }) };
}

export function sanitizeSettings(raw: unknown): Settings {
  const r = isObj(raw) ? raw : {};
  const vol = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
  const flag = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
  return {
    master: vol(r.master, DEFAULT_SETTINGS.master),
    music: vol(r.music, DEFAULT_SETTINGS.music),
    sfx: vol(r.sfx, DEFAULT_SETTINGS.sfx),
    screenShake: flag(r.screenShake, DEFAULT_SETTINGS.screenShake),
    flashes: flag(r.flashes, DEFAULT_SETTINGS.flashes),
    minimap: flag(r.minimap, DEFAULT_SETTINGS.minimap),
    assist: flag(r.assist, DEFAULT_SETTINGS.assist),
    tips: flag(r.tips, DEFAULT_SETTINGS.tips),
    ghost: flag(r.ghost, DEFAULT_SETTINGS.ghost),
  };
}

/** Keeps the best extracted score for the given day. */
export function recordDaily(save: SaveData, day: string, score: number): SaveData {
  const next = clone(save);
  next.daily = next.daily.day === day ? { day, best: Math.max(next.daily.best, score) } : { day, best: score };
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
  dodges?: number;
  drumsDetonated?: number;
  elitesKilled?: number;
  durationMs?: number;
  /** Deck reached (deep dives count when you extract). */
  depth?: number;
  bestCombo?: number;
  bounties?: number;
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
  next.stats.dodges += Math.max(0, result.dodges ?? 0);
  next.stats.drumsDetonated += Math.max(0, result.drumsDetonated ?? 0);
  next.stats.elitesKilled += Math.max(0, result.elitesKilled ?? 0);
  next.stats.timeAboardMs += Math.max(0, Math.round(result.durationMs ?? 0));
  next.stats.bestCombo = Math.max(next.stats.bestCombo, result.bestCombo ?? 0);
  next.stats.bountiesClaimed += Math.max(0, result.bounties ?? 0);
  if (result.extracted) next.stats.deepestDive = Math.max(next.stats.deepestDive, result.depth ?? 1);
  if (result.extracted) {
    next.stats.extractions += 1;
    next.stats.totalBanked += banked;
    next.stats.bestHaul = Math.max(next.stats.bestHaul, banked);
  }
  return next;
}

/** Boss contracts open after a few extractions; the Bloom Mother also needs research vessels unlocked. */
export function bossUnlocked(save: SaveData, id: BossId): boolean {
  if (save.stats.extractions < BOSS_UNLOCK_EXTRACTIONS) return false;
  return canBoard(save, BOSSES[id].ship);
}

/** Records a boss kill: pays the first-kill bonus once and keeps the best time. */
export function recordBossKill(save: SaveData, id: BossId, durationMs: number): { save: SaveData; firstKill: boolean } {
  const next = clone(save);
  const rec = next.bosses[id];
  const firstKill = rec.kills === 0;
  rec.kills += 1;
  const ms = Math.max(1, Math.round(durationMs));
  rec.bestMs = rec.bestMs ? Math.min(rec.bestMs, ms) : ms;
  if (firstKill) next.credits += BOSSES[id].firstKillReward;
  return { save: next, firstKill };
}

export const STREAK = { bonusPerDay: 10, maxBonus: 70 } as const;

const dayBefore = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Counts a Daily Derelict extraction towards your streak. Only the first one
 * each day counts; it pays a bonus that grows with the streak.
 */
export function recordStreak(save: SaveData, day: string): { save: SaveData; bonus: number; counted: boolean } {
  if (save.streak.lastDay === day) return { save, bonus: 0, counted: false };
  const next = clone(save);
  const count = save.streak.lastDay === dayBefore(day) ? save.streak.count + 1 : 1;
  const bonus = Math.min(STREAK.maxBonus, count * STREAK.bonusPerDay);
  next.streak = { lastDay: day, count, best: Math.max(save.streak.best, count) };
  next.credits += bonus;
  return { save: next, bonus, counted: true };
}

/** The streak as it stands today: it's broken if you missed yesterday. */
export function liveStreak(save: SaveData, today: string): number {
  const { lastDay, count } = save.streak;
  return lastDay === today || lastDay === dayBefore(today) ? count : 0;
}

/** Keeps the best extracted score for a weekly challenge; a new week starts fresh. */
export function recordWeekly(save: SaveData, week: string, score: number): SaveData {
  const next = clone(save);
  next.weekly = next.weekly.week === week ? { week, best: Math.max(next.weekly.best, score) } : { week, best: score };
  return next;
}

export function markTipSeen(save: SaveData, id: TipId): SaveData {
  if (save.tips.includes(id)) return save;
  return { ...clone(save), tips: [...save.tips, id] };
}

export function resetTips(save: SaveData): SaveData {
  return { ...clone(save), tips: [] };
}

/** Adds a finished run to the front of the history, keeping the last few. */
export function recordRun(save: SaveData, record: RunRecord): SaveData {
  const next = clone(save);
  next.history = [record, ...next.history].slice(0, HISTORY_LIMIT);
  return next;
}

function sanitizeRecord(v: unknown): RunRecord | null {
  if (!isObj(v)) return null;
  const ship = SHIP_TYPES.includes(v.ship as ShipType) ? (v.ship as ShipType) : null;
  const mode = ['daily', 'weekly', 'custom', 'random', 'boss'].includes(v.mode as string) ? (v.mode as RunRecord['mode']) : null;
  const character = (Object.keys(CHARACTERS) as CharacterId[]).includes(v.character as CharacterId) ? (v.character as CharacterId) : null;
  if (!ship || !mode || !character || typeof v.at !== 'string' || Number.isNaN(Date.parse(v.at))) return null;
  const rec: RunRecord = {
    at: v.at,
    ship,
    mode,
    seed: typeof v.seed === 'string' ? v.seed.slice(0, 32) : '',
    character,
    extracted: v.extracted === true,
    salvage: num(v.salvage),
    kills: num(v.kills),
    durationMs: num(v.durationMs),
  };
  if (BOSS_IDS.includes(v.boss as BossId)) rec.boss = v.boss as BossId;
  if (v.abandoned === true) rec.abandoned = true;
  return rec;
}

/** Records newly earned achievements and pays their salvage rewards. */
export function awardAchievements(save: SaveData, earned: readonly Achievement[]): SaveData {
  const fresh = earned.filter((a) => !save.achievements.includes(a.id));
  if (!fresh.length) return save;
  const next = clone(save);
  for (const a of fresh) {
    next.achievements.push(a.id);
    next.credits += a.reward;
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
  const achievements = pickIds(raw.achievements, ACHIEVEMENT_IDS, []);
  const tips = pickIds(raw.tips, TIP_IDS, []);

  const up = isObj(raw.upgrades) ? raw.upgrades : {};
  const upgrades = {} as Record<StatId, number>;
  for (const id of Object.keys(STATS) as StatId[]) {
    upgrades[id] = Math.min(num(up[id]), STATS[id].costs.length);
  }

  const dailyRaw = isObj(raw.daily) ? raw.daily : {};
  const save: SaveData = {
    ...d,
    playerId: typeof raw.playerId === 'string' && /^[0-9a-f-]{36}$/i.test(raw.playerId) ? raw.playerId : '',
    callsign: typeof raw.callsign === 'string' ? (cleanCallsign(raw.callsign) ?? '') : '',
    callsignClaimed: typeof raw.callsignClaimed === 'string' ? (cleanCallsign(raw.callsignClaimed) ?? '') : '',
    daily:
      typeof dailyRaw.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dailyRaw.day)
        ? { day: dailyRaw.day, best: num(dailyRaw.best) }
        : { day: '', best: 0 },
    streak:
      isObj(raw.streak) && typeof raw.streak.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.streak.lastDay)
        ? { lastDay: raw.streak.lastDay, count: num(raw.streak.count), best: num(raw.streak.best) }
        : { lastDay: '', count: 0, best: 0 },
    weekly:
      isObj(raw.weekly) && typeof raw.weekly.week === 'string' && /^\d{4}-W\d{2}$/.test(raw.weekly.week)
        ? { week: raw.weekly.week, best: num(raw.weekly.best) }
        : { week: '', best: 0 },
    clan:
      isObj(raw.clan) && typeof raw.clan.tag === 'string' && /^[A-Z0-9]{2,4}$/.test(raw.clan.tag) && typeof raw.clan.name === 'string'
        ? { tag: raw.clan.tag, name: raw.clan.name.slice(0, 20) }
        : null,
    clanGoalWeek: typeof raw.clanGoalWeek === 'string' && /^\d{4}-W\d{2}$/.test(raw.clanGoalWeek) ? raw.clanGoalWeek : '',
    // Saves from before training existed: experienced players aren't nagged with it.
    tutorial:
      raw.tutorial === 'done' || raw.tutorial === 'skipped' || raw.tutorial === 'new'
        ? raw.tutorial
        : isObj(raw.stats) && num(raw.stats.runs) >= 3
          ? 'skipped'
          : 'new',
    settings: sanitizeSettings(raw.settings),
    credits: num(raw.credits),
    characters,
    weapons,
    perks,
    tools,
    codex,
    rewards,
    achievements,
    tips,
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

  const bossRaw = isObj(raw.bosses) ? raw.bosses : {};
  for (const id of BOSS_IDS) {
    const r = isObj(bossRaw[id]) ? (bossRaw[id] as Record<string, unknown>) : {};
    save.bosses[id] = { kills: num(r.kills), bestMs: num(r.bestMs) };
  }

  const st = isObj(raw.stats) ? raw.stats : {};
  save.stats = {
    runs: num(st.runs),
    extractions: num(st.extractions),
    bestHaul: num(st.bestHaul),
    totalBanked: num(st.totalBanked),
    dronesDestroyed: num(st.dronesDestroyed),
    dodges: num(st.dodges),
    drumsDetonated: num(st.drumsDetonated),
    elitesKilled: num(st.elitesKilled),
    timeAboardMs: num(st.timeAboardMs),
    deepestDive: num(st.deepestDive),
    bestCombo: num(st.bestCombo),
    bountiesClaimed: num(st.bountiesClaimed),
  };
  // After stats: mining haulers can be unlocked by extractions.
  if (SHIP_TYPES.includes(lo.destination as ShipType) && canBoard(save, lo.destination as ShipType)) {
    save.loadout.destination = lo.destination as ShipType;
  }
  save.history = Array.isArray(raw.history)
    ? raw.history.map(sanitizeRecord).filter((r): r is RunRecord => r !== null).slice(0, HISTORY_LIMIT)
    : [];
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

/** Remembers your clan (or that you have none) as the server last reported it. */
export function setClanCache(save: SaveData, clan: { tag: string; name: string } | null): SaveData {
  const same = (save.clan?.tag ?? null) === (clan?.tag ?? null) && (save.clan?.name ?? null) === (clan?.name ?? null);
  return same ? save : { ...clone(save), clan: clan ? { tag: clan.tag, name: clan.name } : null };
}

/** Pays the weekly clan-goal bonus once per week. */
export function claimClanGoal(save: SaveData, week: string, bonus: number): { save: SaveData; paid: boolean } {
  if (!week || save.clanGoalWeek === week) return { save, paid: false };
  const next = clone(save);
  next.clanGoalWeek = week;
  next.credits += bonus;
  return { save: next, paid: true };
}

/** Finishing training: pays the reward the first time only. */
export function completeTraining(save: SaveData, reward: number): { save: SaveData; paid: boolean } {
  if (save.tutorial === 'done') return { save, paid: false };
  const next = clone(save);
  next.tutorial = 'done';
  next.credits += reward;
  return { save: next, paid: true };
}

export function skipTraining(save: SaveData): SaveData {
  return save.tutorial === 'new' ? { ...clone(save), tutorial: 'skipped' } : save;
}
