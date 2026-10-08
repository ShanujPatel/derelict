import Phaser from 'phaser';
import {
  BULLET,
  DRONE,
  OXYGEN,
  PLAYER,
  SALVAGE,
  SPARK,
  TILE_SIZE,
  paintSprite,
  paintTileset,
  type PixelSprite,
} from '../art/sprites';
import { resolveSeed } from '../core/seed';

/** Builds all textures in code, then starts the first run. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    const sprites: Record<string, PixelSprite> = {
      player: PLAYER,
      drone: DRONE,
      bullet: BULLET,
      oxygen: OXYGEN,
      salvage: SALVAGE,
      spark: SPARK,
    };
    for (const [key, sprite] of Object.entries(sprites)) {
      const tex = this.textures.createCanvas(key, sprite.rows[0].length, sprite.rows.length);
      if (!tex) continue;
      paintSprite(tex.getContext(), sprite);
      tex.refresh();
    }

    const tiles = this.textures.createCanvas('tiles', TILE_SIZE * 4, TILE_SIZE);
    if (tiles) {
      paintTileset(tiles.getContext());
      tiles.refresh();
    }

    // Extraction pad: green ringed platform.
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x0b2a1c).fillCircle(12, 12, 12);
    g.lineStyle(2, 0x3dff9a).strokeCircle(12, 12, 10);
    g.lineStyle(1, 0x1f9e5e).strokeCircle(12, 12, 6);
    g.fillStyle(0x3dff9a).fillTriangle(12, 8, 8, 14, 16, 14);
    g.generateTexture('exit', 24, 24);
    g.destroy();

    this.scene.start('Game', resolveSeed(window.location.search));
  }
}
