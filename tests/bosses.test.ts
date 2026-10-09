import { describe, expect, it } from 'vitest';
import { DOOR, SECTIONS, generateArena, openDoor } from '../src/core/arena';
import {
  BOSSES,
  BOSS_IDS,
  FOREMAN,
  MOTHER,
  bossPhase,
  fanAngles,
  foremanDamage,
  motherDamage,
  motherHeal,
  ringAngles,
} from '../src/core/bosses';
import { bfsDistances } from '../src/core/pathing';
import { bossUnlocked, defaultSave, exportSave, importSave, recordBossKill, sanitizeSave } from '../src/core/progression';
import { Tile } from '../src/core/types';
import { resolveSeed, seedQuery } from '../src/core/seed';

const SEEDS = Array.from({ length: 40 }, (_, i) => `arena-${i}`);
const inRoom = (p: { x: number; y: number }, r: { x: number; y: number; w: number; h: number }) =>
  p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

describe('boss arenas', () => {
  it('are deterministic per seed and boss', () => {
    expect(generateArena('X', 'foreman')).toEqual(generateArena('X', 'foreman'));
  });

  it('use all the cover layouts across seeds', () => {
    expect(new Set(SEEDS.map((s) => generateArena(s, 'foreman').pattern)).size).toBe(3);
  });

  for (const boss of BOSS_IDS) {
    describe(boss, () => {
      it('seal the vault until the door opens, then everything is reachable', () => {
        for (const seed of SEEDS) {
          const a = generateArena(seed, boss);
          const sealed = bfsDistances(a.tiles, a.start);
          expect(sealed[a.extraction.y][a.extraction.x], 'vault sealed').toBe(-1);
          const arenaCentre = { x: SECTIONS.arena.x + 2, y: SECTIONS.arena.y + 10 };
          expect(sealed[arenaCentre.y][arenaCentre.x]).toBeGreaterThan(0);

          const open = a.tiles.map((r) => [...r]);
          openDoor(open);
          const dist = bfsDistances(open, a.start);
          open.forEach((row, y) =>
            row.forEach((t, x) => {
              if (t === Tile.Floor) expect(dist[y][x], `${seed} ${x},${y}`).toBeGreaterThanOrEqual(0);
            }),
          );
        }
      });

      it('put spawns and weak points on free floor in the right sections', () => {
        for (const seed of SEEDS) {
          const a = generateArena(seed, boss);
          const keys = [...a.spawns, ...a.features].map((p) => `${p.x},${p.y}`);
          expect(new Set(keys).size).toBe(keys.length);
          for (const p of [...a.spawns, ...a.features]) expect(a.tiles[p.y][p.x], `${p.x},${p.y}`).toBe(Tile.Floor);
          for (const f of a.features) expect(inRoom(f, SECTIONS.arena)).toBe(true);
          expect(inRoom(a.start, SECTIONS.staging)).toBe(true);
          expect(inRoom(a.extraction, SECTIONS.vault)).toBe(true);
          expect(a.spawns.filter((s) => s.kind === 'cache').every((c) => inRoom(c, SECTIONS.vault))).toBe(true);
          // The boss has room to stand.
          for (let dx = 0; dx < 2; dx++) expect(a.tiles[a.bossSpawn.y][a.bossSpawn.x + dx]).toBe(Tile.Floor);
        }
      });

      it('have the right weak points', () => {
        const a = generateArena('W', boss);
        if (boss === 'foreman') expect(a.features.filter((f) => f.kind === 'coupling')).toHaveLength(FOREMAN.couplings);
        else expect(a.features.filter((f) => f.kind === 'root')).toHaveLength(MOTHER.roots);
        expect(a.ship).toBe(BOSSES[boss].ship);
      });
    });
  }

  it('mirror the cover so neither side is easier', () => {
    const a = generateArena('M', 'foreman');
    const r = SECTIONS.arena;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) expect(a.tiles[y][x]).toBe(a.tiles[y][a.width - 1 - x]);
    }
    expect(DOOR).toHaveLength(2);
  });
});

