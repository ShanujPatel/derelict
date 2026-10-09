import { createRng } from './rng';
import { hashString } from './seed';

/**
 * Music theory for the generative soundtrack. Each place has a theme: a key,
 * a mode, a tempo and a seeded melody phrase, so it always sounds like itself.
 */
export const SCALES = {
  minorPent: [0, 3, 5, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
} as const;

export type ThemeId = 'hub' | 'freighter' | 'research';

export interface MusicTheme {
  /** MIDI note of the drone. */
  root: number;
  scale: readonly number[];
  bpm: number;
  /** Octaves above the root for the melody. */
  melodyOctave: number;
  /** Chance that a 16th step plays a melody note. */
  density: number;
  melodyWave: 'sine' | 'triangle' | 'square';
  /** Whether a combat layer can fade in. */
  combat: boolean;
  seed: string;
}

export const THEMES: Record<ThemeId, MusicTheme> = {
  hub: { root: 45, scale: SCALES.minorPent, bpm: 72, melodyOctave: 2, density: 0.18, melodyWave: 'sine', combat: false, seed: 'hub' },
  freighter: { root: 38, scale: SCALES.dorian, bpm: 96, melodyOctave: 2, density: 0.22, melodyWave: 'triangle', combat: true, seed: 'freighter' },
  research: { root: 37, scale: SCALES.phrygian, bpm: 84, melodyOctave: 3, density: 0.16, melodyWave: 'sine', combat: true, seed: 'research' },
};

export const midiToFreq = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** MIDI note for a scale degree; degrees past the end of the scale wrap up an octave. */
export function scaleNote(root: number, scale: readonly number[], degree: number): number {
  const octave = Math.floor(degree / scale.length);
  const step = ((degree % scale.length) + scale.length) % scale.length;
  return root + octave * 12 + scale[step];
}

/**
 * A repeating melody: one entry per 16th note, a MIDI note or null for a rest.
 * Built as a gentle random walk over the scale so it stays tuneful.
 */
export function buildPhrase(theme: MusicTheme, steps = 32): (number | null)[] {
  const rng = createRng(hashString(`phrase:${theme.seed}`));
  const base = theme.root + theme.melodyOctave * 12;
  let degree = rng.int(0, theme.scale.length - 1);
  return Array.from({ length: steps }, (_, i) => {
    // Downbeats are a little more likely to sound.
    const chance = theme.density * (i % 4 === 0 ? 1.8 : 1);
    if (!rng.chance(chance)) return null;
    degree = Math.max(0, Math.min(theme.scale.length * 2 - 1, degree + rng.int(-2, 2)));
    return scaleNote(base, theme.scale, degree);
  });
}

/** Seconds per 16th note. */
export const stepSeconds = (bpm: number) => 60 / bpm / 4;

/** Combat intensity 0–1 from how many enemies are hunting you. */
export function combatIntensity(alertedNearby: number): number {
  return Math.max(0, Math.min(1, alertedNearby / 3));
}
