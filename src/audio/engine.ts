import { THEMES, buildPhrase, midiToFreq, stepSeconds, type MusicTheme, type ThemeId } from '../core/music';
import type { Settings } from '../core/progression';
import { SFX, sfxDuration, type SfxDef, type SfxName, type ToneLayer } from '../core/sfx';

/**
 * Synthesised audio: every sound and all the music are built from Web Audio
 * oscillators and filtered noise at runtime. No audio files.
 *
 *   sfx voices ─┐
 *               ├─ sfxBus ──┐
 *   music ──── musicBus ────┴─ master ── compressor ── speakers
 */

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseBuffers.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buf);
  }
  return buf;
}

const ramp = (param: AudioParam, from: number, to: number, t0: number, t1: number) => {
  param.setValueAtTime(from, t0);
  if (from > 0 && to > 0) param.exponentialRampToValueAtTime(to, t1);
  else param.linearRampToValueAtTime(to, t1);
};

/** Schedules one synth layer into `dest`. Works on live and offline contexts. */
function playLayer(ctx: BaseAudioContext, dest: AudioNode, layer: ToneLayer, start: number, rate: number, gainScale: number) {
  const t0 = start + (layer.delay ?? 0);
  const t1 = t0 + layer.duration;

  let src: AudioScheduledSourceNode;
  if (layer.wave === 'noise') {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx);
    n.loop = true;
    n.playbackRate.value = rate;
    src = n;
  } else {
    const o = ctx.createOscillator();
    o.type = layer.wave;
    ramp(o.frequency, layer.from * rate, layer.to * rate, t0, t1);
    src = o;
  }

  let node: AudioNode = src;
  if (layer.filter) {
    const f = ctx.createBiquadFilter();
    f.type = layer.filter.type;
    f.Q.value = layer.filter.q ?? 0.8;
    ramp(f.frequency, layer.filter.from, layer.filter.to, t0, t1);
    node.connect(f);
    node = f;
  }

  const g = ctx.createGain();
  const peak = layer.volume * gainScale;
  const attack = Math.min(layer.attack ?? 0.004, layer.duration / 2);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(Math.max(peak * 0.001, 0.0001), t1);
  node.connect(g);
  g.connect(dest);

  src.start(t0);
  src.stop(t1 + 0.02);
}

/** Plays a whole sound definition at time `start`. */
function playDef(ctx: BaseAudioContext, dest: AudioNode, def: SfxDef, start: number, volume = 1, rate = 1) {
  for (const layer of def.layers) playLayer(ctx, dest, layer, start, rate, volume);
}

export interface PlayOptions {
  volume?: number;
  /** -1 (left) to 1 (right). */
  pan?: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private settings: Settings = { master: 0.8, music: 0.6, sfx: 0.8, screenShake: true, flashes: true };
  private muted = false;
  private lastPlayed = new Map<SfxName, number>();
  private voices = new Map<SfxName, number>();
  private music: MusicPlayer | null = null;
  private wantedTheme: ThemeId | null = null;

  /** Browsers only allow audio after a tap or key press; call this from one. */
  unlock() {
    if (typeof window === 'undefined' || !('AudioContext' in window)) return;
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus.connect(this.master);
      this.musicBus.connect(this.master);
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.applyVolumes();
      if (this.wantedTheme) this.startMusic(this.wantedTheme);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Unlocks on the first interaction anywhere on the page. */
  unlockOnFirstGesture() {
    const go = () => {
      this.unlock();
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
    };
    window.addEventListener('pointerdown', go);
    window.addEventListener('keydown', go);
  }

  get ready(): boolean {
    return this.ctx?.state === 'running';
  }

  setSettings(settings: Settings) {
    this.settings = settings;
    this.applyVolumes();
  }

  get isMuted() {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.applyVolumes();
    return this.muted;
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.settings.master, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this.settings.music * 0.55, t, 0.03);
  }

  play(name: SfxName, opts: PlayOptions = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const def: SfxDef = SFX[name];
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -1e9) < (def.cooldownMs ?? 30)) return;
    const playing = this.voices.get(name) ?? 0;
    if (playing >= (def.maxVoices ?? 6)) return;
    this.lastPlayed.set(name, now);
    this.voices.set(name, playing + 1);
    setTimeout(() => this.voices.set(name, Math.max(0, (this.voices.get(name) ?? 1) - 1)), sfxDuration(def) * 1000 + 30);

    let dest: AudioNode = this.sfxBus;
    if (opts.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      p.connect(this.sfxBus);
      dest = p;
    }
    const rate = 1 + (def.jitter ?? 0) * (Math.random() * 2 - 1);
    playDef(ctx, dest, def, ctx.currentTime + 0.005, opts.volume ?? 1, rate);
  }

  startMusic(theme: ThemeId) {
    this.wantedTheme = theme;
    if (!this.ctx) return;
    if (this.music?.themeId === theme) return;
    this.music?.stop();
    this.music = new MusicPlayer(this.ctx, this.musicBus, theme);
  }

  stopMusic() {
    this.wantedTheme = null;
    this.music?.stop();
    this.music = null;
  }

  /** 0 = exploring, 1 = full combat. Smoothed by the music player. */
  setIntensity(value: number) {
    this.music?.setIntensity(value);
  }

  /**
   * Renders a sound offline and measures it: used by the browser tests to
   * prove every effect makes noise and doesn't clip.
   */
  async renderOffline(name: SfxName): Promise<{ rms: number; peak: number; seconds: number }> {
    const def = SFX[name];
    const seconds = sfxDuration(def) + 0.1;
    const ctx = new OfflineAudioContext(1, Math.ceil(44100 * seconds), 44100);
    playDef(ctx, ctx.destination, def, 0);
    const data = (await ctx.startRendering()).getChannelData(0);
    let sum = 0;
    let peak = 0;
    for (const v of data) {
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    return { rms: Math.sqrt(sum / data.length), peak, seconds };
  }
}

