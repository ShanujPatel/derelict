import { shareText } from '../src/core/share';
import { COMBO, NO_COMBO, comboAfterPickup, comboMultiplier, comboTimeLeft } from '../src/core/combo';
import { ACHIEVEMENT_IDS } from '../src/core/achievements';
import { TIP_IDS, nextTip, tipText } from '../src/core/tips';
import { BOUNTY, bountyFor } from '../src/core/bounty';
import { describe, expect, it } from 'vitest';
import { COSMETICS, PERKS, WEAPON_COSTS } from '../src/core/catalog';
import { dodgeReadiness, DODGE } from '../src/core/fieldkit';
import { ARC, WEAPONS, chainTargets } from '../src/core/weapons';
import {
  HISTORY_LIMIT,
  applyRunResult,
  defaultSave,
  exportSave,
  importSave,
  markTipSeen,
  owns,
  priceOf,
  purchase,
  setLook,
  recordRun,
  resetTips,
  sanitizeSave,
  type RunRecord,
} from '../src/core/progression';

describe('arc caster', () => {
  const from = { x: 0, y: 0 };

  it('is for sale and chains', () => {
    expect(WEAPON_COSTS.arc).toBeGreaterThan(0);
    expect(WEAPONS.arc.chain).toBeGreaterThan(1);
  });

  it('hits the nearest target in the aim cone first', () => {
    const targets = [
      { x: 100, y: 0 },
      { x: 50, y: 5 },
      { x: -30, y: 0 }, // behind you
    ];
    expect(chainTargets(from, 0, targets, 1)).toEqual([1]);
  });

  it('jumps to the nearest unhit target within a hop', () => {
    const targets = [
      { x: 40, y: 0 },
      { x: 40 + ARC.hop - 1, y: 0 },
      { x: 40 + ARC.hop * 2 - 2, y: 0 },
      { x: 40 + ARC.hop * 4, y: 0 }, // too far from anything
    ];
    expect(chainTargets(from, 0, targets, 4)).toEqual([0, 1, 2]);
    expect(chainTargets(from, 0, targets, 2)).toEqual([0, 1]);
  });

  it('misses when nothing is in range or in sight', () => {
    expect(chainTargets(from, 0, [{ x: ARC.range + 5, y: 0 }], 4)).toEqual([]);
    expect(chainTargets(from, 0, [{ x: 0, y: 50 }], 4)).toEqual([]);
    expect(chainTargets(from, 0, [{ x: 50, y: 0 }], 4, () => false)).toEqual([]);
  });
});

describe('v0.8 perks', () => {
  it('exist with prices', () => {
    for (const id of ['adrenaline', 'demolitionist', 'field-medic'] as const) expect(PERKS[id].cost).toBeGreaterThan(0);
  });

  it('adrenaline doubles the roll recharge', () => {
    const half = 1000 + DODGE.cooldownMs / 2;
    expect(dodgeReadiness(half, 1000, false, 2)).toBe(1);
    expect(dodgeReadiness(half, 1000, false, 1)).toBeCloseTo(0.5);
  });
});


describe('run history and lifetime stats', () => {
  const rec = (i: number, patch: Partial<RunRecord> = {}): RunRecord => ({
    at: new Date(Date.UTC(2026, 9, 9, 12, i)).toISOString(),
    ship: 'freighter',
    mode: 'random',
    seed: `S${i}`,
    character: 'salvager',
    extracted: i % 2 === 0,
    salvage: i * 10,
    kills: i,
    durationMs: 60_000 + i,
    ...patch,
  });

  it('keeps the newest runs first, up to the limit', () => {
    let s = defaultSave();
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) s = recordRun(s, rec(i));
    expect(s.history).toHaveLength(HISTORY_LIMIT);
    expect(s.history[0].seed).toBe(`S${HISTORY_LIMIT + 2}`);
  });

  it('survives save codes and drops junk entries', () => {
    const s = recordRun(recordRun(defaultSave(), rec(1, { boss: 'foreman', mode: 'boss' })), rec(2, { abandoned: true }));
    expect(importSave(exportSave(s))?.history).toEqual(s.history);
    const dirty = sanitizeSave({ ...s, history: [...s.history, { at: 'nope' }, 7, rec(3, { ship: 'yacht' as never })] });
    expect(dirty.history).toHaveLength(2);
    expect(sanitizeSave({ history: 'x' }).history).toEqual([]);
  });

  it('adds up lifetime counters', () => {
    let s = applyRunResult(defaultSave(), { extracted: true, salvage: 10, dronesDestroyed: 2, dodges: 5, drumsDetonated: 1, elitesKilled: 1, durationMs: 90_000 });
    s = applyRunResult(s, { extracted: false, salvage: 0, dronesDestroyed: 0, dodges: 3, durationMs: 30_000 });
    expect(s.stats).toMatchObject({ dodges: 8, drumsDetonated: 1, elitesKilled: 1, timeAboardMs: 120_000, runs: 2 });
    // Old saves without the new counters still load.
    expect(sanitizeSave({ stats: { runs: 4 } }).stats).toMatchObject({ runs: 4, dodges: 0, timeAboardMs: 0 });
  });
});

describe('assist settings', () => {
  it('default off and survive sanitising', () => {
    const s = defaultSave();
    expect(s.settings.minimap).toBe(false);
    expect(s.settings.assist).toBe(false);
    expect(sanitizeSave({ settings: { assist: true, minimap: 'yes' } }).settings).toMatchObject({ assist: true, minimap: false });
  });
});


