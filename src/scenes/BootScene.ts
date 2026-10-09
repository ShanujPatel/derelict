import Phaser from 'phaser';
import {
  ACID,
  BULLET,
  CACHE_FRAMES,
  CRAWLER_FRAMES,
  DATALOG,
  EGG_FRAMES,
  FREIGHTER_THEME,
  RESEARCH_THEME,
  SPITTER_FRAMES,
  TURRET_BARREL,
  TURRET_FRAMES,
  RAIDER,
  BRUTE,
  DRONE_FRAMES,
  FLASH,
  LAMP,
  OXYGEN,
  POWER_CELL,
  SALVAGE,
  MEDKIT,
  REPAIR_KIT,
  SPARK,
  TILE_SIZE,
  paintLight,
  paintTileset,
  type PixelSprite,
} from '../art/sprites';
import { makeSpriteSheet } from '../art/textures';
import { DISPLAY_TILE_COUNT } from '../core/display';
import { resolveSeed } from '../core/seed';

/** Builds shared textures and animations in code, then opens the hub (or a shared ship). */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    makeSpriteSheet(this, 'drone', DRONE_FRAMES);
    makeSpriteSheet(this, 'crawler', CRAWLER_FRAMES);
    makeSpriteSheet(this, 'spitter', SPITTER_FRAMES);
    makeSpriteSheet(this, 'egg', EGG_FRAMES);
    makeSpriteSheet(this, 'turret', TURRET_FRAMES);
    makeSpriteSheet(this, 'cache', CACHE_FRAMES);
    const singles: Record<string, PixelSprite> = {
      bullet: BULLET,
      flash: FLASH,
      oxygen: OXYGEN,
      battery: POWER_CELL,
      salvage: SALVAGE,
      medkit: MEDKIT,
      repairkit: REPAIR_KIT,
      lamp: LAMP,
      spark: SPARK,
      acid: ACID,
      barrel: TURRET_BARREL,
      datalog: DATALOG,
      raider: RAIDER,
      brute: BRUTE,
    };
    for (const [key, sprite] of Object.entries(singles)) makeSpriteSheet(this, key, [sprite]);

    this.canvas('tiles-freighter', TILE_SIZE * DISPLAY_TILE_COUNT, TILE_SIZE, (ctx) => paintTileset(ctx, FREIGHTER_THEME));
    this.canvas('tiles-research', TILE_SIZE * DISPLAY_TILE_COUNT, TILE_SIZE, (ctx) => paintTileset(ctx, RESEARCH_THEME));
    this.canvas('light', 240, 240, (ctx) => paintLight(ctx, 120));
    this.canvas('light-small', 64, 64, (ctx) => paintLight(ctx, 32));
    this.canvas('shadow', 12, 5, (ctx) => {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(6, 2.5, 6, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    this.canvas('star', 1, 1, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 1, 1);
    });

    // Extraction pad: ringed landing platform.
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x0b2a1c).fillCircle(12, 12, 12);
    g.lineStyle(2, 0x3dff9a).strokeCircle(12, 12, 10);
    g.lineStyle(1, 0x1f9e5e).strokeCircle(12, 12, 6);
    g.fillStyle(0x3dff9a).fillTriangle(12, 7, 7, 15, 17, 15);
    g.generateTexture('exit', 24, 24);
    g.destroy();

    const loop = (key: string, texture: string, frameRate: number) =>
      this.anims.create({ key, frames: [0, 1].map((frame) => ({ key: texture, frame })), frameRate, repeat: -1 });
    loop('drone-idle', 'drone', 3);
    loop('crawler-run', 'crawler', 10);
    loop('egg-pulse', 'egg', 2);

    // A shared link (?seed= or ?daily) boards that ship straight away; otherwise start in the hub.
    const search = window.location.search;
    const params = new URLSearchParams(search);
    if (params.has('seed') || params.has('daily')) this.scene.start('Game', resolveSeed(search));
    else this.scene.start('Hub');
  }

  private canvas(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
    const tex = this.textures.createCanvas(key, w, h);
    if (!tex) return;
    paint(tex.getContext());
    tex.refresh();
  }
}
