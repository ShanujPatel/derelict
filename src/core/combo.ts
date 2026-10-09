/**
 * Salvage combos: grab pickups in quick succession to build a multiplier on
 * the salvage they're worth. Pure rules, tested.
 */
export const COMBO = {
  /** Time allowed between pickups to keep the chain going. */
  windowMs: 4000,
  /** Extra value per link after the first. */
  step: 0.1,
  max: 1.5,
} as const;

export interface ComboState {
  count: number;
  lastAt: number;
}

export const NO_COMBO: ComboState = { count: 0, lastAt: -Infinity };

export function comboAfterPickup(state: ComboState, now: number): ComboState {
  const alive = now - state.lastAt <= COMBO.windowMs;
  return { count: alive ? state.count + 1 : 1, lastAt: now };
}

/** Multiplier for a chain of `count` pickups: 1.0, 1.1, 1.2 ... capped. */
export function comboMultiplier(count: number): number {
  if (count <= 1) return 1;
  return Math.min(COMBO.max, Math.round((1 + COMBO.step * (count - 1)) * 100) / 100);
}

/** 1 → 0 as the chain's window runs out. */
export function comboTimeLeft(state: ComboState, now: number): number {
  return Math.max(0, 1 - (now - state.lastAt) / COMBO.windowMs);
}