describe('bounties', () => {
  it('pick one eligible hostile from the seed', () => {
    expect(bountyFor('X', 'freighter', 0)).toBeNull();
    const b = bountyFor('X', 'freighter', 9)!;
    expect(b).toEqual(bountyFor('X', 'freighter', 9));
    expect(b.index).toBeGreaterThanOrEqual(0);
    expect(b.index).toBeLessThan(9);
    expect(b.reward).toBeGreaterThanOrEqual(BOUNTY.reward[0]);
    expect(b.reward).toBeLessThanOrEqual(BOUNTY.reward[1]);
    expect(b.name.length).toBeGreaterThan(2);
  });
});

describe('first-time tips', () => {
  it('show each tip once, in priority order', () => {
    expect(nextTip(['hostile', 'salvage'], [])).toBe('hostile');
    expect(nextTip(['hostile', 'salvage'], ['hostile'])).toBe('salvage');
    expect(nextTip(['hostile'], ['hostile'])).toBeNull();
  });

  it('word controls for the device in use', () => {
    expect(tipText('weak-wall', 'keyboard')).toContain('F');
    expect(tipText('weak-wall', 'touch')).toContain('TORCH');
    expect(tipText('weak-wall', 'pad')).toContain('X');
    expect(tipText('salvage', 'pad')).toBe(tipText('salvage', 'keyboard'));
  });

  it('are remembered in the save and can be reset', () => {
    let s = markTipSeen(defaultSave(), 'drum');
    expect(markTipSeen(s, 'drum')).toBe(s);
    expect(sanitizeSave({ ...s, tips: ['drum', 'nonsense'] }).tips).toEqual(['drum']);
    s = resetTips(s);
    expect(s.tips).toEqual([]);
    expect(TIP_IDS.length).toBeGreaterThan(5);
  });
});

describe('trophy cosmetics', () => {
  it("can't be bought, and unlock with their achievement", () => {
    const item = { kind: 'cosmetic', character: 'salvager', slot: 'body', id: 'foreman' } as const;
    const rich = { ...defaultSave(), credits: 9999 };
    expect(owns(rich, item)).toBe(false);
    expect(priceOf(rich, item)).toBeNull();
    expect(purchase(rich, item).ok).toBe(false);
    expect(setLook(rich, 'salvager', 'body', 'foreman')).toBe(rich);
    const earned = { ...rich, achievements: ['fired'] };
    expect(owns(earned, item)).toBe(true);
    expect(setLook(earned, 'salvager', 'body', 'foreman').loadout.looks.salvager.body).toBe('foreman');
  });

  it('every trophy points at a real achievement', () => {
    for (const c of Object.values(COSMETICS)) {
      for (const o of [...c.body, ...c.accent]) {
        if (o.trophy) expect(ACHIEVEMENT_IDS).toContain(o.trophy.achievement);
      }
    }
  });
});

describe('salvage combos', () => {
  it('chain pickups inside the window and reset after it', () => {
    let c = comboAfterPickup(NO_COMBO, 1000);
    expect(c.count).toBe(1);
    c = comboAfterPickup(c, 1000 + COMBO.windowMs);
    expect(c.count).toBe(2);
    c = comboAfterPickup(c, 1000 + COMBO.windowMs * 2 + 1);
    expect(c.count).toBe(1);
  });

  it('grow the multiplier in steps up to the cap', () => {
    expect(comboMultiplier(1)).toBe(1);
    expect(comboMultiplier(2)).toBe(1.1);
    expect(comboMultiplier(6)).toBe(1.5);
    expect(comboMultiplier(20)).toBe(COMBO.max);
  });

  it('count down the window', () => {
    const c = { count: 3, lastAt: 0 };
    expect(comboTimeLeft(c, 0)).toBe(1);
    expect(comboTimeLeft(c, COMBO.windowMs / 2)).toBeCloseTo(0.5);
    expect(comboTimeLeft(c, COMBO.windowMs * 2)).toBe(0);
  });
});

describe('share card', () => {
  const base = 'https://example.github.io/derelict/';
  it('describes a daily run with its replay link and rank', () => {
    const t = shareText({
      run: { seed: 'daily-2026-10-09', mode: 'daily', ship: 'research' },
      extracted: true,
      salvage: 230,
      kills: 14,
      durationMs: 192_000,
      base,
      rank: { rank: 3, total: 40 },
    });
    expect(t).toContain('Daily Derelict 2026-10-09');
    expect(t).toContain('Extracted with 230 salvage in 3:12');
    expect(t).toContain('rank #3 of 40');
    expect(t.endsWith(`${base}?daily`)).toBe(true);
  });

  it('links boss fights and lost runs', () => {
    const t = shareText({ run: { seed: 'ABC', mode: 'boss', ship: 'freighter', boss: 'foreman' }, extracted: false, salvage: 40, kills: 2, durationMs: 61_000, base });
    expect(t).toContain('THE FOREMAN');
    expect(t).toContain('Lost aboard after 1:01');
    expect(t).toContain('?boss=foreman&seed=ABC');
  });
});

describe('personal bests', () => {
  it('track deepest extracted dive, longest combo and bounties', () => {
    let s = applyRunResult(defaultSave(), { extracted: false, salvage: 0, dronesDestroyed: 0, depth: 4, bestCombo: 3, bounties: 1 });
    expect(s.stats).toMatchObject({ deepestDive: 0, bestCombo: 3, bountiesClaimed: 1 });
    s = applyRunResult(s, { extracted: true, salvage: 10, dronesDestroyed: 0, depth: 3, bestCombo: 2, bounties: 1 });
    expect(s.stats).toMatchObject({ deepestDive: 3, bestCombo: 3, bountiesClaimed: 2 });
  });
});
