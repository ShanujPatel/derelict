import Phaser from 'phaser';
import { TILE_SIZE } from '../art/sprites';
import { ensureCharacterTexture } from '../art/textures';
import { bossLog, isResearchUnlocked, nextLogFor, type LogEntry } from '../core/codex';
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
import { dayFromDailySeed, formatDuration } from '../core/leaderboard';
import { findPath, hasLineOfSight, nearestByWalking } from '../core/pathing';
import { GRAV_CONE, GRAV_RANGE, hitsShield, inGravCone, rivalEvent, type RivalEvent } from '../core/rivals';
import { newAchievements, type Achievement } from '../core/achievements';
import { CONDITIONS, ELITE, conditionFor, isElite, type Condition } from '../core/conditions';
import { SECTIONS, generateArena, type ArenaDeck } from '../core/arena';
import { TOOLS } from '../core/catalog';
import {
  TRAINING_REWARD,
  TRAINING_STEPS,
  generateTraining,
  trainingText,
  type TrainingDeck,
  type TrainingStepId,
} from '../core/training';
import { BOUNTY, BOUNTY_KINDS, bountyFor } from '../core/bounty';
import { TIP_IDS, nextTip, tipText, type TipId } from '../core/tips';
import { shareText } from '../core/share';
import { vesselName } from '../core/names';
import { DEPTH, baseSeed, deeperSeed, depthMods, placeLift, type Carry } from '../core/depth';
import { bfsDistances } from '../core/pathing';
import { NO_COMBO, comboAfterPickup, comboMultiplier, comboTimeLeft, type ComboState } from '../core/combo';
import { NO_EFFECTS, combineMutators, weekFromSeed, weeklySetup, type Mutator, type MutatorEffects } from '../core/weekly';
import { BOSSES, CAPTAIN, FOREMAN, MOTHER, type BossId } from '../core/bosses';
import { BossFight, CaptainFight, ForemanFight, MotherFight, type BossHost } from './boss';
import { ASSIST, applyRunResult, canBoard, completeTraining, setClanCache, awardAchievements, recordStreak, markTipSeen, recordWeekly, computeRunStats, recordBossKill, recordRun, recordDaily, setClaimedName, type RunStats, type SaveData } from '../core/progression';
import { hashString, type ResolvedSeed } from '../core/seed';
import { ENEMY_KINDS, Tile, type EnemyKind, type Point } from '../core/types';
import { checkRunReport, type RunReport } from '../core/hallOfFame';
import { WEAPONS, chainTargets, pelletAngles, type WeaponDef } from '../core/weapons';
import { leaderboard } from '../net/leaderboard';
import { loadOwnGhost, loadSave, storeOwnGhost, storeSave } from '../storage';
import { GhostRecorder, decodeGhost, type Ghost } from '../core/ghost';
import { GhostView } from './ghostView';
import { weekFromWeeklySeed } from '../core/leaderboard';
import { TouchControls } from '../ui/TouchControls';
import { pad } from '../ui/Gamepad';
import { AIM_MIN, PAD, STICK_FIRE, TRIGGER_FIRE } from '../core/gamepad';
import { audio } from '../audio/engine';
import { combatIntensity } from '../core/music';
import {
  BARREL,
  DODGE,
  POWERUPS,
  rollPowerup,
  SENTRY,
  SHOCK,
  onHazard,
  shockState,
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
  MINE,
  ORE,
  SWEEPER,
  beamEnd,
  distanceToSegment,
} from '../core/fieldkit';
import { spatialise, type SfxName } from '../core/sfx';
import { ENEMY_STATS, RIVAL_KINDS, TURRET_LOCK_MS, isHacked, kindOf, updateEnemy, wakeMimic, type EnemyWorld } from './enemies';

type Sprite = Phaser.Physics.Arcade.Sprite;
type Keys = Record<
  | 'W' | 'A' | 'S' | 'D' | 'UP' | 'LEFT' | 'DOWN' | 'RIGHT' | 'Q' | 'F' | 'R' | 'ENTER' | 'ONE' | 'TWO' | 'ESC' | 'P'
  | 'SHIFT' | 'SPACE' | 'TAB',
  Phaser.Input.Keyboard.Key
>;

const PLAYER_SPEED = 110;
const TORCH_COST = 4;
const GRAV_COST = 3;
const TOOL_COOLDOWN = { torch: 300, hacker: 300, grav: 900, sentry: SENTRY.cooldownMs } as const;
const TOOL_LABEL = { torch: 'TORCH', hacker: 'HACK', grav: 'GRAV', sentry: 'SENTRY' } as const;
const SUFFOCATION_DPS = 6;
const HACK_RANGE = 32;
const HACK_BREAK_RANGE = 46;
/** How each ship type looks: darkness, lamp colour, boarding title and scanner colours. */
const SHIP_LOOK = {
  freighter: { dark: 0.6, lamp: null, title: 'BOARDING DERELICT', titleColour: '#ffd166', mini: 0x3d5a8a, floor: 0x1d2b45, wall: 0x6f8fc0, frame: 0x6fd6ff },
  research: { dark: 0.7, lamp: 0x9bff5c, title: 'BOARDING RESEARCH VESSEL', titleColour: '#9bff5c', mini: 0x2c6f66, floor: 0x173a36, wall: 0x4fd8d0, frame: 0x4fd8d0 },
  mining: { dark: 0.66, lamp: 0xffb347, title: 'BOARDING MINING HAULER', titleColour: '#ffb347', mini: 0x7a5c36, floor: 0x3a2d1f, wall: 0xc99a5a, frame: 0xffb347 },
} as const;

const FONT = { fontFamily: 'monospace', fontSize: '10px', color: '#d7e3ff' };

const toWorld = (p: Point) => ({
  x: p.x * TILE_SIZE + TILE_SIZE / 2,
  y: p.y * TILE_SIZE + TILE_SIZE / 2,
});

interface Hack {
  target: Sprite;
  progress: number;
}

