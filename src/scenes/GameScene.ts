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
import { dayFromDailySeed } from '../core/leaderboard';
import { findPath, hasLineOfSight, nearestByWalking } from '../core/pathing';
import { GRAV_CONE, GRAV_RANGE, hitsShield, inGravCone, rivalEvent, type RivalEvent } from '../core/rivals';
import { newAchievements, type Achievement } from '../core/achievements';
import { CONDITIONS, ELITE, conditionFor, isElite, type Condition } from '../core/conditions';
import { applyRunResult, awardAchievements, computeRunStats, recordDaily, setClaimedName, type RunStats, type SaveData } from '../core/progression';
import { hashString, type ResolvedSeed } from '../core/seed';
import { ENEMY_KINDS, Tile, type EnemyKind, type Point } from '../core/types';
import { WEAPONS, pelletAngles, type WeaponDef } from '../core/weapons';
import { leaderboard } from '../net/leaderboard';
import { loadSave, storeSave } from '../storage';
import { TouchControls } from '../ui/TouchControls';
import { audio } from '../audio/engine';
import { combatIntensity } from '../core/music';
import {
  BARREL,
  DODGE,
  DROP_RULES,
  blastDamage,
  createExplored,
  dodgeDirection,
  dodgeDistance,
  dodgeReadiness,
  exploredFraction,
  isExplored,
  reveal,
  rollSupplyDrop,
} from '../core/fieldkit';
import { spatialise, type SfxName } from '../core/sfx';
import { ENEMY_STATS, RIVAL_KINDS, isHacked, kindOf, updateEnemy, type EnemyWorld } from './enemies';

type Sprite = Phaser.Physics.Arcade.Sprite;
type Keys = Record<
  | 'W' | 'A' | 'S' | 'D' | 'UP' | 'LEFT' | 'DOWN' | 'RIGHT' | 'Q' | 'F' | 'R' | 'ENTER' | 'ONE' | 'TWO' | 'ESC' | 'P'
  | 'SHIFT' | 'SPACE' | 'TAB',
  Phaser.Input.Keyboard.Key
>;

