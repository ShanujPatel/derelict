import Phaser from 'phaser';
import {
  BULLET,
  DRONE_FRAMES,
  FLASH,
  LAMP,
  OXYGEN,
  PLAYER_FRAMES,
  SALVAGE,
  SPARK,
  TILE_SIZE,
  paintLight,
  paintSprite,
  paintTileset,
  type PixelSprite,
} from '../art/sprites';
import { DISPLAY_TILE_COUNT } from '../core/display';
import { resolveSeed } from '../core/seed';

/** Builds all textures and animations in code, then starts the first run. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    this.spriteSheet('player', PLAYER_FRAMES);
    this.spriteSheet('drone', DRONE_FRAMES);
    const singles: Record<string, PixelSprite> = {
      bullet: BULLET,
      flash: FLASH,
      oxygen: OXYGEN,
      salvage: SALVAGE,
      lamp: LAMP,
      spark: SPARK,
    };
    for (const [key, sprite] of Object.entries(singles)) this.spriteSheet(key, [sprite]);

    this.canvas('tiles', TILE_SIZE * DISPLAY_TILE_COUNT, TILE_SIZE, paintTileset);
    this.canvas('light', 240, 240, (ctx) => paintLight(ctx, 120));
    this.canvas('light-small', 64, 64, (ctx) => paintLight(ctx, 32));
    this.canvas('shadow', 12, 5, (ctx) => {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(6, 2.5, 6, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    // Extraction pad: ringed landing platform.
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x0b2a1c).fillCircle(12, 12, 12);
    g.lineStyle(2, 0x3dff9a).strokeCircle(12, 12, 10);
    g.lineStyle(1, 0x1f9e5e).strokeCircle(12, 12, 6);
    g.fillStyle(0x3dff9a).fillTriangle(12, 7, 7, 15, 17, 15);
    g.generateTexture('exit', 24, 24);
    g.destroy();

    this.anims.create({
      key: 'player-walk',
      frames: [0, 1, 2, 3].map((frame) => ({ key: 'player', frame })),
      frameRate: 9,
      repeat: -1,
    });
    this.anims.create({
      key: 'drone-idle',
      frames: [0, 1].map((frame) => ({ key: 'drone', frame })),
      frameRate: 3,
      repeat: -1,
    });

    this.scene.start('Game', resolveSeed(window.location.search));
  }

  /** Paints frames side by side into one canvas texture with numbered frames. */
  private spriteSheet(key: string, frames: PixelSprite[]) {
    const w = frames[0].rows[0].length;
    const h = frames[0].rows.length;
    const tex = this.textures.createCanvas(key, w * frames.length, h);
    if (!tex) return;
    frames.forEach((sprite, i) => {
      paintSprite(tex.getContext(), sprite, i * w, 0);
      tex.add(i, 0, i * w, 0, w, h);
    });
    tex.refresh();
  }

  private canvas(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
    const tex = this.textures.createCanvas(key, w, h);
    if (!tex) return;
    paint(tex.getContext());
    tex.refresh();
  }
}
