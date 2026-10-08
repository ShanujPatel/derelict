import { defaultSave, sanitizeSave, type SaveData } from './core/progression';

// localStorage can be missing or throw (private mode, blocked storage), so every access is guarded.
const SAVE_KEY = 'derelict.save.v1';
const LEGACY_BEST_KEY = 'derelict.bestSalvage';

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return sanitizeSave(JSON.parse(raw));
    // Carry over the v0.1 best score.
    const save = defaultSave();
    save.stats.bestHaul = Number(localStorage.getItem(LEGACY_BEST_KEY)) || 0;
    return save;
  } catch {
    return defaultSave();
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
