import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, newAchievements, type RunSummary } from '../src/core/achievements';
import { awardAchievements, defaultSave, exportSave, importSave, sanitizeSave } from '../src/core/progression';

const run = (patch: Partial<RunSummary> = {}): RunSummary => ({
  extracted: true,
  ship: 'freighter',
  daily: false,
  salvage: 120,
  kills: 4,
  durationMs: 200_000,
  damageTaken: 10,
  dodges: 2,
  blastKills: 0,
  explored: 0.5,
  eggsDestroyed: 0,
  rivalsKilled: 0,
  rivalsBoarded: 0,
  hacks: 0,
  elitesKilled: 0,
  ...patch,
});
const ids = (r: RunSummary, have: string[] = []) => newAchievements(r, have).map((a) => a.id);

describe('achievements', () => {
  it('have unique ids and positive rewards', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) expect(a.reward).toBeGreaterThan(0);
  });

  it('awards a first extraction once', () => {
    expect(ids(run())).toEqual(['first-extract']);
    expect(ids(run(), ['first-extract'])).toEqual([]);
    expect(ids(run({ extracted: false }))).toEqual([]);
  });

  it.each([
    ['ghost', { kills: 0 }],
    ['untouchable', { damageTaken: 0 }],
    ['demolitions', { blastKills: 3 }],
    ['cartographer', { explored: 0.92 }],
    ['in-and-out', { durationMs: 80_000, salvage: 60 }],
    ['heavy-hauler', { salvage: 300 }],
    ['cutters-cut', { rivalsBoarded: 3, rivalsKilled: 3 }],
    ['acrobat', { dodges: 15 }],
    ['weed-killer', { ship: 'research', eggsDestroyed: 3 }],
    ['systems-admin', { hacks: 3 }],
    ['big-game', { elitesKilled: 3 }],
    ['daily-driver', { daily: true }],
  ] as [string, Partial<RunSummary>][])('%s', (id, patch) => {
    expect(ids(run(patch), ['first-extract'])).toContain(id);
    expect(ids(run(), ['first-extract'])).not.toContain(id);
  });

  it("don't count a ghost run with no loot, or rivals that never boarded", () => {
    expect(ids(run({ kills: 0, salvage: 10 }))).not.toContain('ghost');
    expect(ids(run({ rivalsBoarded: 0, rivalsKilled: 0 }))).not.toContain('cutters-cut');
  });

  it('some can be earned without extracting', () => {
    expect(ids(run({ extracted: false, blastKills: 3 }))).toEqual(['demolitions']);
  });

  it('pay their reward once and survive save codes', () => {
    const earned = newAchievements(run({ kills: 0 }), []);
    const s = awardAchievements(defaultSave(), earned);
    expect(s.achievements).toEqual(['first-extract', 'ghost']);
    expect(s.credits).toBe(25 + 80);
    expect(awardAchievements(s, earned)).toBe(s);
    expect(importSave(exportSave(s))?.achievements).toEqual(['first-extract', 'ghost']);
    expect(sanitizeSave({ ...s, achievements: ['ghost', 'made-up'] }).achievements).toEqual(['ghost']);
  });
});
