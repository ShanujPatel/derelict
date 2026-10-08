import { describe, expect, it } from 'vitest';
import { clampKnob, readStick } from '../src/core/stick';
import { computeGameSize } from '../src/core/viewport';

describe('readStick', () => {
  it('is centred inside the dead zone', () => {
    expect(readStick(100, 100, 104, 100, 30).magnitude).toBe(0);
  });

  it('reaches full magnitude at the edge and beyond', () => {
    expect(readStick(100, 100, 130, 100, 30).magnitude).toBeCloseTo(1);
    expect(readStick(100, 100, 200, 100, 30).magnitude).toBeCloseTo(1);
  });

  it('points the right way', () => {
    const up = readStick(100, 100, 100, 70, 30);
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(-1);
    expect(up.angle).toBeCloseTo(-Math.PI / 2);
  });

  it('rescales past the dead zone so movement starts from zero', () => {
    const justOut = readStick(100, 100, 107, 100, 30, 0.2);
    expect(justOut.magnitude).toBeGreaterThan(0);
    expect(justOut.magnitude).toBeLessThan(0.1);
  });
});

describe('clampKnob', () => {
  it('keeps the knob inside the ring', () => {
    expect(clampKnob(0, 0, 100, 0, 30)).toEqual({ x: 30, y: 0 });
    expect(clampKnob(0, 0, 10, 5, 30)).toEqual({ x: 10, y: 5 });
  });
});

describe('computeGameSize', () => {
  it('keeps the classic 480x270 view on a 1080p monitor', () => {
    expect(computeGameSize(1920, 1080)).toMatchObject({ width: 480, height: 270, zoom: 4 });
  });

  it('fills a portrait phone with the short side at 270', () => {
    const s = computeGameSize(390, 844);
    expect(s.width).toBe(270);
    expect(s.height).toBe(584);
  });

  it('fills a landscape phone', () => {
    const s = computeGameSize(844, 390);
    expect(s.height).toBe(270);
    expect(s.width).toBe(584);
  });

  it('caps extreme aspect ratios', () => {
    expect(computeGameSize(5000, 300).width).toBe(810);
  });

  it('survives a zero-sized window', () => {
    const s = computeGameSize(0, 0);
    expect(s.width).toBeGreaterThan(0);
    expect(s.height).toBeGreaterThan(0);
  });
});
