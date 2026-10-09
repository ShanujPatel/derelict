import Phaser from 'phaser';
import { MINE, SWEEPER } from '../core/fieldkit';
import { RIVAL_CARRY_LIMIT } from '../core/rivals';
import type { SfxName } from '../core/sfx';
import type { EnemyKind, Point } from '../core/types';

type Sprite = Phaser.Physics.Arcade.Sprite;

/** Tuning for every hostile. Solid enemies block movement and never move. */
export interface EnemyStats {
  hp: number;
  contactDamage: number;
  solid: boolean;
  speed: number;
  sight: number;
  /** [chance, min, max] salvage dropped when destroyed. */
  drop: [number, number, number];
  radius: number;
  offset: number;
  shadowY: number;
}

export const ENEMY_STATS: Record<EnemyKind, EnemyStats> = {
  drone: { hp: 3, contactDamage: 12, solid: false, speed: 72, sight: 160, drop: [0.3, 3, 8], radius: 5, offset: 2, shadowY: 9 },
  crawler: { hp: 1, contactDamage: 7, solid: false, speed: 92, sight: 140, drop: [0.12, 2, 4], radius: 4, offset: 1, shadowY: 5 },
  spitter: { hp: 4, contactDamage: 10, solid: false, speed: 26, sight: 170, drop: [0.5, 5, 10], radius: 6, offset: 1, shadowY: 8 },
  egg: { hp: 3, contactDamage: 0, solid: true, speed: 0, sight: 140, drop: [1, 6, 12], radius: 5, offset: 1, shadowY: 7 },
  turret: { hp: 5, contactDamage: 0, solid: true, speed: 0, sight: 170, drop: [0.6, 6, 12], radius: 6, offset: 1, shadowY: 0 },
  raider: { hp: 4, contactDamage: 8, solid: false, speed: 62, sight: 180, drop: [0.8, 6, 14], radius: 5, offset: 2, shadowY: 7 },
  /** Research vessels only: nearly invisible until it's close or hurt. */
  stalker: { hp: 2, contactDamage: 10, solid: false, speed: 104, sight: 150, drop: [0.5, 6, 12], radius: 4, offset: 1, shadowY: 0 },
  /** Freighters only: sits looking like a salvage crate until you get close. */
  mimic: { hp: 4, contactDamage: 14, solid: false, speed: 76, sight: 160, drop: [1, 20, 35], radius: 5, offset: 0, shadowY: 0 },
  brute: { hp: 8, contactDamage: 16, solid: false, speed: 48, sight: 200, drop: [1, 10, 18], radius: 6, offset: 2, shadowY: 8 },
  /** Mining haulers: keeps its distance and lays proximity mines behind it. */
  sapper: { hp: 3, contactDamage: 8, solid: false, speed: 70, sight: 170, drop: [0.5, 4, 10], radius: 5, offset: 2, shadowY: 7 },
  /** Mining haulers: a cutting laser on a turntable, sweeping its room. Hack it to turn the beam on hostiles. */
  sweeper: { hp: 9, contactDamage: 0, solid: true, speed: 0, sight: 160, drop: [1, 8, 14], radius: 7, offset: 1, shadowY: 0 },
};

/** Enemies that use walking routes rather than flying straight at you. */
export const RIVAL_KINDS: readonly EnemyKind[] = ['raider', 'brute'];

const TURRET_COOLDOWN = 1300;
/** How long a turret's laser sight shows before it fires. */
export const TURRET_LOCK_MS = 550;
const SPITTER_COOLDOWN = 1700;
const EGG_COOLDOWN = 4500;
const EGG_BROOD = 3;
const RAIDER_COOLDOWN = 1800;
const RETARGET_MS = 1200;

/** What an enemy can see and do in the world. Implemented by GameScene. */
export interface EnemyWorld {
  player: Sprite;
  canSee(from: Point, to: Point): boolean;
  /** Active, non-hacked enemies (targets for hacked turrets). */
  hostiles(): Sprite[];
  /** A shot that hurts the player. */
  shootAtPlayer(x: number, y: number, angle: number, speed: number, damage: number, texture: string): void;
  /** A shot that hurts enemies (from a hacked turret). */
  shootAtEnemies(x: number, y: number, angle: number): void;
  spawnEnemy(kind: EnemyKind, x: number, y: number): Sprite;
  moveTowards(e: Sprite, target: Point, speed: number): void;
  /** Walks along a route round walls towards a world position. */
  followPath(e: Sprite, target: Point, speed: number): void;
  /** Loose salvage a rival could grab: the nearest one by walking distance. */
  nearestSalvage(e: Sprite): Sprite | null;
  /** A rival picks up a salvage pickup. */
  steal(e: Sprite, pickup: Sprite): void;
  /** Plays a sound effect at a world position. */
  soundAt(name: SfxName, x: number, y: number): void;
  /** A sapper drops a proximity mine where it stands. */
  layMine(e: Sprite): void;
  /** How many of this sapper's mines are still out. */
  minesOf(e: Sprite): number;
}

