import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, newAchievements, type RunSummary } from '../src/core/achievements';
import { generateArena } from '../src/core/arena';
import { BOSSES, CAPTAIN, captainDamage } from '../src/core/bosses';
import { CHAPTERS, CODEX, MINING_UNLOCK_EXTRACTIONS, bossLog, isMiningUnlocked, nextLogFor } from '../src/core/codex';
import { DECK_OPTIONS, generateDeck } from '../src/core/deckGenerator';
import { MINE, SWEEPER, beamEnd, distanceToSegment } from '../src/core/fieldkit';
import { vesselName } from '../src/core/names';
import { bfsDistances } from '../src/core/pathing';
import { canBoard, defaultSave, sanitizeSave, setDestination } from '../src/core/progression';
import { THEMES } from '../src/core/music';
import { MINING_WEEKLY_FROM, weeklySetup } from '../src/core/weekly';
import { Tile } from '../src/core/types';

const SEEDS = Array.from({ length: 60 }, (_, i) => `mine-${i}`);

describe('mining haulers', () => {
  it('carry sappers and sweepers, and no aliens', () => {
    for (const seed of SEEDS) {
      const kinds = new Set(generateDeck(seed, 'mining').spawns.map((s) => s.kind));
      expect(kinds.has('sapper'), seed).toBe(true);
      for (const alien of ['crawler', 'spitter', 'egg', 'stalker', 'mimic', 'turret']) expect(kinds.has(alien as never)).toBe(false);
    }
  });

  it('put each sweeper in the middle of a big room, never the exit room', () => {
    for (const seed of SEEDS) {
      const deck = generateDeck(seed, 'mining');
      const sweepers = deck.spawns.filter((s) => s.kind === 'sweeper');
      for (const s of sweepers) {
        const room = deck.rooms.find((r) => s.x === r.x + Math.floor(r.w / 2) && s.y === r.y + Math.floor(r.h / 2));
        expect(room, seed).toBeDefined();
        expect(room!.w).toBeGreaterThanOrEqual(7);
        const e = deck.extraction;
        expect(e.x >= room!.x && e.x < room!.x + room!.w && e.y >= room!.y && e.y < room!.y + room!.h).toBe(false);
      }
      expect(new Set(sweepers.map((s) => `${s.x},${s.y}`)).size).toBe(sweepers.length);
    }
  });

  it('have plenty of ore veins, and cutting one never cuts off anything', () => {
    let total = 0;
    for (const seed of SEEDS) {
      const deck = generateDeck(seed, 'mining');
      total += deck.weakWalls.length;
      expect(deck.weakWalls.length, seed).toBeGreaterThanOrEqual(5);
      const before = bfsDistances(deck.tiles, deck.start);
      const cut = deck.tiles.map((row) => row.map((t) => (t === Tile.WeakWall ? Tile.Floor : t)));
      const after = bfsDistances(cut, deck.start);
      deck.tiles.forEach((row, y) => row.forEach((t, x) => t === Tile.Floor && expect(after[y][x]).toBeLessThanOrEqual(before[y][x])));
    }
    expect(total / SEEDS.length).toBeGreaterThan(10);
    expect(DECK_OPTIONS.mining.oreVeins).toBeGreaterThan(0);
  });

  it('keeps older ship layouts unchanged', () => {
    // Ore veins only exist on mining haulers.
    expect(generateDeck('HULK42').weakWalls.length).toBeLessThanOrEqual(DECK_OPTIONS.freighter.maxWeakWalls);
  });

  it('have their own names and music', () => {
    expect(vesselName('ABC', 'mining')).toMatch(/^MH /);
    expect(THEMES.mining.combat).toBe(true);
  });
});

describe('sweeper beams and mines', () => {
  const grid = Array.from({ length: 10 }, (_, y) => Array.from({ length: 10 }, (_, x) => (x === 7 || y === 0 ? Tile.Wall : Tile.Floor)));

  it('stop at the first wall', () => {
    const end = beamEnd(grid, 40, 40, 0, 200, 16);
    expect(end.x).toBeLessThan(7 * 16);
    expect(end.x).toBeGreaterThan(6 * 16);
    const free = beamEnd(grid, 40, 40, Math.PI / 2, 50, 16);
    expect(free.y).toBeCloseTo(90);
  });

  it('measure distance to the beam', () => {
    expect(distanceToSegment(5, 3, 0, 0, 10, 0)).toBe(3);
    expect(distanceToSegment(-4, 3, 0, 0, 10, 0)).toBe(5);
    expect(distanceToSegment(1, 1, 0, 0, 0, 0)).toBeCloseTo(Math.SQRT2);
  });

  it('are tuned so a roll gets you through', () => {
    expect(SWEEPER.beamWidth).toBeLessThan(10);
    expect(MINE.fuseMs).toBeLessThan(500);
    expect(MINE.armMs).toBeGreaterThan(0);
  });
});