describe('boss rules', () => {
  it('switch to phase 2 at half health', () => {
    expect(bossPhase(70, 70)).toBe(1);
    expect(bossPhase(36, 70)).toBe(1);
    expect(bossPhase(35, 70)).toBe(2);
  });

  it("only let the Foreman's armour through when stunned, stripped, or by the railgun", () => {
    expect(foremanDamage(3, { stunned: false, armourGone: false, pierce: false })).toBe(0);
    expect(foremanDamage(3, { stunned: true, armourGone: false, pierce: false })).toBe(3);
    expect(foremanDamage(3, { stunned: false, armourGone: true, pierce: false })).toBe(3);
    expect(foremanDamage(3, { stunned: false, armourGone: false, pierce: true })).toBe(2);
  });

  it("only hurt the Mother while her mouth is open, and roots heal her", () => {
    expect(motherDamage(2, { open: false })).toBe(0);
    expect(motherDamage(2, { open: true })).toBe(2);
    expect(motherHeal(50, 80, 3, 2)).toBeCloseTo(50 + 3 * MOTHER.healPerRoot * 2);
    expect(motherHeal(79, 80, 3, 10)).toBe(80);
    expect(motherHeal(50, 80, 0, 10)).toBe(50);
  });

  it('aim fans and rings correctly', () => {
    expect(fanAngles(1, 1, 1)).toEqual([1]);
    const fan = fanAngles(0, 5, 1);
    expect(fan[0]).toBeCloseTo(-0.5);
    expect(fan[4]).toBeCloseTo(0.5);
    const ring = ringAngles(4);
    expect(ring[1]).toBeCloseTo(Math.PI / 2);
  });
});

describe('boss contracts in the save', () => {
  it('unlock after 3 extractions; the Mother also needs research vessels', () => {
    const s = defaultSave();
    expect(bossUnlocked(s, 'foreman')).toBe(false);
    s.stats.extractions = 3;
    expect(bossUnlocked(s, 'foreman')).toBe(true);
    expect(bossUnlocked(s, 'mother')).toBe(false);
    s.codex = ['c1-01', 'c1-02', 'c1-03'];
    expect(bossUnlocked(s, 'mother')).toBe(true);
  });

  it('pay the first-kill bonus once and keep the best time', () => {
    const first = recordBossKill(defaultSave(), 'foreman', 120_000);
    expect(first.firstKill).toBe(true);
    expect(first.save.credits).toBe(BOSSES.foreman.firstKillReward);
    const second = recordBossKill(first.save, 'foreman', 90_000);
    expect(second.firstKill).toBe(false);
    expect(second.save.credits).toBe(BOSSES.foreman.firstKillReward);
    expect(second.save.bosses.foreman).toEqual({ kills: 2, bestMs: 90_000 });
    expect(recordBossKill(second.save, 'foreman', 150_000).save.bosses.foreman.bestMs).toBe(90_000);
  });

  it('survive sanitising and save codes', () => {
    const s = recordBossKill(defaultSave(), 'mother', 100_000).save;
    expect(importSave(exportSave(s))?.bosses.mother).toEqual({ kills: 1, bestMs: 100_000 });
    expect(sanitizeSave({ ...s, bosses: { mother: { kills: 'lots' } } }).bosses).toEqual({
      foreman: { kills: 0, bestMs: 0 },
      mother: { kills: 0, bestMs: 0 },
    });
    expect(sanitizeSave({}).bosses.foreman).toEqual({ kills: 0, bestMs: 0 });
  });
});

describe('boss contract links', () => {
  it('round-trip through the address bar', () => {
    const run = resolveSeed('?boss=mother&seed=ABC123');
    expect(run).toEqual({ seed: 'ABC123', mode: 'boss', ship: 'research', boss: 'mother' });
    expect(seedQuery(run)).toBe('?boss=mother&seed=ABC123');
    expect(resolveSeed('?boss=foreman', new Date(), () => 0).boss).toBe('foreman');
    expect(resolveSeed('?boss=nobody&seed=X').mode).toBe('custom');
  });
});
