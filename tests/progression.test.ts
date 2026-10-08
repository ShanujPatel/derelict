import { describe, expect, it } from 'vitest';
import { CHARACTERS, COSMETICS, PERKS, STATS } from '../src/core/catalog';
import {
  applyRunResult,
  computeRunStats,
  defaultSave,
  exportSave,
  importSave,
  owns,
  priceOf,
  purchase,
  sanitizeSave,
  selectCharacter,
  setGun,
  setLook,
  setPerk,
  type SaveData,
} from '../src/core/progression';

const rich = (credits = 10_000): SaveData => ({ ...defaultSave(), credits });

const buy = (save: SaveData, ...items: Parameters<typeof purchase>[1][]) =>
  items.reduce((s, item) => {
    const r = purchase(s, item);
    if (!r.ok) throw new Error(r.reason);
    return r.save;
  }, save);

describe('defaultSave', () => {
  it('starts as the salvager with blaster and scattergun', () => {
    const s = defaultSave();
    expect(s.loadout.character).toBe('salvager');
    expect(s.loadout.guns).toEqual(['blaster', 'scattergun']);
    expect(owns(s, { kind: 'character', id: 'robot' })).toBe(false);
  });
});

describe('purchase', () => {
  it('charges the price and grants the item', () => {
    const r = purchase(rich(200), { kind: 'character', id: 'robot' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.save.credits).toBe(200 - CHARACTERS.robot.cost);
    expect(r.save.characters).toContain('robot');
    expect(r.save.loadout.character).toBe('robot');
  });

  it('refuses when short of salvage, explaining how much more is needed', () => {
    const r = purchase(rich(100), { kind: 'character', id: 'robot' });
    expect(r).toEqual({ ok: false, reason: 'Need 50 more salvage' });
  });

  it('refuses to sell things already owned', () => {
    expect(purchase(rich(), { kind: 'weapon', id: 'blaster' }).ok).toBe(false);
    expect(purchase(rich(), { kind: 'cosmetic', character: 'salvager', slot: 'body', id: 'orange' }).ok).toBe(false);
  });

  it('does not mutate the original save', () => {
    const s = rich(500);
    purchase(s, { kind: 'perk', id: 'scavenger' });
    expect(s.credits).toBe(500);
    expect(s.perks).toEqual([]);
  });

  it('steps through stat tiers and stops at max', () => {
    let s = rich();
    for (const cost of STATS.speed.costs) {
      expect(priceOf(s, { kind: 'stat', id: 'speed' })).toBe(cost);
      s = buy(s, { kind: 'stat', id: 'speed' });
    }
    expect(priceOf(s, { kind: 'stat', id: 'speed' })).toBeNull();
    expect(purchase(s, { kind: 'stat', id: 'speed' }).ok).toBe(false);
  });

  it('equips a first perk and bought cosmetics automatically', () => {
    const s = buy(
      rich(),
      { kind: 'perk', id: 'scrapper' },
      { kind: 'cosmetic', character: 'salvager', slot: 'body', id: 'gold' },
    );
    expect(s.loadout.perk).toBe('scrapper');
    expect(s.loadout.looks.salvager.body).toBe('gold');
  });
});

describe('loadout changes', () => {
  it('only selects owned characters', () => {
    expect(selectCharacter(defaultSave(), 'robot').loadout.character).toBe('salvager');
  });

  it('swaps guns when the chosen gun is in the other slot', () => {
    const s = setGun(defaultSave(), 0, 'scattergun');
    expect(s.loadout.guns).toEqual(['scattergun', 'blaster']);
  });

  it('ignores unowned guns, perks and cosmetics', () => {
    const s = defaultSave();
    expect(setGun(s, 0, 'railgun')).toBe(s);
    expect(setPerk(s, 'scavenger')).toBe(s);
    expect(setLook(s, 'salvager', 'body', 'gold')).toBe(s);
  });

  it('can clear the perk', () => {
    const s = buy(rich(), { kind: 'perk', id: 'scavenger' });
    expect(setPerk(s, null).loadout.perk).toBeNull();
  });
});

describe('applyRunResult', () => {
  it('banks salvage only on extraction', () => {
    const won = applyRunResult(defaultSave(), { extracted: true, salvage: 80, dronesDestroyed: 3 });
    expect(won.credits).toBe(80);
    expect(won.stats).toMatchObject({ runs: 1, extractions: 1, bestHaul: 80, totalBanked: 80, dronesDestroyed: 3 });

    const lost = applyRunResult(won, { extracted: false, salvage: 200, dronesDestroyed: 1 });
    expect(lost.credits).toBe(80);
    expect(lost.stats).toMatchObject({ runs: 2, extractions: 1, bestHaul: 80, dronesDestroyed: 4 });
  });
});

describe('computeRunStats', () => {
  it('applies upgrades and character traits', () => {
    let s = buy(rich(), { kind: 'stat', id: 'health' }, { kind: 'stat', id: 'capacity' }, { kind: 'character', id: 'robot' });
    const robot = computeRunStats(s);
    expect(robot.character.resource).toBe('battery');
    expect(robot.maxHp).toBe(CHARACTERS.robot.baseHp + STATS.health.perTier);
    expect(robot.capacity).toBe(CHARACTERS.robot.baseCapacity + STATS.capacity.perTier);
    expect(robot.armour).toBeGreaterThan(0);

    s = selectCharacter(s, 'salvager');
    const human = computeRunStats(s);
    expect(human.character.resource).toBe('oxygen');
    expect(human.colours.b).toBe(COSMETICS.salvager.body[0].colours.b);
  });

  it('returns the equipped guns and perk', () => {
    const s = setPerk(buy(rich(), { kind: 'weapon', id: 'railgun' }, { kind: 'perk', id: 'second-wind' }), 'second-wind');
    const stats = computeRunStats(setGun(s, 1, 'railgun'));
    expect(stats.guns.map((g) => g.id)).toEqual(['blaster', 'railgun']);
    expect(stats.perk).toBe(PERKS['second-wind']);
  });
});

describe('sanitizeSave', () => {
  it('returns defaults for junk', () => {
    expect(sanitizeSave(null)).toEqual(defaultSave());
    expect(sanitizeSave('nope')).toEqual(defaultSave());
  });

  it('drops unknown ids, clamps numbers and keeps starting gear', () => {
    const s = sanitizeSave({
      credits: -50,
      characters: ['robot', 'dragon'],
      weapons: ['laser'],
      perks: ['scavenger', 'flight'],
      upgrades: { health: 99, speed: 'fast' },
      loadout: { character: 'robot', guns: ['railgun', 'blaster'], perk: 'scavenger' },
    });
    expect(s.credits).toBe(0);
    expect(s.characters).toEqual(['salvager', 'robot']);
    expect(s.weapons).toEqual(['blaster', 'scattergun']);
    expect(s.perks).toEqual(['scavenger']);
    expect(s.upgrades).toEqual({ health: STATS.health.costs.length, capacity: 0, speed: 0 });
    expect(s.loadout.character).toBe('robot');
    expect(s.loadout.guns).toEqual(['blaster', 'scattergun']); // railgun not owned
    expect(s.loadout.perk).toBe('scavenger');
  });

  it('round-trips a real save unchanged', () => {
    const s = buy(rich(1000), { kind: 'character', id: 'robot' }, { kind: 'cosmetic', character: 'robot', slot: 'accent', id: 'red' });
    expect(sanitizeSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});

describe('export / import', () => {
  it('round-trips through a save code', () => {
    const s = buy(rich(777), { kind: 'weapon', id: 'railgun' }, { kind: 'stat', id: 'speed' });
    const code = exportSave(s);
    expect(code.startsWith('DRL1.')).toBe(true);
    expect(importSave(code)).toEqual(s);
  });

  it('rejects tampered or malformed codes', () => {
    const code = exportSave(rich(5));
    const [p, body, check] = code.split('.');
    expect(importSave(`${p}.${body.slice(0, -2)}xx.${check}`)).toBeNull();
    expect(importSave('hello')).toBeNull();
    expect(importSave('')).toBeNull();
  });
});
