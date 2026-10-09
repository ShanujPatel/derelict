import { describe, expect, it } from 'vitest';
import { bfsDistances } from '../src/core/pathing';
import { completeTraining, defaultSave, sanitizeSave, skipTraining } from '../src/core/progression';
import { resolveSeed, seedQuery } from '../src/core/seed';
import { TRAINING_REWARD, TRAINING_STEPS, generateTraining, trainingText } from '../src/core/training';
import { Tile } from '../src/core/types';

describe('training run', () => {
  const t = generateTraining();
  const reach = (tiles: Tile[][]) => bfsDistances(tiles, t.start);

  it('has nine steps with text for every control scheme', () => {
    expect(TRAINING_STEPS.map((s) => s.id)).toEqual(['move', 'salvage', 'supplies', 'shoot', 'roll', 'torch', 'drum', 'scanner', 'extract']);
    for (const s of TRAINING_STEPS) for (const scheme of ['keyboard', 'touch', 'pad'] as const) expect(trainingText(s, scheme).length).toBeGreaterThan(20);
    expect(trainingText(TRAINING_STEPS[0], 'touch')).toMatch(/thumb/);
  });

  it('keeps each room sealed until its step opens the door', () => {
    const d = reach(t.tiles);
    // Only the first room is reachable at the start.
    expect(d[t.marker.y][t.marker.x]).toBeGreaterThanOrEqual(0);
    expect(d[t.extraction.y][t.extraction.x]).toBe(-1);
    for (const tiles of Object.values(t.gates)) for (const p of tiles!) expect(t.tiles[p.y][p.x]).toBe(Tile.Wall);
    for (const p of t.weakWalls) expect(t.tiles[p.y][p.x]).toBe(Tile.WeakWall);
  });

  it('can be finished: opening every door and cutting the wall reaches the exit', () => {
    const open = t.tiles.map((row) => [...row]);
    for (const tiles of Object.values(t.gates)) for (const p of tiles!) open[p.y][p.x] = Tile.Floor;
    expect(reach(open)[t.extraction.y][t.extraction.x]).toBe(-1); // the cracked wall still blocks
    for (const p of t.weakWalls) open[p.y][p.x] = Tile.Floor;
    const d = reach(open);
    expect(d[t.extraction.y][t.extraction.x]).toBeGreaterThan(0);
    // Everything the steps need sits on reachable floor.
    for (const s of t.spawns) expect(d[s.y][s.x], s.kind).toBeGreaterThanOrEqual(0);
    for (const ps of Object.values(t.drones)) for (const p of ps!) expect(d[p.y][p.x]).toBeGreaterThanOrEqual(0);
  });

  it('puts an always-live floor across the roll room, short enough to roll over', () => {
    const h = t.hazards![0];
    expect(h.alwaysOn).toBe(true);
    const room = t.rooms[4];
    expect(h.y).toBe(room.y);
    expect(h.h).toBe(room.h);
    expect(h.w * 16).toBeLessThan(51); // a roll covers about 51 px
    expect(t.rollLine).toBeGreaterThan(h.x + h.w - 1);
  });

  it('places the drum next to the drones it should blow up', () => {
    const drum = t.spawns.find((s) => s.kind === 'drum')!;
    for (const p of t.drones.drum!) expect(Math.hypot((p.x - drum.x) * 16, (p.y - drum.y) * 16)).toBeLessThan(36);
  });

  it('starts from ?tutorial', () => {
    const r = resolveSeed('?tutorial');
    expect(r).toMatchObject({ mode: 'tutorial', ship: 'freighter' });
    expect(seedQuery(r)).toBe('?tutorial');
  });

  it('pays its reward once, and remembers being skipped', () => {
    const s = defaultSave();
    expect(s.tutorial).toBe('new');
    const first = completeTraining(s, TRAINING_REWARD);
    expect(first.paid).toBe(true);
    expect(first.save.credits).toBe(s.credits + TRAINING_REWARD);
    expect(completeTraining(first.save, TRAINING_REWARD).paid).toBe(false);
    expect(skipTraining(s).tutorial).toBe('skipped');
    expect(skipTraining(first.save).tutorial).toBe('done');
    // Older saves: experienced players aren't asked; new ones are.
    expect(sanitizeSave({ stats: { runs: 12 } }).tutorial).toBe('skipped');
    expect(sanitizeSave({ stats: { runs: 1 } }).tutorial).toBe('new');
    expect(sanitizeSave({ tutorial: 'done', stats: { runs: 0 } }).tutorial).toBe('done');
  });
});
