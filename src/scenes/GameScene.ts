import Phaser from 'phaser';
import { TILE_SIZE } from '../art/sprites';
import { ensureCharacterTexture } from '../art/textures';
import { isResearchUnlocked, nextLogFor, type LogEntry } from '../core/codex';
import { generateDeck, type Deck } from '../core/deckGenerator';
import {
  SOLID_DISPLAY_TILES,
  buildDisplayMap,
  displayTileAt,
  lampPositions,
} from '../core/display';
import {
  createOxygen,
  isOxygenEmpty,
  refillOxygen,
  spendOxygen,
  tickOxygen,
  type OxygenState,
} from '../core/oxygen';
import { hasLineOfSight } from '../core/pathing';
import { applyRunResult, computeRunStats, type RunStats, type SaveData } from '../core/progression';
import { hashString, type ResolvedSeed } from '../core/seed';
import { ENEMY_KINDS, Tile, type EnemyKind, type Point } from '../core/types';
import { WEAPONS, pelletAngles, type WeaponDef } from '../core/weapons';
import { loadSave, storeSave } from '../storage';
import { TouchControls } from '../ui/TouchControls';
import { ENEMY_STATS, isHacked, kindOf, updateEnemy, type EnemyWorld } from './enemies';

type Sprite = Phaser.Physics.Arcade.Sprite;
type Keys = Record<
  'W' | 'A' | 'S' | 'D' | 'UP' | 'LEFT' | 'DOWN' | 'RIGHT' | 'Q' | 'F' | 'R' | 'ENTER' | 'ONE' | 'TWO',
  Phaser.Input.Keyboard.Key
>;

const PLAYER_SPEED = 110;
const TORCH_COST = 4;
const SUFFOCATION_DPS = 6;
const HACK_RANGE = 32;
const HACK_BREAK_RANGE = 46;
const DARKNESS = { freighter: 0.6, research: 0.7 } as const;

const FONT = { fontFamily: 'monospace', fontSize: '10px', color: '#d7e3ff' };

const toWorld = (p: Point) => ({
  x: p.x * TILE_SIZE + TILE_SIZE / 2,
  y: p.y * TILE_SIZE + TILE_SIZE / 2,
});

interface Hack {
  target: Sprite;
  progress: number;
}

export class GameScene extends Phaser.Scene implements EnemyWorld {
  private run!: ResolvedSeed;
  private deck!: Deck;
  private seedHash = 0;
  /** Live collision grid (weak walls become floor when cut). */
  private grid!: Tile[][];
  private layer!: Phaser.Tilemaps.TilemapLayer;

  player!: Sprite;
  private playerShadow!: Phaser.GameObjects.Image;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private hostileShots!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.StaticGroup;
  private caches!: Phaser.Physics.Arcade.StaticGroup;
  private exitPad!: Phaser.Physics.Arcade.Image;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private muzzle!: Phaser.GameObjects.Image;
  private lamps: Phaser.GameObjects.Image[] = [];

  private keys!: Keys;
  private touch!: TouchControls;
  private darkness!: Phaser.GameObjects.RenderTexture;
  private hud!: Phaser.GameObjects.Graphics;
  private hackGfx!: Phaser.GameObjects.Graphics;
  private hpLabel!: Phaser.GameObjects.Text;
  private o2Label!: Phaser.GameObjects.Text;
  private salvageText!: Phaser.GameObjects.Text;
  private weaponText!: Phaser.GameObjects.Text;
  private seedText!: Phaser.GameObjects.Text;
  private endScreen: Phaser.GameObjects.GameObject[] = [];
  private banners: Phaser.GameObjects.GameObject[] = [];

  // Run state — reset in init() because Phaser reuses the scene instance on restart.
  private saveAtStart!: SaveData;
  private stats!: RunStats;
  private pendingLog: LogEntry | null = null;
  private logsFound: string[] = [];
  private walkAnim = '';
  private hp = 100;
  private kills = 0;
  private secondWindUsed = false;
  private oxygen: OxygenState = createOxygen();
  private salvage = 0;
  private weapons: WeaponDef[] = [];
  private weaponIndex = 0;
  private lastShotAt = 0;
  private lastToolAt = 0;
  private invulnerableUntil = 0;
  private hack: Hack | null = null;
  private ended = false;

  constructor() {
    super('Game');
  }

