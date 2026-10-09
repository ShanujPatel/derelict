import { describe, expect, it } from 'vitest';
import { CHAPTERS, CODEX, RESEARCH_UNLOCK_LOG, bossLog, chapterProgress, isResearchUnlocked, nextLogFor } from '../src/core/codex';
import {
  applyRunResult,
  canBoard,
  computeRunStats,
  defaultSave,
  owns,
  purchase,
  sanitizeSave,
  setDestination,
  setTool,
} from '../src/core/progression';
import { TOOLS } from '../src/core/catalog';

const ids = (ship: 'freighter' | 'research') =>
  CODEX.filter((e) => e.ship === ship && (e.source ?? 'ship') === 'ship').map((e) => e.id);

describe('codex data', () => {
  it('has unique ids and a log for every chapter', () => {
    expect(new Set(CODEX.map((e) => e.id)).size).toBe(CODEX.length);
    for (const c of CHAPTERS) expect(CODEX.some((e) => e.chapter === c.id)).toBe(true);
  });

  it('can unlock research vessels from a freighter log', () => {
    expect(CODEX.find((e) => e.id === RESEARCH_UNLOCK_LOG)?.ship).toBe('freighter');
  });
});

describe('nextLogFor', () => {
  it('hands out logs for a ship type in story order', () => {
    const found: string[] = [];
    for (const id of ids('freighter')) {
      expect(nextLogFor(found, 'freighter')?.id).toBe(id);
      found.push(id);
    }
    expect(nextLogFor(found, 'freighter')).toBeNull();
    expect(nextLogFor(found, 'research')?.id).toBe(ids('research')[0]);
  });
});

describe('chapter 2', () => {
  it('follows chapter 1 on ships', () => {
    const ch1 = CODEX.filter((e) => e.chapter === 1 && e.ship === 'freighter').map((e) => e.id);
    expect(nextLogFor(ch1, 'freighter')?.chapter).toBe(2);
    expect(nextLogFor([], 'freighter')?.chapter).toBe(1);
  });

  it('keeps one log for each boss, never on ships', () => {
    expect(bossLog([], 'foreman')?.id).toBe('c2-05');
    expect(bossLog([], 'mother')?.id).toBe('c2-06');
    expect(bossLog(['c2-05'], 'foreman')).toBeNull();
    const everyShipLog = CODEX.filter((e) => (e.source ?? 'ship') === 'ship').map((e) => e.id);
    expect(nextLogFor(everyShipLog, 'freighter')).toBeNull();
  });

  it('pays its own reward', () => {
    const all = CODEX.filter((e) => e.chapter === 2).map((e) => e.id);
    const s = applyRunResult(defaultSave(), { extracted: false, salvage: 0, dronesDestroyed: 0, logsFound: all });
    expect(chapterProgress(s.codex, 2).complete).toBe(true);
    expect(s.credits).toBe(CHAPTERS[1].reward);
  });
});

describe('research unlock', () => {
  it('needs the coordinates log', () => {
    const save = defaultSave();
    expect(canBoard(save, 'research')).toBe(false);
    expect(setDestination(save, 'research')).toBe(save);

    const found = applyRunResult(save, { extracted: false, salvage: 0, dronesDestroyed: 0, logsFound: ids('freighter').slice(0, 3) });
    expect(isResearchUnlocked(found.codex)).toBe(true);
    expect(setDestination(found, 'research').loadout.destination).toBe('research');
  });
});

describe('applyRunResult with logs', () => {
  it('keeps logs even when the run fails, without duplicates or unknown ids', () => {
    let s = applyRunResult(defaultSave(), { extracted: false, salvage: 50, dronesDestroyed: 0, logsFound: ['c1-01', 'bogus'] });
    s = applyRunResult(s, { extracted: true, salvage: 0, dronesDestroyed: 0, logsFound: ['c1-01'] });
    expect(s.codex).toEqual(['c1-01']);
    expect(s.credits).toBe(0);
  });

  it('pays the chapter reward exactly once', () => {
    const all = CODEX.filter((e) => e.chapter === 1).map((e) => e.id);
    let s = applyRunResult(defaultSave(), { extracted: false, salvage: 0, dronesDestroyed: 0, logsFound: all.slice(0, -1) });
    expect(s.credits).toBe(0);
    s = applyRunResult(s, { extracted: false, salvage: 0, dronesDestroyed: 0, logsFound: all.slice(-1) });
    expect(chapterProgress(s.codex, 1).complete).toBe(true);
    expect(s.credits).toBe(CHAPTERS[0].reward);
    s = applyRunResult(s, { extracted: false, salvage: 0, dronesDestroyed: 0, logsFound: all });
    expect(s.credits).toBe(CHAPTERS[0].reward);
  });
});

describe('tools', () => {
  it('starts with the torch and sells the hacking tool', () => {
    const s = defaultSave();
    expect(computeRunStats(s).tool).toBe(TOOLS.torch);
    expect(owns(s, { kind: 'tool', id: 'hacker' })).toBe(false);
    const r = purchase({ ...s, credits: 500 }, { kind: 'tool', id: 'hacker' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.credits).toBe(500 - TOOLS.hacker.cost);
    expect(r.save.loadout.tool).toBe('hacker');
    expect(setTool(r.save, 'torch').loadout.tool).toBe('torch');
  });

  it('robots hack faster than salvagers', () => {
    const r = purchase({ ...defaultSave(), credits: 500 }, { kind: 'character', id: 'robot' });
    if (!r.ok) throw new Error(r.reason);
    expect(computeRunStats(r.save).hackSeconds).toBeLessThan(computeRunStats(defaultSave()).hackSeconds);
  });
});

describe('sanitizeSave (v0.3 fields)', () => {
  it('upgrades a v0.2 save that has no tools, codex or destination', () => {
    const s = sanitizeSave({ credits: 10, loadout: { character: 'salvager' } });
    expect(s.tools).toEqual(['torch']);
    expect(s.codex).toEqual([]);
    expect(s.loadout.tool).toBe('torch');
    expect(s.loadout.destination).toBe('freighter');
  });

  it('refuses a research destination without the coordinates', () => {
    expect(sanitizeSave({ loadout: { destination: 'research' } }).loadout.destination).toBe('freighter');
    expect(
      sanitizeSave({ codex: ['c1-01', 'c1-02', 'c1-03'], loadout: { destination: 'research' } }).loadout.destination,
    ).toBe('research');
  });
});
