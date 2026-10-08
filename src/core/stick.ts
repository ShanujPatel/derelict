export interface StickState {
  /** Normalised direction scaled by magnitude, each axis in [-1, 1]. */
  x: number;
  y: number;
  /** 0 inside the dead zone, up to 1 at the stick's edge. */
  magnitude: number;
  /** Radians; 0 when the stick is centred. */
  angle: number;
}

export const CENTRED: StickState = { x: 0, y: 0, magnitude: 0, angle: 0 };

/**
 * Converts a thumb position relative to where it first touched into a
 * virtual-stick reading. The dead zone is rescaled so movement starts at 0.
 */
export function readStick(
  originX: number,
  originY: number,
  touchX: number,
  touchY: number,
  radius: number,
  deadZone = 0.2,
): StickState {
  const dx = touchX - originX;
  const dy = touchY - originY;
  const raw = Math.min(1, Math.hypot(dx, dy) / radius);
  if (raw <= deadZone) return CENTRED;
  const magnitude = (raw - deadZone) / (1 - deadZone);
  const angle = Math.atan2(dy, dx);
  return { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude, magnitude, angle };
}

/** Clamps the knob's drawn position to the stick's ring. */
export function clampKnob(
  originX: number,
  originY: number,
  touchX: number,
  touchY: number,
  radius: number,
): { x: number; y: number } {
  const dx = touchX - originX;
  const dy = touchY - originY;
  const len = Math.hypot(dx, dy);
  if (len <= radius) return { x: touchX, y: touchY };
  return { x: originX + (dx / len) * radius, y: originY + (dy / len) * radius };
}
