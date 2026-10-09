/**
 * Gamepad maths, kept pure for tests. Button numbers follow the browser's
 * "standard" mapping, which Xbox and PlayStation pads both report.
 */
export const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  BACK: 8,
  START: 9,
} as const;

export interface PadStick {
  x: number;
  y: number;
  /** 0–1 after the deadzone. */
  magnitude: number;
  angle: number;
}

export const STILL: PadStick = { x: 0, y: 0, magnitude: 0, angle: 0 };

/**
 * Radial deadzone: ignores small wobbles near the centre, then rescales so
 * the stick still reaches full speed at the edge.
 */
export function radialDeadzone(x: number, y: number, deadzone = 0.2): PadStick {
  const raw = Math.hypot(x, y);
  if (raw <= deadzone) return STILL;
  const magnitude = Math.min(1, (raw - deadzone) / (1 - deadzone));
  const angle = Math.atan2(y, x);
  return { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude, magnitude, angle };
}

/** Pull this far on the right trigger (or push the aim stick to the edge) to fire. */
export const TRIGGER_FIRE = 0.35;
export const STICK_FIRE = 0.85;
export const AIM_MIN = 0.25;
