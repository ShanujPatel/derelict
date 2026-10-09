import { describe, expect, it } from 'vitest';
import { SFX, sfxDuration, spatialise, type SfxDef } from '../src/core/sfx';
import { THEMES, buildPhrase, combatIntensity, midiToFreq, scaleNote, stepSeconds } from '../src/core/music';
import { DEFAULT_SETTINGS, defaultSave, sanitizeSave, sanitizeSettings, updateSettings } from '../src/core/progression';

describe('SFX definitions', () => {
  it.each(Object.entries(SFX) as [string, SfxDef][])('%s is a sane sound', (_name, def) => {
    expect(def.layers.length).toBeGreaterThan(0);
    expect(sfxDuration(def)).toBeLessThanOrEqual(1.6);
    for (const l of def.layers) {
      expect(l.duration).toBeGreaterThan(0);
      expect(l.volume).toBeGreaterThan(0);
      expect(l.volume).toBeLessThanOrEqual(0.6);
      if (l.wave !== 'noise') {
        expect(l.from).toBeGreaterThan(0);
        expect(l.to).toBeGreaterThan(0);
        expect(Math.max(l.from, l.to)).toBeLessThan(12000);
      }
      if (l.filter) expect(Math.min(l.filter.from, l.filter.to)).toBeGreaterThan(0);
    }
    // Layers stacked at the same moment shouldn't sum to clipping.
    expect(def.layers.filter((l) => !l.delay).reduce((a, l) => a + l.volume, 0)).toBeLessThanOrEqual(1);
  });

  it('includes delayed layers in the duration', () => {
    expect(sfxDuration(SFX.datalog)).toBeCloseTo(0.59);
  });
});

describe('spatialise', () => {
  it('is loudest and centred at the camera', () => {
    expect(spatialise(0, 0)).toEqual({ volume: 1, pan: 0 });
  });

  it('pans with horizontal position and fades with distance', () => {
    const left = spatialise(-150, 0)!;
    const right = spatialise(150, 0)!;
    expect(left.pan).toBeLessThan(0);
    expect(right.pan).toBeCloseTo(-left.pan);
    expect(spatialise(0, 200)!.volume).toBeLessThan(spatialise(0, 50)!.volume);
  });

  it('skips sounds that are too far away', () => {
    expect(spatialise(400, 0)).toBeNull();
  });
});

describe('music', () => {
  it('converts MIDI to frequency', () => {
    expect(midiToFreq(69)).toBeCloseTo(440);
    expect(midiToFreq(57)).toBeCloseTo(220);
  });

  it('maps scale degrees across octaves', () => {
    const minorPent = [0, 3, 5, 7, 10];
    expect(scaleNote(60, minorPent, 0)).toBe(60);
    expect(scaleNote(60, minorPent, 4)).toBe(70);
    expect(scaleNote(60, minorPent, 5)).toBe(72);
  });

  it.each(Object.entries(THEMES))('%s phrase is deterministic and in key', (_id, theme) => {
    const phrase = buildPhrase(theme);
    expect(buildPhrase(theme)).toEqual(phrase);
    expect(phrase).toHaveLength(32);
    const notes = phrase.filter((n): n is number => n !== null);
    expect(notes.length).toBeGreaterThan(2);
    for (const n of notes) {
      expect(theme.scale).toContain((((n - theme.root) % 12) + 12) % 12);
    }
  });

  it('gives each place its own tune', () => {
    expect(buildPhrase(THEMES.freighter)).not.toEqual(buildPhrase(THEMES.research));
  });

  it('works out step length and combat intensity', () => {
    expect(stepSeconds(120)).toBeCloseTo(0.125);
    expect(combatIntensity(0)).toBe(0);
    expect(combatIntensity(6)).toBe(1);
  });
});

describe('settings', () => {
  it('defaults sensibly and survives junk', () => {
    expect(defaultSave().settings).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ master: 7, music: -1, sfx: 'loud', screenShake: 'no' })).toEqual({
      ...DEFAULT_SETTINGS,
      master: 1,
      music: 0,
    });
    expect(sanitizeSave({}).settings).toEqual(DEFAULT_SETTINGS);
  });

  it('updates without touching the rest of the save', () => {
    const s = updateSettings(defaultSave(), { music: 0.2, screenShake: false });
    expect(s.settings).toMatchObject({ music: 0.2, screenShake: false, master: DEFAULT_SETTINGS.master });
    expect(s.credits).toBe(0);
  });
});
