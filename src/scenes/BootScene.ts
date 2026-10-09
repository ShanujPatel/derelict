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
  OVERDRIVE,
  AEGIS,
  MIMIC_FRAMES,
  STALKER_FRAMES,
  FUEL_DRUM,
  REPAIR_KIT,
  SPARK,
  SAPPER_FRAMES,
  SWEEPER_FRAMES,
  MINE_FRAMES,
  GRENADE,
  ORE_CHUNK,
  MINING_THEME,
  TILE_SIZE,
  paintLight,
  paintTileset,
  type PixelSprite,
} from '../art/sprites';
import { makeSpriteSheet } from '../art/textures';
import { BOSS_TEXTURES } from '../art/bosses';
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
    makeSpriteSheet(this, 'mimic', MIMIC_FRAMES);
    makeSpriteSheet(this, 'stalker', STALKER_FRAMES);
    makeSpriteSheet(this, 'sapper', SAPPER_FRAMES);
    makeSpriteSheet(this, 'sweeper', SWEEPER_FRAMES);
    makeSpriteSheet(this, 'mine', MINE_FRAMES);
    const singles: Record<string, PixelSprite> = {
      bullet: BULLET,
      flash: FLASH,
      oxygen: OXYGEN,
      battery: POWER_CELL,
      salvage: SALVAGE,
      medkit: MEDKIT,
      overdrive: OVERDRIVE,
      aegis: AEGIS,
      drum: FUEL_DRUM,
      repairkit: REPAIR_KIT,
      lamp: LAMP,
      spark: SPARK,
      acid: ACID,
      barrel: TURRET_BARREL,
      datalog: DATALOG,
      raider: RAIDER,
      brute: BRUTE,
      grenade: GRENADE,
      ore: ORE_CHUNK,
    };
    for (const [key, sprite] of Object.entries(singles)) makeSpriteSheet(this, key, [sprite]);

    this.canvas('tiles-freighter', TILE_SIZE * DISPLAY_TILE_COUNT, TILE_SIZE, (ctx) => paintTileset(ctx, FREIGHTER_THEME));
    this.canvas('tiles-research', TILE_SIZE * DISPLAY_TILE_COUNT, TILE_SIZE, (ctx) => paintTileset(ctx, RESEARCH_THEME));
    this.canvas('tiles-mining', TILE_SIZE * DISPLAY_TILE_COUNT, TILE_SIZE, (ctx) => paintTileset(ctx, MINING_THEME));
    this.canvas('light', 240, 240, (ctx) => paintLight(ctx, 120));
    this.canvas('light-small', 64, 64, (ctx) => paintLight(ctx, 32));
    this.canvas('shadow', 12, 5, (ctx) => {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.ellipse(6, 2.5, 6, 2.5, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    for (const [key, t] of Object.entries(BOSS_TEXTURES)) this.canvas(key, t.w, t.h, t.paint);
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
    // Lift pad (deep dive): purple ring with a down arrow.
    g.clear();
    g.fillStyle(0x1a0f2e).fillCircle(12, 12, 12);
    g.lineStyle(2, 0xc9a0ff).strokeCircle(12, 12, 10);
    g.lineStyle(1, 0x7a4fc9).strokeCircle(12, 12, 6);
    g.fillStyle(0xc9a0ff).fillTriangle(12, 17, 7, 9, 17, 9);
    g.generateTexture('lift', 24, 24);
    g.destroy();

    const loop = (key: string, texture: string, frameRate: number) =>
      this.anims.create({ key, frames: [0, 1].map((frame) => ({ key: texture, frame })), frameRate, repeat: -1 });
    loop('drone-idle', 'drone', 3);
    loop('crawler-run', 'crawler', 10);
    loop('stalker-run', 'stalker', 12);
    loop('egg-pulse', 'egg', 2);
    loop('sapper-blink', 'sapper', 4);
    loop('mine-blink', 'mine', 3);

    // A shared link (?seed= or ?daily) boards that ship straight away; otherwise start in the hub.
    const search = window.location.search;
    const params = new URLSearchParams(search);
    if (['seed', 'daily', 'boss', 'weekly'].some((k) => params.has(k))) this.scene.start('Game', resolveSeed(search));
    else this.scene.start('Hub');
  }

  private canvas(key: string, w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) {
    const tex = this.textures.createCanvas(key, w, h);
    if (!tex) return;
    paint(tex.getContext());
    tex.refresh();
  }
}