/**
 * Generative soundtrack for one place: a filtered drone on the root and fifth,
 * a seeded melody phrase, and (on ships) a combat layer of kick, hats and bass
 * that fades in with intensity. Notes are scheduled slightly ahead of time.
 */
class MusicPlayer {
  private theme: MusicTheme;
  private phrase: (number | null)[];
  private out: GainNode;
  private combat: GainNode;
  private drone: AudioScheduledSourceNode[] = [];
  private timer: ReturnType<typeof setInterval>;
  private step = 0;
  private nextTime: number;
  private intensity = 0;

  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
    readonly themeId: ThemeId,
  ) {
    this.theme = THEMES[themeId];
    this.phrase = buildPhrase(this.theme);
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0, ctx.currentTime);
    this.out.gain.linearRampToValueAtTime(1, ctx.currentTime + 2.5);
    this.out.connect(dest);
    this.combat = ctx.createGain();
    this.combat.gain.value = 0;
    this.combat.connect(this.out);
    this.startDrone();
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 50);
  }

  setIntensity(value: number) {
    if (!this.theme.combat) return;
    this.intensity = Math.max(0, Math.min(1, value));
    this.combat.gain.setTargetAtTime(this.intensity, this.ctx.currentTime, 1.2);
  }

  stop() {
    clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0, t, 0.4);
    for (const d of this.drone) d.stop(t + 2);
    setTimeout(() => this.out.disconnect(), 2500);
  }

  private startDrone() {
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 2;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(filter.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.16;
    filter.connect(g).connect(this.out);
    for (const [semi, detune] of [[0, -6], [0, 7], [7, 3], [-12, 0]] as const) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiToFreq(this.theme.root + semi);
      o.detune.value = detune;
      o.connect(filter);
      o.start();
      this.drone.push(o);
    }
    lfo.start();
    this.drone.push(lfo);
  }

  private schedule() {
    const step = stepSeconds(this.theme.bpm);
    while (this.nextTime < this.ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += step;
      this.step = (this.step + 1) % this.phrase.length;
    }
  }

  private playStep(i: number, t: number) {
    const ctx = this.ctx;
    const note = this.phrase[i];
    if (note !== null) {
      playLayer(
        ctx,
        this.out,
        { wave: this.theme.melodyWave, from: midiToFreq(note), to: midiToFreq(note), duration: 0.9, volume: 0.07, attack: 0.01 },
        t,
        1,
        1,
      );
      // A quiet echo an octave down, two steps later.
      playLayer(
        ctx,
        this.out,
        { wave: 'sine', from: midiToFreq(note - 12), to: midiToFreq(note - 12), duration: 1.2, volume: 0.035, attack: 0.02 },
        t + stepSeconds(this.theme.bpm) * 2,
        1,
        1,
      );
    }
    if (!this.theme.combat || this.intensity < 0.02) return;
    // Combat layer: kick on the beat, hats on the off-beats, a pulsing bass on 8ths.
    if (i % 4 === 0) {
      playLayer(ctx, this.combat, { wave: 'sine', from: 140, to: 42, duration: 0.18, volume: 0.5 }, t, 1, 1);
    }
    if (i % 4 === 2) {
      playLayer(
        ctx,
        this.combat,
        { wave: 'noise', from: 0, to: 0, duration: 0.05, volume: 0.12, filter: { type: 'highpass', from: 7000, to: 7000 } },
        t,
        1,
        1,
      );
    }
    if (i % 2 === 0) {
      const root = midiToFreq(this.theme.root + (i % 16 < 8 ? 12 : 15));
      playLayer(
        ctx,
        this.combat,
        { wave: 'square', from: root, to: root, duration: 0.14, volume: 0.09, filter: { type: 'lowpass', from: 900, to: 300 } },
        t,
        1,
        1,
      );
    }
  }
}

/** The game's single audio engine. */
export const audio = new AudioEngine();
