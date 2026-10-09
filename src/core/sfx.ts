/**
 * Every sound effect in the game, described as synth layers rather than audio
 * files (like the pixel art, it's all generated in code). Pure data: the audio
 * engine turns these into Web Audio nodes.
 */
export type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle' | 'noise';

export interface ToneLayer {
  wave: Wave;
  /** Start and end pitch in Hz (for noise: the filter sweep if no filter is given). */
  from: number;
  to: number;
  /** Seconds. */
  duration: number;
  /** Peak gain, 0–1. */
  volume: number;
  attack?: number;
  /** Seconds after the sound starts. */
  delay?: number;
  filter?: { type: 'lowpass' | 'highpass' | 'bandpass'; from: number; to: number; q?: number };
}

export interface SfxDef {
  layers: ToneLayer[];
  /** Random pitch variation, ± this fraction, so repeated sounds don't grate. */
  jitter?: number;
  /** Minimum gap between plays of this sound. */
  cooldownMs?: number;
  /** Most copies that can play at once. */
  maxVoices?: number;
}

const L = (layer: ToneLayer): ToneLayer => layer;

export const SFX = {
  // ---------------------------------------------------------------- weapons
  blaster: {
    jitter: 0.06,
    cooldownMs: 40,
    maxVoices: 4,
    layers: [
      L({ wave: 'square', from: 880, to: 220, duration: 0.09, volume: 0.22 }),
      L({ wave: 'noise', from: 0, to: 0, duration: 0.05, volume: 0.12, filter: { type: 'highpass', from: 3000, to: 1500 } }),
    ],
  },
  scattergun: {
    jitter: 0.05,
    layers: [
      L({ wave: 'noise', from: 0, to: 0, duration: 0.22, volume: 0.5, filter: { type: 'lowpass', from: 4000, to: 300 } }),
      L({ wave: 'sine', from: 160, to: 40, duration: 0.18, volume: 0.5 }),
    ],
  },
  railgun: {
    layers: [
      L({ wave: 'sawtooth', from: 200, to: 1800, duration: 0.12, volume: 0.15, filter: { type: 'lowpass', from: 800, to: 6000 } }),
      L({ wave: 'sine', from: 90, to: 30, duration: 0.35, volume: 0.55, delay: 0.1 }),
      L({ wave: 'noise', from: 0, to: 0, duration: 0.3, volume: 0.25, delay: 0.1, filter: { type: 'bandpass', from: 2500, to: 600, q: 2 } }),
    ],
  },
  arc: {
    jitter: 0.08,
    cooldownMs: 60,
    layers: [
      L({ wave: 'square', from: 1400, to: 300, duration: 0.14, volume: 0.14, filter: { type: 'bandpass', from: 3000, to: 900, q: 2 } }),
      L({ wave: 'noise', from: 0, to: 0, duration: 0.12, volume: 0.3, filter: { type: 'highpass', from: 3500, to: 1800 } }),
      L({ wave: 'sawtooth', from: 120, to: 90, duration: 0.1, volume: 0.1 }),
    ],
  },
  enemyShot: {
    jitter: 0.08,
    cooldownMs: 50,
    maxVoices: 3,
    layers: [L({ wave: 'square', from: 520, to: 180, duration: 0.08, volume: 0.12, filter: { type: 'lowpass', from: 2000, to: 800 } })],
  },
  acid: {
    jitter: 0.1,
    layers: [
      L({ wave: 'noise', from: 0, to: 0, duration: 0.18, volume: 0.25, filter: { type: 'bandpass', from: 600, to: 1800, q: 4 } }),
      L({ wave: 'sine', from: 300, to: 600, duration: 0.12, volume: 0.15 }),
    ],
  },

  // ---------------------------------------------------------------- hits & deaths
  hit: {
    jitter: 0.12,
    cooldownMs: 25,
    maxVoices: 4,
    layers: [L({ wave: 'square', from: 300, to: 120, duration: 0.05, volume: 0.14 })],
  },
  shieldBlock: {
    jitter: 0.08,
    cooldownMs: 60,
    layers: [
      L({ wave: 'triangle', from: 2400, to: 1900, duration: 0.15, volume: 0.18 }),
      L({ wave: 'square', from: 1210, to: 1150, duration: 0.1, volume: 0.06 }),
    ],
  },
  mechDie: {
    jitter: 0.08,
    maxVoices: 3,
    layers: [
      L({ wave: 'noise', from: 0, to: 0, duration: 0.4, volume: 0.45, filter: { type: 'lowpass', from: 3000, to: 200 } }),
      L({ wave: 'square', from: 400, to: 60, duration: 0.25, volume: 0.15 }),
    ],
  },
  alienDie: {
    jitter: 0.15,
    maxVoices: 3,
    layers: [
      L({ wave: 'noise', from: 0, to: 0, duration: 0.25, volume: 0.3, filter: { type: 'bandpass', from: 1200, to: 300, q: 3 } }),
      L({ wave: 'sawtooth', from: 220, to: 70, duration: 0.2, volume: 0.12, filter: { type: 'lowpass', from: 1200, to: 300 } }),
    ],
  },
  playerHurt: {
    cooldownMs: 150,
    layers: [
      L({ wave: 'sawtooth', from: 180, to: 80, duration: 0.2, volume: 0.3, filter: { type: 'lowpass', from: 1500, to: 400 } }),
      L({ wave: 'noise', from: 0, to: 0, duration: 0.12, volume: 0.25, filter: { type: 'lowpass', from: 2000, to: 500 } }),
    ],
  },
  death: {
    layers: [
      L({ wave: 'sawtooth', from: 220, to: 30, duration: 1.4, volume: 0.35, filter: { type: 'lowpass', from: 2000, to: 150 } }),
      L({ wave: 'noise', from: 0, to: 0, duration: 1.0, volume: 0.3, filter: { type: 'lowpass', from: 1500, to: 100 } }),
    ],
  },

  // ---------------------------------------------------------------- pickups & tools
  salvage: {
    jitter: 0.03,
    cooldownMs: 40,
    layers: [
      L({ wave: 'square', from: 988, to: 988, duration: 0.06, volume: 0.12 }),
      L({ wave: 'square', from: 1319, to: 1319, duration: 0.12, volume: 0.12, delay: 0.06 }),
    ],
  },
  oxygen: {
    layers: [
      L({ wave: 'noise', from: 0, to: 0, duration: 0.35, volume: 0.25, filter: { type: 'highpass', from: 1500, to: 5000 } }),
      L({ wave: 'sine', from: 600, to: 900, duration: 0.2, volume: 0.12 }),
    ],
  },
  dodge: {
    jitter: 0.08,
    layers: [
      L({ wave: 'noise', from: 0, to: 0, duration: 0.18, volume: 0.3, filter: { type: 'bandpass', from: 600, to: 2600, q: 1.4 } }),
      L({ wave: 'sine', from: 160, to: 90, duration: 0.12, volume: 0.12 }),
    ],
  },
  explosion: {
    jitter: 0.1,
    maxVoices: 3,
    layers: [
      L({ wave: 'noise', from: 0, to: 0, duration: 0.7, volume: 0.5, filter: { type: 'lowpass', from: 2400, to: 120 } }),
      L({ wave: 'sine', from: 110, to: 30, duration: 0.5, volume: 0.4 }),
      L({ wave: 'square', from: 70, to: 40, duration: 0.25, volume: 0.08 }),
    ],
  },
  achievement: {
    layers: [
      L({ wave: 'triangle', from: 523, to: 523, duration: 0.1, volume: 0.16 }),
      L({ wave: 'triangle', from: 659, to: 659, duration: 0.1, volume: 0.16, delay: 0.1 }),
      L({ wave: 'triangle', from: 784, to: 784, duration: 0.1, volume: 0.16, delay: 0.2 }),
      L({ wave: 'triangle', from: 1047, to: 1047, duration: 0.4, volume: 0.18, delay: 0.3 }),
    ],
  },
  scan: {
    cooldownMs: 120,
    layers: [L({ wave: 'sine', from: 900, to: 1500, duration: 0.12, volume: 0.1 })],
  },
  bossCharge: {
    layers: [
      L({ wave: 'sawtooth', from: 70, to: 260, duration: 0.8, volume: 0.3, filter: { type: 'lowpass', from: 400, to: 2400 } }),
      L({ wave: 'noise', from: 0, to: 0, duration: 0.8, volume: 0.15, filter: { type: 'bandpass', from: 300, to: 1600, q: 2 } }),
    ],
  },
  bossSlam: {
    cooldownMs: 120,
    layers: [
      L({ wave: 'sine', from: 90, to: 28, duration: 0.45, volume: 0.55 }),
      L({ wave: 'noise', from: 0, to: 0, duration: 0.35, volume: 0.4, filter: { type: 'lowpass', from: 1800, to: 150 } }),
    ],
  },
  bossRoar: {
    cooldownMs: 600,
    layers: [
      L({ wave: 'sawtooth', from: 110, to: 55, duration: 0.9, volume: 0.25, filter: { type: 'lowpass', from: 900, to: 300 } }),
      L({ wave: 'noise', from: 0, to: 0, duration: 0.9, volume: 0.3, filter: { type: 'bandpass', from: 500, to: 220, q: 3 } }),
      L({ wave: 'square', from: 58, to: 52, duration: 0.7, volume: 0.06 }),
    ],
  },
  bossArmour: {
    cooldownMs: 90,
    maxVoices: 3,
    layers: [L({ wave: 'square', from: 1600, to: 1300, duration: 0.06, volume: 0.1, filter: { type: 'highpass', from: 900, to: 900 } })],
  },
  bossDie: {
    layers: [
      L({ wave: 'noise', from: 0, to: 0, duration: 1.6, volume: 0.45, filter: { type: 'lowpass', from: 3000, to: 80 } }),
      L({ wave: 'sine', from: 140, to: 20, duration: 1.4, volume: 0.4 }),
      L({ wave: 'sawtooth', from: 300, to: 40, duration: 1.2, volume: 0.1, filter: { type: 'lowpass', from: 1500, to: 200 } }),
    ],
  },
  doorOpen: {
    layers: [
      L({ wave: 'noise', from: 0, to: 0, duration: 0.9, volume: 0.35, filter: { type: 'highpass', from: 1200, to: 300 } }),
      L({ wave: 'square', from: 70, to: 70, duration: 0.15, volume: 0.15, delay: 0.75 }),
      L({ wave: 'sine', from: 120, to: 60, duration: 0.25, volume: 0.3, delay: 0.75 }),
    ],
  },
  heal: {
    layers: [
      L({ wave: 'sine', from: 440, to: 660, duration: 0.18, volume: 0.22 }),
      L({ wave: 'triangle', from: 660, to: 990, duration: 0.28, volume: 0.14, delay: 0.1 }),
      L({ wave: 'noise', from: 0, to: 0, duration: 0.3, volume: 0.08, filter: { type: 'highpass', from: 4000, to: 7000 } }),
    ],
  },
  datalog: {
    layers: [
      L({ wave: 'triangle', from: 660, to: 660, duration: 0.12, volume: 0.2 }),
      L({ wave: 'triangle', from: 880, to: 880, duration: 0.12, volume: 0.2, delay: 0.12 }),
      L({ wave: 'triangle', from: 1320, to: 1320, duration: 0.35, volume: 0.2, delay: 0.24 }),
    ],
  },
  torch: {
    layers: [
      L({ wave: 'noise', from: 0, to: 0, duration: 0.45, volume: 0.4, filter: { type: 'bandpass', from: 2500, to: 900, q: 1.5 } }),
      L({ wave: 'sawtooth', from: 90, to: 60, duration: 0.4, volume: 0.1 }),
    ],
  },
  hackTick: {
    cooldownMs: 120,
    layers: [L({ wave: 'square', from: 1800, to: 1800, duration: 0.025, volume: 0.06 })],
  },
  hackDone: {
    layers: [
      L({ wave: 'square', from: 523, to: 523, duration: 0.08, volume: 0.12 }),
      L({ wave: 'square', from: 784, to: 784, duration: 0.08, volume: 0.12, delay: 0.08 }),
      L({ wave: 'square', from: 1047, to: 1047, duration: 0.18, volume: 0.12, delay: 0.16 }),
    ],
  },
  hackFail: {
    layers: [L({ wave: 'square', from: 300, to: 150, duration: 0.25, volume: 0.12 })],
  },
  grav: {
    layers: [
      L({ wave: 'sine', from: 70, to: 220, duration: 0.3, volume: 0.5 }),
      L({ wave: 'noise', from: 0, to: 0, duration: 0.3, volume: 0.2, filter: { type: 'lowpass', from: 300, to: 3000 } }),
    ],
  },
  cache: {
    layers: [
      L({ wave: 'noise', from: 0, to: 0, duration: 0.15, volume: 0.2, filter: { type: 'lowpass', from: 1200, to: 400 } }),
      L({ wave: 'triangle', from: 440, to: 880, duration: 0.25, volume: 0.15, delay: 0.1 }),
    ],
  },

  // ---------------------------------------------------------------- events
  hatch: {
    jitter: 0.15,
    layers: [
      L({ wave: 'noise', from: 0, to: 0, duration: 0.3, volume: 0.45, filter: { type: 'bandpass', from: 400, to: 900, q: 1.2 } }),
      L({ wave: 'sine', from: 180, to: 90, duration: 0.2, volume: 0.15 }),
    ],
  },
  alarm: {
    layers: [0, 0.35, 0.7].map((delay) =>
      L({ wave: 'square', from: 660, to: 440, duration: 0.3, volume: 0.14, delay, filter: { type: 'lowpass', from: 3000, to: 3000 } }),
    ),
  },
  extract: {
    layers: [
      L({ wave: 'sine', from: 220, to: 1760, duration: 0.9, volume: 0.25 }),
      L({ wave: 'triangle', from: 330, to: 2640, duration: 0.9, volume: 0.1 }),
      L({ wave: 'noise', from: 0, to: 0, duration: 0.9, volume: 0.1, filter: { type: 'highpass', from: 500, to: 6000 } }),
    ],
  },
  heartbeat: {
    layers: [
      L({ wave: 'sine', from: 70, to: 45, duration: 0.12, volume: 0.45 }),
      L({ wave: 'sine', from: 65, to: 40, duration: 0.14, volume: 0.35, delay: 0.18 }),
    ],
  },
  step: {
    jitter: 0.2,
    cooldownMs: 120,
    maxVoices: 2,
    layers: [L({ wave: 'noise', from: 0, to: 0, duration: 0.05, volume: 0.22, filter: { type: 'bandpass', from: 1000, to: 600, q: 0.7 } })],
  },

  // ---------------------------------------------------------------- hub
  ui: {
    cooldownMs: 40,
    layers: [L({ wave: 'triangle', from: 1200, to: 1200, duration: 0.04, volume: 0.1 })],
  },
  buy: {
    layers: [
      L({ wave: 'triangle', from: 784, to: 784, duration: 0.07, volume: 0.15 }),
      L({ wave: 'triangle', from: 1175, to: 1175, duration: 0.15, volume: 0.15, delay: 0.07 }),
    ],
  },
  denied: {
    layers: [L({ wave: 'square', from: 180, to: 160, duration: 0.18, volume: 0.1, filter: { type: 'lowpass', from: 900, to: 900 } })],
  },
  launch: {
    layers: [
      L({ wave: 'sawtooth', from: 60, to: 240, duration: 0.8, volume: 0.25, filter: { type: 'lowpass', from: 300, to: 2400 } }),
      L({ wave: 'noise', from: 0, to: 0, duration: 0.8, volume: 0.15, filter: { type: 'lowpass', from: 200, to: 2000 } }),
    ],
  },
} satisfies Record<string, SfxDef>;

export type SfxName = keyof typeof SFX;

/** Total length of a sound, including delayed layers. */
export function sfxDuration(def: SfxDef): number {
  return Math.max(...def.layers.map((l) => (l.delay ?? 0) + l.duration));
}

/**
 * Volume and stereo position for a sound at a world position, heard from the
 * camera centre. Returns null when it's too far away to bother playing.
 */
export function spatialise(dx: number, dy: number, range = 360): { volume: number; pan: number } | null {
  const d = Math.hypot(dx, dy);
  if (d >= range) return null;
  const volume = 1 - d / range;
  const pan = Math.max(-1, Math.min(1, dx / 220));
  return { volume: volume * volume * 0.7 + 0.3 * volume, pan };
}
