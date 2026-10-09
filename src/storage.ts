import { isPlaceholderName, randomName } from './core/names';
import { defaultSave, sanitizeSave, type SaveData } from './core/progression';

// localStorage can be missing or throw (private mode, blocked storage), so every access is guarded.
const SAVE_KEY = 'derelict.save.v1';
const LEGACY_BEST_KEY = 'derelict.bestSalvage';

function newPlayerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback for very old browsers: RFC 4122 v4 shape from Math.random.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * Gives a save an anonymous leaderboard id and a random name the first time.
 * Old placeholder names ("SALVAGER-0421") are swapped for a proper one.
 */
function withIdentity(save: SaveData): SaveData {
  if (save.playerId && save.callsign && !isPlaceholderName(save.callsign)) return save;
  const callsign = save.callsign && !isPlaceholderName(save.callsign) ? save.callsign : randomName();
  const next = { ...save, playerId: save.playerId || newPlayerId(), callsign };
  storeSave(next);
  return next;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return withIdentity(sanitizeSave(JSON.parse(raw)));
    // Carry over the v0.1 best score.
    const save = defaultSave();
    save.stats.bestHaul = Number(localStorage.getItem(LEGACY_BEST_KEY)) || 0;
    return withIdentity(save);
  } catch {
    return withIdentity(defaultSave());
  }
}

export function storeSave(save: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* ignore: progress just won't persist */
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
    localStorage.removeItem(LEGACY_BEST_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- your own daily ghost

const GHOST_KEY = 'derelict.ghost.v1';

/** Your best daily run's path, kept locally so there's something to race offline. */
export interface StoredGhost {
  day: string;
  score: number;
  durationMs: number;
  ghost: string;
}

export function loadOwnGhost(day: string): StoredGhost | null {
  try {
    const raw = JSON.parse(localStorage.getItem(GHOST_KEY) ?? 'null') as StoredGhost | null;
    return raw && raw.day === day && typeof raw.ghost === 'string' ? raw : null;
  } catch {
    return null;
  }
}

/** Keeps the ghost if it's the best run of the day so far (more salvage, then faster). */
export function storeOwnGhost(g: StoredGhost): boolean {
  const old = loadOwnGhost(g.day);
  if (old && (old.score > g.score || (old.score === g.score && old.durationMs <= g.durationMs))) return false;
  try {
    localStorage.setItem(GHOST_KEY, JSON.stringify(g));
    return true;
  } catch {
    return false;
  }
}