export const kindOf = (e: Sprite) => e.getData('kind') as EnemyKind;
export const isHacked = (e: Sprite) => e.getData('hacked') === true;

/** Runs one frame of behaviour for a single enemy. */
export function updateEnemy(e: Sprite, world: EnemyWorld, time: number) {
  const kind = kindOf(e);
  const stats = ENEMY_STATS[kind];
  const shadow = e.getData('shadow') as Phaser.GameObjects.Image | undefined;
  shadow?.setPosition(e.x, e.y + stats.shadowY);

  // Stunned by the grav tool: drift and do nothing else.
  if (time < (e.getData('stunnedUntil') ?? 0)) {
    e.setVelocity((e.body?.velocity.x ?? 0) * 0.92, (e.body?.velocity.y ?? 0) * 0.92);
    return;
  }

  if (kind === 'turret') return updateTurret(e, world, time, stats);
  if (kind === 'sweeper') return updateSweeper(e, world, time, stats);
  // Mimics ignore line of sight while dormant: they only wake when you're right next to them.
  if (kind === 'mimic') {
    return updateMimic(e, world, time, stats, Phaser.Math.Distance.Between(e.x, e.y, world.player.x, world.player.y));
  }

  const p = world.player;
  const dist = Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y);
  const sees = dist < stats.sight && world.canSee(e, p);
  if (sees) e.setData('alertUntil', time + 2500);
  const alert = time < e.getData('alertUntil');

  switch (kind) {
    case 'drone':
      if (alert) world.moveTowards(e, p, stats.speed);
      else wander(e, time, 22);
      return;

    case 'crawler':
      // Crawlers smell you up close even round corners.
      if (alert || dist < 70) world.moveTowards(e, p, stats.speed);
      else wander(e, time, 40);
      faceVelocity(e);
      return;

    case 'spitter': {
      if (dist < 60) {
        // Too close: back away.
        const a = Phaser.Math.Angle.Between(p.x, p.y, e.x, e.y);
        e.setVelocity(Math.cos(a) * stats.speed * 1.5, Math.sin(a) * stats.speed * 1.5);
      } else if (alert && !sees) {
        world.moveTowards(e, p, stats.speed);
      } else {
        e.setVelocity(0, 0);
      }
      if (sees && time > (e.getData('nextShot') ?? 0)) {
        e.setData('nextShot', time + SPITTER_COOLDOWN);
        e.setFrame(1);
        e.scene.time.delayedCall(220, () => e.active && e.setFrame(0));
        const a = Phaser.Math.Angle.Between(e.x, e.y, p.x, p.y);
        world.shootAtPlayer(e.x, e.y, a, 150, 10, 'acid');
      }
      return;
    }

    case 'raider':
      return updateRaider(e, world, time, stats, dist, sees);

    case 'sapper': {
      if (!alert) {
        wander(e, time, 24);
        faceVelocity(e);
        return;
      }
      // Keep a middle distance, sidestepping, and leave mines in your path.
      const a = Phaser.Math.Angle.Between(e.x, e.y, p.x, p.y);
      if (dist > 130) world.moveTowards(e, p, stats.speed);
      else if (dist < 70) e.setVelocity(-Math.cos(a) * stats.speed * 1.2, -Math.sin(a) * stats.speed * 1.2);
      else {
        const side = (e.getData('side') as number) ?? 1;
        e.setVelocity(Math.cos(a + (Math.PI / 2) * side) * stats.speed * 0.7, Math.sin(a + (Math.PI / 2) * side) * stats.speed * 0.7);
        if (time > (e.getData('flipAt') ?? 0)) e.setData({ side: -side, flipAt: time + Phaser.Math.Between(1200, 2200) });
      }
      faceVelocity(e);
      if (time > (e.getData('nextMine') ?? 0) && world.minesOf(e) < MINE.maxPerSapper && dist < 200) {
        e.setData('nextMine', time + MINE.layEveryMs);
        world.layMine(e);
      }
      return;
    }

    case 'stalker': {
      // Cloaked: a faint shimmer, until it's within striking range or has been hit.
      const revealed = dist < STALKER_REVEAL || time < (e.getData('revealedUntil') ?? 0);
      e.setAlpha(revealed ? 1 : 0.07 + 0.05 * Math.sin(time / 130));
      if (alert || dist < 90) world.moveTowards(e, p, stats.speed);
      else wander(e, time, 30);
      faceVelocity(e);
      return;
    }


    case 'brute':
      if (sees) world.moveTowards(e, p, stats.speed);
      else world.followPath(e, p, stats.speed);
      faceVelocity(e);
      return;

    case 'egg': {
      const brood = (e.getData('brood') as number) ?? 0;
      if (sees && brood < EGG_BROOD && time > (e.getData('nextShot') ?? 0)) {
        e.setData('nextShot', time + EGG_COOLDOWN);
        e.setData('brood', brood + 1);
        const child = world.spawnEnemy('crawler', e.x + Phaser.Math.Between(-6, 6), e.y + Phaser.Math.Between(-6, 6));
        child.setData({ parent: e, alertUntil: time + 3000 });
        e.scene.tweens.add({ targets: e, scaleX: 1.25, scaleY: 0.8, yoyo: true, duration: 120 });
        world.soundAt('hatch', e.x, e.y);
      }
      return;
    }
  }
}

