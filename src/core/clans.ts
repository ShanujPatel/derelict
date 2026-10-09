/**
 * Clans: players team up and every member's banked salvage (while they're a
 * member) counts towards the clan, per week and all time. The database
 * (docs/supabase.sql) enforces all of this; these are the same rules for the UI.
 */
export const CLAN = {
  maxMembers: 15,
  /** Weekly goal: this much salvage per member, but never less than the minimum. */
  goalPerMember: 2500,
  goalMinimum: 5000,
  /** Paid once a week to each member who sees the goal reached. */
  goalBonus: 100,
  /** Hours to wait after leaving a clan before joining another. */
  rejoinHours: 24,
} as const;

export const CLAN_NAME_PATTERN = /^[A-Za-z0-9 _'-]{3,20}$/;
export const CLAN_TAG_PATTERN = /^[A-Z0-9]{2,4}$/;

// Same light filter as the database (clan_name_blocked).
const BLOCKED = ['fuck', 'shit', 'cunt', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'kkk', 'whore', 'slut', 'bitch', 'dick', 'cock', 'porn', 'retard'];

export function clanNameBlocked(text: string): boolean {
  const letters = text.toLowerCase().replace(/[^a-z]/g, '');
  return BLOCKED.some((w) => letters.includes(w));
}

/** Tidies a typed clan name; null with a reason if it isn't allowed. */
export function checkClanName(raw: string): { ok: true; value: string } | { ok: false; reason: string } {
  const value = raw.replace(/\s+/g, ' ').trim();
  if (!CLAN_NAME_PATTERN.test(value)) return { ok: false, reason: "Clan name: 3–20 letters, numbers, spaces, _ - or '" };
  if (clanNameBlocked(value)) return { ok: false, reason: 'Pick a different clan name' };
  return { ok: true, value };
}

export function checkClanTag(raw: string): { ok: true; value: string } | { ok: false; reason: string } {
  const value = raw.trim().toUpperCase();
  if (!CLAN_TAG_PATTERN.test(value)) return { ok: false, reason: 'Tag: 2–4 letters or numbers' };
  if (clanNameBlocked(value)) return { ok: false, reason: 'Pick a different tag' };
  return { ok: true, value };
}

/** This week's clan goal for a clan of this size. */
export function clanGoal(members: number): number {
  return Math.max(CLAN.goalMinimum, CLAN.goalPerMember * Math.max(1, members));
}

/** "[RUST] NOVA" when there's a tag. */
export const withTag = (callsign: string, tag?: string | null) => (tag ? `[${tag}] ${callsign}` : callsign);

export interface ClanMember {
  callsign: string;
  leader: boolean;
  you: boolean;
  weekSalvage: number;
  allSalvage: number;
  runs: number;
}

export interface MyClan {
  id: number;
  name: string;
  tag: string;
  open: boolean;
  inviteCode: string;
  isLeader: boolean;
  week: string;
  weekSalvage: number;
  allSalvage: number;
  weekRank: number | null;
  lastWeek: string;
  lastWeekRank: number | null;
  members: ClanMember[];
}

export interface ClanBoardRow {
  rank: number;
  id: number;
  name: string;
  tag: string;
  members: number;
  open: boolean;
  salvage: number;
  runs: number;
  bosses: number;
  isYours: boolean;
}

export interface OpenClan {
  id: number;
  name: string;
  tag: string;
  members: number;
  weekSalvage: number;
}

/** What a finished run added to your clan (from submit_run). */
export interface ClanRunSummary {
  tag: string;
  name: string;
  added: number;
  weekSalvage: number;
  weekRank: number | null;
}

/** Turns get_my_clan's JSON into a MyClan (numbers can arrive as strings). */
export function parseMyClan(raw: unknown): MyClan | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  // Anything without a clan tag isn't a clan (e.g. an empty reply).
  if (typeof r.tag !== 'string' || !r.tag) return null;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const members = Array.isArray(r.members) ? (r.members as Record<string, unknown>[]) : [];
  return {
    id: Number(r.id),
    name: String(r.name),
    tag: String(r.tag),
    open: r.open === true,
    inviteCode: String(r.inviteCode ?? ''),
    isLeader: r.isLeader === true,
    week: String(r.week ?? ''),
    weekSalvage: Number(r.weekSalvage ?? 0),
    allSalvage: Number(r.allSalvage ?? 0),
    weekRank: num(r.weekRank),
    lastWeek: String(r.lastWeek ?? ''),
    lastWeekRank: num(r.lastWeekRank),
    members: members.map((m) => ({
      callsign: String(m.callsign),
      leader: m.leader === true,
      you: m.you === true,
      weekSalvage: Number(m.weekSalvage ?? 0),
      allSalvage: Number(m.allSalvage ?? 0),
      runs: Number(m.runs ?? 0),
    })),
  };
}
