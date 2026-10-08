// localStorage can be missing or throw (private mode, blocked storage), so every access is guarded.
const BEST_KEY = 'derelict.bestSalvage';

export function loadBestSalvage(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function saveBestSalvage(value: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    /* ignore */
  }
}
