import { describe, expect, it } from 'vitest';
import { GHOST, GhostRecorder, decodeGhost, encodeGhost, ghostAt, ghostDuration } from '../src/core/ghost';
import SQL from '../docs/supabase.sql?raw';

describe('ghost replays', () => {
  it('round-trip a path', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: 400 + i * 3, y: 900 - i * 2 }));
    const g = decodeGhost(encodeGhost(pts, 100))!;
    expect(g.intervalMs).toBe(100);
    expect(g.points).toEqual(pts);
  });

  it('clamps huge steps without drifting', () => {
    const g = decodeGhost(encodeGhost([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 10 }, { x: 300, y: 10 }, { x: 300, y: 10 }]))!;
    expect(g.points[1].x).toBe(127);
    // It catches up afterwards.
    expect(g.points[3]).toEqual({ x: 300, y: 10 });
  });

  it('fits ten minutes under the database limit, in the format it accepts', () => {
    const pts = Array.from({ length: GHOST.maxPoints + 500 }, (_, i) => ({ x: 500 + Math.sin(i / 9) * 300, y: 500 + Math.cos(i / 7) * 300 }));
    const text = encodeGhost(pts);
    expect(text.length).toBeLessThanOrEqual(GHOST.maxLength);
    expect(text).toMatch(/^G1\.[0-9]+\.[A-Za-z0-9_-]+$/);
    expect(SQL).toContain(String(GHOST.maxLength));
    expect(decodeGhost(text)!.points).toHaveLength(GHOST.maxPoints);
  });

  it('interpolates between samples and ends', () => {
    const g = decodeGhost(encodeGhost([{ x: 0, y: 0 }, { x: 10, y: 20 }, { x: 20, y: 20 }], 100))!;
    expect(ghostAt(g, 50)).toEqual({ x: 5, y: 10 });
    expect(ghostAt(g, 150)).toEqual({ x: 15, y: 20 });
    expect(ghostAt(g, 250)).toBeNull();
    expect(ghostDuration(g)).toBe(200);
  });

  it('rejects junk', () => {
    for (const bad of ['', 'nope', 'G1.100.***', 'G2.100.AAAA', 'G1.0.AAAAAA', 'G1.100.AA']) expect(decodeGhost(bad)).toBeNull();
  });

  it('records at a steady rate whatever the frame times', () => {
    const r = new GhostRecorder(100);
    for (const t of [0, 16, 33, 250, 260, 400]) r.sample(t, t / 10, 0);
    // Samples at 0, 100 (late frame at 250 fills 100 and 200), 300 (frame 400) and 400.
    expect(r.length).toBe(5);
    expect(decodeGhost(r.encode())!.points.map((p) => p.x)).toEqual([0, 25, 25, 40, 40]);
  });
});
