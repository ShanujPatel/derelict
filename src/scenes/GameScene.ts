import Phaser from 'phaser';
import { TILE_SIZE } from '../art/sprites';
import { generateDeck, toDisplayTiles, type Deck } from '../core/deckGenerator';
import {
  createOxygen,
  isOxygenEmpty,
  refillOxygen,
  spendOxygen,
  tickOxygen,
  type OxygenState,
} from '../core/oxygen';
import { hasLineOfSight } from '../core/pathing';
import { randomSeed, type ResolvedSeed } from '../core/seed';
import { Tile, type Point } from '../core/types';
import { WEAPONS, pelletAngles, type WeaponDef } from '../core/weapons';
import { loadBestSalvage, saveBestSalvage } from '../storage';

type Sprite = Phaser.Physics.Arcade.Sprite;
type Keys = Record<
  'W' | 'A' | 'S' | 'D' | 'UP' | 'LEFT' | 'DOWN' | 'RIGHT' | 'Q' | 'F' | 'ONE' | 'TWO',
  Phaser.Input.Keyboard.Key
>;

const PLAYER_SPEED = 110;
const MAX_HP = 100;
const DRONE_SPEED = 72;
const DRONE_SIGHT = 160;
const DRONE_HP = 3;
const TORCH_OXYGEN_COST = 4;
const SUFFOCATION_DPS = 6;

const toWorld = (p: Point) => ({
  x: p.x * TILE_SIZE + TILE_SIZE / 2,
  y: p.y * TILE_SIZE + TILE_SIZE / 2,
});

export class GameScene extends Phaser.Scene {
  private run!: ResolvedSeed;
  private deck!: Deck;
  /** Live collision grid (weak walls become floor when cut). */
  private grid!: Tile[][];
  private layer!: Phaser.Tilemaps.TilemapLayer;

  private player!: Sprite;
  private drones!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.StaticGroup;
  private exitPad!: Phaser.Physics.Arcade.Image;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;

  private keys!: Keys;
  private hud!: Phaser.GameObjects.Graphics;
  private beacon!: Phaser.GameObjects.Graphics;
  private salvageText!: Phaser.GameObjects.Text;
  private weaponText!: Phaser.GameObjects.Text;

  // Run state — reset in init() because Phaser reuses the scene instance on restart.
  private hp = MAX_HP;
  private oxygen: OxygenState = createOxygen();
  private salvage = 0;
  private weapons: WeaponDef[] = [];
  private weaponIndex = 0;
  private lastShotAt = 0;
  private lastTorchAt = 0;
  private invulnerableUntil = 0;
  private ended = false;

  constructor() {
    super('Game');
  }

  init(data: ResolvedSeed) {
    this.run = data;
    this.hp = MAX_HP;
    this.oxygen = createOxygen();
    this.salvage = 0;
    this.weapons = [WEAPONS.blaster, WEAPONS.scattergun];
    this.weaponIndex = 0;
    this.lastShotAt = 0;
    this.lastTorchAt = 0;
    this.invulnerableUntil = 0;
    this.ended = false;
  }

  create() {
    this.physics.resume();
    this.deck = generateDeck(this.run.seed);
    this.grid = this.deck.tiles.map((row) => [...row]);

    this.buildMap();
    this.spawnEntities();
    this.setupInput();
    this.setupCollisions();
    this.buildHud();
    this.showIntro();
  }

  // ---------------------------------------------------------------- setup

  private buildMap() {
    const map = this.make.tilemap({
      data: toDisplayTiles(this.deck.tiles),
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
    });
    const tileset = map.addTilesetImage('tiles', 'tiles', TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) throw new Error('Tileset missing');
    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) throw new Error('Layer missing');
    this.layer = layer;
    this.layer.setCollision([Tile.Wall, Tile.WeakWall, Tile.Void]);

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
    this.drones = this.physics.add.group();
    this.bullets = this.physics.add.group();

    for (const s of this.deck.spawns) {
      const { x, y } = toWorld(s);
      if (s.kind === 'drone') {
        const d = this.drones.create(x, y, 'drone') as Sprite;
        d.setDepth(10).setCircle(5, 2, 2).setCollideWorldBounds(true);
        d.setData({ hp: DRONE_HP, alertUntil: 0, nextWander: 0 });
      } else {
        const item = this.pickups.create(x, y, s.kind) as Sprite;
        item.setDepth(5).setData({ kind: s.kind, value: s.value });
        this.tweens.add({ targets: item, y: y - 2, yoyo: true, repeat: -1, duration: 600 });
      }
    }