export const MIMIC_TRIGGER = 34;
const STALKER_REVEAL = 52;
const MIMIC_LUNGE_MS = 550;

/** Mimic: dormant crate until you're close (or it's shot), then a lunge and a chase. */
function updateMimic(e: Sprite, world: EnemyWorld, time: number, stats: EnemyStats, dist: number) {
  const p = world.player;
  if (e.getData('dormant')) {
    e.setVelocity(0, 0);
    if (dist < MIMIC_TRIGGER) wakeMimic(e, world, time);
    return;
  }
  if (time < (e.getData('lungeUntil') ?? 0)) return;
  world.moveTowards(e, p, stats.speed);
  e.setFrame(Math.floor(time / 140) % 2 === 0 ? 1 : 2);
  faceVelocity(e);
}

export function wakeMimic(e: Sprite, world: EnemyWorld, time: number) {
  if (!e.getData('dormant')) return;
  e.setData({ dormant: false, lungeUntil: time + MIMIC_LUNGE_MS, alertUntil: time + 8000 });
  e.setFrame(1);
  const a = Phaser.Math.Angle.Between(e.x, e.y, world.player.x, world.player.y);
  e.setVelocity(Math.cos(a) * 190, Math.sin(a) * 190);
  e.scene.tweens.add({ targets: e, scaleX: 1.3, scaleY: 1.3, yoyo: true, duration: 110 });
  world.soundAt('hatch', e.x, e.y);
}

/** Sweeper: turns its beam steadily; faster once it has seen you. GameScene draws the beam and applies hits. */
function updateSweeper(e: Sprite, world: EnemyWorld, time: number, stats: EnemyStats) {
  const last = (e.getData('lastTick') as number | undefined) ?? time;
  e.setData('lastTick', time);
  const seconds = Math.min(0.1, (time - last) / 1000);
  const p = world.player;
  const sees =
    !isHacked(e) && Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y) < stats.sight && world.canSee(e, p);
  if (sees) e.setData('angryUntil', time + 3000);
  const speed = time < (e.getData('angryUntil') ?? 0) ? SWEEPER.angrySpeed : SWEEPER.turnSpeed;
  const spin = (e.getData('spin') as number | undefined) ?? 1;
  e.setData('beam', ((e.getData('beam') as number | undefined) ?? 0) + spin * speed * seconds);
  e.setRotation(e.getData('beam') as number);
}

