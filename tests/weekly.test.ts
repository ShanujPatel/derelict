import { describe, expect, it } from 'vitest';
import { STREAK, defaultSave, exportSave, importSave, liveStreak, recordStreak, recordWeekly, sanitizeSave } from '../src/core/progression';
import { resolveSeed, seedQuery } from '../src/core/seed';
import { MUTATORS, NO_EFFECTS, combineMutators, isoWeek, weekFromSeed, weeklySeed, weeklySetup } from '../src/core/weekly';

describe('weekly challenge', () => {
  it('numbers weeks the ISO way, across year ends', () => {
    expect(isoWeek(new Date('2026-10-09T12:00:00Z'))).toBe('2026-W41');
    expect(isoWeek(new Date('2026-12-31T12:00:00Z'))).toBe('2026-W53');
    expect(isoWeek(new Date('2027-01-01T12:00:00Z'))).toBe('2026-W53');
    expect(isoWeek(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01');
    expect(isoWeek(new Date('2024-12-30T12:00:00Z'))).toBe('2025-W01');
  });

  it('is the same all week and changes on Monday', () => {
    expect(weeklySeed(new Date('2026-10-05T00:00:00Z'))).toBe(weeklySeed(new Date('2026-10-11T23:59:00Z')));
    expect(weeklySeed(new Date('2026-10-12T00:00:00Z'))).not.toBe(weeklySeed(new Date('2026-10-11T23:59:00Z')));
    expect(weekFromSeed('weekly-2026-W41')).toBe('2026-W41');
    expect(weekFromSeed('daily-2026-10-09')).toBeNull();
  });

  it('always picks two different mutators', () => {
    for (let w = 1; w <= 53; w++) {
      const { mutators } = weeklySetup(`weekly-2026-W${String(w).padStart(2, '0')}`);
      expect(mutators).toHaveLength(2);
      expect(mutators[0].id).not.toBe(mutators[1].id);
    }
  });

  it('combines mutator effects', () => {
    expect(combineMutators([])).toEqual(NO_EFFECTS);
    const e = combineMutators([MUTATORS.glass, MUTATORS['thin-air']]);
    expect(e).toMatchObject({ damageOut: 2, damageIn: 2, drain: 1.6, salvage: 1.5, healOnKill: 0 });
    expect(combineMutators([MUTATORS.jackpot, MUTATORS.bloodthirsty])).toMatchObject({ eliteChance: 0.4, healOnKill: 5 });
  });

  it('has a ?weekly link', () => {
    const run = resolveSeed('?weekly', new Date('2026-10-09T12:00:00Z'));
    expect(run).toMatchObject({ seed: 'weekly-2026-W41', mode: 'weekly' });
    expect(run.ship).toBe(weeklySetup('weekly-2026-W41').ship);
    expect(seedQuery(run)).toBe('?weekly');
  });

  it('keeps your best for the week and starts fresh next week', () => {
    let s = recordWeekly(defaultSave(), '2026-W41', 120);
    s = recordWeekly(s, '2026-W41', 90);
    expect(s.weekly).toEqual({ week: '2026-W41', best: 120 });
    s = recordWeekly(s, '2026-W42', 30);
    expect(s.weekly).toEqual({ week: '2026-W42', best: 30 });
    expect(importSave(exportSave(s))?.weekly).toEqual(s.weekly);
    expect(sanitizeSave({ weekly: { week: 'soon', best: 5 } }).weekly).toEqual({ week: '', best: 0 });
  });
});

describe('daily streaks', () => {
  it('grow on consecutive days, pay once a day, and reset after a gap', () => {
    let r = recordStreak(defaultSave(), '2026-10-08');
    expect(r.bonus).toBe(STREAK.bonusPerDay);
    r = recordStreak(r.save, '2026-10-09');
    expect(r.save.streak).toEqual({ lastDay: '2026-10-09', count: 2, best: 2 });
    expect(r.bonus).toBe(20);
    const again = recordStreak(r.save, '2026-10-09');
    expect(again.counted).toBe(false);
    expect(again.save).toBe(r.save);
    const gap = recordStreak(r.save, '2026-10-12');
    expect(gap.save.streak).toEqual({ lastDay: '2026-10-12', count: 1, best: 2 });
  });

  it('crosses month ends and caps the bonus', () => {
    let s = defaultSave();
    s = recordStreak(s, '2026-10-31').save;
    expect(recordStreak(s, '2026-11-01').save.streak.count).toBe(2);
    s = { ...s, streak: { lastDay: '2026-10-31', count: 40, best: 40 } };
    expect(recordStreak(s, '2026-11-01').bonus).toBe(STREAK.maxBonus);
  });

  it('shows as broken once you miss a day', () => {
    const s = recordStreak(defaultSave(), '2026-10-08').save;
    expect(liveStreak(s, '2026-10-09')).toBe(1);
    expect(liveStreak(s, '2026-10-10')).toBe(0);
    expect(sanitizeSave({ streak: { lastDay: 'x' } }).streak).toEqual({ lastDay: '', count: 0, best: 0 });
  });
});
