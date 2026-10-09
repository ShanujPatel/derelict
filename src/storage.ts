import { randomCallsign } from './core/leaderboard';
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

/** Gives a save an anonymous leaderboard id and a default callsign the first time. */
function withIdentity(save: SaveData): SaveData {
  if (save.playerId && save.callsign) return save;
  const next = { ...save, playerId: save.playerId || newPlayerId(), callsign: save.callsign || randomCallsign() };
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