  init(data: ResolvedSeed) {
    this.run = { ...data, ship: data.ship ?? 'freighter' };
    this.seedHash = hashString(data.seed);
    this.saveAtStart = loadSave();
    this.stats = computeRunStats(this.saveAtStart);
    this.pendingLog = nextLogFor(this.saveAtStart.codex, this.run.ship);
    this.logsFound = [];
    this.hp = this.stats.maxHp;
    this.oxygen = createOxygen(this.stats.capacity, this.stats.drainPerSecond);
    this.salvage = 0;
    this.kills = 0;
    this.secondWindUsed = false;
    this.weapons = [...this.stats.guns];
    this.weaponIndex = 0;
    this.lastShotAt = 0;
    this.lastToolAt = 0;
    this.invulnerableUntil = 0;
    this.hack = null;
    this.ended = false;
    this.lamps = [];
    this.endScreen = [];
    this.banners = [];
  }

  create() {
    this.physics.resume();
    this.deck = generateDeck(this.run.seed, this.run.ship);
    this.grid = this.deck.tiles.map((row) => [...row]);

    this.buildMap();
    this.spawnEntities();
    this.setupInput();
    this.setupCollisions();
    this.buildHud();
    this.showIntro();

    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      this.touch.destroy();
    });
    this.layout();
  }

  // ---------------------------------------------------------------- setup

  private buildMap() {
    const display = buildDisplayMap(this.deck.tiles, this.seedHash);
    const map = this.make.tilemap({ data: display, tileWidth: TILE_SIZE, tileHeight: TILE_SIZE });
    const tileset = map.addTilesetImage('tiles', `tiles-${this.run.ship}`, TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) throw new Error('Tileset missing');
    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) throw new Error('Layer missing');
    this.layer = layer;
    this.layer.setCollision([...SOLID_DISPLAY_TILES]);

    // Blinking warning lamps on some bulkheads.
    for (const p of lampPositions(display, this.seedHash)) {
      const lamp = this.add.image(p.x * TILE_SIZE + 8, p.y * TILE_SIZE + 9, 'lamp').setDepth(3);
      if (this.run.ship === 'research') lamp.setTint(0x9bff5c);
      this.tweens.add({
        targets: lamp,
        alpha: 0.25,
        yoyo: true,
        repeat: -1,
        duration: 500 + ((p.x * 37 + p.y * 11) % 600),
      });
      this.lamps.push(lamp);
    }

    const w = this.deck.width * TILE_SIZE;
    const h = this.deck.height * TILE_SIZE;
    this.physics.world.setBounds(0, 0, w, h);
    this.cameras.main.setBounds(0, 0, w, h).setRoundPixels(true);
  }

  private spawnEntities() {
    const exit = toWorld(this.deck.extraction);
    this.exitPad = this.physics.add.staticImage(exit.x, exit.y, 'exit').setDepth(2);
    this.tweens.add({ targets: this.exitPad, alpha: 0.55, yoyo: true, repeat: -1, duration: 700 });

    this.pickups = this.physics.add.staticGroup();
    this.caches = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.hostileShots = this.physics.add.group();

    for (const s of this.deck.spawns) {
      const { x, y } = toWorld(s);
      switch (s.kind) {
        case 'oxygen':
        case 'salvage':
          this.addPickup(x, y, s.kind, s.value);
          break;
        case 'cache': {
          const cache = this.caches.create(x, y, 'cache', 0) as Sprite;
          cache.setDepth(5).setData({ value: s.value, open: false });
          break;
        }
        case 'datalog':
          // The slot is always generated (so layouts don't depend on the save); it's only filled if a log is left to find.
          if (this.pendingLog) this.addPickup(x, y, 'datalog', 0);
          break;
        default:
          if (ENEMY_KINDS.includes(s.kind)) this.spawnEnemy(s.kind, x, y);
      }
    }

    const start = toWorld(this.deck.start);
    this.playerShadow = this.add.image(start.x, start.y + 7, 'shadow').setDepth(4);
    const look = ensureCharacterTexture(this, this.stats.character.id, this.stats.colours);
    this.walkAnim = look.walk;
    this.player = this.physics.add.sprite(start.x, start.y, look.texture, 0);
    this.player.setDepth(11).setCircle(5, 3, 3).setCollideWorldBounds(true);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    this.muzzle = this.add.image(0, 0, 'flash').setDepth(13).setVisible(false);
    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 30, max: 140 },
      lifespan: { min: 150, max: 380 },
      scale: { start: 1, end: 0 },
      tint: [0xffd166, 0xff7b3a, 0xffffff],
      emitting: false,
    });
    this.sparks.setDepth(20);
    this.hackGfx = this.add.graphics().setDepth(14);

    this.darkness = this.add
      .renderTexture(0, 0, this.scale.width, this.scale.height)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(90);
  }

  private setupInput() {
    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard input unavailable');
    // No key capture, so typing still works in the hub after a run.
    this.keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,Q,F,R,ENTER,ONE,TWO', false) as Keys;
    this.input.mouse?.disableContextMenu();
    this.input.on('wheel', () => this.switchWeapon());
    this.touch = new TouchControls(this, this.stats.tool.id === 'hacker' ? 'HACK' : 'TORCH');
  }

  private setupCollisions() {
    const solid = (_a: unknown, e: unknown) => ENEMY_STATS[kindOf(e as Sprite)].solid;
    this.physics.add.collider(this.player, this.layer);
    this.physics.add.collider(this.player, this.caches);
    this.physics.add.collider(this.player, this.enemies, undefined, solid);
    this.physics.add.collider(this.enemies, this.layer);
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.collider(this.enemies, this.caches);

    const spark = (b: unknown) => {
      const shot = b as Sprite;
      this.sparks.explode(3, shot.x, shot.y);
      shot.destroy();
    };
    this.physics.add.collider(this.bullets, this.layer, spark);
    this.physics.add.collider(this.bullets, this.caches, spark);
    this.physics.add.collider(this.hostileShots, this.layer, spark);
    this.physics.add.collider(this.hostileShots, this.caches, spark);

    this.physics.add.overlap(this.bullets, this.enemies, (b, e) => this.hitEnemy(b as Sprite, e as Sprite));
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => {
      const enemy = e as Sprite;
      const damage = ENEMY_STATS[kindOf(enemy)].contactDamage;
      if (damage > 0 && !isHacked(enemy)) this.hurtPlayer(damage, enemy);
    });
    this.physics.add.overlap(this.player, this.hostileShots, (_p, s) => {
      const shot = s as Sprite;
      if (!shot.active) return;
      this.hurtPlayer(shot.getData('damage') as number);
      this.sparks.explode(6, shot.x, shot.y);
      shot.destroy();
    });
    this.physics.add.overlap(this.player, this.pickups, (_p, item) => this.collect(item as Sprite));
    this.physics.add.overlap(this.player, this.exitPad, () => this.endRun(true));
  }

  private buildHud() {
    const fixed = (t: Phaser.GameObjects.Text) => t.setScrollFactor(0).setDepth(101);
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hpLabel = fixed(this.add.text(0, 0, 'HP', FONT));
    this.o2Label = fixed(this.add.text(0, 0, this.isRobot ? 'PWR' : 'O₂', FONT));
    this.salvageText = fixed(this.add.text(0, 0, '', FONT).setOrigin(1, 0));
    this.weaponText = fixed(this.add.text(0, 0, '', FONT));
    const label = this.run.mode === 'daily' ? this.run.seed.toUpperCase() : `SEED ${this.run.seed}`;
    this.seedText = fixed(this.add.text(0, 0, label, { ...FONT, color: '#6f7fa3' }).setOrigin(1, 0));
  }

  /** Positions screen-space UI. Runs on start and whenever the window changes shape. */
  private layout() {
    const { width: w, height: h } = this.scale;
    this.cameras.main.setSize(w, h);
    this.darkness.resize(w, h);
    this.hpLabel.setPosition(8, 6);
    this.o2Label.setPosition(8, 18);
    this.salvageText.setPosition(w - 8, 6);
    this.seedText.setPosition(w - 8, 18);
    this.weaponText.setPosition(8, 32);
    this.touch.layout(w, h);
  }

  private showIntro() {
    const { width: w, height: h } = this.scale;
    const hacker = this.stats.tool.id === 'hacker';
    const toolHint = hacker ? 'hack turrets + locked caches (stay close)' : 'torch cracked walls';
    const help = this.touch.enabled
      ? `Left thumb: move · right thumb: aim + fire\nGUN: swap · ${hacker ? 'HACK' : 'TORCH'}: ${toolHint}\nReach the green EXIT`
      : `WASD move · mouse aim + fire · Q swap gun\nF / right-click: ${toolHint} · reach the green EXIT`;
    const title = this.run.ship === 'research' ? 'BOARDING RESEARCH VESSEL' : 'BOARDING DERELICT';
    const titleText = this.add
      .text(w / 2, h * 0.22, title, { ...FONT, fontSize: '16px', color: this.run.ship === 'research' ? '#9bff5c' : '#ffd166' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    const hint = this.add
      .text(w / 2, h * 0.68, help, { ...FONT, fontSize: '9px', color: '#9fb0d0', align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    this.tweens.add({ targets: titleText, alpha: 0, delay: 1800, duration: 600 });
    this.tweens.add({ targets: hint, alpha: 0, delay: 7000, duration: 800 });
  }

  // ---------------------------------------------------------------- EnemyWorld

  canSee(from: Point, to: Point): boolean {
    return hasLineOfSight(this.grid, this.tileAt(from.x, from.y), this.tileAt(to.x, to.y));
  }

  hostiles(): Sprite[] {
    return (this.enemies.getChildren() as Sprite[]).filter((e) => e.active && !isHacked(e));
  }

  shootAtPlayer(x: number, y: number, angle: number, speed: number, damage: number, texture: string) {
    const shot = this.hostileShots.create(x, y, texture) as Sprite;
    shot.setDepth(12).setCircle(2).setRotation(angle).setData('damage', damage);
    if (texture === 'bullet') shot.setTint(0xff5a6a);
    shot.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.time.delayedCall(2200, () => shot.destroy());
  }

  shootAtEnemies(x: number, y: number, angle: number) {
    this.makeBullet(x, y, angle, WEAPONS.blaster).setTint(0x5ef2ff);
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number): Sprite {
    const stats = ENEMY_STATS[kind];
    const e = this.enemies.create(x, y, kind, 0) as Sprite;
    e.setDepth(10).setCircle(stats.radius, stats.offset, stats.offset).setCollideWorldBounds(true);
    e.setData({ kind, hp: stats.hp, alertUntil: 0, nextWander: 0, nextShot: 0, hacked: false });
    if (stats.solid) e.setImmovable(true).setPushable(false);
    if (stats.shadowY) e.setData('shadow', this.add.image(x, y + stats.shadowY, 'shadow').setDepth(4));
    if (kind === 'drone') e.anims.play({ key: 'drone-idle', startFrame: Math.round(x + y) % 2 });
    if (kind === 'crawler') e.anims.play('crawler-run');
    if (kind === 'egg') e.anims.play({ key: 'egg-pulse', startFrame: Math.round(x) % 2 });
    if (kind === 'turret') {
      e.setData('barrel', this.add.image(x, y, 'barrel').setOrigin(0.2, 0.5).setDepth(11));
    }
    return e;
  }

  moveTowards(e: Sprite, target: Point, speed: number) {
    this.physics.moveTo(e, target.x, target.y, speed);
  }

  // ---------------------------------------------------------------- loop

  update(time: number, delta: number) {
    this.touch.draw();
    if (this.ended) return;
    const seconds = delta / 1000;

    this.updatePlayer(time);
    for (const e of this.enemies.getChildren() as Sprite[]) if (e.active) updateEnemy(e, this, time);
    this.updateHack(seconds);

    this.oxygen = tickOxygen(this.oxygen, seconds);
    if (isOxygenEmpty(this.oxygen)) {
      this.hp -= SUFFOCATION_DPS * seconds;
      if (this.hp <= 0) return this.endRun(false, this.isRobot ? 'Battery flat' : 'Oxygen depleted');
    }

    this.drawLighting();
    this.drawHud();
  }

  private updatePlayer(time: number) {
    const k = this.keys;
    const t = this.touch;
    let ix = Number(k.D.isDown || k.RIGHT.isDown) - Number(k.A.isDown || k.LEFT.isDown);
    let iy = Number(k.S.isDown || k.DOWN.isDown) - Number(k.W.isDown || k.UP.isDown);
    const keyLen = Math.hypot(ix, iy) || 1;
    ix /= keyLen;
    iy /= keyLen;
    if (t.move.magnitude > 0) {
      ix = t.move.x;
      iy = t.move.y;
    }
    const speed = PLAYER_SPEED * this.stats.speedMultiplier;
    this.player.setVelocity(ix * speed, iy * speed);
    const moving = Math.abs(ix) + Math.abs(iy) > 0.05;
    if (moving) this.player.anims.play(this.walkAnim, true);
    else this.player.anims.stop();
    this.playerShadow.setPosition(this.player.x, this.player.y + 7);

    // Aim: touch aim stick, else mouse, else face the direction of travel.
    let aim = this.player.rotation;
    if (t.enabled) {
      if (t.aim.magnitude > 0) aim = t.aim.angle;
      else if (moving) aim = Math.atan2(iy, ix);
    } else {
      const pointer = this.input.activePointer;
      const target = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      aim = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    }
    this.player.setRotation(aim);

    if (Phaser.Input.Keyboard.JustDown(k.Q) || t.consume('swap')) this.switchWeapon();
    if (Phaser.Input.Keyboard.JustDown(k.ONE)) this.weaponIndex = 0;
    if (Phaser.Input.Keyboard.JustDown(k.TWO)) this.weaponIndex = 1;

    const pointer = this.input.activePointer;
    const mouseFire = !t.enabled && pointer.leftButtonDown();
    const weapon = this.weapons[this.weaponIndex];
    if ((mouseFire || t.firing) && time > this.lastShotAt + weapon.cooldownMs) {
      this.lastShotAt = time;
      this.fire(weapon, aim);
    }

    const tool =
      Phaser.Input.Keyboard.JustDown(k.F) || t.consume('torch') || (!t.enabled && pointer.rightButtonDown());
    if (tool && time > this.lastToolAt + 300) {
      this.lastToolAt = time;
      if (this.stats.tool.id === 'hacker') this.startHack();
      else this.useTorch(aim);
    }
  }

  // ---------------------------------------------------------------- actions

  private switchWeapon() {
    this.weaponIndex = (this.weaponIndex + 1) % this.weapons.length;
  }

  private makeBullet(x: number, y: number, angle: number, weapon: WeaponDef): Sprite {
    const b = this.bullets.create(x, y, 'bullet') as Sprite;
    b.setDepth(12).setCircle(2).setRotation(angle);
    b.setVelocity(Math.cos(angle) * weapon.bulletSpeed, Math.sin(angle) * weapon.bulletSpeed);
    b.setData({ damage: weapon.damage, pierce: weapon.pierce, hit: new Set<Sprite>() });
    this.time.delayedCall(weapon.lifetimeMs, () => b.destroy());
    return b;
  }

  private fire(weapon: WeaponDef, aim: number) {
    for (const angle of pelletAngles(weapon, aim)) {
      const b = this.makeBullet(
        this.player.x + Math.cos(angle) * 9,
        this.player.y + Math.sin(angle) * 9,
        angle,
        weapon,
      );
      if (weapon.pierce) b.setScale(1.5).setTint(0x9fe8ff);
    }
    this.muzzle
      .setPosition(this.player.x + Math.cos(aim) * 11, this.player.y + Math.sin(aim) * 11)
      .setRotation(aim)
      .setVisible(true);
    this.time.delayedCall(45, () => this.muzzle.setVisible(false));
    this.cameras.main.shake(40, weapon.pellets > 1 ? 0.004 : 0.0015);
  }

  /** Cuts a weak wall directly in front of the player. */
  private useTorch(aim: number) {
    for (const reach of [10, 18, 26]) {
      const t = this.tileAt(
        this.player.x + Math.cos(aim) * reach,
        this.player.y + Math.sin(aim) * reach,
      );
      if (this.grid[t.y]?.[t.x] !== Tile.WeakWall) continue;

      this.cutTile(t.x, t.y);
      // A weak wall can be two tiles thick; open the neighbour in the same line too.
      const nx = t.x + Math.round(Math.cos(aim));
      const ny = t.y + Math.round(Math.sin(aim));
      if (this.grid[ny]?.[nx] === Tile.WeakWall) this.cutTile(nx, ny);

      this.oxygen = spendOxygen(this.oxygen, this.hasPerk('cold-cutter') ? 1 : TORCH_COST);
      const w = toWorld(t);
      this.sparks.explode(24, w.x, w.y);
      this.cameras.main.shake(120, 0.006);
      this.floatText(w.x, w.y - 8, 'CUT', '#ffd166');
      return;
    }
  }

  private cutTile(x: number, y: number) {
    this.grid[y][x] = Tile.Floor;
    // Redraw this tile and its neighbours so wall faces and shadows stay correct.
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = x + dx;
        const ty = y + dy;
        if (this.grid[ty]?.[tx] === undefined) continue;
        this.layer.putTileAt(displayTileAt(this.grid, tx, ty, this.seedHash), tx, ty);
      }
    }
  }

  /** Things the hacking tool works on: hostile turrets and locked caches. */
  private hackables(): Sprite[] {
    const turrets = (this.enemies.getChildren() as Sprite[]).filter(
      (e) => e.active && kindOf(e) === 'turret' && !isHacked(e),
    );
    const caches = (this.caches.getChildren() as Sprite[]).filter((c) => !c.getData('open'));
    return [...turrets, ...caches];
  }

  private startHack() {
    const near = this.hackables()
      .map((t) => ({ t, d: Phaser.Math.Distance.Between(this.player.x, this.player.y, t.x, t.y) }))
      .filter(({ d }) => d <= HACK_RANGE)
      .sort((a, b) => a.d - b.d)[0];
    if (!near) {
      this.floatText(this.player.x, this.player.y - 12, 'NOTHING TO HACK', '#9fb0d0');
      return;
    }
    if (this.hack?.target === near.t) return;
    this.hack = { target: near.t, progress: 0 };
  }

  private updateHack(seconds: number) {
    const g = this.hackGfx.clear();
    if (!this.hack) return;
    const { target } = this.hack;
    const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, target.x, target.y);
    if (!target.active || d > HACK_BREAK_RANGE) {
      this.floatText(this.player.x, this.player.y - 12, 'HACK LOST', '#ff5a6a');
      this.hack = null;
      return;
    }
    this.hack.progress += seconds / this.stats.hackSeconds;
    const start = -Math.PI / 2;
    g.lineStyle(3, 0x0d1220, 0.8).strokeCircle(target.x, target.y, 12);
    g.lineStyle(2, 0x5ef2ff, 1).beginPath();
    g.arc(target.x, target.y, 12, start, start + Math.PI * 2 * Math.min(1, this.hack.progress));
    g.strokePath();
    if (this.hack.progress >= 1) {
      this.completeHack(target);
      this.hack = null;
    }
  }

  private completeHack(target: Sprite) {
    if (target.getData('kind') === 'turret') {
      target.setData('hacked', true).setFrame(1);
      (target.getData('barrel') as Phaser.GameObjects.Image).setTint(0x9ff6ff);
      this.floatText(target.x, target.y - 12, 'TURRET HACKED', '#5ef2ff');
    } else {
      target.setData('open', true).setFrame(1);
      const a = Phaser.Math.Angle.Between(target.x, target.y, this.player.x, this.player.y);
      this.addPickup(target.x + Math.cos(a) * 14, target.y + Math.sin(a) * 14, 'salvage', target.getData('value'));
      this.floatText(target.x, target.y - 12, 'CACHE OPEN', '#3dff9a');
    }
    this.sparks.explode(14, target.x, target.y);
  }

  private hitEnemy(bullet: Sprite, enemy: Sprite) {
    if (!bullet.active || !enemy.active || isHacked(enemy)) return;
    const already = bullet.getData('hit') as Set<Sprite>;
    if (already.has(enemy)) return;
    already.add(enemy);
    const hp = enemy.getData('hp') - bullet.getData('damage');
    const angle = Math.atan2(bullet.body!.velocity.y, bullet.body!.velocity.x);
    if (!bullet.getData('pierce')) bullet.destroy();
    enemy.setData({ hp, alertUntil: this.time.now + 4000 });
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(60, () => enemy.active && enemy.clearTint());
    if (!ENEMY_STATS[kindOf(enemy)].solid) enemy.setVelocity(Math.cos(angle) * 140, Math.sin(angle) * 140);
    if (hp <= 0) this.killEnemy(enemy);
  }

  private killEnemy(enemy: Sprite) {
    const kind = kindOf(enemy);
    const alien = kind === 'crawler' || kind === 'spitter' || kind === 'egg';
    this.sparks.explode(alien ? 18 : 30, enemy.x, enemy.y);
    const ring = this.add.circle(enemy.x, enemy.y, 4).setStrokeStyle(2, alien ? 0x9bff5c : 0xffd166).setDepth(19);
    this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
    this.cameras.main.shake(80, 0.006);
    (enemy.getData('shadow') as Phaser.GameObjects.Image | undefined)?.destroy();
    (enemy.getData('barrel') as Phaser.GameObjects.Image | undefined)?.destroy();
    const parent = enemy.getData('parent') as Sprite | undefined;
    if (parent?.active) parent.setData('brood', Math.max(0, (parent.getData('brood') ?? 1) - 1));
    this.kills += 1;

    const [chance, min, max] = ENEMY_STATS[kind].drop;
    if (this.hasPerk('scrapper')) this.addPickup(enemy.x, enemy.y, 'salvage', Phaser.Math.Between(Math.max(min, 5), Math.max(max, 10)));
    else if (Math.random() < chance) this.addPickup(enemy.x, enemy.y, 'salvage', Phaser.Math.Between(min, max));
    enemy.destroy();
  }

  private hurtPlayer(amount: number, source?: Sprite) {
    if (this.time.now < this.invulnerableUntil || this.ended) return;
    this.invulnerableUntil = this.time.now + 800;
    this.hp -= amount * (1 - this.stats.armour);
    if (this.hp <= 0 && this.hasPerk('second-wind') && !this.secondWindUsed) {
      this.secondWindUsed = true;
      this.hp = 1;
      this.invulnerableUntil = this.time.now + 2000;
      this.floatText(this.player.x, this.player.y - 12, 'SECOND WIND', '#3dff9a');
    }
    this.cameras.main.shake(140, 0.012);
    this.cameras.main.flash(80, 120, 0, 0);
    this.player.setTintFill(0xff5566);
    this.time.delayedCall(90, () => this.player.clearTint());
    this.tweens.add({ targets: this.player, alpha: 0.3, yoyo: true, repeat: 3, duration: 90 });

    if (source && !ENEMY_STATS[kindOf(source)].solid) {
      const a = Phaser.Math.Angle.Between(source.x, source.y, this.player.x, this.player.y);
      source.setVelocity(-Math.cos(a) * 120, -Math.sin(a) * 120);
    }
    if (this.hp <= 0) this.endRun(false, this.isRobot ? 'Chassis destroyed' : 'Hull breach — salvager lost');
  }

  private collect(item: Sprite) {
    if (!item.active) return;
    const kind = item.getData('kind') as string;
    const value = item.getData('value') as number;
    if (kind === 'oxygen') {
      this.oxygen = refillOxygen(this.oxygen, value);
      this.floatText(item.x, item.y, `+${value} ${this.isRobot ? 'PWR' : 'O₂'}`, this.isRobot ? '#ffd166' : '#6fd6ff');
    } else if (kind === 'datalog' && this.pendingLog) {
      this.logsFound.push(this.pendingLog.id);
      this.showBanner('DATA LOG RECOVERED', this.pendingLog.title);
      this.pendingLog = null;
    } else {
      const amount = this.hasPerk('scavenger') ? Math.round(value * 1.25) : value;
      this.salvage += amount;
      this.floatText(item.x, item.y, `+${amount}`, '#e8b04a');
    }
    item.destroy();
  }

  private endRun(extracted: boolean, reason = '') {
    if (this.ended) return;
    this.ended = true;
    this.physics.pause();
    this.player.anims.stop();
    this.hackGfx.clear();
    for (const b of this.banners) b.destroy();
    this.drawHud();

    const before = loadSave();
    const after = applyRunResult(before, {
      extracted,
      salvage: this.salvage,
      dronesDestroyed: this.kills,
      logsFound: this.logsFound,
    });
    storeSave(after);
    const bonus = after.rewards.length > before.rewards.length;
    const banked = after.credits - before.credits;
    const newBest = extracted && this.salvage > before.stats.bestHaul;
    const unlockedResearch = !isResearchUnlocked(before.codex) && isResearchUnlocked(after.codex);

    const { width: w, height: h } = this.scale;
    const ui = <T extends Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle>(o: T) => {
      o.setScrollFactor(0).setDepth(300);
      this.endScreen.push(o);
      return o;
    };

    ui(this.add.rectangle(w / 2, h / 2, w, h, 0x05070c, 0.82));
    ui(
      this.add
        .text(w / 2, h / 2 - 62, extracted ? 'EXTRACTED' : 'SIGNAL LOST', {
          ...FONT,
          fontSize: '20px',
          color: extracted ? '#3dff9a' : '#ff3b4e',
        })
        .setOrigin(0.5),
    );
    const lines = extracted
      ? [`Salvage banked: ${this.salvage}${newBest ? '  (new best!)' : ''}`]
      : [reason, `Salvage lost: ${this.salvage}`];
    lines.push(`Hostiles destroyed: ${this.kills}`);
    if (this.logsFound.length) lines.push(`Data log kept: ${this.logsFound.length}`);
    if (bonus) lines.push('Chapter complete! +bonus salvage');
    if (unlockedResearch) lines.push('NEW DESTINATION: research vessels');
    lines.push(`Ship's hold: ${after.credits}${bonus && !extracted ? ` (+${banked})` : ''}`);
    ui(this.add.text(w / 2, h / 2 - 12, lines.join('\n'), { ...FONT, fontSize: '11px', align: 'center' }).setOrigin(0.5));

    const retry = () => this.scene.restart(this.run);
    const hub = () => {
      try {
        window.history.replaceState(null, '', window.location.pathname);
      } catch {
        /* ignore */
      }
      this.scene.start('Hub');
    };

    const button = (y: number, label: string, onTap: () => void) =>
      ui(
        this.add
          .text(w / 2, y, label, {
            ...FONT,
            fontSize: '11px',
            backgroundColor: '#1b2333',
            padding: { x: 10, y: 5 },
          })
          .setOrigin(0.5)
          .setInteractive({ useHandCursor: true })
          .on('pointerover', function (this: Phaser.GameObjects.Text) {
            this.setColor('#ffd166');
          })
          .on('pointerout', function (this: Phaser.GameObjects.Text) {
            this.setColor('#d7e3ff');
          })
          .on('pointerup', onTap),
      );

    // Short delay so a held trigger doesn't skip the results screen.
    const top = h / 2 + 22 + lines.length * 6;
    this.time.delayedCall(400, () => {
      button(top, this.touch.enabled ? 'RETURN TO SHIP' : 'RETURN TO SHIP  [ENTER]', hub);
      button(top + 26, this.touch.enabled ? 'RETRY THIS DERELICT' : 'RETRY THIS DERELICT  [R]', retry);
      this.input.keyboard?.once('keydown-ENTER', hub);
      this.input.keyboard?.once('keydown-R', retry);
    });
  }

  // ---------------------------------------------------------------- drawing

  /** Darkens the ship, then cuts soft light holes for the player, exit, lamps and glowing things. */
  private drawLighting() {
    const view = this.cameras.main.worldView;
    const rt = this.darkness;
    rt.clear().fill(0x000000, DARKNESS[this.run.ship]);
    const light = (key: string, x: number, y: number, size: number) => {
      if (x < view.x - size || x > view.right + size || y < view.y - size || y > view.bottom + size) return;
      rt.erase(key, x - view.x - size, y - view.y - size);
    };
    light('light', this.player.x, this.player.y, 120);
    light('light-small', this.exitPad.x, this.exitPad.y, 32);
    for (const lamp of this.lamps) light('light-small', lamp.x, lamp.y + 8, 32);
    for (const e of this.enemies.getChildren() as Sprite[]) {
      if (e.active && kindOf(e) === 'egg') light('light-small', e.x, e.y, 32);
    }
    for (const p of this.pickups.getChildren() as Sprite[]) {
      if (p.active && p.getData('kind') === 'datalog') light('light-small', p.x, p.y, 32);
    }
  }

  private drawHud() {
    const g = this.hud.clear();
    const bar = (y: number, value: number, max: number, colour: number) => {
      g.fillStyle(0x0d1220, 0.9).fillRect(26, y, 82, 7);
      g.fillStyle(colour).fillRect(27, y + 1, Math.max(0, (value / max) * 80), 5);
    };
    bar(8, this.hp, this.stats.maxHp, 0xff3b4e);
    const low = this.oxygen.current < 25 && Math.floor(this.time.now / 250) % 2 === 0;
    bar(20, this.oxygen.current, this.oxygen.max, low ? 0xffffff : this.isRobot ? 0xffc23d : 0x3fa7ff);

    this.salvageText.setText(`SALVAGE ${this.salvage}`);
    const guns = this.weapons.map((w, i) => (i === this.weaponIndex ? `[${w.name}]` : ` ${w.name} `)).join(' ');
    this.weaponText.setText(`${guns}  · ${this.stats.tool.id === 'hacker' ? 'HACK' : 'TORCH'}`);

    // Arrow round the player pointing at the extraction pad.
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.exitPad.x, this.exitPad.y);
    if (dist < 120) return;
    const cam = this.cameras.main.worldView;
    const cx = this.player.x - cam.x;
    const cy = this.player.y - cam.y;
    const a = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.exitPad.x, this.exitPad.y);
    const r = 20;
    g.fillStyle(0x3dff9a, 0.8).fillTriangle(
      cx + Math.cos(a) * (r + 5),
      cy + Math.sin(a) * (r + 5),
      cx + Math.cos(a - 0.25) * r,
      cy + Math.sin(a - 0.25) * r,
      cx + Math.cos(a + 0.25) * r,
      cy + Math.sin(a + 0.25) * r,
    );
  }

  private showBanner(title: string, subtitle: string) {
    const { width: w } = this.scale;
    const bg = this.add.rectangle(w / 2, 62, Math.min(w - 16, 300), 34, 0x06141a, 0.9).setStrokeStyle(1, 0x2fb6d6);
    const text = this.add
      .text(w / 2, 62, `${title}\n${subtitle}`, { ...FONT, fontSize: '10px', color: '#a8f0ff', align: 'center' })
      .setOrigin(0.5);
    for (const o of [bg, text]) {
      this.banners.push(o);
      o.setScrollFactor(0).setDepth(250);
      this.tweens.add({ targets: o, alpha: 0, delay: 3200, duration: 500, onComplete: () => o.destroy() });
    }
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, { ...FONT, fontSize: '9px', color })
      .setOrigin(0.5)
      .setDepth(95);
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private get isRobot(): boolean {
    return this.stats.character.resource === 'battery';
  }

  private hasPerk(id: string): boolean {
    return this.stats.perk?.id === id;
  }

  private addPickup(x: number, y: number, kind: 'oxygen' | 'salvage' | 'datalog', value: number) {
    const texture = kind === 'oxygen' && this.isRobot ? 'battery' : kind;
    const item = this.pickups.create(x, y, texture) as Sprite;
    item.setDepth(5).setData({ kind, value });
    this.tweens.add({ targets: item, y: y - 2, yoyo: true, repeat: -1, duration: 600 });
  }

  private tileAt(x: number, y: number): Point {
    return { x: Math.floor(x / TILE_SIZE), y: Math.floor(y / TILE_SIZE) };
  }
}