function updateTurret(e: Sprite, world: EnemyWorld, time: number, stats: EnemyStats) {
  const barrel = e.getData('barrel') as Phaser.GameObjects.Image;
  let target: Point | null = null;

  if (isHacked(e)) {
    let best = stats.sight;
    for (const h of world.hostiles()) {
      if (h === e) continue;
      const d = Phaser.Math.Distance.Between(e.x, e.y, h.x, h.y);
      if (d < best && world.canSee(e, h)) {
        best = d;
        target = h;
      }
    }
  } else {
    const p = world.player;
    if (Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y) < stats.sight && world.canSee(e, p)) target = p;
  }

  if (!target) {
    barrel.rotation += 0.004; // idle sweep
    e.setData('tracking', false);
    return;
  }
  // Newly spotted you: a short lock-on (shown as a laser sight) before the first shot.
  if (!isHacked(e) && !e.getData('tracking')) {
    e.setData({ tracking: true, nextShot: Math.max(e.getData('nextShot') ?? 0, time + TURRET_LOCK_MS) });
  }
  const want = Phaser.Math.Angle.Between(e.x, e.y, target.x, target.y);
  barrel.rotation = Phaser.Math.Angle.RotateTo(barrel.rotation, want, 0.06);
  const aligned = Math.abs(Phaser.Math.Angle.Wrap(want - barrel.rotation)) < 0.15;
  if (aligned && time > (e.getData('nextShot') ?? 0)) {
    e.setData('nextShot', time + (isHacked(e) ? TURRET_COOLDOWN * 0.6 : TURRET_COOLDOWN));
    const mx = e.x + Math.cos(barrel.rotation) * 10;
    const my = e.y + Math.sin(barrel.rotation) * 10;
    if (isHacked(e)) world.shootAtEnemies(mx, my, barrel.rotation);
    else world.shootAtPlayer(mx, my, barrel.rotation, 210, 9, 'bullet');
  }
}

/**
 * Raiders keep a firing distance and shoot in bursts when they see you;
 * otherwise they go after loose salvage until their packs are full, then hunt you.
 */
function updateRaider(e: Sprite, world: EnemyWorld, time: number, stats: EnemyStats, dist: number, sees: boolean) {
  const p = world.player;
  if (sees) {
    const a = Phaser.Math.Angle.Between(e.x, e.y, p.x, p.y);
    e.setRotation(a);
    if (dist > 140) world.followPath(e, p, stats.speed);
    else if (dist < 80) e.setVelocity(-Math.cos(a) * stats.speed, -Math.sin(a) * stats.speed);
    else e.setVelocity(Math.cos(a + Math.PI / 2) * 20, Math.sin(a + Math.PI / 2) * 20); // sidestep
    if (time > (e.getData('nextShot') ?? 0)) {
      e.setData('nextShot', time + RAIDER_COOLDOWN);
      for (let i = 0; i < 3; i++) {
        e.scene.time.delayedCall(i * 110, () => {
          if (!e.active) return;
          const aim = Phaser.Math.Angle.Between(e.x, e.y, p.x, p.y) + Phaser.Math.FloatBetween(-0.08, 0.08);
          world.shootAtPlayer(e.x + Math.cos(aim) * 9, e.y + Math.sin(aim) * 9, aim, 230, 6, 'bullet');
        });
      }
    }
    return;
  }

  const carrying = (e.getData('loot') as number[] | undefined)?.length ?? 0;
  if (carrying < RIVAL_CARRY_LIMIT) {
    let target = e.getData('lootTarget') as Sprite | null;
    if (!target?.active || time > (e.getData('retargetAt') ?? 0)) {
      target = world.nearestSalvage(e);
      e.setData({ lootTarget: target, retargetAt: time + RETARGET_MS });
    }
    if (target?.active) {
      if (Phaser.Math.Distance.Between(e.x, e.y, target.x, target.y) < 10) {
        world.steal(e, target);
        e.setData('lootTarget', null);
      } else {
        world.followPath(e, target, stats.speed);
      }
      faceVelocity(e);
      return;
    }
  }
  world.followPath(e, p, stats.speed);
  faceVelocity(e);
}

function wander(e: Sprite, time: number, speed: number) {
  if (time < (e.getData('nextWander') ?? 0)) return;
  const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
  const s = Phaser.Math.Between(0, 1) ? speed : 0;
  e.setVelocity(Math.cos(a) * s, Math.sin(a) * s);
  e.setData('nextWander', time + Phaser.Math.Between(900, 2400));
}

function faceVelocity(e: Sprite) {
  const v = e.body?.velocity;
  if (v && Math.abs(v.x) + Math.abs(v.y) > 4) e.setRotation(Math.atan2(v.y, v.x));
}
