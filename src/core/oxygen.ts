/** Oxygen is the salvager's run timer. All functions return new state. */
export interface OxygenState {
  current: number;
  max: number;
  drainPerSecond: number;
}

export function createOxygen(max = 100, drainPerSecond = 0.8): OxygenState {
  return { current: max, max, drainPerSecond };
}

const clamp = (s: OxygenState, value: number): OxygenState => ({
  ...s,
  current: Math.max(0, Math.min(s.max, value)),
});

export function tickOxygen(s: OxygenState, seconds: number): OxygenState {
  return clamp(s, s.current - s.drainPerSecond * seconds);
}

export function refillOxygen(s: OxygenState, amount: number): OxygenState {
  return clamp(s, s.current + amount);
}

export function spendOxygen(s: OxygenState, amount: number): OxygenState {
  return clamp(s, s.current - amount);
}

export function isOxygenEmpty(s: OxygenState): boolean {
  return s.current <= 0;
}