export class GameScene extends Phaser.Scene implements EnemyWorld, BossHost {
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
  private mutators: Mutator[] = [];
  private bountyTarget: Sprite | null = null;
  private bountiesClaimed = 0;
  private tipBox: Phaser.GameObjects.Text | null = null;
  private laserGfx!: Phaser.GameObjects.Graphics;
  private lastHurtAt = 0;
  private overdriveUntil = 0;
  private aegis = 0;
  private powerText!: Phaser.GameObjects.Text;
  private depth = 1;
  private liftPad: Phaser.Physics.Arcade.Image | null = null;
  private descending = false;
  private hazardGfx!: Phaser.GameObjects.Graphics;
  private nextShockTick = 0;
  private nextZap = 0;
  private sentry: { base: Phaser.GameObjects.Image; gun: Phaser.GameObjects.Image; ring: Phaser.GameObjects.Graphics; until: number; nextShot: number } | null = null;
  private combo: ComboState = NO_COMBO;
  private bestCombo = 0;
  private comboText!: Phaser.GameObjects.Text;
  private tipUntil = 0;
  private nextTipCheck = 0;
  private tipsSeen: string[] = [];
  private bountyGfx!: Phaser.GameObjects.Graphics;
  private bountyLabel: Phaser.GameObjects.Text | null = null;
  private mods: MutatorEffects = NO_EFFECTS;
  private arena: ArenaDeck | null = null;
  private boss: BossFight | null = null;
  private bossParts!: Phaser.Physics.Arcade.StaticGroup;
  private bulkhead: Phaser.GameObjects.Image | null = null;
  private bossDefeated: { id: BossId; ms: number } | null = null;
  private elitesKilled = 0;
  /** Kills by type over the whole dive, plus elites and bounties from decks above (hall of fame). */
  private killsByKind: Partial<Record<EnemyKind, number>> = {};
  private priorElites = 0;
  private priorBounties = 0;
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
  private drumsDetonated = 0;
  private abandoned = false;
  private damageTaken = 0;
  private eggsDestroyed = 0;
  private rivalsKilled = 0;
  private rivalsBoarded = 0;
  private hacks = 0;
  /** Ore veins cut open this run (mining haulers). */
  private oreVeins = 0;
  /** Training run (mode 'tutorial'): the deck, which step you're on, and its bits on screen. */
  private training: TrainingDeck | null = null;
  private trainingStep = 0;
  private trainingDrones: Sprite[] = [];
  private trainingMapSeen = false;
  private trainingGfx!: Phaser.GameObjects.Graphics;
  private trainingDoors = new Map<TrainingStepId, Phaser.GameObjects.Image>();
  private trainingPrompt: { panel: Phaser.GameObjects.Rectangle; title: Phaser.GameObjects.Text; body: Phaser.GameObjects.Text } | null = null;
  /** Daily runs: your path (to post as a ghost) and the ghost you're racing. */
  private ghostRecorder: GhostRecorder | null = null;
  private ghostView: GhostView | null = null;
  /** Bumped every run, so a ghost that loads after a restart is dropped. */
  private runToken = 0;
  private nextBeamTick = 0;
  private explored: Uint8Array = new Uint8Array(0);
  private nextRevealAt = 0;
  private mapOpen = false;
  private mapDirty = true;
  private mapTiles!: Phaser.GameObjects.Graphics;
  private miniMap!: Phaser.GameObjects.Graphics;
  private nextMiniAt = 0;
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
    const carry = data.carry;
    this.depth = carry?.depth ?? 1;
    this.logsFound = carry ? [...carry.logsFound] : [];
    this.pendingLog = nextLogFor([...this.saveAtStart.codex, ...this.logsFound], this.run.ship);
    this.hp = carry ? Math.min(this.stats.maxHp, carry.hp) : this.stats.maxHp;
    this.liftPad = null;
    this.descending = false;
    // Boss contracts are fought as designed: no random condition, no elites, no rivals, no data logs.
    const scripted = !!this.run.boss || this.run.mode === 'tutorial';
    this.condition = scripted ? { ...CONDITIONS.calm, eliteChance: 0 } : conditionFor(this.run.seed, this.run.ship);
    // Training always teaches the cutting torch.
    if (this.run.mode === 'tutorial') this.stats = { ...this.stats, tool: TOOLS.torch };
    // Weekly challenge mutators fold into the ship's condition where they overlap.
    this.mutators = this.run.mode === 'weekly' ? weeklySetup(this.run.seed).mutators : [];
    this.mods = combineMutators(this.mutators);
    if (this.mutators.length) {
      const c = this.condition;
      this.condition = {
        ...c,
        oxygenDrain: c.oxygenDrain * this.mods.drain,
        salvage: c.salvage * this.mods.salvage,
        eliteChance: Math.max(c.eliteChance, this.mods.eliteChance),
        darkness: c.darkness + this.mods.darkness,
        lampsOff: c.lampsOff || this.mods.darkness > 0,
      };
    }
    // Deeper decks: more elites, richer salvage, quicker hostiles.
    if (this.depth > 1) {
      const dm = depthMods(this.depth);
      this.condition = {
        ...this.condition,
        eliteChance: Math.min(0.6, this.condition.eliteChance + dm.eliteBonus),
        salvage: this.condition.salvage * dm.salvage,
      };
      this.mods = { ...this.mods, enemySpeed: this.mods.enemySpeed * dm.enemySpeed };
    }
    this.arena = null;
    this.boss = null;
    this.bountyTarget = null;
    this.bountyLabel = null;
    this.bountiesClaimed = 0;
    this.tipBox = null;
    this.lastHurtAt = 0;
    this.overdriveUntil = 0;
    this.aegis = 0;
    this.nextShockTick = 0;
    this.nextZap = 0;
    this.sentry = null;
    this.combo = NO_COMBO;
    this.bestCombo = 0;
    this.tipUntil = 0;
    this.nextTipCheck = 0;
    this.tipsSeen = [...this.saveAtStart.tips];
    this.bulkhead = null;
    this.bossDefeated = null;
    this.bossLabel = undefined;
    this.resultActions = null;
    this.lastRank = undefined;
    this.elitesKilled = 0;
    this.killsByKind = carry?.tally ? { ...carry.tally.kills } : {};
    this.priorElites = carry?.tally?.elites ?? 0;
    this.priorBounties = carry?.tally?.bounties ?? 0;
    const assist = this.saveAtStart.settings.assist;
    this.oxygen = createOxygen(
      Math.round(this.stats.capacity * (assist ? ASSIST.capacity : 1)),
      this.stats.drainPerSecond * this.condition.oxygenDrain,
    );
    if (carry) this.oxygen = { ...this.oxygen, current: Math.min(this.oxygen.max, carry.oxygen) };
    this.salvage = carry?.salvage ?? 0;
    this.kills = carry?.kills ?? 0;
    this.secondWindUsed = false;
    this.weapons = [...this.stats.guns];
    this.weaponIndex = 0;
    this.lastShotAt = 0;
    this.lastToolAt = 0;
    this.invulnerableUntil = 0;
    this.hack = null;
    this.rivals = rivalEvent(this.run.seed, this.run.ship);
    this.rivalsArrived = scripted;
    if (scripted) this.pendingLog = null;
    this.trainingPrompt = null;
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
    this.drumsDetonated = 0;
    this.abandoned = false;
    this.damageTaken = 0;
    this.eggsDestroyed = 0;
    this.rivalsKilled = 0;
    this.rivalsBoarded = 0;
    this.hacks = 0;
    this.oreVeins = 0;
    this.nextBeamTick = 0;
    this.nextRevealAt = 0;
    this.nextMiniAt = 0;
    this.mapOpen = false;
    this.mapDirty = true;
    this.ended = false;
    this.lamps = [];
    this.endScreen = [];
    this.banners = [];
  }

  create() {
    this.physics.resume();
    this.arena = this.run.boss ? generateArena(this.run.seed, this.run.boss) : null;
    this.training = this.run.mode === 'tutorial' ? generateTraining() : null;
    this.deck = this.training ?? this.arena ?? generateDeck(this.run.seed, this.run.ship);
    this.grid = this.deck.tiles.map((row) => [...row]);
    this.explored = createExplored(this.deck.width, this.deck.height);

    this.buildMap();
    this.spawnEntities();
    this.setupInput();
    this.setupCollisions();
    this.buildHud();
    this.showIntro();

    // A deep dive's clock covers every deck so far.
    this.runStartedAt = this.time.now - (this.run.carry?.elapsedMs ?? 0);
    this.runToken += 1;
    this.ghostView = null;
    this.ghostRecorder = this.run.mode === 'daily' ? new GhostRecorder() : null;
    if (this.run.mode === 'daily' && this.saveAtStart.settings.ghost) this.loadGhost(this.runToken);
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
      const tint = SHIP_LOOK[this.run.ship].lamp;
      if (tint) lamp.setTint(tint);
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
    // One named hostile per ordinary run carries a bounty.
    const eligible = this.arena || this.training ? [] : this.deck.spawns.filter((s) => BOUNTY_KINDS.includes(s.kind as EnemyKind));
    const bounty = bountyFor(this.run.seed, this.run.ship, eligible.length);
    const bountySpawn = bounty ? eligible[bounty.index] : null;
    for (const s of this.deck.spawns) {
      const { x, y } = toWorld(s);
      switch (s.kind) {
        case 'salvage':
          this.addPickup(x, y, s.kind, Math.round(s.value * this.condition.salvage));
          break;
        case 'oxygen':
        case 'medkit':
        case 'overdrive':
        case 'aegis':
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
            if (bounty && s === bountySpawn) this.makeBounty(e, bounty.name, bounty.reward);
          }
      }
    }

    if (this.arena) this.setupArena(this.arena);
    else if (this.training) this.setupTraining(this.training);
    else this.setupLift();
    this.hazardGfx = this.add.graphics().setDepth(3);
    this.laserGfx = this.add.graphics().setDepth(12);

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
    // Moving the mouse hands aiming back from the gamepad.
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.wasTouch) pad.active = false;
    });
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
      if (damage > 0 && !isHacked(enemy) && !enemy.getData('dormant')) this.hurtPlayer(damage, enemy);
    });
    this.physics.add.overlap(this.player, this.hostileShots, (_p, s) => {
      const shot = s as Sprite;
      if (!shot.active) return;
      this.hurtPlayer(shot.getData('damage') as number);
      this.sparks.explode(6, shot.x, shot.y);
      shot.destroy();
    });
    this.physics.add.overlap(this.player, this.pickups, (_p, item) => this.collect(item as Sprite));
    if (this.boss) this.setupBossCollisions(this.boss);
    this.physics.add.overlap(this.player, this.exitPad, () => this.endRun(true));
    if (this.liftPad) this.physics.add.overlap(this.player, this.liftPad, () => this.descend());
  }

  private buildHud() {
    const fixed = (t: Phaser.GameObjects.Text) => t.setScrollFactor(0).setDepth(101);
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hpLabel = fixed(this.add.text(0, 0, 'HP', FONT));
    this.o2Label = fixed(this.add.text(0, 0, this.isRobot ? 'PWR' : 'O₂', FONT));
    this.salvageText = fixed(this.add.text(0, 0, '', FONT).setOrigin(1, 0));
    this.comboText = fixed(this.add.text(0, 0, '', { ...FONT, color: '#ffd166' }).setOrigin(1, 0));
    this.powerText = fixed(this.add.text(0, 0, '', { ...FONT, fontSize: '9px', color: '#ff9a3c' }));
    this.weaponText = fixed(this.add.text(0, 0, '', FONT));
    const label = this.run.mode === 'tutorial' ? 'TRAINING' : this.run.mode === 'daily' || this.run.mode === 'weekly' ? this.run.seed.toUpperCase() : `SEED ${this.run.seed}`;
    this.seedText = fixed(this.add.text(0, 0, label, { ...FONT, color: '#6f7fa3' }).setOrigin(1, 0));
    this.conditionText = fixed(
      this.add
        .text(0, 0, this.hudConditionLabel(), { ...FONT, color: '#ff9a3c', align: 'right' })
        .setOrigin(1, 0),
    );
    this.mapTiles = this.add.graphics().setScrollFactor(0).setDepth(120).setVisible(false);
    this.mapMarks = this.add.graphics().setScrollFactor(0).setDepth(121).setVisible(false);
    this.miniMap = this.add.graphics().setScrollFactor(0).setDepth(99);
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
    // On narrow portrait screens the weapon line is in the way, so drop below it.
    this.conditionText.setPosition(w - 8, w < 360 ? 46 : 30);
    this.weaponText.setPosition(8, 32);
    this.powerText.setPosition(8, 45);
    this.touch.layout(w, h);
    this.mapDirty = true;
  }

  private showIntro() {
    const { width: w, height: h } = this.scale;
    const toolHint = {
      torch: 'torch cracked walls',
      hacker: 'hack turrets + locked caches (stay close)',
      grav: 'grav pulse: shove + stun, block shots',
      sentry: 'deploy a sentry turret',
    }[this.stats.tool.id];
    const help = pad.connected
      ? `Left stick move · right stick aim · RT fire · A roll\nX/RB: ${toolHint} · Y swap · Back: map · reach the green EXIT`
      : this.touch.enabled
      ? `Left thumb: move · right thumb: aim + fire\nGUN: swap · ROLL: dodge · ${TOOL_LABEL[this.stats.tool.id]}: ${toolHint}\nMAP: scanner · reach the green EXIT`
      : `WASD move · mouse aim + fire · Q swap gun · Shift/Space roll\nF / right-click: ${toolHint} · Tab: scanner map · reach the green EXIT`;
    const title = this.training
      ? 'TRAINING RUN'
      : this.run.boss
      ? `CONTRACT · ${BOSSES[this.run.boss].arena.toUpperCase()}`
      : this.depth > 1
        ? `DEPTH ${this.depth} · RICHER, NASTIER`
        : SHIP_LOOK[this.run.ship].title;
    const titleText = this.add
      .text(w / 2, h * 0.22, title, { ...FONT, fontSize: '16px', color: SHIP_LOOK[this.run.ship].titleColour })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    const hint = this.add
      .text(w / 2, h * 0.68, help, { ...FONT, fontSize: '9px', color: '#9fb0d0', align: 'center', wordWrap: { width: w - 20 } })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    this.tweens.add({ targets: titleText, alpha: 0, delay: 1800, duration: 600 });
    if (this.mutators.length) {
      const mut = this.add
        .text(w / 2, h * 0.22 + 20, `WEEKLY CHALLENGE\n${this.mutators.map((m) => `${m.name.toUpperCase()}: ${m.blurb}`).join('\n')}`, {
          ...FONT,
          fontSize: '9px',
          color: '#c9a0ff',
          align: 'center',
          wordWrap: { width: w - 20 },
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(200);
      this.tweens.add({ targets: mut, alpha: 0, delay: 4200, duration: 700 });
    } else if (this.condition.id !== 'calm') {
      const cond = this.add
        .text(w / 2, h * 0.22 + 20, `${this.condition.name.toUpperCase()}\n${this.condition.blurb}`, {
          ...FONT,
          fontSize: '9px',
          color: '#ff9a3c',
          align: 'center',
          wordWrap: { width: w - 20 },
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0)
        .setDepth(200);
      this.tweens.add({ targets: cond, alpha: 0, delay: 3200, duration: 700 });
    }
    this.tweens.add({ targets: hint, alpha: 0, delay: 7000, duration: 800 });
    // Training explains things one step at a time instead.
    if (this.training) hint.setVisible(false);
  }

  // ---------------------------------------------------------------- training run (v1.2)

  /** Sets up the current training step: its prompt, and anything it needs (drones, low air). */
  private startTrainingStep() {
    const t = this.training;
    if (!t) return;
    const step = TRAINING_STEPS[this.trainingStep];
    if (!step) return;
    const deck = t;
    if (step.id === 'supplies') {
      // Make the lesson real: low air and a few scratches.
      this.oxygen = { ...this.oxygen, current: Math.min(this.oxygen.current, this.oxygen.max * 0.4) };
      this.hp = Math.min(this.hp, Math.round(this.stats.maxHp * 0.55));
      this.floatText(this.player.x, this.player.y - 16, 'AIR LOW · HURT', '#ff9a3c');
    }
    for (const p of deck.drones[step.id] ?? []) {
      const { x, y } = toWorld(p);
      const e = this.spawnEnemy('drone', x, y);
      // Training drones hold position and go down quickly.
      e.setData({ pinned: true, hp: step.id === 'drum' ? 3 : 2, alertUntil: 0 });
      this.trainingDrones.push(e);
      this.explosionAt(x, y, 6);
    }
    this.drawTrainingPrompt();
    audio.play('ui');
  }

  /** Checks whether the current step is done; if so opens its door and moves on. */
  private updateTraining(time: number) {
    const t = this.training;
    if (!t || this.ended) return;
    const step = TRAINING_STEPS[this.trainingStep];
    if (!step) return;
    // The marker for step 1.
    const g = this.trainingGfx.clear();
    if (step.id === 'move') {
      const m = toWorld(t.marker);
      const r = 9 + Math.sin(time / 180) * 2;
      g.lineStyle(2, 0x3dff9a, 0.9).strokeCircle(m.x, m.y, r);
      g.fillStyle(0x3dff9a, 0.18).fillCircle(m.x, m.y, r);
    }
    const inRoom = (s: Sprite, i: number) => {
      const r = t.rooms[i];
      const p = this.tileAt(s.x, s.y);
      return p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
    };
    const pickupsLeft = (kinds: string[], room: number) =>
      (this.pickups.getChildren() as Sprite[]).filter((p) => p.active && kinds.includes(p.getData('kind')) && inRoom(p, room)).length;
    const dronesLeft = this.trainingDrones.filter((d) => d.active).length;
    let done = false;
    switch (step.id) {
      case 'move':
        done = Phaser.Math.Distance.Between(this.player.x, this.player.y, toWorld(t.marker).x, toWorld(t.marker).y) < 14;
        break;
      case 'salvage':
        done = pickupsLeft(['salvage'], 1) === 0;
        break;
      case 'supplies':
        done = pickupsLeft(['oxygen', 'medkit'], 2) === 0;
        break;
      case 'shoot':
      case 'drum':
        done = this.trainingDrones.length > 0 && dronesLeft === 0;
        break;
      case 'roll':
        done = this.tileAt(this.player.x, this.player.y).x >= t.rollLine;
        break;
      case 'torch':
        done = t.weakWalls.every((p) => this.grid[p.y][p.x] !== Tile.WeakWall);
        break;
      case 'scanner':
        done = this.trainingMapSeen;
        break;
      case 'extract':
        done = false; // finished by stepping on the exit
        break;
    }
    if (!done) return;
    for (const p of t.gates[step.id] ?? []) this.cutTile(p.x, p.y);
    const door = this.trainingDoors.get(step.id);
    if (door) {
      this.tweens.add({ targets: door, alpha: 0, scaleY: 0.2, duration: 500, onComplete: () => door.destroy() });
      audio.play('doorOpen');
    } else audio.play('achievement');
    this.floatText(this.player.x, this.player.y - 18, `✓ ${step.title}`, '#3dff9a');
    this.trainingDrones = [];
    this.trainingStep += 1;
    this.time.delayedCall(450, () => !this.ended && this.startTrainingStep());
  }

  /** The step prompt: "TRAINING 3/9 · SUPPLIES" and what to do, in your controls. */
  private drawTrainingPrompt() {
    const step = TRAINING_STEPS[this.trainingStep];
    if (!step || !this.trainingPrompt) return;
    const scheme = pad.connected && pad.active ? 'pad' : this.touch.enabled ? 'touch' : 'keyboard';
    const { width: w, height: h } = this.scale;
    this.trainingPrompt.title.setText(`TRAINING ${this.trainingStep + 1}/${TRAINING_STEPS.length} · ${step.title}`);
    this.trainingPrompt.body.setText(trainingText(step, scheme)).setWordWrapWidth(Math.min(w - 32, 420));
    // Bottom of the screen on desktop; under the HUD on touch screens, clear of the thumb sticks.
    const y = this.touch.enabled ? 64 : h - 14 - this.trainingPrompt.body.height;
    this.trainingPrompt.title.setPosition(w / 2, y - 12);
    this.trainingPrompt.body.setPosition(w / 2, y);
    const pw = Math.max(this.trainingPrompt.body.width, this.trainingPrompt.title.width) + 20;
    this.trainingPrompt.panel.setPosition(w / 2, y - 16).setSize(pw, this.trainingPrompt.body.height + 24);
    for (const o of [this.trainingPrompt.panel, this.trainingPrompt.title, this.trainingPrompt.body]) {
      this.tweens.add({ targets: o, alpha: { from: 0.2, to: 1 }, duration: 250 });
    }
  }

  private setupTraining(t: TrainingDeck) {
    this.trainingGfx = this.add.graphics().setDepth(3);
    this.trainingDoors = new Map();
    // Sealed doors look like bulkheads until their step is done.
    for (const [id, tiles] of Object.entries(t.gates) as [TrainingStepId, Point[]][]) {
      const top = toWorld(tiles[0]);
      const door = this.add.image(top.x, top.y + TILE_SIZE / 2, 'bulkhead').setAngle(90).setDepth(7);
      this.trainingDoors.set(id, door);
    }
    const panel = this.add.rectangle(0, 0, 10, 10, 0x05070c, 0.82).setOrigin(0.5, 0).setStrokeStyle(1, 0x3dff9a, 0.6);
    const title = this.add.text(0, 0, '', { ...FONT, fontSize: '9px', color: '#3dff9a' }).setOrigin(0.5, 0);
    const body = this.add.text(0, 0, '', { ...FONT, fontSize: '10px', align: 'center', wordWrap: { width: 400 } }).setOrigin(0.5, 0);
    for (const o of [panel, title, body]) o.setScrollFactor(0).setDepth(250);
    this.trainingPrompt = { panel, title, body };
    this.trainingStep = 0;
    this.trainingDrones = [];
    this.trainingMapSeen = false;
    this.time.delayedCall(1200, () => this.startTrainingStep());
  }

  /** The end of training: no score, just a pat on the back (and a one-off reward). */
  private endTraining(extracted: boolean, reason: string) {
    const { width: w, height: h } = this.scale;
    const done = extracted && this.trainingStep >= TRAINING_STEPS.length - 1;
    let paid = false;
    if (done) {
      const r = completeTraining(loadSave(), TRAINING_REWARD);
      paid = r.paid;
      storeSave(r.save);
    }
    for (const o of this.trainingPrompt ? [this.trainingPrompt.panel, this.trainingPrompt.title, this.trainingPrompt.body] : []) o.setVisible(false);
    const ui = <T extends Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle>(o: T) => {
      o.setScrollFactor(0).setDepth(300);
      this.endScreen.push(o);
      return o;
    };
    this.time.delayedCall(extracted ? 800 : 950, () => {
      ui(this.add.rectangle(w / 2, h / 2, w, h, 0x05070c, 0.85));
      ui(
        this.add
          .text(w / 2, h / 2 - 60, done ? 'TRAINING COMPLETE' : extracted ? 'TRAINING OVER' : 'SIGNAL LOST', {
            ...FONT,
            fontSize: '18px',
            color: done ? '#3dff9a' : '#ff9a3c',
          })
          .setOrigin(0.5),
      );
      const lines = done
        ? [
            "You know the basics. Real ships are bigger, darker,",
            'and the things aboard fight back.',
            '',
            paid ? `+${TRAINING_REWARD} salvage for finishing training` : 'Training finished again: no reward this time.',
            'Spend salvage on upgrades back on your ship.',
          ]
        : [reason || 'Training ended early.', '', 'Replay it any time from the top of CREW.'];
      ui(this.add.text(w / 2, h / 2 - 16, lines.join('\n'), { ...FONT, fontSize: '10px', align: 'center', wordWrap: { width: w - 32 } }).setOrigin(0.5));
      const button = (y: number, label: string, onTap: () => void) =>
        ui(
          this.add
            .text(w / 2, y, label, { ...FONT, fontSize: '11px', backgroundColor: '#1b2333', padding: { x: 10, y: 5 } })
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
      const hub = () => {
        audio.play('ui');
        try {
          window.history.replaceState(null, '', window.location.pathname);
        } catch {
          /* ignore */
        }
        this.scene.start('Hub');
      };
      const retry = () => {
        audio.play('launch');
        this.scene.restart({ ...this.run });
      };
      const top = Math.min(h / 2 + 40, h - 50);
      button(top, this.touch.enabled ? 'RETURN TO SHIP' : 'RETURN TO SHIP  [ENTER]', hub);
      button(top + 26, this.touch.enabled ? 'PLAY TRAINING AGAIN' : 'PLAY TRAINING AGAIN  [R]', retry);
      this.input.keyboard?.once('keydown-ENTER', hub);
      this.input.keyboard?.once('keydown-R', retry);
      this.resultActions = { hub, retry, share: () => undefined };
    });
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

  shootAtPlayer(x: number, y: number, angle: number, speed: number, damage: number, texture: string, lifetimeMs = 2200) {
    this.sfx(texture === 'acid' ? 'acid' : 'enemyShot', x, y);
    const shot = this.hostileShots.create(x, y, texture) as Sprite;
    shot.setDepth(12).setCircle(2).setRotation(angle).setData('damage', damage);
    if (texture === 'bullet') shot.setTint(0xff5a6a);
    shot.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.time.delayedCall(lifetimeMs, () => shot.destroy());
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
    if (kind === 'stalker') {
      e.anims.play('stalker-run');
      e.setAlpha(0.08);
    }
    if (kind === 'egg') e.anims.play({ key: 'egg-pulse', startFrame: Math.round(x) % 2 });
    if (kind === 'sapper') e.anims.play({ key: 'sapper-blink', startFrame: Math.round(x + y) % 2 });
    if (kind === 'sweeper') {
      // Seeded by position so a shared ship sweeps the same way.
      const spin = Math.round(x / TILE_SIZE + y / TILE_SIZE) % 2 === 0 ? 1 : -1;
      e.setData({ beam: ((x * 7 + y * 13) % 628) / 100, spin });
    }
    if (kind === 'mimic') e.setData('dormant', true).setFrame(0);
    if (kind === 'turret') {
      e.setData('barrel', this.add.image(x, y, 'barrel').setOrigin(0.2, 0.5).setDepth(11));
    }
    if (RIVAL_KINDS.includes(kind)) e.setData('loot', []);
    return e;
  }

  // ---------------------------------------------------------------- first-time tips

  private updateTips(time: number) {
    // Wait for the boarding help text to fade before showing tips.
    if (!this.saveAtStart.settings.tips || time < this.nextTipCheck || time - this.runStartedAt < 7000) return;
    this.nextTipCheck = time + 400;
    if (time < this.tipUntil || this.tipsSeen.length >= TIP_IDS.length) return;
    const near = (x: number, y: number, r: number) => Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) < r;
    const pickupNear = (kind: string, r: number) =>
      (this.pickups.getChildren() as Sprite[]).some((p) => p.active && p.getData('kind') === kind && near(p.x, p.y, r));
    const triggered: TipId[] = [];
    if (this.oxygen.current < this.oxygen.max * 0.35) triggered.push('oxygen-low');
    if (this.hostiles().some((e) => !e.getData('dormant') && time < (e.getData('alertUntil') ?? 0) && near(e.x, e.y, 200))) triggered.push('hostile');
    if (this.barrels().some((d) => !d.getData('mine') && near(d.x, d.y, 80))) triggered.push('drum');
    if (this.barrels().some((d) => d.getData('mine') && near(d.x, d.y, 120))) triggered.push('mine');
    if (this.hostiles().some((e) => kindOf(e) === 'sweeper' && near(e.x, e.y, 170))) triggered.push('sweeper');
    if (this.liftPad && near(this.liftPad.x, this.liftPad.y, 140)) triggered.push('lift');
    if ((this.deck.hazards ?? []).some((h) => near((h.x + h.w / 2) * TILE_SIZE, (h.y + h.h / 2) * TILE_SIZE, 90))) triggered.push('shock');
    if (pickupNear('datalog', 90)) triggered.push('datalog');
    if (pickupNear('medkit', 70)) triggered.push('medkit');
    if (pickupNear('salvage', 70)) triggered.push('salvage');
    const t = this.tileAt(this.player.x, this.player.y);
    let wall = false;
    for (let dy = -3; dy <= 3 && !wall; dy++) for (let dx = -3; dx <= 3; dx++) if (this.grid[t.y + dy]?.[t.x + dx] === Tile.WeakWall) wall = true;
    if (wall && this.run.ship === 'mining' && !this.arena) triggered.push('ore');
    if (wall && this.stats.tool.id === 'torch') triggered.push('weak-wall');
    if (near(this.exitPad.x, this.exitPad.y, 160) && this.time.now - this.runStartedAt > 3000) triggered.push('exit');
    if (time - this.runStartedAt > 40000) triggered.push('scanner');
    const tip = nextTip(triggered, this.tipsSeen);
    if (tip) this.showTip(tip);
  }

  private showTip(id: TipId) {
    this.tipsSeen.push(id);
    storeSave(markTipSeen(loadSave(), id));
    const scheme = pad.connected && pad.active ? 'pad' : this.touch.enabled ? 'touch' : 'keyboard';
    const { width: w, height: h } = this.scale;
    this.tipBox?.destroy();
    this.tipBox = this.add
      .text(w / 2, this.touch.enabled ? h - 96 : h - 34, `TIP · ${tipText(id, scheme)}`, {
        ...FONT,
        fontSize: '9px',
        color: '#e8f4ff',
        backgroundColor: '#0d1a2acc',
        padding: { x: 8, y: 5 },
        align: 'center',
        wordWrap: { width: Math.min(360, w - 32) },
      })
      .setOrigin(0.5, 1)
      .setScrollFactor(0)
      .setDepth(140)
      .setAlpha(0);
    this.tweens.add({ targets: this.tipBox, alpha: 1, duration: 200 });
    this.tweens.add({ targets: this.tipBox, alpha: 0, delay: 5200, duration: 500 });
    this.tipUntil = this.time.now + 6200;
    audio.play('ui', { volume: 0.6 });
  }

  /** Bounty target: named, tougher, marked, and worth a reward. */
  private makeBounty(e: Sprite, name: string, reward: number) {
    e.setData({ bounty: { name, reward }, hp: Math.ceil((e.getData('hp') as number) * BOUNTY.hpMultiplier) });
    e.setScale(BOUNTY.scale).setTint(0xff7b9a);
    this.bountyTarget = e;
    this.bountyGfx = this.add.graphics().setDepth(17);
    this.bountyLabel = this.add
      .text(e.x, e.y - 16, name, { ...FONT, fontSize: '8px', color: '#ff7b9a' })
      .setOrigin(0.5, 1)
      .setDepth(17);
    this.time.delayedCall(2600, () => {
      if (!this.ended && e.active) this.showBanner(`BOUNTY: ${name}`, `Destroy it for +${reward} salvage. It's marked on your scanner.`, 0xff7b9a);
    });
  }

  private updateBounty(time: number) {
    const t = this.bountyTarget;
    if (!t) return;
    const g = this.bountyGfx.clear();
    if (!t.active) {
      this.bountyLabel?.destroy();
      this.bountyTarget = null;
      return;
    }
    const bob = Math.sin(time / 200) * 1.5;
    const y = t.y - 14 + bob;
    g.fillStyle(0xff7b9a, 1).fillTriangle(t.x - 3, y - 4, t.x + 3, y - 4, t.x, y);
    this.bountyLabel?.setPosition(t.x, y - 5);
  }

  /** Elite: double health, a little faster, gold, and always drops extra salvage. */
  private makeElite(e: Sprite) {
    e.setData({ elite: true, hp: Math.ceil((e.getData('hp') as number) * ELITE.hpMultiplier), speedMul: ELITE.speedMultiplier });
    e.setTint(0xffc94a).setScale(1.15);
  }

  moveTowards(e: Sprite, target: Point, speed: number) {
    speed *= ((e.getData('speedMul') as number | undefined) ?? 1) * this.mods.enemySpeed;
    this.physics.moveTo(e, target.x, target.y, speed);
  }

  followPath(e: Sprite, target: Point, speed: number) {
    speed *= ((e.getData('speedMul') as number | undefined) ?? 1) * this.mods.enemySpeed;
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
    pad.poll();
    if (this.ended) return this.padResults();
    const seconds = delta / 1000;

    this.updatePlayer(time);
    this.ghostRecorder?.sample(time - this.runStartedAt, this.player.x, this.player.y);
    this.ghostView?.update(time - this.runStartedAt);
    if (!this.rivalsArrived && time - this.runStartedAt > this.rivals.arrivesAfter * 1000) this.spawnRivals();
    for (const e of this.enemies.getChildren() as Sprite[]) if (e.active) updateEnemy(e, this, time);
    if (this.boss && !this.boss.dead) {
      if (!this.boss.awake && this.inArena()) this.boss.wake(time);
      this.boss.update(time, delta);
    }
    this.updateHack(seconds);

    this.oxygen = tickOxygen(this.oxygen, seconds);
    if (isOxygenEmpty(this.oxygen)) {
      this.hp -= SUFFOCATION_DPS * seconds;
      this.damageTaken += SUFFOCATION_DPS * seconds;
      if (this.hp <= 0) return this.endRun(false, this.isRobot ? 'Battery flat' : 'Oxygen depleted');
    }

    this.updateAudio(time);
    this.updateBounty(time);
    this.updateSentry(time);
    this.updateHazards(time);
    this.updateMines(time);
    this.drawTurretLasers(time);
    this.updateSelfRepair(time, seconds);
    if (this.training) this.updateTraining(time);
    else this.updateTips(time);
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
    if (Phaser.Input.Keyboard.JustDown(this.keys.TAB) || this.touch.consume('map') || pad.justPressed(PAD.BACK) || pad.justPressed(PAD.B)) {
      this.mapOpen = !this.mapOpen;
      this.mapDirty = true;
      if (this.mapOpen && this.training && TRAINING_STEPS[this.trainingStep]?.id === 'scanner') this.trainingMapSeen = true;
      audio.play('scan');
    }
    this.mapTiles.setVisible(this.mapOpen);
    this.mapMarks.setVisible(this.mapOpen);
    this.mapText.setVisible(this.mapOpen);
    if (this.mapOpen) this.drawScanner();
    const mini = this.saveAtStart.settings.minimap && !this.mapOpen;
    this.miniMap.setVisible(mini);
    if (mini && time > this.nextMiniAt) {
      this.nextMiniAt = time + 200;
      this.drawMiniMap();
    }
  }

  /** Always-on corner map: explored floor, you, and the exit once you've seen it. */
  private drawMiniMap() {
    const { width: w } = this.scale;
    const cell = Math.max(1, Math.floor(76 / this.deck.width));
    const mw = cell * this.deck.width;
    const mh = cell * this.deck.height;
    const x0 = w - 8 - mw;
    const y0 = Math.max(44, this.conditionText.y + this.conditionText.height + 6);
    const g = this.miniMap.clear();
    g.fillStyle(0x05070c, 0.75).fillRect(x0 - 2, y0 - 2, mw + 4, mh + 4);
    g.lineStyle(1, 0x2a3550, 1).strokeRect(x0 - 2.5, y0 - 2.5, mw + 5, mh + 5);
    const room = this.condition.scannerJammed ? this.currentRoom() : null;
    g.fillStyle(SHIP_LOOK[this.run.ship].mini, 1);
    for (let y = 0; y < this.deck.height; y++) {
      for (let x = 0; x < this.deck.width; x++) {
        if (this.grid[y][x] !== Tile.Floor || !isExplored(this.explored, this.deck.width, { x, y })) continue;
        if (room && !(x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h)) continue;
        g.fillRect(x0 + x * cell, y0 + y * cell, cell, cell);
      }
    }
    const exit = this.tileAt(this.exitPad.x, this.exitPad.y);
    if (isExplored(this.explored, this.deck.width, exit)) g.fillStyle(0x3dff9a, 1).fillRect(x0 + exit.x * cell - 1, y0 + exit.y * cell - 1, cell + 2, cell + 2);
    const p = this.tileAt(this.player.x, this.player.y);
    g.fillStyle(0xffffff, 1).fillRect(x0 + p.x * cell - 1, y0 + p.y * cell - 1, cell + 2, cell + 2);
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
    const look = SHIP_LOOK[this.run.ship];
    if (this.mapDirty) {
      this.mapDirty = false;
      const g = this.mapTiles.clear();
      g.fillStyle(0x05070c, 0.94).fillRect(f.x - 6, f.y - 6, f.mw + 12, f.mh + 12);
      g.lineStyle(1, look.frame, 0.6).strokeRect(f.x - 6.5, f.y - 6.5, f.mw + 13, f.mh + 13);
      const room = this.currentRoom();
      const jammed = this.condition.scannerJammed;
      for (let y = 0; y < this.deck.height; y++) {
        for (let x = 0; x < this.deck.width; x++) {
          if (!isExplored(this.explored, this.deck.width, { x, y })) continue;
          if (jammed && !(room && x >= room.x - 1 && x <= room.x + room.w && y >= room.y - 1 && y <= room.y + room.h)) continue;
          const t = this.grid[y][x];
          if (t === Tile.Floor) g.fillStyle(look.floor, 1);
          else if (t === Tile.WeakWall) g.fillStyle(0x8a6a2a, 1);
          else {
            // Only draw walls that touch floor, so rooms read as outlines.
            const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => this.grid[y + dy]?.[x + dx] === Tile.Floor);
            if (!edge) continue;
            g.fillStyle(look.wall, 0.75);
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
    const colours: Record<string, number> = {
      salvage: 0xe8b04a,
      oxygen: 0x3fa7ff,
      medkit: 0xff3b4e,
      datalog: 0x5ef2ff,
      overdrive: 0xff7b3a,
      aegis: 0x5ef2ff,
    };
    for (const p of this.pickups.getChildren() as Sprite[]) {
      if (p.active) dot(p.x, p.y, colours[p.getData('kind') as string] ?? 0xffffff);
    }
    for (const c of this.caches.getChildren() as Sprite[]) if (!c.getData('open')) dot(c.x, c.y, 0xb08a3a, 1.2);
    for (const b of this.barrels()) dot(b.x, b.y, 0xff7b3a);
    for (const h of this.deck.hazards ?? []) {
      if (!isExplored(this.explored, this.deck.width, { x: h.x, y: h.y })) continue;
      g.lineStyle(1, 0xffd166, 0.8).strokeRect(f.x + h.x * f.cell + 0.5, f.y + h.y * f.cell + 0.5, h.w * f.cell - 1, h.h * f.cell - 1);
    }
    const blink = Math.floor(this.time.now / 300) % 2 === 0;
    dot(this.exitPad.x, this.exitPad.y, 0x3dff9a, blink ? 1.8 : 1.3);
    if (this.liftPad) dot(this.liftPad.x, this.liftPad.y, 0xc9a0ff, blink ? 1.6 : 1.2);
    // The bounty's tracking beacon shows even in unexplored space.
    if (this.bountyTarget?.active) {
      const b = this.tileAt(this.bountyTarget.x, this.bountyTarget.y);
      const s = Math.max(3, f.cell * (blink ? 1.8 : 1.2));
      g.fillStyle(0xff7b9a, 1).fillRect(f.x + b.x * f.cell + (f.cell - s) / 2, f.y + b.y * f.cell + (f.cell - s) / 2, s, s);
    }
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
    audio.setIntensity(this.boss?.awake && !this.boss.dead ? 1 : combatIntensity(hunting));
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
    if (pad.move.magnitude > 0) {
      ix = pad.move.x;
      iy = pad.move.y;
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
    const usePad = pad.connected && pad.active;
    if (usePad) {
      if (pad.aim.magnitude > AIM_MIN) aim = pad.aim.angle;
      else if (moving) aim = Math.atan2(iy, ix);
    } else if (t.enabled) {
      if (t.aim.magnitude > 0) aim = t.aim.angle;
      else if (moving) aim = Math.atan2(iy, ix);
    } else {
      const pointer = this.input.activePointer;
      const target = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      aim = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    }
    this.player.setRotation(aim);

    // Lean the camera a little towards where you're aiming.
    const aiming = usePad ? pad.aim.magnitude > AIM_MIN || moving : t.enabled ? t.aim.magnitude > 0 || moving : true;
    this.lookX = Phaser.Math.Linear(this.lookX, aiming ? -Math.cos(aim) * 24 : 0, 0.08);
    this.lookY = Phaser.Math.Linear(this.lookY, aiming ? -Math.sin(aim) * 24 : 0, 0.08);
    this.cameras.main.setFollowOffset(this.lookX, this.lookY);

    if (Phaser.Input.Keyboard.JustDown(k.ESC) || Phaser.Input.Keyboard.JustDown(k.P) || t.consume('pause') || pad.justPressed(PAD.START)) {
      this.openPause();
      return;
    }

    const rollPressed =
      Phaser.Input.Keyboard.JustDown(k.SHIFT) || Phaser.Input.Keyboard.JustDown(k.SPACE) || t.consume('dodge') || pad.justPressed(PAD.A) || pad.justPressed(PAD.LB);
    if (rollPressed && !dodging && dodgeReadiness(time, this.lastDodgeAt, this.isRobot, this.rollRate) >= 1) this.startDodge(time, ix, iy, aim);

    if (Phaser.Input.Keyboard.JustDown(k.Q) || t.consume('swap') || pad.justPressed(PAD.Y)) this.switchWeapon();
    if (Phaser.Input.Keyboard.JustDown(k.ONE)) this.weaponIndex = 0;
    if (Phaser.Input.Keyboard.JustDown(k.TWO)) this.weaponIndex = 1;

    const pointer = this.input.activePointer;
    const mouseFire = !t.enabled && !usePad && pointer.leftButtonDown();
    const padFire = usePad && (pad.trigger > TRIGGER_FIRE || pad.aim.magnitude > STICK_FIRE);
    const weapon = this.weapons[this.weaponIndex];
    const rate = time < this.overdriveUntil ? POWERUPS.overdriveRate : 1;
    if ((mouseFire || padFire || t.firing) && time > this.lastShotAt + weapon.cooldownMs / rate) {
      this.lastShotAt = time;
      this.fire(weapon, aim);
    }

    const tool =
      Phaser.Input.Keyboard.JustDown(k.F) ||
      t.consume('torch') ||
      pad.justPressed(PAD.X) ||
      pad.justPressed(PAD.RB) ||
      (!t.enabled && !usePad && pointer.rightButtonDown());
    const toolId = this.stats.tool.id;
    if (tool && time > this.lastToolAt + TOOL_COOLDOWN[toolId]) {
      this.lastToolAt = time;
      if (toolId === 'hacker') this.startHack();
      else if (toolId === 'grav') this.useGrav(aim);
      else if (toolId === 'sentry') this.deploySentry(aim);
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
    if (weapon.chain) return this.fireArc(weapon, aim);
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

  /** Arc caster: instant lightning that jumps between hostiles (and sets off drums). */
  private fireArc(weapon: WeaponDef, aim: number) {
    type Target = { x: number; y: number; hit: (dmg: number) => void };
    const targets: Target[] = [];
    for (const e of this.hostiles()) targets.push({ x: e.x, y: e.y, hit: (d) => this.damageEnemy(e, d) });
    for (const d of this.barrels()) targets.push({ x: d.x, y: d.y, hit: (n) => this.damageDrum(d, n) });
    const boss = this.boss;
    if (boss?.awake && !boss.dead) {
      targets.push({ x: boss.sprite.x, y: boss.sprite.y, hit: (n) => boss.hit(n, false, boss.sprite.x, boss.sprite.y) });
      for (const part of boss.livingParts()) targets.push({ x: part.x, y: part.y, hit: (n) => boss.damagePart(part, n) });
    }
    const origin = { x: this.player.x + Math.cos(aim) * 9, y: this.player.y + Math.sin(aim) * 9 };
    const order = chainTargets(origin, aim, targets, weapon.chain ?? 1, (a, b) => this.canSee(a, b));

    const g = this.add.graphics().setDepth(16);
    const bolt = (a: Point, b: Point) => {
      // A jagged line with a soft glow under it.
      const steps = Math.max(3, Math.round(Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) / 12));
      const pts = [a];
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        pts.push({ x: a.x + (b.x - a.x) * t + Phaser.Math.Between(-4, 4), y: a.y + (b.y - a.y) * t + Phaser.Math.Between(-4, 4) });
      }
      pts.push(b);
      for (const [width, colour, alpha] of [[4, 0x5ef2ff, 0.35], [1.5, 0xe0f8ff, 1]] as const) {
        g.lineStyle(width, colour, alpha).beginPath().moveTo(pts[0].x, pts[0].y);
        for (const pt of pts.slice(1)) g.lineTo(pt.x, pt.y);
        g.strokePath();
      }
    };
    if (!order.length) {
      bolt(origin, { x: origin.x + Math.cos(aim) * 40, y: origin.y + Math.sin(aim) * 40 });
    } else {
      let from: Point = origin;
      order.forEach((i, hop) => {
        const t = targets[i];
        bolt(from, t);
        this.sparks.explode(5, t.x, t.y);
        t.hit(hop === 0 ? weapon.damage : Math.max(1, weapon.damage - 1));
        from = t;
      });
    }
    this.tweens.add({ targets: g, alpha: 0, duration: 140, onComplete: () => g.destroy() });
    this.shake(50, 0.002);
  }

  /** Cuts a weak wall directly in front of the player. */
  private useTorch(aim: number) {
    // The torch burns through a feeder root in one go.
    for (const part of (this.bossParts?.getChildren() ?? []) as Sprite[]) {
      if (part.getData('kind') !== 'root' || !part.getData('alive')) continue;
      const tx = this.player.x + Math.cos(aim) * 16;
      const ty = this.player.y + Math.sin(aim) * 16;
      if (Phaser.Math.Distance.Between(tx, ty, part.x, part.y) > 18) continue;
      this.oxygen = spendOxygen(this.oxygen, this.hasPerk('cold-cutter') ? 1 : TORCH_COST);
      this.sparks.explode(24, part.x, part.y);
      audio.play('torch');
      this.floatText(part.x, part.y - 14, 'BURNED', '#ffd166');
      this.boss?.breakPart(part);
      return;
    }
    for (const reach of [10, 18, 26]) {
      const t = this.tileAt(
        this.player.x + Math.cos(aim) * reach,
        this.player.y + Math.sin(aim) * reach,
      );
      if (this.grid[t.y]?.[t.x] !== Tile.WeakWall) continue;

      this.cutTile(t.x, t.y);
      // Training: one cut opens the whole cracked doorway.
      for (const p of this.training?.weakWalls ?? []) {
        if (this.grid[p.y][p.x] === Tile.WeakWall && Math.abs(p.x - t.x) + Math.abs(p.y - t.y) <= 2) this.cutTile(p.x, p.y);
      }
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

  // ---------------------------------------------------------------- deep dive

  /** Ordinary runs get a lift to a deeper deck, until the bottom. */
  private setupLift() {
    if (!(this.run.mode === 'random' || this.run.mode === 'custom') || this.depth >= DEPTH.max) return;
    const spot = placeLift(this.deck, bfsDistances(this.deck.tiles, this.deck.start));
    if (!spot) return;
    const { x, y } = toWorld(spot);
    this.liftPad = this.physics.add.staticImage(x, y, 'lift').setDepth(2);
    this.tweens.add({ targets: this.liftPad, angle: 360, repeat: -1, duration: 4000 });
  }

  /** Take the lift: carry everything down to the next deck. */
  private descend() {
    if (this.ended || this.descending) return;
    this.descending = true;
    const carry: Carry = {
      depth: this.depth + 1,
      hp: this.hp,
      oxygen: this.oxygen.current,
      salvage: this.salvage,
      kills: this.kills,
      logsFound: this.logsFound,
      elapsedMs: this.time.now - this.runStartedAt,
      tally: {
        kills: { ...this.killsByKind },
        elites: this.priorElites + this.elitesKilled,
        bounties: this.priorBounties + this.bountiesClaimed,
      },
    };
    audio.play('launch');
    this.player.setVelocity(0, 0);
    if (this.saveAtStart.settings.flashes) this.cameras.main.flash(250, 160, 110, 255);
    this.tweens.add({ targets: this.player, scale: 0.2, alpha: 0, duration: 450 });
    this.time.delayedCall(500, () =>
      this.scene.restart({ seed: deeperSeed(this.run.seed, carry.depth), mode: this.run.mode, ship: this.run.ship, carry }),
    );
  }

  /** Hostile turrets show a laser sight while they lock on, so their shots are fair. */
  private drawTurretLasers(time: number) {
    const g = this.laserGfx.clear();
    for (const e of this.enemies.getChildren() as Sprite[]) {
      if (!e.active || kindOf(e) !== 'turret' || isHacked(e) || !e.getData('tracking')) continue;
      const left = (e.getData('nextShot') ?? 0) - time;
      if (left <= 0 || left > TURRET_LOCK_MS) continue;
      const barrel = e.getData('barrel') as Phaser.GameObjects.Image;
      const len = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) + 6;
      const a = barrel.rotation;
      g.lineStyle(1, 0xff3b4e, 0.35 + 0.5 * (1 - left / TURRET_LOCK_MS));
      g.lineBetween(e.x + Math.cos(a) * 9, e.y + Math.sin(a) * 9, e.x + Math.cos(a) * len, e.y + Math.sin(a) * len);
    }
    this.updateSweepers(time, g);
  }

  /**
   * Sweeper beams: drawn every frame, stopped by walls. Touching a hostile beam
   * hurts (a dodge roll's i-frames get you through); a hacked one burns hostiles.
   */
  private updateSweepers(time: number, g: Phaser.GameObjects.Graphics) {
    const tick = time > this.nextBeamTick;
    if (tick) this.nextBeamTick = time + SWEEPER.hackedTickMs;
    for (const e of [...this.enemies.getChildren()] as Sprite[]) {
      if (!e.active || kindOf(e) !== 'sweeper' || time < (e.getData('stunnedUntil') ?? 0)) continue;
      const a = (e.getData('beam') as number | undefined) ?? 0;
      const sx = e.x + Math.cos(a) * 8;
      const sy = e.y + Math.sin(a) * 8;
      const end = beamEnd(this.grid, sx, sy, a, SWEEPER.beamLength, TILE_SIZE);
      const hacked = isHacked(e);
      const flicker = 0.75 + 0.25 * Math.sin(time / 40);
      g.lineStyle(5, hacked ? 0x2fb8c9 : 0xff5a1f, 0.25 * flicker).lineBetween(sx, sy, end.x, end.y);
      g.lineStyle(2, hacked ? 0x9ff6ff : 0xffb347, 0.9 * flicker).lineBetween(sx, sy, end.x, end.y);
      g.fillStyle(hacked ? 0xe0fbff : 0xffe0b0, 0.9).fillCircle(end.x, end.y, 2 + Math.sin(time / 30));
      if (hacked) {
        if (!tick) continue;
        for (const h of this.hostiles()) {
          if (h === e) continue;
          if (distanceToSegment(h.x, h.y, sx, sy, end.x, end.y) < SWEEPER.beamWidth + 4) this.damageEnemy(h, SWEEPER.hackedDamage);
        }
      } else if (distanceToSegment(this.player.x, this.player.y, sx, sy, end.x, end.y) < SWEEPER.beamWidth) {
        this.hurtPlayer(SWEEPER.damage);
      }
    }
  }

  // ---------------------------------------------------------------- daily ghost

  /** Fetches the day's leading ghost (or your own best, offline) and sets it running. */
  private async loadGhost(token: number) {
    const day = dayFromDailySeed(this.run.seed);
    if (!day) return;
    let found: { name: string; ghost: Ghost; score: number } | null = null;
    if (leaderboard.enabled) {
      try {
        const g = await leaderboard.dailyGhost(day);
        if (g) found = { name: g.callsign, ghost: g.ghost, score: g.score };
      } catch {
        /* offline: fall back to your own */
      }
    }
    if (!found) {
      const own = loadOwnGhost(day);
      const ghost = decodeGhost(own?.ghost);
      if (own && ghost) found = { name: 'YOUR BEST', ghost, score: own.score };
    }
    if (!found || token !== this.runToken || this.ended || !this.sys.isActive()) return;
    const look = ensureCharacterTexture(this, this.stats.character.id, this.stats.colours);
    this.ghostView = new GhostView(this, found.ghost, look.texture, found.name);
    this.floatText(this.player.x, this.player.y - 20, `GHOST: ${found.name} · ${found.score}`, '#9ff6ff');
  }

  // ---------------------------------------------------------------- sapper mines

  layMine(e: Sprite) {
    const mine = this.drums.create(e.x, e.y, 'mine', 0) as Sprite;
    mine.setDepth(5).setData({
      hp: 1,
      lit: false,
      mine: true,
      owner: e,
      armAt: this.time.now + MINE.armMs,
      expireAt: this.time.now + MINE.lifetimeMs,
      radius: MINE.radius,
      playerDamage: MINE.playerDamage,
      enemyDamage: MINE.enemyDamage,
    });
    (mine.body as Phaser.Physics.Arcade.StaticBody).setSize(6, 6);
    // Mines don't block anyone: you walk onto them.
    (mine.body as Phaser.Physics.Arcade.StaticBody).checkCollision.none = true;
    this.sfx('hackTick', e.x, e.y);
  }

  minesOf(e: Sprite): number {
    return (this.drums.getChildren() as Sprite[]).filter((d) => d.active && d.getData('owner') === e).length;
  }

  /** Mines arm, blink, and go off a moment after you get close. */
  private updateMines(time: number) {
    for (const m of [...this.drums.getChildren()] as Sprite[]) {
      if (!m.active || !m.getData('mine') || m.getData('lit')) continue;
      if (time > (m.getData('expireAt') as number)) {
        this.sparks.explode(4, m.x, m.y);
        m.destroy();
        continue;
      }
      const armed = time > (m.getData('armAt') as number);
      const triggered = m.getData('triggeredAt') as number | undefined;
      if (triggered !== undefined) {
        m.setFrame(Math.floor(time / 60) % 2);
        if (time > triggered + MINE.fuseMs) this.explodeDrum(m);
        continue;
      }
      m.setFrame(armed && Math.floor(time / 400) % 2 === 0 ? 1 : 0);
      if (armed && Phaser.Math.Distance.Between(m.x, m.y, this.player.x, this.player.y) < MINE.triggerRadius) {
        m.setData('triggeredAt', time);
        this.sfx('denied', m.x, m.y);
        this.floatText(m.x, m.y - 8, 'MINE!', '#ff5a6a');
      }
    }
  }

  /** Self-repair perk (robot): out of combat, battery becomes hull. */
  private updateSelfRepair(time: number, seconds: number) {
    if (!this.isRobot || !this.hasPerk('self-repair') || this.hp >= this.stats.maxHp) return;
    if (time - this.lastHurtAt < 4000 || this.oxygen.current < 15) return;
    const heal = Math.min(3 * seconds, this.stats.maxHp - this.hp);
    this.hp += heal;
    this.oxygen = spendOxygen(this.oxygen, heal * 0.8);
    if (Math.random() < seconds * 3) this.sparks.explode(1, this.player.x + Phaser.Math.Between(-5, 5), this.player.y + Phaser.Math.Between(-5, 5));
  }

  /** Shock floors: draw them, and hurt whatever stands on a live one. */
  private updateHazards(time: number) {
    const hazards = this.deck.hazards ?? [];
    const g = this.hazardGfx.clear();
    if (!hazards.length) return;
    const tick = time > this.nextShockTick;
    if (tick) this.nextShockTick = time + SHOCK.enemyTickMs;
    const you = this.tileAt(this.player.x, this.player.y);
    for (const h of hazards) {
      const state = h.alwaysOn ? 'on' : shockState(time, h.phaseMs);
      const x = h.x * TILE_SIZE;
      const y = h.y * TILE_SIZE;
      const w = h.w * TILE_SIZE;
      const hh = h.h * TILE_SIZE;
      // Grate outline and hazard corners, always visible.
      g.fillStyle(0x3a3010, 0.3).fillRect(x + 1, y + 1, w - 2, hh - 2);
      g.lineStyle(1, 0xffd166, 0.55).strokeRect(x + 1.5, y + 1.5, w - 3, hh - 3);
      for (let gx = x + 4; gx < x + w - 2; gx += 4) g.lineStyle(1, 0x2a3550, 0.9).lineBetween(gx, y + 3, gx, y + hh - 3);
      if (state === 'warn' && Math.floor(time / 90) % 2 === 0) g.fillStyle(0x6fd6ff, 0.18).fillRect(x + 2, y + 2, w - 4, hh - 4);
      if (state !== 'on') continue;
      g.fillStyle(0x5ef2ff, 0.28).fillRect(x + 2, y + 2, w - 4, hh - 4);
      g.lineStyle(1, 0xe0f8ff, 0.9);
      for (let i = 0; i < 3; i++) {
        let px = x + Phaser.Math.Between(2, w - 2);
        let py = y + 2;
        g.beginPath().moveTo(px, py);
        while (py < y + hh - 4) {
          px = Phaser.Math.Clamp(px + Phaser.Math.Between(-5, 5), x + 2, x + w - 2);
          py += Phaser.Math.Between(3, 6);
          g.lineTo(px, py);
        }
        g.strokePath();
      }
      const near = Phaser.Math.Distance.Between(this.player.x, this.player.y, x + w / 2, y + hh / 2) < 200;
      if (near && time > this.nextZap) {
        this.nextZap = time + 400;
        this.sfx('arc', x + w / 2, y + hh / 2);
      }
      if (onHazard(h, you.x, you.y)) this.hurtPlayer(SHOCK.playerDamage);
      if (tick) {
        for (const e of [...this.enemies.getChildren()] as Sprite[]) {
          const k = kindOf(e);
          // Drones hover, so they're safe; turrets and eggs are bolted down and shielded.
          if (!e.active || k === 'drone' || ENEMY_STATS[k].solid) continue;
          const t = this.tileAt(e.x, e.y);
          if (onHazard(h, t.x, t.y)) this.damageEnemy(e, SHOCK.enemyDamage);
        }
      }
    }
  }

  /** Sentry tool: drops a friendly auto-turret just ahead of you. */
  private deploySentry(aim: number) {
    this.removeSentry();
    let x = this.player.x + Math.cos(aim) * 14;
    let y = this.player.y + Math.sin(aim) * 14;
    const t = this.tileAt(x, y);
    if (this.grid[t.y]?.[t.x] !== Tile.Floor) ({ x, y } = this.player);
    this.oxygen = spendOxygen(this.oxygen, SENTRY.cost);
    const base = this.add.image(x, y, 'turret', 1).setDepth(9).setScale(0.8).setTint(0x9ff6ff);
    const gun = this.add.image(x, y, 'barrel').setOrigin(0.2, 0.5).setDepth(10).setTint(0x9ff6ff).setRotation(aim);
    const ring = this.add.graphics().setDepth(8);
    this.sentry = { base, gun, ring, until: this.time.now + SENTRY.lifetimeMs, nextShot: this.time.now + 300 };
    base.setScale(0.2);
    this.tweens.add({ targets: base, scale: 0.8, duration: 160, ease: 'Back.out' });
    audio.play('hackDone');
    this.floatText(x, y - 12, 'SENTRY UP', '#5ef2ff');
  }

  private updateSentry(time: number) {
    const s = this.sentry;
    if (!s) return;
    if (time > s.until) return this.removeSentry(true);
    // A ring that drains as its battery runs down.
    const left = (s.until - time) / SENTRY.lifetimeMs;
    s.ring.clear().lineStyle(1, 0x5ef2ff, 0.7).beginPath();
    s.ring.arc(s.base.x, s.base.y, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
    s.ring.strokePath();
    if (time < s.nextShot) return;
    let best: Sprite | null = null;
    let bestD: number = SENTRY.range;
    for (const e of this.hostiles()) {
      if (e.getData('dormant')) continue;
      const d = Phaser.Math.Distance.Between(s.base.x, s.base.y, e.x, e.y);
      if (d < bestD && this.canSee(s.base, e)) {
        best = e;
        bestD = d;
      }
    }
    const boss = this.boss;
    const bossTarget = boss?.awake && !boss.dead && Phaser.Math.Distance.Between(s.base.x, s.base.y, boss.sprite.x, boss.sprite.y) < SENTRY.range;
    const target = best ?? (bossTarget ? boss!.sprite : null);
    if (!target) return;
    s.nextShot = time + SENTRY.fireEveryMs;
    const a = Phaser.Math.Angle.Between(s.base.x, s.base.y, target.x, target.y);
    s.gun.setRotation(a);
    this.shootAtEnemies(s.base.x + Math.cos(a) * 7, s.base.y + Math.sin(a) * 7, a);
  }

  private removeSentry(expired = false) {
    const s = this.sentry;
    if (!s) return;
    if (expired) this.sparks.explode(10, s.base.x, s.base.y);
    for (const o of [s.base, s.gun, s.ring]) o.destroy();
    this.sentry = null;
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
    // The Hollow Captain's grenades fly back at him.
    if (this.boss instanceof CaptainFight && !this.boss.dead) this.boss.deflect((gx, gy) => inGravCone(x, y, aim, gx, gy));
    for (const shot of this.hostileShots.getChildren() as Sprite[]) {
      if (shot.active && inGravCone(x, y, aim, shot.x, shot.y)) {
        this.sparks.explode(4, shot.x, shot.y);
        shot.destroy();
      }
    }
  }

  private cutTile(x: number, y: number) {
    // Mining haulers: every cracked wall is an ore vein.
    if (this.run.ship === 'mining' && !this.arena && this.grid[y][x] === Tile.WeakWall) {
      const w = toWorld({ x, y });
      this.oreVeins += 1;
      const value = Math.round(Phaser.Math.Between(...ORE.value) * this.condition.salvage);
      this.time.delayedCall(80, () => this.addPickup(w.x + Phaser.Math.Between(-3, 3), w.y + Phaser.Math.Between(-3, 3), 'salvage', value, 'ore'));
      this.floatText(w.x, w.y - 16, 'ORE', '#ffb347');
    }
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
      (e) => e.active && (kindOf(e) === 'turret' || kindOf(e) === 'sweeper') && !isHacked(e),
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
    } else if (target.getData('kind') === 'sweeper') {
      target.setData('hacked', true).setFrame(1);
      this.floatText(target.x, target.y - 12, 'LASER HACKED', '#5ef2ff');
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
    if (kindOf(enemy) === 'stalker') enemy.setData('revealedUntil', this.time.now + 2500);
    amount *= this.mods.damageOut;
    if (enemy.getData('dormant')) wakeMimic(enemy, this, this.time.now);
    const hp = (enemy.getData('hp') as number) - amount;
    if (hp > 0) this.sfx('hit', enemy.x, enemy.y);
    enemy.setData({ hp, alertUntil: this.time.now + 4000 });
    enemy.setTintFill(0xffffff);
    this.time.delayedCall(60, () => {
      if (!enemy.active) return;
      enemy.clearTint();
      if (enemy.getData('bounty')) enemy.setTint(0xff7b9a);
      else if (enemy.getData('elite')) enemy.setTint(0xffc94a);
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
    this.killsByKind[kind] = (this.killsByKind[kind] ?? 0) + 1;
    if (kind === 'egg') this.eggsDestroyed += 1;
    if (RIVAL_KINDS.includes(kind)) this.rivalsKilled += 1;
    if (this.mods.healOnKill && this.hp < this.stats.maxHp) {
      this.hp = Math.min(this.stats.maxHp, this.hp + this.mods.healOnKill);
      this.floatText(this.player.x, this.player.y - 14, `+${this.mods.healOnKill}`, '#ff6b7d');
    }
    const bounty = enemy.getData('bounty') as { name: string; reward: number } | undefined;
    if (bounty) {
      this.bountiesClaimed += 1;
      this.addPickup(enemy.x - 6, enemy.y + 6, 'salvage', bounty.reward);
      this.showBanner('BOUNTY CLAIMED', `${bounty.name} is scrap. +${bounty.reward} salvage dropped`, 0x3dff9a);
      audio.play('achievement');
    }
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

    // Elites and bounties always carry a power-up; anything else rarely does.
    const power = rollPowerup(Math.random(), Math.random(), !!enemy.getData('elite') || !!enemy.getData('bounty'));
    if (power && !parent) this.addPickup(enemy.x + 7, enemy.y - 5, power, 0);

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

  hurtPlayer(amount: number, source?: Sprite) {
    if (this.time.now < this.invulnerableUntil || this.ended) return;
    if (this.aegis > 0) {
      // The shield soaks the hit.
      this.aegis -= 1;
      this.invulnerableUntil = this.time.now + 500;
      this.sparks.explode(10, this.player.x, this.player.y);
      audio.play('shieldBlock');
      this.floatText(this.player.x, this.player.y - 14, this.aegis ? 'SHIELD HOLDS' : 'SHIELD DOWN', '#5ef2ff');
      return;
    }
    this.invulnerableUntil = this.time.now + 800;
    this.lastHurtAt = this.time.now;
    if (this.saveAtStart.settings.assist) amount *= ASSIST.damage;
    amount *= this.mods.damageIn;
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
    if (kind === 'overdrive' || kind === 'aegis') {
      if (kind === 'overdrive') {
        this.overdriveUntil = this.time.now + POWERUPS.overdriveMs;
        this.floatText(item.x, item.y, 'OVERDRIVE', '#ff7b3a');
      } else {
        this.aegis = POWERUPS.aegisHits;
        this.floatText(item.x, item.y, 'AEGIS SHIELD', '#5ef2ff');
      }
      audio.play('hackDone');
      this.sparks.explode(12, item.x, item.y);
    } else if (kind === 'medkit') {
      // Left where it is when you're already at full health, for later.
      if (this.hp >= this.stats.maxHp) return;
      const heal = this.hasPerk('field-medic') ? Math.round(value * 1.6) : value;
      const healed = Math.min(heal, this.stats.maxHp - this.hp);
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
      this.combo = comboAfterPickup(this.combo, this.time.now);
      this.bestCombo = Math.max(this.bestCombo, this.combo.count);
      const mult = comboMultiplier(this.combo.count);
      const amount = Math.round(value * (this.hasPerk('scavenger') ? 1.25 : 1) * mult);
      this.salvage += amount;
      audio.play('salvage', { volume: 0.8 + Math.min(0.4, (mult - 1) * 0.8) });
      this.floatText(item.x, item.y, mult > 1 ? `+${amount} ×${mult.toFixed(1)}` : `+${amount}`, mult > 1 ? '#ffd166' : '#e8b04a');
    }
    item.destroy();
  }

  /**
   * Adds this run to your all-time totals (Log → Hall of fame). Only once your
   * name is claimed, never in assist mode, and quietly: a failure just skips it.
   */
  private postToHallOfFame(extracted: boolean, durationMs: number, save: SaveData) {
    if (!leaderboard.enabled || this.saveAtStart.settings.assist) return;
    if (!save.callsignClaimed || save.callsign !== save.callsignClaimed) return;
    const report: RunReport = {
      extracted,
      salvage: extracted ? this.salvage : 0,
      durationMs: Math.round(durationMs),
      depth: this.depth,
      kills: { ...this.killsByKind },
      elites: this.priorElites + this.elitesKilled,
      bounties: this.priorBounties + this.bountiesClaimed,
      boss: extracted && this.bossDefeated ? this.bossDefeated.id : null,
      bossMs: extracted && this.bossDefeated ? Math.round(this.bossDefeated.ms) : null,
    };
    if (!checkRunReport(report).ok) return;
    const token = this.runToken;
    leaderboard
      .submitRun(save.playerId, report)
      .then((clan) => {
        storeSave(setClanCache(loadSave(), clan ? { tag: clan.tag, name: clan.name } : loadSave().clan));
        // Your clan's share, at the top of the results screen.
        if (!clan || !extracted || token !== this.runToken || !this.ended) return;
        const rank = clan.weekRank ? ` · clan #${clan.weekRank} this week` : '';
        const line = this.add
          .text(this.scale.width / 2, 14, `+${clan.added} to [${clan.tag}]${rank}`, { ...FONT, fontSize: '10px', color: '#ff9a8a' })
          .setOrigin(0.5)
          .setScrollFactor(0)
          .setDepth(301);
        this.endScreen.push(line);
      })
      .catch(() => undefined);
  }

  private endRun(extracted: boolean, reason = '') {
    if (this.ended) return;
    this.ended = true;
    this.mapOpen = false;
    for (const o of [this.mapTiles, this.mapMarks, this.mapText, this.miniMap]) o.setVisible(false);
    this.player.anims.stop();
    this.player.setVelocity(0, 0);
    this.hackGfx.clear();
    for (const b of this.banners) b.destroy();
    this.drawHud();
    audio.setIntensity(0);
    if (extracted) this.extractionMoment();
    else this.deathMoment();
    if (this.training) return this.endTraining(extracted, reason);

    const durationMs = this.time.now - this.runStartedAt;
    const before = loadSave();
    let after = applyRunResult(before, {
      extracted,
      salvage: this.salvage,
      dronesDestroyed: this.kills,
      logsFound: this.logsFound,
      dodges: this.dodges,
      drumsDetonated: this.drumsDetonated,
      elitesKilled: this.elitesKilled,
      durationMs,
      depth: this.depth,
      bestCombo: this.bestCombo,
      bounties: this.bountiesClaimed,
    });
    after = recordRun(after, {
      at: new Date().toISOString(),
      ship: this.run.ship,
      mode: this.run.mode as Exclude<typeof this.run.mode, 'tutorial'>,
      seed: this.run.seed,
      character: this.stats.character.id,
      extracted,
      salvage: this.salvage,
      kills: this.kills,
      durationMs,
      ...(this.run.boss ? { boss: this.run.boss } : {}),
      ...(this.abandoned ? { abandoned: true } : {}),
    });
    const day = this.run.mode === 'daily' ? dayFromDailySeed(this.run.seed) : null;
    if (day && extracted) after = recordDaily(after, day, this.salvage);
    let streak: { count: number; bonus: number } | null = null;
    if (day && extracted) {
      const st = recordStreak(after, day);
      after = st.save;
      if (st.counted) streak = { count: st.save.streak.count, bonus: st.bonus };
    }
    const week = this.run.mode === 'weekly' ? weekFromSeed(this.run.seed) : null;
    if (week && extracted) after = recordWeekly(after, week, this.salvage);
    let bossResult: { firstKill: boolean; best: boolean; ms: number } | null = null;
    if (extracted && this.bossDefeated) {
      const prevBest = after.bosses[this.bossDefeated.id].bestMs;
      const rec = recordBossKill(after, this.bossDefeated.id, this.bossDefeated.ms);
      after = rec.save;
      bossResult = { firstKill: rec.firstKill, best: !prevBest || this.bossDefeated.ms < prevBest, ms: this.bossDefeated.ms };
    }
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
        // Arenas are small and open, so they don't count towards Cartographer.
        explored: this.run.boss ? 0 : exploredFraction(this.explored, this.grid),
        eggsDestroyed: this.eggsDestroyed,
        rivalsKilled: this.rivalsKilled,
        rivalsBoarded: this.rivalsBoarded,
        hacks: this.hacks,
        oreVeins: this.oreVeins,
        elitesKilled: this.elitesKilled,
        bossKilled: this.bossDefeated?.id ?? null,
        weekly: week !== null,
        bounties: this.bountiesClaimed,
        bestCombo: this.bestCombo,
        depth: this.depth,
      },
      before.achievements,
    );
    after = awardAchievements(after, earned);
    storeSave(after);
    const bonus = after.rewards.length > before.rewards.length;
    const banked = after.credits - before.credits;
    const newBest = extracted && this.salvage > before.stats.bestHaul;
    const unlockedResearch = !isResearchUnlocked(before.codex) && isResearchUnlocked(after.codex);
    const unlockedMining = !canBoard(before, 'mining') && canBoard(after, 'mining');

    // Results appear after the extraction / death moment has played out.
    this.time.delayedCall(extracted ? 800 : 950, () =>
      this.showResults(extracted, reason, { before, after, day, durationMs, bonus, banked, newBest, unlockedResearch, unlockedMining, earned, bossResult, streak }),
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
      unlockedMining: boolean;
      earned: Achievement[];
      bossResult: { firstKill: boolean; best: boolean; ms: number } | null;
      streak: { count: number; bonus: number } | null;
    },
  ) {
    const { after, day, durationMs, bonus, banked, newBest, unlockedResearch, unlockedMining, earned, bossResult, streak } = r;
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
    if (this.depth > 1) lines.push(`Deepest deck: ${this.depth}`);
    if (streak) lines.push(`Daily streak: ${streak.count} day${streak.count === 1 ? '' : 's'}  +${streak.bonus}`);
    if (this.run.mode === 'weekly' && extracted) lines.push(`Weekly best: ${after.weekly.best}`);
    if (this.run.boss) {
      const def = BOSSES[this.run.boss];
      if (bossResult) {
        lines.push(`${def.name} DOWN · ${formatDuration(bossResult.ms)}${bossResult.best ? ' (best)' : ''}`);
        if (bossResult.firstKill) lines.push(`First kill bonus +${def.firstKillReward}`);
      } else if (this.bossDefeated) lines.push(`${def.name} beaten, but you didn't get out`);
    }
    if (this.logsFound.length) lines.push(`Data log kept: ${this.logsFound.length}`);
    if (bonus) lines.push('Chapter complete! +bonus salvage');
    if (unlockedResearch) lines.push('NEW DESTINATION: research vessels');
    if (unlockedMining) lines.push('NEW DESTINATION: mining haulers');
    for (const a of earned) lines.push(`★ ${a.name.toUpperCase()}  +${a.reward}`);
    const paidWithoutExtracting = (bonus || earned.length > 0) && !extracted;
    lines.push(`Ship's hold: ${after.credits}${paidWithoutExtracting ? ` (+${banked})` : ''}`);
    if (earned.length) this.time.delayedCall(300, () => audio.play('achievement'));
    const summary = ui(this.add.text(w / 2, h / 2 - 12, lines.join('\n'), { ...FONT, fontSize: '11px', align: 'center' }).setOrigin(0.5));
    // Keep the title clear of the summary however many lines it has.
    title.setY(summary.y - summary.height / 2 - (extracted && (day || this.run.mode === 'weekly') ? 34 : 18));

    const retry = () => {
      audio.play('launch');
      // A deep dive retries from the top deck.
      const { carry: _carry, ...rest } = this.run;
      this.scene.restart({ ...rest, seed: baseSeed(this.run.seed) });
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

    this.postToHallOfFame(extracted, durationMs, after);

    // Keep your own best daily path locally, so there's a ghost to race offline too.
    const ghost = day && extracted && this.ghostRecorder ? this.ghostRecorder.encode() : null;
    if (day && ghost) storeOwnGhost({ day, score: this.salvage, durationMs: Math.round(durationMs), ghost });

    // Weekly Challenge: post to the week's board.
    const weekId = this.run.mode === 'weekly' ? weekFromWeeklySeed(this.run.seed) : null;
    if (weekId && extracted && leaderboard.enabled) {
      const status = ui(
        this.add
          .text(w / 2, summary.y - summary.height / 2 - 12, 'Posting to weekly board…', { ...FONT, fontSize: '10px', color: '#c9a0ff' })
          .setOrigin(0.5),
      );
      if (this.saveAtStart.settings.assist) status.setText('Assist mode: not posted to the weekly board');
      else {
        leaderboard
          .submitWeekly({
            week: weekId,
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
            if (after.callsign !== after.callsignClaimed) storeSave(setClaimedName(loadSave(), after.callsign));
            if (status.active) status.setText(`WEEKLY RANK #${r.rank} of ${r.total} · best ${r.best}`);
          })
          .catch((e: Error) => {
            const message = /name taken/.test(e.message) ? 'Name taken. Pick a new one in CREW' : `Weekly board: ${e.message}`;
            if (status.active) status.setText(message).setColor('#ff9a3c');
          });
      }
    }

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
      if (leaderboard.enabled && this.saveAtStart.settings.assist) {
        status.setText('Assist mode: not posted to the daily board');
      } else if (leaderboard.enabled) {
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
            this.lastRank = { rank: r.rank, total: r.total };
            // This run is your best today: post its path for others to race.
            if (r.best === this.salvage && ghost) {
              leaderboard.submitGhost(day, after.playerId, this.salvage, durationMs, ghost).catch(() => undefined);
            }
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
    // Three buttons need about 66px; keep them on screen on short landscape phones.
    const top = Math.min(h / 2 + 22 + lines.length * 6, h - 66);
    this.time.delayedCall(400, () => {
      button(top, this.touch.enabled ? 'RETURN TO SHIP' : 'RETURN TO SHIP  [ENTER]', hub);
      button(top + 26, this.touch.enabled ? 'RETRY THIS DERELICT' : 'RETRY THIS DERELICT  [R]', retry);
      const shareLabel = this.touch.enabled ? 'SHARE RESULT' : 'SHARE RESULT  [S]';
      const shareButton = button(top + 52, shareLabel, () => share());
      const share = () => {
        const text = shareText({
          run: this.run,
          extracted,
          salvage: this.salvage,
          kills: this.kills,
          durationMs: r.durationMs,
          base: `${window.location.origin}${window.location.pathname}`,
          rank: this.lastRank,
        });
        const done = (msg: string) => {
          shareButton.setText(msg);
          this.time.delayedCall(1600, () => shareButton.active && shareButton.setText(shareLabel));
        };
        audio.play('ui');
        // Phones get the native share sheet; elsewhere it goes to the clipboard.
        if (this.touch.enabled && typeof navigator.share === 'function') {
          navigator.share({ text }).then(() => done('SHARED'), () => done(shareLabel));
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(text).then(() => done('COPIED TO CLIPBOARD'), () => done('COULD NOT COPY'));
        } else done('COULD NOT COPY');
      };
      this.input.keyboard?.once('keydown-ENTER', hub);
      this.input.keyboard?.once('keydown-R', retry);
      this.input.keyboard?.on('keydown-S', share);
      this.resultActions = { hub, retry, share };
    });
  }

  // ---------------------------------------------------------------- drawing

  /** Darkens the ship, then cuts soft light holes for the player, exit, lamps and glowing things. */
  private drawLighting() {
    const view = this.cameras.main.worldView;
    const rt = this.darkness;
    rt.clear().fill(0x000000, Math.min(0.9, SHIP_LOOK[this.run.ship].dark + this.condition.darkness));
    const light = (key: string, x: number, y: number, size: number) => {
      if (x < view.x - size || x > view.right + size || y < view.y - size || y > view.bottom + size) return;
      rt.erase(key, x - view.x - size, y - view.y - size);
    };
    light('light', this.player.x, this.player.y, 120);
    light('light-small', this.exitPad.x, this.exitPad.y, 32);
    if (this.liftPad) light('light-small', this.liftPad.x, this.liftPad.y, 32);
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
    // Combo: shows next to the salvage count while the chain is alive.
    const left = comboTimeLeft(this.combo, this.time.now);
    const mult = comboMultiplier(this.combo.count);
    const showCombo = left > 0 && mult > 1;
    this.comboText.setVisible(showCombo);
    if (showCombo) {
      const sx = this.salvageText.x - this.salvageText.width - 8;
      this.comboText.setPosition(sx, 6).setText(`×${mult.toFixed(1)}`);
      g.fillStyle(0xffd166, 0.85).fillRect(sx - this.comboText.width, 17, this.comboText.width * left, 2);
    }
    const guns = this.weapons.map((w, i) => (i === this.weaponIndex ? `[${w.name}]` : ` ${w.name} `)).join(' ');
    this.weaponText.setText(`${guns}  · ${TOOL_LABEL[this.stats.tool.id]}`);

    this.drawBossBar(g);

    // Power-ups: a line under the weapons, and a ring round you while the shield's up.
    const od = Math.max(0, Math.ceil((this.overdriveUntil - this.time.now) / 1000));
    const parts = [od ? `OVERDRIVE ${od}s` : '', this.aegis ? `AEGIS ${'◆'.repeat(this.aegis)}` : ''].filter(Boolean);
    this.powerText.setText(parts.join('  '));
    if (this.aegis) {
      const v = this.cameras.main.worldView;
      g.lineStyle(1, 0x5ef2ff, 0.6 + 0.3 * Math.sin(this.time.now / 120)).strokeCircle(this.player.x - v.x, this.player.y - v.y, 11);
    }

    // Dodge recharge, as a thin bar under your feet while it refills.
    const ready = dodgeReadiness(this.time.now, this.lastDodgeAt, this.isRobot, this.rollRate);
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

  showBanner(title: string, subtitle: string, colour = 0x2fb6d6) {
    const { width: w } = this.scale;
    // One banner at a time: a new one replaces whatever is showing.
    for (const b of this.banners) {
      this.tweens.killTweensOf(b);
      b.destroy();
    }
    this.banners = [];
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

  floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, { ...FONT, fontSize: '9px', color })
      .setOrigin(0.5)
      .setDepth(95);
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  /** Plays a sound at a world position, panned and faded relative to the camera. */
  sfx(name: SfxName, x: number, y: number) {
    const cam = this.cameras.main;
    const heard = spatialise(x - cam.midPoint.x, y - cam.midPoint.y);
    if (heard) audio.play(name, heard);
  }

  shake(duration: number, intensity: number) {
    if (this.saveAtStart.settings.screenShake) this.cameras.main.shake(duration, intensity);
  }

  /** A split-second freeze that makes hits land. */
  hitStop(ms: number) {
    if (this.ended || this.physics.world.isPaused) return;
    this.physics.world.pause();
    this.time.delayedCall(ms, () => !this.ended && this.physics.world.resume());
  }

  private openPause() {
    if (this.ended || !this.scene.isActive()) return;
    this.player.setVelocity(0, 0);
    this.scene.launch('Pause', {
      summary: this.pauseSummary(),
      onAbandon: () => {
        this.abandoned = true;
        this.endRun(false, 'Run abandoned');
      },
    });
    this.scene.pause();
  }

  private get isRobot(): boolean {
    return this.stats.character.resource === 'battery';
  }

  // ---------------------------------------------------------------- boss arenas

  private bossLabel?: Phaser.GameObjects.Text;
  /** Results-screen buttons, for the gamepad (A: back to ship, X: retry). */
  private resultActions: { hub: () => void; retry: () => void; share: () => void } | null = null;
  private lastRank: { rank: number; total: number } | undefined;

  private padResults() {
    if (!this.resultActions) return;
    if (pad.justPressed(PAD.A) || pad.justPressed(PAD.START)) this.resultActions.hub();
    else if (pad.justPressed(PAD.X)) this.resultActions.retry();
    else if (pad.justPressed(PAD.Y)) this.resultActions.share();
  }

  /** Boss health along the bottom of the screen, with what state it's in. */
  private drawBossBar(g: Phaser.GameObjects.Graphics) {
    const boss = this.boss;
    const show = !!boss && boss.awake && !boss.dead && !this.ended;
    if (!show) {
      this.bossLabel?.setVisible(false);
      return;
    }
    const st = boss.status();
    const { width: w, height: h } = this.scale;
    const bw = Math.min(240, w * 0.56);
    const x = (w - bw) / 2;
    // On touch screens the bottom belongs to the thumb sticks, so the bar sits up top.
    const y = this.touch.enabled ? 58 : h - 20;
    g.fillStyle(0x0d1220, 0.92).fillRect(x - 2, y - 2, bw + 4, 9);
    g.fillStyle(st.vulnerable ? 0xffd166 : 0xff3b4e).fillRect(x, y, bw * (st.hp / st.max), 5);
    g.lineStyle(1, st.vulnerable ? 0xffd166 : 0x6f7fa3, 0.8).strokeRect(x - 2.5, y - 2.5, bw + 5, 10);
    if (!this.bossLabel) {
      this.bossLabel = this.add
        .text(0, 0, '', { ...FONT, fontSize: '9px', align: 'center' })
        .setOrigin(0.5, 1)
        .setScrollFactor(0)
        .setDepth(101);
    }
    this.bossLabel
      .setVisible(true)
      .setPosition(w / 2, y - 3)
      .setColor(st.vulnerable ? '#ffd166' : '#d7e3ff')
      .setText(`${st.name}  ·  ${st.state}`);
  }

  private setupArena(arena: ArenaDeck) {
    this.bossParts = this.physics.add.staticGroup();
    const parts = arena.features.map((f) => {
      const { x, y } = toWorld(f);
      const part = this.bossParts.create(x, y, f.kind) as Sprite;
      const hp = f.kind === 'coupling' ? FOREMAN.couplingHp : f.kind === 'pylon' ? CAPTAIN.pylonHp : MOTHER.rootHp;
      part.setDepth(6).setData({ kind: f.kind, hp, alive: true });
      (part.body as Phaser.Physics.Arcade.StaticBody).setSize(10, 10);
      return part;
    });
    // The sealed bulkhead over the vault door.
    const d0 = toWorld(arena.door[0]);
    this.bulkhead = this.add.image(d0.x + TILE_SIZE / 2, d0.y, 'bulkhead').setDepth(7);
    const bx = (arena.bossSpawn.x + 1) * TILE_SIZE;
    const by = arena.bossSpawn.y * TILE_SIZE + TILE_SIZE / 2;
    if (arena.boss === 'foreman') {
      const a = SECTIONS.arena;
      const hatches = [
        { x: (a.x + 1) * TILE_SIZE, y: (a.y + a.h / 2) * TILE_SIZE },
        { x: (a.x + a.w - 1) * TILE_SIZE, y: (a.y + a.h / 2) * TILE_SIZE },
      ];
      this.boss = new ForemanFight(this, bx, by, parts, hatches);
    } else if (arena.boss === 'captain') {
      // Open floor he can blink to: a grid over the arena, skipping pillars.
      const a = SECTIONS.arena;
      const spots: Point[] = [];
      for (let ty = a.y + 2; ty < a.y + a.h - 3; ty += 3) {
        for (let tx = a.x + 2; tx < a.x + a.w - 2; tx += 3) {
          const clear = [0, 1].every((dy) => [0, 1].every((dx) => this.grid[ty + dy]?.[tx + dx] === Tile.Floor));
          if (clear) spots.push({ x: (tx + 1) * TILE_SIZE, y: (ty + 1) * TILE_SIZE });
        }
      }
      this.boss = new CaptainFight(this, bx, by, parts, spots);
    } else {
      this.boss = new MotherFight(this, bx, by, parts);
    }
  }

  private setupBossCollisions(boss: BossFight) {
    const s = boss.sprite;
    this.physics.add.collider(s, this.layer);
    this.physics.add.collider(s, this.drums, (_b, drum) => {
      if (boss instanceof ForemanFight && boss.charging) this.explodeDrum(drum as Sprite);
    });
    this.physics.add.collider(s, this.bossParts);
    this.physics.add.collider(this.player, this.bossParts);
    this.physics.add.collider(this.enemies, this.bossParts);
    this.physics.add.collider(this.player, s, () => {
      if (boss instanceof ForemanFight || boss instanceof MotherFight || boss instanceof CaptainFight) boss.touchPlayer();
    });
    this.physics.add.overlap(this.bullets, s, (_s, b) => {
      const bullet = b as Sprite;
      if (!bullet.active || boss.dead) return;
      const already = bullet.getData('hit') as Set<unknown>;
      if (already.has(s)) return;
      already.add(s);
      const pierce = bullet.getData('pierce') as boolean;
      const done = boss.hit(bullet.getData('damage') as number, pierce, bullet.x, bullet.y);
      if (done <= 0) this.sparks.explode(4, bullet.x, bullet.y);
      if (!pierce || done <= 0) bullet.destroy();
    });
    const shootPart = (b: unknown, part: unknown) => {
      const bullet = b as Sprite;
      if (!bullet.active) return;
      this.sparks.explode(3, bullet.x, bullet.y);
      const dmg = bullet.getData('damage') as number;
      bullet.destroy();
      boss.damagePart(part as Sprite, dmg);
    };
    this.physics.add.collider(this.bullets, this.bossParts, shootPart);
    this.physics.add.collider(this.hostileShots, this.bossParts, (shot) => (shot as Sprite).destroy());
  }

  /** Whether you've walked out of the staging bay into the arena proper. */
  private inArena(): boolean {
    const t = this.tileAt(this.player.x, this.player.y);
    const a = SECTIONS.arena;
    return t.x >= a.x && t.x < a.x + a.w && t.y >= a.y && t.y < a.y + a.h - 2;
  }

  explosionAt(x: number, y: number, size: number) {
    this.sparks.explode(Math.round(size * 1.5), x, y);
    const ring = this.add.circle(x, y, size).setStrokeStyle(2, 0xffd166).setDepth(19).setScale(0.3);
    this.tweens.add({ targets: ring, scale: 1.2, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    this.sfx('explosion', x, y);
  }

  onBossDefeated(boss: BossFight) {
    if (this.ended) return;
    this.bossDefeated = { id: boss.def.id, ms: this.time.now - this.runStartedAt };
    const { x, y } = boss.sprite;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      this.addPickup(x + Math.cos(a) * 14, y + Math.sin(a) * 14, 'salvage', Phaser.Math.Between(20, 35));
    }
    this.showBanner(`${boss.def.name} DEFEATED`, 'The vault is open: grab the loot and get out', 0x3dff9a);
    // Each boss carries a chapter 2 log the first time.
    const log = bossLog([...this.saveAtStart.codex, ...this.logsFound], boss.def.id);
    if (log) {
      this.pendingLog = log;
      this.addPickup(x, y - 18, 'datalog', 0);
    }
    // Open the vault.
    for (const d of this.arena?.door ?? []) this.cutTile(d.x, d.y);
    audio.play('doorOpen');
    if (this.bulkhead) {
      const door = this.bulkhead;
      this.tweens.add({ targets: door, y: door.y - 14, alpha: 0, duration: 900, onComplete: () => door.destroy() });
    }
    this.shake(400, 0.008);
  }

  /** A few lines about the run for the pause screen. */
  private pauseSummary(): string[] {
    const where = this.run.boss
      ? `${BOSSES[this.run.boss].name} · ${BOSSES[this.run.boss].arena.toUpperCase()}`
      : `${vesselName(baseSeed(this.run.seed), this.run.ship)}${this.depth > 1 ? ` · DEPTH ${this.depth}` : ''}`;
    const lines = [where, `${formatDuration(this.time.now - this.runStartedAt)} aboard · ${this.salvage} salvage · ${this.kills} down`];
    if (this.mutators.length) lines.push(`Weekly: ${this.mutators.map((m) => m.name).join(' + ')}`);
    else if (this.condition.id !== 'calm') lines.push(`Condition: ${this.condition.name}`);
    const b = this.bountyTarget;
    if (b?.active) lines.push(`Bounty: ${(b.getData('bounty') as { name: string }).name} still out there`);
    else if (this.bountiesClaimed) lines.push('Bounty claimed');
    if (this.pendingLog) lines.push('A data log is still aboard');
    return lines;
  }

  private hudConditionLabel(): string {
    const lines: string[] = [];
    if (this.depth > 1) lines.push(`DEPTH ${this.depth}`);
    if (this.mutators.length) lines.push(...this.mutators.map((m) => m.name.toUpperCase()));
    else if (this.condition.id !== 'calm') lines.push(this.condition.name.toUpperCase());
    return lines.join('\n');
  }

  private currentRoom() {
    const p = this.tileAt(this.player.x, this.player.y);
    return this.deck.rooms.find((r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h) ?? null;
  }

  /** Adrenaline doubles how fast the roll recharges. */
  private get rollRate() {
    return this.hasPerk('adrenaline') ? 2 : 1;
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
  explodeDrum(drum: Sprite) {
    if (!drum.active || drum.getData('lit')) return;
    drum.setData('lit', true);
    const mine = drum.getData('mine') === true;
    if (!mine) this.drumsDetonated += 1;
    const { x, y } = drum;
    const demo = this.hasPerk('demolitionist');
    const baseRadius = (drum.getData('radius') as number | undefined) ?? BARREL.radius;
    const radius = demo ? baseRadius * 1.4 : baseRadius;
    const enemyMax = (drum.getData('enemyDamage') as number | undefined) ?? BARREL.enemyDamage;
    const playerMax = (drum.getData('playerDamage') as number | undefined) ?? BARREL.playerDamage;
    drum.destroy();
    this.sfx('explosion', x, y);
    this.sparks.explode(40, x, y);
    const fire = this.add.circle(x, y, radius, 0xff7b3a, 0.45).setDepth(18).setScale(0.2);
    const ring = this.add.circle(x, y, radius).setStrokeStyle(3, 0xffd166).setDepth(19).setScale(0.3);
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
      const dmg = blastDamage(Phaser.Math.Distance.Between(x, y, e.x, e.y), enemyMax, radius);
      if (dmg <= 0) continue;
      if (!ENEMY_STATS[kindOf(e)].solid) {
        const a = Phaser.Math.Angle.Between(x, y, e.x, e.y);
        e.setVelocity(Math.cos(a) * 220, Math.sin(a) * 220);
      }
      const before = this.kills;
      this.damageEnemy(e, dmg);
      if (this.kills > before) this.blastKills += 1;
    }
    if (this.boss?.awake && !this.boss.dead) {
      const reach = Phaser.Math.Distance.Between(x, y, this.boss.sprite.x, this.boss.sprite.y) - this.boss.radius;
      if (reach < radius) this.boss.blast();
    }
    for (const part of this.bossParts?.getChildren() ?? []) {
      const pt = part as Sprite;
      if (pt.getData('alive') && Phaser.Math.Distance.Between(x, y, pt.x, pt.y) < radius) this.boss?.breakPart(pt);
    }
    // Demolitionists know where to stand.
    const toYou = demo ? 0 : blastDamage(Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y), playerMax, radius);
    if (toYou > 0) this.hurtPlayer(toYou);

    // Cracked walls in the blast give way.
    const centre = this.tileAt(x, y);
    const reach = Math.ceil(radius / TILE_SIZE);
    for (let ty = centre.y - reach; ty <= centre.y + reach; ty++) {
      for (let tx = centre.x - reach; tx <= centre.x + reach; tx++) {
        if (this.grid[ty]?.[tx] !== Tile.WeakWall) continue;
        const w = toWorld({ x: tx, y: ty });
        if (Phaser.Math.Distance.Between(x, y, w.x, w.y) <= radius * 0.75) this.cutTile(tx, ty);
      }
    }

    for (const other of this.barrels()) {
      if (Phaser.Math.Distance.Between(x, y, other.x, other.y) <= radius) {
        this.time.delayedCall(BARREL.chainDelayMs, () => this.explodeDrum(other));
      }
    }
  }

  private hasPerk(id: string): boolean {
    return this.stats.perk?.id === id;
  }

  private addPickup(
    x: number,
    y: number,
    kind: 'oxygen' | 'salvage' | 'datalog' | 'medkit' | 'overdrive' | 'aegis',
    value: number,
    look?: string,
  ) {
    const texture = look ?? (kind === 'oxygen' && this.isRobot ? 'battery' : kind === 'medkit' && this.isRobot ? 'repairkit' : kind);
    const item = this.pickups.create(x, y, texture) as Sprite;
    item.setDepth(5).setData({ kind, value });
    this.tweens.add({ targets: item, y: y - 2, yoyo: true, repeat: -1, duration: 600 });
  }

  private tileAt(x: number, y: number): Point {
    return { x: Math.floor(x / TILE_SIZE), y: Math.floor(y / TILE_SIZE) };
  }
}