    const start = toWorld(this.deck.start);
    this.player = this.physics.add.sprite(start.x, start.y, 'player');
    this.player.setDepth(11).setCircle(5, 3, 3).setCollideWorldBounds(true);
    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 30, max: 140 },
      lifespan: { min: 150, max: 380 },
      scale: { start: 1, end: 0 },
      tint: [0xffd166, 0xff7b3a, 0xffffff],
      emitting: false,
    });
    this.sparks.setDepth(20);
    this.beacon = this.add.graphics().setDepth(15);
  }

  private setupInput() {
    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard input unavailable');
    this.keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,Q,F,ONE,TWO') as Keys;
    this.input.mouse?.disableContextMenu();
    this.input.on('wheel', () => this.switchWeapon());
  }

  private setupCollisions() {
    this.physics.add.collider(this.player, this.layer);
    this.physics.add.collider(this.drones, this.layer);
    this.physics.add.collider(this.drones, this.drones);
    this.physics.add.collider(this.bullets, this.layer, (b) => {
      const bullet = b as unknown as Sprite;
      this.sparks.explode(3, bullet.x, bullet.y);
      bullet.destroy();
    });
    this.physics.add.overlap(this.bullets, this.drones, (b, d) =>
      this.hitDrone(b as unknown as Sprite, d as unknown as Sprite),
    );
    this.physics.add.overlap(this.player, this.drones, (_p, d) =>
      this.hurtPlayer(12, d as unknown as Sprite),
    );
    this.physics.add.overlap(this.player, this.pickups, (_p, item) =>
      this.collect(item as unknown as Sprite),
    );
    this.physics.add.overlap(this.player, this.exitPad, () => this.endRun(true));
  }

  private buildHud() {
    const fixed = <T extends Phaser.GameObjects.Components.ScrollFactor>(o: T) => {
      o.setScrollFactor(0);
      return o;
    };
    const style = { fontFamily: 'monospace', fontSize: '10px', color: '#d7e3ff' };

    this.hud = fixed(this.add.graphics().setDepth(100));
    fixed(this.add.text(8, 6, 'HP', style).setDepth(101));
    fixed(this.add.text(8, 18, 'O₂', style).setDepth(101));
    this.salvageText = fixed(
      this.add.text(this.scale.width - 8, 6, '', style).setOrigin(1, 0).setDepth(101),
    );
    this.weaponText = fixed(
      this.add.text(8, this.scale.height - 16, '', style).setDepth(101),
    );
    const label = this.run.mode === 'daily' ? this.run.seed.toUpperCase() : `SEED ${this.run.seed}`;
    fixed(
      this.add
        .text(this.scale.width - 8, this.scale.height - 16, label, { ...style, color: '#6f7fa3' })
        .setOrigin(1, 0)
        .setDepth(101),
    );
  }

  private showIntro() {
    const cx = this.scale.width / 2;
    const title = this.add
      .text(cx, 60, 'BOARDING DERELICT', {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#ffd166',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    const help = this.add
      .text(
        cx,
        this.scale.height - 40,
        'WASD move · mouse aim + fire · Q swap gun\nF / right-click: torch cracked walls · reach the green EXIT',
        { fontFamily: 'monospace', fontSize: '9px', color: '#9fb0d0', align: 'center' },
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    this.tweens.add({ targets: title, alpha: 0, delay: 1800, duration: 600 });
    this.tweens.add({ targets: help, alpha: 0, delay: 7000, duration: 800 });
  }

  // ---------------------------------------------------------------- loop

  update(time: number, delta: number) {
    if (this.ended) return;
    const seconds = delta / 1000;

    this.updatePlayer(time);
    this.updateDrones(time);

    this.oxygen = tickOxygen(this.oxygen, seconds);
    if (isOxygenEmpty(this.oxygen)) {
      this.hp -= SUFFOCATION_DPS * seconds;
      if (this.hp <= 0) return this.endRun(false, 'Oxygen depleted');
    }

    this.drawHud();
    this.drawBeacon();
  }

  private updatePlayer(time: number) {
    const k = this.keys;
    const ix = Number(k.D.isDown || k.RIGHT.isDown) - Number(k.A.isDown || k.LEFT.isDown);
    const iy = Number(k.S.isDown || k.DOWN.isDown) - Number(k.W.isDown || k.UP.isDown);
    const len = Math.hypot(ix, iy) || 1;
    this.player.setVelocity((ix / len) * PLAYER_SPEED, (iy / len) * PLAYER_SPEED);

    const pointer = this.input.activePointer;
    const target = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const aim = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    this.player.setRotation(aim);

    if (Phaser.Input.Keyboard.JustDown(k.Q)) this.switchWeapon();
    if (Phaser.Input.Keyboard.JustDown(k.ONE)) this.weaponIndex = 0;
    if (Phaser.Input.Keyboard.JustDown(k.TWO)) this.weaponIndex = 1;

    const weapon = this.weapons[this.weaponIndex];
    if (pointer.leftButtonDown() && time > this.lastShotAt + weapon.cooldownMs) {
      this.lastShotAt = time;
      this.fire(weapon, aim);
    }

    const torch = Phaser.Input.Keyboard.JustDown(k.F) || pointer.rightButtonDown();
    if (torch && time > this.lastTorchAt + 300) {
      this.lastTorchAt = time;
      this.useTorch(aim);
    }
  }

  private updateDrones(time: number) {
    const playerTile = this.tileAt(this.player.x, this.player.y);
    for (const obj of this.drones.getChildren()) {
      const d = obj as Sprite;
      if (!d.active) continue;
      const dist = Phaser.Math.Distance.Between(d.x, d.y, this.player.x, this.player.y);
      if (dist < DRONE_SIGHT && hasLineOfSight(this.grid, this.tileAt(d.x, d.y), playerTile)) {
        d.setData('alertUntil', time + 2500);
      }
      if (time < d.getData('alertUntil')) {
        this.physics.moveToObject(d, this.player, DRONE_SPEED);
      } else if (time > d.getData('nextWander')) {
        const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const speed = Phaser.Math.Between(0, 1) ? 22 : 0;
        d.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
        d.setData('nextWander', time + Phaser.Math.Between(900, 2400));
      }
    }
  }

  // ---------------------------------------------------------------- actions

  private switchWeapon() {
    this.weaponIndex = (this.weaponIndex + 1) % this.weapons.length;
  }

  private fire(weapon: WeaponDef, aim: number) {
    for (const angle of pelletAngles(weapon, aim)) {
      const x = this.player.x + Math.cos(angle) * 9;
      const y = this.player.y + Math.sin(angle) * 9;
      const b = this.bullets.create(x, y, 'bullet') as Sprite;
      b.setDepth(12).setCircle(2).setRotation(angle);
      b.setVelocity(Math.cos(angle) * weapon.bulletSpeed, Math.sin(angle) * weapon.bulletSpeed);
      b.setData('damage', weapon.damage);
      this.time.delayedCall(weapon.lifetimeMs, () => b.destroy());
    }
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

      this.grid[t.y][t.x] = Tile.Floor;
      this.layer.putTileAt(Tile.Floor, t.x, t.y);
      // A weak wall can be two tiles thick; open the neighbour in the same line too.
      const nx = t.x + Math.round(Math.cos(aim));
      const ny = t.y + Math.round(Math.sin(aim));
      if (this.grid[ny]?.[nx] === Tile.WeakWall) {
        this.grid[ny][nx] = Tile.Floor;
        this.layer.putTileAt(Tile.Floor, nx, ny);
      }
      this.oxygen = spendOxygen(this.oxygen, TORCH_OXYGEN_COST);
      const w = toWorld(t);
      this.sparks.explode(24, w.x, w.y);
      this.floatText(w.x, w.y - 8, 'CUT', '#ffd166');
      return;
    }
  }

  private hitDrone(bullet: Sprite, drone: Sprite) {
    if (!bullet.active || !drone.active) return;
    const hp = drone.getData('hp') - bullet.getData('damage');
    const angle = Math.atan2(bullet.body!.velocity.y, bullet.body!.velocity.x);
    bullet.destroy();
    drone.setData({ hp, alertUntil: this.time.now + 4000 });
    drone.setTintFill(0xffffff);
    this.time.delayedCall(60, () => drone.active && drone.clearTint());
    drone.setVelocity(Math.cos(angle) * 140, Math.sin(angle) * 140);

    if (hp <= 0) {
      this.sparks.explode(30, drone.x, drone.y);
      this.cameras.main.shake(80, 0.006);
      drone.destroy();
    }
  }

  private hurtPlayer(amount: number, source: Sprite) {
    if (this.time.now < this.invulnerableUntil || this.ended) return;
    this.invulnerableUntil = this.time.now + 800;
    this.hp -= amount;
    this.cameras.main.shake(140, 0.012);
    this.player.setTintFill(0xff5566);
    this.time.delayedCall(90, () => this.player.clearTint());
    this.tweens.add({ targets: this.player, alpha: 0.3, yoyo: true, repeat: 3, duration: 90 });

    const a = Phaser.Math.Angle.Between(source.x, source.y, this.player.x, this.player.y);
    source.setVelocity(-Math.cos(a) * 120, -Math.sin(a) * 120);
    if (this.hp <= 0) this.endRun(false, 'Hull breach — salvager lost');
  }

  private collect(item: Sprite) {
    if (!item.active) return;
    const kind = item.getData('kind') as string;
    const value = item.getData('value') as number;
    if (kind === 'oxygen') {
      this.oxygen = refillOxygen(this.oxygen, value);
      this.floatText(item.x, item.y, `+${value} O₂`, '#6fd6ff');
    } else {
      this.salvage += value;
      this.floatText(item.x, item.y, `+${value}`, '#e8b04a');
    }
    item.destroy();
  }

  private endRun(extracted: boolean, reason = '') {
    if (this.ended) return;
    this.ended = true;
    this.physics.pause();

    const best = loadBestSalvage();
    const banked = extracted ? this.salvage : 0;
    const newBest = banked > best;
    if (newBest) saveBestSalvage(banked);

    const { width: w, height: h } = this.scale;
    const ui = (o: Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle) =>
      o.setScrollFactor(0).setDepth(300);

    ui(this.add.rectangle(w / 2, h / 2, w, h, 0x05070c, 0.78));
    ui(
      this.add
        .text(w / 2, h / 2 - 40, extracted ? 'EXTRACTED' : 'SIGNAL LOST', {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: extracted ? '#3dff9a' : '#ff3b4e',
        })
        .setOrigin(0.5),
    );
    const lines = extracted
      ? [`Salvage banked: ${banked}`, newBest ? 'New best!' : `Best: ${Math.max(best, banked)}`]
      : [reason, `Salvage lost: ${this.salvage}`];
    ui(
      this.add
        .text(w / 2, h / 2, lines.join('\n'), {
          fontFamily: 'monospace',
          fontSize: '11px',
          color: '#d7e3ff',
          align: 'center',
        })
        .setOrigin(0.5),
    );
    ui(
      this.add
        .text(w / 2, h / 2 + 44, 'ENTER / click  retry this ship\nR  board a new derelict', {
          fontFamily: 'monospace',
          fontSize: '10px',
          color: '#9fb0d0',
          align: 'center',
        })
        .setOrigin(0.5),
    );

    const kb = this.input.keyboard;
    const retry = () => this.scene.restart(this.run);
    // Short delay so a held mouse button doesn't skip the results screen.
    this.time.delayedCall(400, () => {
      kb?.once('keydown-ENTER', retry);
      this.input.once('pointerdown', retry);
      kb?.once('keydown-R', () => {
        const seed = randomSeed();
        try {
          window.history.replaceState(null, '', `?seed=${seed}`);
        } catch {
          /* ignore */
        }
        this.scene.restart({ seed, mode: 'random' } satisfies ResolvedSeed);
      });
    });
  }

  // ---------------------------------------------------------------- drawing

  private drawHud() {
    const g = this.hud.clear();
    const bar = (y: number, value: number, max: number, colour: number) => {
      g.fillStyle(0x0d1220, 0.9).fillRect(26, y, 82, 7);
      g.fillStyle(colour).fillRect(27, y + 1, Math.max(0, (value / max) * 80), 5);
    };
    bar(8, this.hp, MAX_HP, 0xff3b4e);
    const low = this.oxygen.current < 25 && Math.floor(this.time.now / 250) % 2 === 0;
    bar(20, this.oxygen.current, this.oxygen.max, low ? 0xffffff : 0x3fa7ff);

    this.salvageText.setText(`SALVAGE ${this.salvage}`);
    this.weaponText.setText(
      this.weapons
        .map((w, i) => (i === this.weaponIndex ? `[${i + 1} ${w.name}]` : ` ${i + 1} ${w.name} `))
        .join(' '),
    );
  }

  /** Small green arrow orbiting the player, pointing at the extraction pad. */
  private drawBeacon() {
    const g = this.beacon.clear();
    const dist = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.exitPad.x,
      this.exitPad.y,
    );
    if (dist < 120) return;
    const a = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.exitPad.x, this.exitPad.y);
    const r = 20;
    const tip = { x: this.player.x + Math.cos(a) * (r + 5), y: this.player.y + Math.sin(a) * (r + 5) };
    const l = { x: this.player.x + Math.cos(a - 0.25) * r, y: this.player.y + Math.sin(a - 0.25) * r };
    const rr = { x: this.player.x + Math.cos(a + 0.25) * r, y: this.player.y + Math.sin(a + 0.25) * r };
    g.fillStyle(0x3dff9a, 0.75).fillTriangle(tip.x, tip.y, l.x, l.y, rr.x, rr.y);
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, { fontFamily: 'monospace', fontSize: '9px', color })
      .setOrigin(0.5)
      .setDepth(50);
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private tileAt(x: number, y: number): Point {
    return { x: Math.floor(x / TILE_SIZE), y: Math.floor(y / TILE_SIZE) };
  }
}