const PLAYER_SPEED = 110;
const TORCH_COST = 4;
const GRAV_COST = 3;
const TOOL_COOLDOWN = { torch: 300, hacker: 300, grav: 900 } as const;
const TOOL_LABEL = { torch: 'TORCH', hacker: 'HACK', grav: 'GRAV' } as const;
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
  private drums!: Phaser.Physics.Arcade.StaticGroup;
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
  private condition: Condition = CONDITIONS.calm;
  private elitesKilled = 0;
  private conditionText!: Phaser.GameObjects.Text;
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
  private runStartedAt = 0;
  private rivals!: RivalEvent;
  private rivalsArrived = false;
  private nextStepAt = 0;
  private nextHeartbeatAt = 0;
  private nextHackTickAt = 0;
  private pausedAt = 0;
  private lookX = 0;
  private lookY = 0;
  private lastDodgeAt = 0;
  private dodgeUntil = 0;
  private dodgeVec = { x: 0, y: 0 };
  private dodgeFrom = { x: 0, y: 0 };
  private nextGhostAt = 0;
  private dodges = 0;
  private blastKills = 0;
  private damageTaken = 0;
  private eggsDestroyed = 0;
  private rivalsKilled = 0;
  private rivalsBoarded = 0;
  private hacks = 0;
  private explored: Uint8Array = new Uint8Array(0);
  private nextRevealAt = 0;
  private mapOpen = false;
  private mapDirty = true;
  private mapTiles!: Phaser.GameObjects.Graphics;
  private mapMarks!: Phaser.GameObjects.Graphics;
  private mapText!: Phaser.GameObjects.Text;
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
    this.condition = conditionFor(this.run.seed, this.run.ship);
    this.elitesKilled = 0;
    this.oxygen = createOxygen(this.stats.capacity, this.stats.drainPerSecond * this.condition.oxygenDrain);
    this.salvage = 0;
    this.kills = 0;
    this.secondWindUsed = false;
    this.weapons = [...this.stats.guns];
    this.weaponIndex = 0;
    this.lastShotAt = 0;
    this.lastToolAt = 0;
    this.invulnerableUntil = 0;
    this.hack = null;
    this.rivals = rivalEvent(this.run.seed, this.run.ship);
    this.rivalsArrived = false;
    this.nextStepAt = 0;
    this.nextHeartbeatAt = 0;
    this.nextHackTickAt = 0;
    this.lookX = 0;
    this.lookY = 0;
    this.lastDodgeAt = 0;
    this.dodgeUntil = 0;
    this.nextGhostAt = 0;
    this.dodges = 0;
    this.blastKills = 0;
    this.damageTaken = 0;
    this.eggsDestroyed = 0;
    this.rivalsKilled = 0;
    this.rivalsBoarded = 0;
    this.hacks = 0;
    this.nextRevealAt = 0;
    this.mapOpen = false;
    this.mapDirty = true;
    this.ended = false;
    this.lamps = [];
    this.endScreen = [];
    this.banners = [];
  }

  create() {
    this.physics.resume();
    this.deck = generateDeck(this.run.seed, this.run.ship);
    this.grid = this.deck.tiles.map((row) => [...row]);
    this.explored = createExplored(this.deck.width, this.deck.height);

    this.buildMap();
    this.spawnEntities();
    this.setupInput();
    this.setupCollisions();
    this.buildHud();
    this.showIntro();

    this.runStartedAt = this.time.now;
    audio.setSettings(this.saveAtStart.settings);
    audio.startMusic(this.run.ship);
    audio.setIntensity(0);

    // Pause: Esc/P, the touch pause button, or automatically when the tab loses focus.
    this.events.on('pause', () => (this.pausedAt = this.game.loop.time));
    this.events.on('resume', () => {
      // Don't let paused time count towards the run clock or the rivals' arrival.
      this.runStartedAt += this.game.loop.time - this.pausedAt;
      // Settings may have changed in the pause menu.
      this.saveAtStart = { ...this.saveAtStart, settings: loadSave().settings };
    });
    const autoPause = () => this.openPause();
    this.game.events.on(Phaser.Core.Events.BLUR, autoPause);

    this.scale.on('resize', this.layout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.layout, this);
      this.game.events.off(Phaser.Core.Events.BLUR, autoPause);
      this.events.off('pause');
      this.events.off('resume');
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
    for (const p of this.condition.lampsOff ? [] : lampPositions(display, this.seedHash)) {
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
    this.drums = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.hostileShots = this.physics.add.group();

    let enemyIndex = 0;
    for (const s of this.deck.spawns) {
      const { x, y } = toWorld(s);
      switch (s.kind) {
        case 'salvage':
          this.addPickup(x, y, s.kind, Math.round(s.value * this.condition.salvage));
          break;
        case 'oxygen':
        case 'medkit':
          this.addPickup(x, y, s.kind, s.value);
          break;
        case 'cache': {
          const cache = this.caches.create(x, y, 'cache', 0) as Sprite;
          cache.setDepth(5).setData({ value: Math.round(s.value * this.condition.salvage), open: false });
          break;
        }
        case 'drum': {
          const drum = this.drums.create(x, y, 'drum') as Sprite;
          drum.setDepth(6).setData({ hp: BARREL.hp, lit: false });
          (drum.body as Phaser.Physics.Arcade.StaticBody).setSize(10, 10);
          break;
        }
        case 'datalog':
          // The slot is always generated (so layouts don't depend on the save); it's only filled if a log is left to find.
          if (this.pendingLog) this.addPickup(x, y, 'datalog', 0);
          break;
        default:
          if (ENEMY_KINDS.includes(s.kind)) {
            const e = this.spawnEnemy(s.kind, x, y);
            if (isElite(this.run.seed, this.run.ship, enemyIndex++, this.condition.eliteChance)) this.makeElite(e);
          }
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
    this.keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,Q,F,R,ENTER,ONE,TWO,ESC,P,SHIFT,SPACE,TAB', false) as Keys;
    // Tab and Space would otherwise move browser focus or scroll the page mid-run.
    kb.addCapture('TAB,SPACE');
    this.events.once('shutdown', () => kb.removeCapture('TAB,SPACE'));
    this.input.mouse?.disableContextMenu();
    this.input.on('wheel', () => this.switchWeapon());
    this.touch = new TouchControls(this, TOOL_LABEL[this.stats.tool.id]);
  }

  private setupCollisions() {
    const solid = (_a: unknown, e: unknown) => ENEMY_STATS[kindOf(e as Sprite)].solid;
    this.physics.add.collider(this.player, this.layer);
    this.physics.add.collider(this.player, this.caches);
    this.physics.add.collider(this.player, this.enemies, undefined, solid);
    this.physics.add.collider(this.enemies, this.layer);
    this.physics.add.collider(this.enemies, this.enemies);
    this.physics.add.collider(this.enemies, this.caches);
    this.physics.add.collider(this.player, this.drums);
    this.physics.add.collider(this.enemies, this.drums);
    const shootDrum = (shot: unknown, drum: unknown) => {
      const b = shot as Sprite;
      if (!b.active) return;
      this.sparks.explode(3, b.x, b.y);
      b.destroy();
      this.damageDrum(drum as Sprite, 1);
    };
    this.physics.add.collider(this.bullets, this.drums, shootDrum);
    this.physics.add.collider(this.hostileShots, this.drums, shootDrum);

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
    this.conditionText = fixed(
      this.add.text(0, 0, this.condition.id === 'calm' ? '' : this.condition.name.toUpperCase(), { ...FONT, color: '#ff9a3c' }).setOrigin(1, 0),
    );
    this.mapTiles = this.add.graphics().setScrollFactor(0).setDepth(120).setVisible(false);
    this.mapMarks = this.add.graphics().setScrollFactor(0).setDepth(121).setVisible(false);
    this.mapText = fixed(this.add.text(0, 0, '', { ...FONT, fontSize: '9px', color: '#6fd6ff', backgroundColor: '#05070c' }).setOrigin(0.5, 1))
      .setDepth(122)
      .setVisible(false);
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
    this.conditionText.setPosition(w - 8, 30);
    this.weaponText.setPosition(8, 32);
    this.touch.layout(w, h);
    this.mapDirty = true;
  }

  private showIntro() {
    const { width: w, height: h } = this.scale;
    const toolHint = {
      torch: 'torch cracked walls',
      hacker: 'hack turrets + locked caches (stay close)',
      grav: 'grav pulse: shove + stun, block shots',
    }[this.stats.tool.id];
    const help = this.touch.enabled
      ? `Left thumb: move · right thumb: aim + fire\nGUN: swap · ROLL: dodge · ${TOOL_LABEL[this.stats.tool.id]}: ${toolHint}\nMAP: scanner · reach the green EXIT`
      : `WASD move · mouse aim + fire · Q swap gun · Shift/Space roll\nF / right-click: ${toolHint} · Tab: scanner map · reach the green EXIT`;
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
    if (this.condition.id !== 'calm') {
      const cond = this.add
        .text(w / 2, h * 0.22 + 20, `${this.condition.name.toUpperCase()}\n${this.condition.blurb}`, {
          ...FONT,
          fontSize: '9px',
          color: '#ff9a3c',
          align: 'center',
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(200);
      this.tweens.add({ targets: cond, alpha: 0, delay: 3200, duration: 700 });
    }
    this.tweens.add({ targets: hint, alpha: 0, delay: 7000, duration: 800 });
  }

  // ---------------------------------------------------------------- EnemyWorld

  canSee(from: Point, to: Point): boolean {
    return hasLineOfSight(this.grid, this.tileAt(from.x, from.y), this.tileAt(to.x, to.y));
  }

  hostiles(): Sprite[] {
    return (this.enemies.getChildren() as Sprite[]).filter((e) => e.active && !isHacked(e));
  }

  soundAt(name: SfxName, x: number, y: number) {
    this.sfx(name, x, y);
  }

  shootAtPlayer(x: number, y: number, angle: number, speed: number, damage: number, texture: string) {
    this.sfx(texture === 'acid' ? 'acid' : 'enemyShot', x, y);
    const shot = this.hostileShots.create(x, y, texture) as Sprite;
    shot.setDepth(12).setCircle(2).setRotation(angle).setData('damage', damage);
    if (texture === 'bullet') shot.setTint(0xff5a6a);
    shot.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.time.delayedCall(2200, () => shot.destroy());
  }

  shootAtEnemies(x: number, y: number, angle: number) {
    this.sfx('enemyShot', x, y);
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
    if (RIVAL_KINDS.includes(kind)) e.setData('loot', []);
    return e;
  }

  /** Elite: double health, a little faster, gold, and always drops extra salvage. */
  private makeElite(e: Sprite) {
    e.setData({ elite: true, hp: Math.ceil((e.getData('hp') as number) * ELITE.hpMultiplier), speedMul: ELITE.speedMultiplier });
    e.setTint(0xffc94a).setScale(1.15);
  }

  moveTowards(e: Sprite, target: Point, speed: number) {
    speed *= (e.getData('speedMul') as number | undefined) ?? 1;
    this.physics.moveTo(e, target.x, target.y, speed);
  }

  followPath(e: Sprite, target: Point, speed: number) {
    speed *= (e.getData('speedMul') as number | undefined) ?? 1;
    const goal = this.tileAt(target.x, target.y);
    const goalKey = `${goal.x},${goal.y}`;
    let path = e.getData('path') as Point[] | undefined;
    if (!path || this.time.now > (e.getData('pathAt') ?? 0) || e.getData('pathGoal') !== goalKey) {
      path = findPath(this.grid, this.tileAt(e.x, e.y), goal, 3000) ?? [];
      e.setData({ path, pathAt: this.time.now + 700, pathGoal: goalKey });
    }
    while (path.length && Phaser.Math.Distance.Between(e.x, e.y, toWorld(path[0]).x, toWorld(path[0]).y) < 4) path.shift();
    const next = path.length ? toWorld(path[0]) : target;
    this.physics.moveTo(e, next.x, next.y, speed);
  }

  nearestSalvage(e: Sprite): Sprite | null {
    const loot = (this.pickups.getChildren() as Sprite[]).filter((p) => p.active && p.getData('kind') === 'salvage');
    const best = nearestByWalking(this.grid, this.tileAt(e.x, e.y), loot.map((p) => this.tileAt(p.x, p.y)));
    return best ? loot[best.index] : null;
  }

  steal(e: Sprite, pickup: Sprite) {
    const loot = (e.getData('loot') as number[] | undefined) ?? [];
    e.setData('loot', [...loot, pickup.getData('value') as number]);
    this.floatText(pickup.x, pickup.y - 6, 'STOLEN', '#ff5a6a');
    pickup.destroy();
  }

  private spawnRivals() {
    this.rivalsArrived = true;
    this.rivalsBoarded = this.rivals.party.length;
    const start = toWorld(this.deck.start);
    const offsets = [[-12, -8], [12, -8], [0, 10], [-12, 10], [12, 10]];
    this.rivals.party.forEach((kind, i) => {
      const [dx, dy] = offsets[i % offsets.length];
      const e = this.spawnEnemy(kind, start.x + dx, start.y + dy);
      e.setData({ loot: [], alertUntil: 0 });
      e.setAlpha(0);
      this.tweens.add({ targets: e, alpha: 1, duration: 600, delay: i * 150 });
    });
    this.shake(300, 0.01);
    this.showBanner('GRAVECUTTERS DOCKING', 'Rival salvagers are after your loot', 0xff5a6a);
    audio.play('alarm');
  }

  // ---------------------------------------------------------------- loop

  update(time: number, delta: number) {
    this.touch.draw();
    if (this.ended) return;
    const seconds = delta / 1000;

    this.updatePlayer(time);
    if (!this.rivalsArrived && time - this.runStartedAt > this.rivals.arrivesAfter * 1000) this.spawnRivals();
    for (const e of this.enemies.getChildren() as Sprite[]) if (e.active) updateEnemy(e, this, time);
    this.updateHack(seconds);

    this.oxygen = tickOxygen(this.oxygen, seconds);
    if (isOxygenEmpty(this.oxygen)) {
      this.hp -= SUFFOCATION_DPS * seconds;
      this.damageTaken += SUFFOCATION_DPS * seconds;
      if (this.hp <= 0) return this.endRun(false, this.isRobot ? 'Battery flat' : 'Oxygen depleted');
    }

    this.updateAudio(time);
    this.updateScanner(time);
    this.drawLighting();
    this.drawHud();
  }

  // ---------------------------------------------------------------- scanner map

  private updateScanner(time: number) {
    if (time > this.nextRevealAt) {
      this.nextRevealAt = time + 150;
      if (reveal(this.explored, this.grid, this.deck.rooms, this.tileAt(this.player.x, this.player.y)) > 0) this.mapDirty = true;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.TAB) || this.touch.consume('map')) {
      this.mapOpen = !this.mapOpen;
      this.mapDirty = true;
      audio.play('scan');
    }
    this.mapTiles.setVisible(this.mapOpen);
    this.mapMarks.setVisible(this.mapOpen);
    this.mapText.setVisible(this.mapOpen);
    if (this.mapOpen) this.drawScanner();
  }

  /** Where the map sits on screen and how big each tile is. */
  private mapFrame() {
    const { width: w, height: h } = this.scale;
    const cell = Math.max(2, Math.floor(Math.min((w * 0.86) / this.deck.width, (h * 0.7) / this.deck.height)));
    const mw = cell * this.deck.width;
    const mh = cell * this.deck.height;
    return { cell, x: Math.round((w - mw) / 2), y: Math.round((h - mh) / 2) - 4, mw, mh };
  }

  private drawScanner() {
    const f = this.mapFrame();
    const research = this.run.ship === 'research';
    if (this.mapDirty) {
      this.mapDirty = false;
      const g = this.mapTiles.clear();
      g.fillStyle(0x05070c, 0.94).fillRect(f.x - 6, f.y - 6, f.mw + 12, f.mh + 12);
      g.lineStyle(1, research ? 0x4fd8d0 : 0x6fd6ff, 0.6).strokeRect(f.x - 6.5, f.y - 6.5, f.mw + 13, f.mh + 13);
      const room = this.currentRoom();
      const jammed = this.condition.scannerJammed;
      for (let y = 0; y < this.deck.height; y++) {
        for (let x = 0; x < this.deck.width; x++) {
          if (!isExplored(this.explored, this.deck.width, { x, y })) continue;
          if (jammed && !(room && x >= room.x - 1 && x <= room.x + room.w && y >= room.y - 1 && y <= room.y + room.h)) continue;
          const t = this.grid[y][x];
          if (t === Tile.Floor) g.fillStyle(research ? 0x173a36 : 0x1d2b45, 1);
          else if (t === Tile.WeakWall) g.fillStyle(0x8a6a2a, 1);
          else {
            // Only draw walls that touch floor, so rooms read as outlines.
            const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.grid[y + dy]?.[x + dx] === Tile.Floor);
            if (!edge) continue;
            g.fillStyle(research ? 0x4fd8d0 : 0x6f8fc0, 0.75);
          }
          g.fillRect(f.x + x * f.cell, f.y + y * f.cell, f.cell, f.cell);
        }
      }
      const pct = Math.round(exploredFraction(this.explored, this.grid) * 100);
      const status = jammed ? 'SIGNAL JAMMED' : `${pct}% MAPPED`;
      this.mapText.setPosition(this.scale.width / 2, f.y + f.mh + 18).setText(`SCANNER · ${status} · ${this.touch.enabled ? 'MAP' : 'TAB'} TO CLOSE`);
      // Jammed, the map follows you room by room, so redraw it as you move.
      if (jammed) this.mapDirty = true;
    }

    const g = this.mapMarks.clear();
    const room = this.condition.scannerJammed ? this.currentRoom() : null;
    const dot = (wx: number, wy: number, colour: number, size = 1) => {
      const t = this.tileAt(wx, wy);
      if (!isExplored(this.explored, this.deck.width, t)) return;
      if (this.condition.scannerJammed && !(room && t.x >= room.x && t.x < room.x + room.w && t.y >= room.y && t.y < room.y + room.h)) return;
      const s = Math.max(2, f.cell * size);
      g.fillStyle(colour, 1).fillRect(f.x + t.x * f.cell + (f.cell - s) / 2, f.y + t.y * f.cell + (f.cell - s) / 2, s, s);
    };
    const colours: Record<string, number> = { salvage: 0xe8b04a, oxygen: 0x3fa7ff, medkit: 0xff3b4e, datalog: 0x5ef2ff };
    for (const p of this.pickups.getChildren() as Sprite[]) {
      if (p.active) dot(p.x, p.y, colours[p.getData('kind') as string] ?? 0xffffff);
    }
    for (const c of this.caches.getChildren() as Sprite[]) if (!c.getData('open')) dot(c.x, c.y, 0xb08a3a, 1.2);
    for (const b of this.barrels()) dot(b.x, b.y, 0xff7b3a);
    const blink = Math.floor(this.time.now / 300) % 2 === 0;
    dot(this.exitPad.x, this.exitPad.y, 0x3dff9a, blink ? 1.8 : 1.3);
    const p = this.tileAt(this.player.x, this.player.y);
    g.fillStyle(0xffffff, 1).fillCircle(f.x + (p.x + 0.5) * f.cell, f.y + (p.y + 0.5) * f.cell, Math.max(2, f.cell * 0.8));
    g.lineStyle(1, 0xffffff, 0.8).lineBetween(
      f.x + (p.x + 0.5) * f.cell,
      f.y + (p.y + 0.5) * f.cell,
      f.x + (p.x + 0.5) * f.cell + Math.cos(this.player.rotation) * f.cell * 2.5,
      f.y + (p.y + 0.5) * f.cell + Math.sin(this.player.rotation) * f.cell * 2.5,
    );
  }

  private updateAudio(time: number) {
    let hunting = 0;
    for (const e of this.enemies.getChildren() as Sprite[]) {
      if (!e.active || isHacked(e) || time > (e.getData('alertUntil') ?? 0)) continue;
      if (Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < 260) hunting++;
    }
    audio.setIntensity(combatIntensity(hunting));
    if (this.oxygen.current < 25 && time > this.nextHeartbeatAt) {
      this.nextHeartbeatAt = time + (this.oxygen.current < 10 ? 650 : 950);
      audio.play('heartbeat', { volume: 0.8 });
    }
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
    const rolled = Phaser.Math.Distance.Between(this.dodgeFrom.x, this.dodgeFrom.y, this.player.x, this.player.y);
    if (time < this.dodgeUntil && rolled >= dodgeDistance(this.isRobot)) this.dodgeUntil = 0;
    const dodging = time < this.dodgeUntil;
    if (dodging) {
      const rollSpeed = this.isRobot ? DODGE.robot.speed : DODGE.speed;
      this.player.setVelocity(this.dodgeVec.x * rollSpeed, this.dodgeVec.y * rollSpeed);
      // Stay untouchable for the whole roll, even if a slow frame stretches it out.
      this.invulnerableUntil = Math.max(this.invulnerableUntil, time + 60);
      if (time > this.nextGhostAt) {
        this.nextGhostAt = time + 30;
        const ghost = this.add
          .image(this.player.x, this.player.y, this.player.texture.key, this.player.frame.name)
          .setRotation(this.player.rotation)
          .setDepth(10)
          .setAlpha(0.45)
          .setTintFill(this.isRobot ? 0xffd166 : 0x6fd6ff);
        this.tweens.add({ targets: ghost, alpha: 0, duration: 220, onComplete: () => ghost.destroy() });
      }
    } else this.player.setVelocity(ix * speed, iy * speed);
    const moving = Math.abs(ix) + Math.abs(iy) > 0.05;
    if (moving) {
      this.player.anims.play(this.walkAnim, true);
      if (time > this.nextStepAt) {
        this.nextStepAt = time + (this.isRobot ? 230 : 300);
        audio.play('step', { volume: this.isRobot ? 1 : 0.7 });
      }
    } else this.player.anims.stop();
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

    // Lean the camera a little towards where you're aiming.
    const aiming = t.enabled ? t.aim.magnitude > 0 || moving : true;
    this.lookX = Phaser.Math.Linear(this.lookX, aiming ? -Math.cos(aim) * 24 : 0, 0.08);
    this.lookY = Phaser.Math.Linear(this.lookY, aiming ? -Math.sin(aim) * 24 : 0, 0.08);
    this.cameras.main.setFollowOffset(this.lookX, this.lookY);

    if (Phaser.Input.Keyboard.JustDown(k.ESC) || Phaser.Input.Keyboard.JustDown(k.P) || t.consume('pause')) {
      this.openPause();
      return;
    }

    const rollPressed = Phaser.Input.Keyboard.JustDown(k.SHIFT) || Phaser.Input.Keyboard.JustDown(k.SPACE) || t.consume('dodge');
    if (rollPressed && !dodging && dodgeReadiness(time, this.lastDodgeAt, this.isRobot) >= 1) this.startDodge(time, ix, iy, aim);

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
    const toolId = this.stats.tool.id;
    if (tool && time > this.lastToolAt + TOOL_COOLDOWN[toolId]) {
      this.lastToolAt = time;
      if (toolId === 'hacker') this.startHack();
      else if (toolId === 'grav') this.useGrav(aim);
      else this.useTorch(aim);
    }
  }

  // ---------------------------------------------------------------- actions

  /** Dodge roll: a quick dash you can't be hit during. */
  private startDodge(time: number, ix: number, iy: number, aim: number) {
    this.dodgeVec = dodgeDirection(ix, iy, aim);
    this.lastDodgeAt = time;
    this.dodgeUntil = time + DODGE.maxMs;
    this.dodgeFrom = { x: this.player.x, y: this.player.y };
    this.invulnerableUntil = Math.max(this.invulnerableUntil, time + DODGE.invulnerableMs);
    this.dodges += 1;
    this.nextGhostAt = 0;
    audio.play('dodge');
    this.player.anims.play(this.walkAnim, true);
  }

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
    audio.play(weapon.id, { volume: 0.9 });
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
    this.shake(40, weapon.pellets > 1 ? 0.004 : 0.0015);
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
      this.shake(120, 0.006);
      this.floatText(w.x, w.y - 8, 'CUT', '#ffd166');
      audio.play('torch');
      return;
    }
  }

  /** Grav pulse: shoves and stuns enemies in a cone and swats incoming shots aside. */
  private useGrav(aim: number) {
    const { x, y } = this.player;
    this.oxygen = spendOxygen(this.oxygen, GRAV_COST);

    audio.play('grav');
    const wave = this.add.graphics({ x, y }).setDepth(15);
    wave.fillStyle(0x9f8cff, 0.3).slice(0, 0, GRAV_RANGE, aim - GRAV_CONE, aim + GRAV_CONE).fillPath();
    wave.lineStyle(2, 0xc9bdff, 0.9).beginPath();
    wave.arc(0, 0, GRAV_RANGE, aim - GRAV_CONE, aim + GRAV_CONE);
    wave.strokePath();
    wave.setScale(0.35);
    this.tweens.add({ targets: wave, scale: 1, alpha: 0, duration: 280, onComplete: () => wave.destroy() });
    this.shake(90, 0.005);

    for (const e of [...this.enemies.getChildren()] as Sprite[]) {
      if (!e.active || isHacked(e) || ENEMY_STATS[kindOf(e)].solid || !inGravCone(x, y, aim, e.x, e.y)) continue;
      const a = Phaser.Math.Angle.Between(x, y, e.x, e.y);
      e.setVelocity(Math.cos(a) * 260, Math.sin(a) * 260);
      e.setData({ stunnedUntil: this.time.now + 700, alertUntil: this.time.now + 4000 });
      this.damageEnemy(e, 1);
    }
    for (const shot of this.hostileShots.getChildren() as Sprite[]) {
      if (shot.active && inGravCone(x, y, aim, shot.x, shot.y)) {
        this.sparks.explode(4, shot.x, shot.y);
        shot.destroy();
      }
    }
  }

  private cutTile(x: number, y: number) {
    this.grid[y][x] = Tile.Floor;
    this.mapDirty = true;
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
      audio.play('denied');
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
      audio.play('hackFail');
      this.hack = null;
      return;
    }
    this.hack.progress += seconds / this.stats.hackSeconds;
    if (this.time.now > this.nextHackTickAt) {
      this.nextHackTickAt = this.time.now + 140;
      audio.play('hackTick', { volume: 0.6 + this.hack.progress * 0.4 });
    }
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
    this.hacks += 1;
    if (target.getData('kind') === 'turret') {
      target.setData('hacked', true).setFrame(1);
      (target.getData('barrel') as Phaser.GameObjects.Image).setTint(0x9ff6ff);
      this.floatText(target.x, target.y - 12, 'TURRET HACKED', '#5ef2ff');
      audio.play('hackDone');
    } else {
      target.setData('open', true).setFrame(1);
      const a = Phaser.Math.Angle.Between(target.x, target.y, this.player.x, this.player.y);
      this.addPickup(target.x + Math.cos(a) * 14, target.y + Math.sin(a) * 14, 'salvage', target.getData('value'));
      this.floatText(target.x, target.y - 12, 'CACHE OPEN', '#3dff9a');
      audio.play('cache');
    }
    this.sparks.explode(14, target.x, target.y);
  }

  private hitEnemy(bullet: Sprite, enemy: Sprite) {
    if (!bullet.active || !enemy.active || isHacked(enemy)) return;
    const already = bullet.getData('hit') as Set<Sprite>;
    if (already.has(enemy)) return;
    already.add(enemy);
    const angle = Math.atan2(bullet.body!.velocity.y, bullet.body!.velocity.x);
    const pierce = bullet.getData('pierce') as boolean;
    const damage = bullet.getData('damage') as number;
    if (kindOf(enemy) === 'brute' && hitsShield(enemy.rotation, angle, pierce)) {
      // Deflected by the riot shield: flank it, stun it with the grav tool, or use the railgun.
      this.sparks.explode(5, bullet.x, bullet.y);
      this.sfx('shieldBlock', enemy.x, enemy.y);
      bullet.destroy();
      enemy.setData('alertUntil', this.time.now + 4000);
      return;
    }
    if (!pierce) bullet.destroy();
    if (!ENEMY_STATS[kindOf(enemy)].solid) enemy.setVelocity(Math.cos(angle) * 140, Math.sin(angle) * 140);
    this.damageEnemy(enemy, damage);
  }

  private damageEnemy(enemy: Sprite, amount: number) {
    const hp = (enemy.getData('hp') as number) - amount;
    if (hp > 0) this.sfx('hit', enemy.x, enemy.y);
    enemy.setData({ hp, alertUntil: this.time.now + 4000 });
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(60, () => {
      if (!enemy.active) return;
      enemy.clearTint();
      if (enemy.getData('elite')) enemy.setTint(0xffc94a);
    });
    if (hp <= 0) this.killEnemy(enemy);
  }

  private killEnemy(enemy: Sprite) {
    const kind = kindOf(enemy);
    const alien = kind === 'crawler' || kind === 'spitter' || kind === 'egg';
    this.sparks.explode(alien ? 18 : 30, enemy.x, enemy.y);
    this.sfx(alien ? 'alienDie' : 'mechDie', enemy.x, enemy.y);
    this.hitStop(kind === 'crawler' ? 25 : 55);
    const ring = this.add.circle(enemy.x, enemy.y, 4).setStrokeStyle(2, alien ? 0x9bff5c : 0xffd166).setDepth(19);
    this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
    this.shake(80, 0.006);
    (enemy.getData('shadow') as Phaser.GameObjects.Image | undefined)?.destroy();
    (enemy.getData('barrel') as Phaser.GameObjects.Image | undefined)?.destroy();
    const parent = enemy.getData('parent') as Sprite | undefined;
    if (parent?.active) parent.setData('brood', Math.max(0, (parent.getData('brood') ?? 1) - 1));
    this.kills += 1;
    if (kind === 'egg') this.eggsDestroyed += 1;
    if (RIVAL_KINDS.includes(kind)) this.rivalsKilled += 1;
    if (enemy.getData('elite')) {
      this.elitesKilled += 1;
      this.addPickup(enemy.x + 6, enemy.y - 5, 'salvage', Phaser.Math.Between(...ELITE.bonus));
      this.floatText(enemy.x, enemy.y - 14, 'ELITE DOWN', '#ffc94a');
    }

    const stolen = ((enemy.getData('loot') as number[] | undefined) ?? []).reduce((a, b) => a + b, 0);
    if (stolen > 0) {
      this.addPickup(enemy.x + 6, enemy.y, 'salvage', stolen);
      this.floatText(enemy.x, enemy.y - 10, 'LOOT DROPPED', '#e8b04a');
    }
    const [chance, min, max] = ENEMY_STATS[kind].drop;
    if (this.hasPerk('scrapper')) this.addPickup(enemy.x, enemy.y, 'salvage', Phaser.Math.Between(Math.max(min, 5), Math.max(max, 10)));
    else if (Math.random() < chance) this.addPickup(enemy.x, enemy.y, 'salvage', Phaser.Math.Between(min, max));

    // Sometimes a supply drop too, more likely when you're low. Crawlers hatched from eggs
    // never drop supplies, or egg sacs would be an endless oxygen farm.
    if (!parent) {
      const drop = rollSupplyDrop(Math.random(), Math.random(), this.hp / this.stats.maxHp, this.oxygen.current / this.oxygen.max);
      if (drop) {
        const amount = drop === 'medkit' ? DROP_RULES.healAmount : DROP_RULES.oxygenAmount;
        this.addPickup(enemy.x - 7, enemy.y + 4, drop, amount);
      }
    }
    enemy.destroy();
  }

  private hurtPlayer(amount: number, source?: Sprite) {
    if (this.time.now < this.invulnerableUntil || this.ended) return;
    this.invulnerableUntil = this.time.now + 800;
    this.hp -= amount * (1 - this.stats.armour);
    this.damageTaken += amount * (1 - this.stats.armour);
    audio.play('playerHurt');
    this.hitStop(70);
    if (this.hp <= 0 && this.hasPerk('second-wind') && !this.secondWindUsed) {
      this.secondWindUsed = true;
      this.hp = 1;
      this.invulnerableUntil = this.time.now + 2000;
      this.floatText(this.player.x, this.player.y - 12, 'SECOND WIND', '#3dff9a');
    }
    this.shake(140, 0.012);
    if (this.saveAtStart.settings.flashes) this.cameras.main.flash(80, 120, 0, 0);
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
    if (kind === 'medkit') {
      // Left where it is when you're already at full health, for later.
      if (this.hp >= this.stats.maxHp) return;
      const healed = Math.min(value, this.stats.maxHp - this.hp);
      this.hp += healed;
      audio.play('heal');
      this.floatText(item.x, item.y, `+${Math.round(healed)} ${this.isRobot ? 'REPAIR' : 'HP'}`, '#ff6b7d');
      this.tweens.add({ targets: this.player, alpha: 0.6, yoyo: true, duration: 80 });
    } else if (kind === 'oxygen') {
      this.oxygen = refillOxygen(this.oxygen, value);
      audio.play('oxygen');
      this.floatText(item.x, item.y, `+${value} ${this.isRobot ? 'PWR' : 'O₂'}`, this.isRobot ? '#ffd166' : '#6fd6ff');
    } else if (kind === 'datalog' && this.pendingLog) {
      this.logsFound.push(this.pendingLog.id);
      audio.play('datalog');
      this.showBanner('DATA LOG RECOVERED', this.pendingLog.title);
      this.pendingLog = null;
    } else {
      const amount = this.hasPerk('scavenger') ? Math.round(value * 1.25) : value;
      this.salvage += amount;
      audio.play('salvage');
      this.floatText(item.x, item.y, `+${amount}`, '#e8b04a');
    }
    item.destroy();
  }

  private endRun(extracted: boolean, reason = '') {
    if (this.ended) return;
    this.ended = true;
    this.mapOpen = false;
    for (const o of [this.mapTiles, this.mapMarks, this.mapText]) o.setVisible(false);
    this.player.anims.stop();
    this.player.setVelocity(0, 0);
    this.hackGfx.clear();
    for (const b of this.banners) b.destroy();
    this.drawHud();
    audio.setIntensity(0);
    if (extracted) this.extractionMoment();
    else this.deathMoment();

    const durationMs = this.time.now - this.runStartedAt;
    const before = loadSave();
    let after = applyRunResult(before, {
      extracted,
      salvage: this.salvage,
      dronesDestroyed: this.kills,
      logsFound: this.logsFound,
    });
    const day = this.run.mode === 'daily' ? dayFromDailySeed(this.run.seed) : null;
    if (day && extracted) after = recordDaily(after, day, this.salvage);
    const earned = newAchievements(
      {
        extracted,
        ship: this.run.ship,
        daily: day !== null,
        salvage: this.salvage,
        kills: this.kills,
        durationMs,
        damageTaken: this.damageTaken,
        dodges: this.dodges,
        blastKills: this.blastKills,
        explored: exploredFraction(this.explored, this.grid),
        eggsDestroyed: this.eggsDestroyed,
        rivalsKilled: this.rivalsKilled,
        rivalsBoarded: this.rivalsBoarded,
        hacks: this.hacks,
        elitesKilled: this.elitesKilled,
      },
      before.achievements,
    );
    after = awardAchievements(after, earned);
    storeSave(after);
    const bonus = after.rewards.length > before.rewards.length;
    const banked = after.credits - before.credits;
    const newBest = extracted && this.salvage > before.stats.bestHaul;
    const unlockedResearch = !isResearchUnlocked(before.codex) && isResearchUnlocked(after.codex);

    // Results appear after the extraction / death moment has played out.
    this.time.delayedCall(extracted ? 800 : 950, () =>
      this.showResults(extracted, reason, { before, after, day, durationMs, bonus, banked, newBest, unlockedResearch, earned }),
    );
  }

  private extractionMoment() {
    this.physics.pause();
    audio.play('extract');
    const { x, y } = this.player;
    const beam = this.add.rectangle(x, y - 60, 14, 140, 0x3dff9a, 0.35).setDepth(16).setScale(0.2, 1);
    this.tweens.add({ targets: beam, scaleX: 1, duration: 200, yoyo: true, hold: 350 });
    this.tweens.add({ targets: [this.player, this.playerShadow], scale: 0, alpha: 0, y: '-=12', duration: 600, ease: 'Quad.easeIn' });
    if (this.saveAtStart.settings.flashes) this.cameras.main.flash(250, 61, 255, 154);
  }

  private deathMoment() {
    audio.play('death');
    // Slow motion while the camera closes in.
    this.physics.world.timeScale = 4;
    this.tweens.timeScale = 0.4;
    this.cameras.main.zoomTo(1.2, 700, 'Sine.easeOut');
    if (this.saveAtStart.settings.flashes) this.cameras.main.flash(300, 160, 0, 0);
    this.tweens.add({ targets: this.player, angle: '+=200', alpha: 0.3, duration: 350 });
    this.sparks.explode(40, this.player.x, this.player.y);
  }

  private showResults(
    extracted: boolean,
    reason: string,
    r: {
      before: SaveData;
      after: SaveData;
      day: string | null;
      durationMs: number;
      bonus: boolean;
      banked: number;
      newBest: boolean;
      unlockedResearch: boolean;
      earned: Achievement[];
    },
  ) {
    const { after, day, durationMs, bonus, banked, newBest, unlockedResearch, earned } = r;
    this.physics.pause();
    this.physics.world.timeScale = 1;
    this.tweens.timeScale = 1;
    this.cameras.main.setZoom(1);
    const { width: w, height: h } = this.scale;
    const ui = <T extends Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle>(o: T) => {
      o.setScrollFactor(0).setDepth(300);
      this.endScreen.push(o);
      return o;
    };

    ui(this.add.rectangle(w / 2, h / 2, w, h, 0x05070c, 0.82));
    const title = ui(
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
    for (const a of earned) lines.push(`★ ${a.name.toUpperCase()}  +${a.reward}`);
    const paidWithoutExtracting = (bonus || earned.length > 0) && !extracted;
    lines.push(`Ship's hold: ${after.credits}${paidWithoutExtracting ? ` (+${banked})` : ''}`);
    if (earned.length) this.time.delayedCall(300, () => audio.play('achievement'));
    const summary = ui(this.add.text(w / 2, h / 2 - 12, lines.join('\n'), { ...FONT, fontSize: '11px', align: 'center' }).setOrigin(0.5));
    // Keep the title clear of the summary however many lines it has.
    title.setY(summary.y - summary.height / 2 - (extracted && day ? 34 : 18));

    const retry = () => {
      audio.play('launch');
      this.scene.restart(this.run);
    };
    const hub = () => {
      audio.play('ui');
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

    // Daily Derelict: post the score and show the rank when it comes back.
    if (day && extracted) {
      const status = ui(
        this.add
          .text(w / 2, summary.y - summary.height / 2 - 12, leaderboard.enabled ? 'Posting to daily board…' : `Today's best: ${after.daily.best}`, {
            ...FONT,
            fontSize: '10px',
            color: '#6fd6ff',
          })
          .setOrigin(0.5),
      );
      if (leaderboard.enabled) {
        leaderboard
          .submit({
            day,
            seed: this.run.seed,
            ship: this.run.ship,
            callsign: after.callsign,
            score: this.salvage,
            kills: this.kills,
            durationMs,
            character: this.stats.character.id,
            playerId: after.playerId,
          })
          .then((r) => {
            // Posting reserves your name, so there's no need to check it again.
            if (after.callsign !== after.callsignClaimed) storeSave(setClaimedName(loadSave(), after.callsign));
            if (status.active) status.setText(`DAILY RANK #${r.rank} of ${r.total} · best ${r.best}`);
          })
          .catch((e: Error) => {
            const message = /name taken/.test(e.message) ? 'Name taken. Pick a new one in CREW' : `Leaderboard: ${e.message}`;
            if (status.active) status.setText(message).setColor('#ff9a3c');
          });
      }
    }

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
    rt.clear().fill(0x000000, Math.min(0.9, DARKNESS[this.run.ship] + this.condition.darkness));
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
      const kind = p.active ? p.getData('kind') : null;
      if (kind === 'datalog' || kind === 'medkit') light('light-small', p.x, p.y, 32);
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
    this.weaponText.setText(`${guns}  · ${TOOL_LABEL[this.stats.tool.id]}`);

    // Dodge recharge, as a thin bar under your feet while it refills.
    const ready = dodgeReadiness(this.time.now, this.lastDodgeAt, this.isRobot);
    if (ready < 1) {
      const view = this.cameras.main.worldView;
      const px = this.player.x - view.x;
      const py = this.player.y - view.y;
      g.fillStyle(0x0d1220, 0.8).fillRect(px - 9, py + 11, 18, 3);
      g.fillStyle(this.isRobot ? 0xffd166 : 0x6fd6ff, 0.9).fillRect(px - 8, py + 12, 16 * ready, 1);
    }

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

  private showBanner(title: string, subtitle: string, colour = 0x2fb6d6) {
    const { width: w } = this.scale;
    const css = `#${colour.toString(16).padStart(6, '0')}`;
    const bg = this.add.rectangle(w / 2, 62, Math.min(w - 16, 300), 34, 0x06141a, 0.9).setStrokeStyle(1, colour);
    const text = this.add
      .text(w / 2, 62, `${title}\n${subtitle}`, { ...FONT, fontSize: '10px', color: colour === 0x2fb6d6 ? '#a8f0ff' : css, align: 'center' })
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

  /** Plays a sound at a world position, panned and faded relative to the camera. */
  private sfx(name: SfxName, x: number, y: number) {
    const cam = this.cameras.main;
    const heard = spatialise(x - cam.midPoint.x, y - cam.midPoint.y);
    if (heard) audio.play(name, heard);
  }

  private shake(duration: number, intensity: number) {
    if (this.saveAtStart.settings.screenShake) this.cameras.main.shake(duration, intensity);
  }

  /** A split-second freeze that makes hits land. */
  private hitStop(ms: number) {
    if (this.ended || this.physics.world.isPaused) return;
    this.physics.world.pause();
    this.time.delayedCall(ms, () => !this.ended && this.physics.world.resume());
  }

  private openPause() {
    if (this.ended || !this.scene.isActive()) return;
    this.player.setVelocity(0, 0);
    this.scene.launch('Pause', {
      onAbandon: () => this.endRun(false, 'Run abandoned'),
    });
    this.scene.pause();
  }

  private get isRobot(): boolean {
    return this.stats.character.resource === 'battery';
  }

  private currentRoom() {
    const p = this.tileAt(this.player.x, this.player.y);
    return this.deck.rooms.find((r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) ?? null;
  }

  private barrels(): Sprite[] {
    return (this.drums.getChildren() as Sprite[]).filter((d) => d.active);
  }

  // ---------------------------------------------------------------- explosive drums

  private damageDrum(drum: Sprite, amount: number) {
    if (!drum.active || drum.getData('lit')) return;
    const hp = (drum.getData('hp') as number) - amount;
    drum.setData('hp', hp);
    drum.setTintFill(0xffffff);
    this.time.delayedCall(50, () => drum.active && drum.clearTint());
    if (hp <= 0) this.explodeDrum(drum);
    else this.sfx('hit', drum.x, drum.y);
  }

  /** Blast: hurts everything nearby (you too), opens cracked walls, and sets off other drums. */
  private explodeDrum(drum: Sprite) {
    if (!drum.active || drum.getData('lit')) return;
    drum.setData('lit', true);
    const { x, y } = drum;
    drum.destroy();
    this.sfx('explosion', x, y);
    this.sparks.explode(40, x, y);
    const fire = this.add.circle(x, y, BARREL.radius, 0xff7b3a, 0.45).setDepth(18).setScale(0.2);
    const ring = this.add.circle(x, y, BARREL.radius).setStrokeStyle(3, 0xffd166).setDepth(19).setScale(0.3);
    this.tweens.add({ targets: fire, scale: 1, alpha: 0, duration: 320, onComplete: () => fire.destroy() });
    this.tweens.add({ targets: ring, scale: 1.1, alpha: 0, duration: 380, onComplete: () => ring.destroy() });
    const scorch = this.add.circle(x, y, 9, 0x000000, 0.35).setDepth(1);
    this.tweens.add({ targets: scorch, alpha: 0, delay: 6000, duration: 2000, onComplete: () => scorch.destroy() });
    const near = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) < 200;
    this.shake(near ? 260 : 120, near ? 0.018 : 0.006);
    if (near && this.saveAtStart.settings.flashes) this.cameras.main.flash(90, 255, 140, 60);
    this.hitStop(60);

    // Copy the list: killing an enemy removes it from the group mid-loop.
    for (const e of [...this.enemies.getChildren()] as Sprite[]) {
      if (!e.active || isHacked(e)) continue;
      const dmg = blastDamage(Phaser.Math.Distance.Between(x, y, e.x, e.y), BARREL.enemyDamage);
      if (dmg <= 0) continue;
      if (!ENEMY_STATS[kindOf(e)].solid) {
        const a = Phaser.Math.Angle.Between(x, y, e.x, e.y);
        e.setVelocity(Math.cos(a) * 220, Math.sin(a) * 220);
      }
      const before = this.kills;
      this.damageEnemy(e, dmg);
      if (this.kills > before) this.blastKills += 1;
    }
    const toYou = blastDamage(Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y), BARREL.playerDamage);
    if (toYou > 0) this.hurtPlayer(toYou);

    // Cracked walls in the blast give way.
    const centre = this.tileAt(x, y);
    const reach = Math.ceil(BARREL.radius / TILE_SIZE);
    for (let ty = centre.y - reach; ty <= centre.y + reach; ty++) {
      for (let tx = centre.x - reach; tx <= centre.x + reach; tx++) {
        if (this.grid[ty]?.[tx] !== Tile.WeakWall) continue;
        const w = toWorld({ x: tx, y: ty });
        if (Phaser.Math.Distance.Between(x, y, w.x, w.y) <= BARREL.radius * 0.75) this.cutTile(tx, ty);
      }
    }

    for (const other of this.barrels()) {
      if (Phaser.Math.Distance.Between(x, y, other.x, other.y) <= BARREL.radius) {
        this.time.delayedCall(BARREL.chainDelayMs, () => this.explodeDrum(other));
      }
    }
  }

  private hasPerk(id: string): boolean {
    return this.stats.perk?.id === id;
  }

  private addPickup(x: number, y: number, kind: 'oxygen' | 'salvage' | 'datalog' | 'medkit', value: number) {
    const texture = kind === 'oxygen' && this.isRobot ? 'battery' : kind === 'medkit' && this.isRobot ? 'repairkit' : kind;
    const item = this.pickups.create(x, y, texture) as Sprite;
    item.setDepth(5).setData({ kind, value });
    this.tweens.add({ targets: item, y: y - 2, yoyo: true, repeat: -1, duration: 600 });
  }

  private tileAt(x: number, y: number): Point {
    return { x: Math.floor(x / TILE_SIZE), y: Math.floor(y / TILE_SIZE) };
  }
}