describe('unlocking mining haulers', () => {
  it('opens with the ledger log or enough extractions', () => {
    expect(isMiningUnlocked([], 0)).toBe(false);
    expect(isMiningUnlocked(['c2-01'], 0)).toBe(true);
    expect(isMiningUnlocked([], MINING_UNLOCK_EXTRACTIONS)).toBe(true);
    const save = defaultSave();
    expect(canBoard(save, 'mining')).toBe(false);
    expect(setDestination(save, 'mining').loadout.destination).toBe('freighter');
    save.stats.extractions = MINING_UNLOCK_EXTRACTIONS;
    const next = setDestination(save, 'mining');
    expect(next.loadout.destination).toBe('mining');
    // The choice survives a reload (stats are read before the destination is checked).
    expect(sanitizeSave(JSON.parse(JSON.stringify(next))).loadout.destination).toBe('mining');
  });
});

describe('chapter 3 and the Hollow Captain', () => {
  it('has five ship logs and one boss log', () => {
    const c3 = CODEX.filter((e) => e.chapter === 3);
    expect(c3.filter((e) => (e.source ?? 'ship') === 'ship')).toHaveLength(5);
    expect(c3.every((e) => e.ship === 'mining')).toBe(true);
    expect(CHAPTERS.find((c) => c.id === 3)).toBeDefined();
    expect(nextLogFor([], 'mining')?.id).toBe('c3-01');
    expect(bossLog([], 'captain')?.id).toBe('c3-06');
    expect(CODEX.find((e) => e.id === 'c2-01')?.body).toMatch(/mining haulers can now be boarded/);
  });

  it('shield blocks everything until the pylons fall', () => {
    expect(captainDamage(5, { shielded: true })).toBe(0);
    expect(captainDamage(5, { shielded: false })).toBe(5);
    expect(CAPTAIN.grenadeSelfDamage).toBeGreaterThan(0);
    expect(BOSSES.captain.ship).toBe('mining');
  });

  it('arena has three pylons on open floor and mining guards', () => {
    for (const seed of ['A', 'B', 'C', 'D']) {
      const a = generateArena(seed, 'captain');
      expect(a.features.filter((f) => f.kind === 'pylon')).toHaveLength(3);
      for (const f of a.features) expect(a.tiles[f.y][f.x]).toBe(Tile.Floor);
      expect(a.spawns.some((s) => s.kind === 'sapper')).toBe(true);
    }
  });

  it('has achievements for the new content', () => {
    const base: RunSummary = {
      extracted: true, ship: 'mining', daily: false, salvage: 40, kills: 3, durationMs: 200_000, damageTaken: 10, dodges: 0,
      blastKills: 0, explored: 0.2, eggsDestroyed: 0, rivalsKilled: 0, rivalsBoarded: 0, hacks: 0, elitesKilled: 0,
      bossKilled: null, weekly: false, bounties: 0, bestCombo: 0, depth: 1, oreVeins: 5,
    };
    expect(newAchievements(base, []).map((a) => a.id)).toContain('prospector');
    expect(newAchievements({ ...base, bossKilled: 'captain' }, []).map((a) => a.id)).toContain('mutiny');
    expect(newAchievements({ ...base, ship: 'freighter' }, []).map((a) => a.id)).not.toContain('prospector');
    expect(ACHIEVEMENTS.length).toBe(22);
  });
});

describe('weekly challenge', () => {
  it('can be a mining hauler from week 42 of 2026', () => {
    expect(MINING_WEEKLY_FROM).toBe('2026-W42');
    const ships = new Set(Array.from({ length: 40 }, (_, i) => weeklySetup(`weekly-2027-W${String(i + 1).padStart(2, '0')}`).ship));
    expect(ships.has('mining')).toBe(true);
    const old = new Set(Array.from({ length: 40 }, (_, i) => weeklySetup(`weekly-2025-W${String(i + 1).padStart(2, '0')}`).ship));
    expect(old.has('mining')).toBe(false);
  });
});
