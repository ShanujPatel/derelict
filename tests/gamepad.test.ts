import { describe, expect, it } from 'vitest';
import { STILL, radialDeadzone } from '../src/core/gamepad';

describe('gamepad deadzone', () => {
  it('ignores small wobbles', () => {
    expect(radialDeadzone(0.1, -0.1)).toBe(STILL);
  });

  it('rescales so the edge is still full speed', () => {
    const s = radialDeadzone(1, 0);
    expect(s.magnitude).toBeCloseTo(1);
    expect(s.x).toBeCloseTo(1);
    const half = radialDeadzone(0.6, 0);
    expect(half.magnitude).toBeCloseTo(0.5);
  });

  it('keeps the direction and caps diagonals at 1', () => {
    const d = radialDeadzone(1, 1);
    expect(d.magnitude).toBe(1);
    expect(d.angle).toBeCloseTo(Math.PI / 4);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
  });
});
