import Phaser from 'phaser';
import { dailySeed, dailyShip, randomSeed, seedQuery, type ResolvedSeed } from '../core/seed';
import { HubView } from '../hub/HubView';
import { audio } from '../audio/engine';
import { clearSave, loadSave, storeSave } from '../storage';

/** Between runs: a drifting starfield behind the HTML hub screens. */
export class HubScene extends Phaser.Scene {
  private view: HubView | null = null;
  private stars: { img: Phaser.GameObjects.Image; speed: number }[] = [];

  constructor() {
    super('Hub');
  }

  create() {
    this.stars = [];
    for (let i = 0; i < 140; i++) {
      const depth = Math.random();
      const img = this.add
        .image(Math.random() * this.scale.width, Math.random() * this.scale.height, 'star')
        .setAlpha(0.25 + depth * 0.75)
        .setScale(depth > 0.85 ? 2 : 1);
      this.stars.push({ img, speed: 4 + depth * 22 });
    }

    audio.startMusic('hub');
    audio.setIntensity(0);
    this.view = new HubView(loadSave(), {
      onSave: storeSave,
      onReset: clearSave,
      onLaunch: (daily) => this.launch(daily),
      onSound: (name) => audio.play(name),
      onSettings: (settings) => audio.setSettings(settings),
    });
    this.events.once('shutdown', () => {
      this.view?.destroy();
      this.view = null;
    });
  }

  update(_time: number, delta: number) {
    const { width, height } = this.scale;
    for (const s of this.stars) {
      s.img.x -= (s.speed * delta) / 1000;
      if (s.img.x < -2) s.img.setPosition(width + 2, Math.random() * height);
    }
  }

  private launch(daily: boolean) {
    const today = dailySeed(new Date());
    const run: ResolvedSeed = daily
      ? { seed: today, mode: 'daily', ship: dailyShip(today) }
      : { seed: randomSeed(), mode: 'random', ship: loadSave().loadout.destination };
    try {
      window.history.replaceState(null, '', seedQuery(run));
    } catch {
      /* ignore */
    }
    audio.unlock();
    audio.play('launch');
    this.scene.start('Game', run);
  }
}
