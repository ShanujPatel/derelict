import Phaser from 'phaser';
import { audio } from '../audio/engine';
import { pad } from '../ui/Gamepad';
import { PAD } from '../core/gamepad';
import { updateSettings } from '../core/progression';
import { loadSave, storeSave } from '../storage';

const FONT = { fontFamily: 'monospace', fontSize: '11px', color: '#d7e3ff' };

export interface PauseData {
  /** Ends the run as a loss (salvage lost, logs kept). */
  onAbandon: () => void;
  /** A few lines about the run so far. */
  summary?: string[];
}

/** Overlay shown over a paused run. The Game scene is frozen underneath. */
export class PauseScene extends Phaser.Scene {
  private opts!: PauseData;
  private confirmAbandon = false;

  constructor() {
    super('Pause');
  }

  init(data: PauseData) {
    this.opts = data;
    this.confirmAbandon = false;
  }

  create() {
    this.draw();
    this.scale.on('resize', this.draw, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.draw, this));

    const kb = this.input.keyboard;
    kb?.on('keydown-ESC', this.resume, this);
    kb?.on('keydown-P', this.resume, this);
    kb?.on('keydown-M', () => this.toggleSound());
  }

  update() {
    pad.poll();
    if (pad.justPressed(PAD.START) || pad.justPressed(PAD.B)) this.resume();
  }

  private draw() {
    this.children.removeAll(true);
    const { width: w, height: h } = this.scale;
    const settings = loadSave().settings;
    this.add.rectangle(w / 2, h / 2, w, h, 0x05070c, 0.78).setInteractive(); // swallow taps behind
    if (this.opts.summary?.length) {
      this.add
        .text(10, h - 8, this.opts.summary.join('\n'), { ...FONT, fontSize: '9px', color: '#9fb0d0', lineSpacing: 3, wordWrap: { width: w - 20 } })
        .setOrigin(0, 1);
    }
    this.add.text(w / 2, h / 2 - 82, 'PAUSED', { ...FONT, fontSize: '20px', color: '#ffd166' }).setOrigin(0.5);

    const rows: [string, () => void][] = [
      [pad.connected ? 'RESUME  [Esc / Start]' : 'RESUME  [Esc]', () => this.resume()],
      [`SOUND: ${audio.isMuted ? 'OFF' : 'ON'}  [M]`, () => this.toggleSound()],
      [`SCREEN SHAKE: ${settings.screenShake ? 'ON' : 'OFF'}`, () => this.toggleShake()],
      [`CORNER MAP: ${settings.minimap ? 'ON' : 'OFF'}`, () => this.toggleMinimap()],
      [this.confirmAbandon ? 'TAP AGAIN: LOSE THIS RUN' : 'ABANDON RUN', () => this.abandon()],
    ];
    rows.forEach(([label, action], i) => {
      const danger = i === rows.length - 1;
      this.add
        .text(w / 2, h / 2 - 46 + i * 26, label, {
          ...FONT,
          backgroundColor: danger && this.confirmAbandon ? '#5a1a22' : '#1b2333',
          padding: { x: 12, y: 6 },
          color: danger ? '#ff9a8a' : '#d7e3ff',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on('pointerup', action);
    });
    // Short landscape screens need the room for the run summary.
    if (h >= 360 || !this.opts.summary?.length) this.add
      .text(w / 2, h / 2 + 96, 'Abandoning keeps any crew logs you found.', { ...FONT, fontSize: '9px', color: '#7f8fb3' })
      .setOrigin(0.5);
  }

  private resume() {
    audio.play('ui');
    this.scene.resume('Game');
    this.scene.stop();
  }

  private toggleSound() {
    audio.toggleMute();
    audio.play('ui');
    this.draw();
  }

  private toggleShake() {
    const save = loadSave();
    const next = updateSettings(save, { screenShake: !save.settings.screenShake });
    storeSave(next);
    audio.play('ui');
    this.draw();
  }

  private toggleMinimap() {
    const save = loadSave();
    storeSave(updateSettings(save, { minimap: !save.settings.minimap }));
    audio.play('ui');
    this.draw();
  }

  private abandon() {
    if (!this.confirmAbandon) {
      this.confirmAbandon = true;
      audio.play('denied');
      return this.draw();
    }
    this.scene.resume('Game');
    this.scene.stop();
    this.opts.onAbandon();
  }
}
