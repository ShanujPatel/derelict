import Phaser from 'phaser';
import { TILE_SIZE } from '../art/sprites';
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
import { hashString, randomSeed, type ResolvedSeed } from '../core/seed';
import { Tile, type Point } from '../core/types';
import { WEAPONS, pelletAngles, type WeaponDef } from '../core/weapons';
import { loadBestSalvage, saveBestSalvage } from '../storage';
import { TouchControls } from '../ui/TouchControls';

type Sprite = Phaser.Physics.Arcade.Sprite;
type Keys = Record<
  'W' | 'A' | 'S' | 'D' | 'UP' | 'LEFT' | 'DOWN' | 'RIGHT' | 'Q' | 'F' | 'R' | 'ENTER' | 'ONE' | 'TWO',
  Phaser.Input.Keyboard.Key
>;

const PLAYER_SPEED = 110;
const MAX_HP = 100;
const DRONE_SPEED = 72;
const DRONE_SIGHT = 160;
const DRONE_HP = 3;
const TORCH_OXYGEN_COST = 4;
const SUFFOCATION_DPS = 6;
const DARKNESS = 0.6;

const FONT = { fontFamily: 'monospace', fontSize: '10px', color: '#d7e3ff' };

const toWorld = (p: Point) => ({
  x: p.x * TILE_SIZE + TILE_SIZE / 2,
  y: p.y * TILE_SIZE + TILE_SIZE / 2,
});

export class GameScene extends Phaser.Scene {
  private run!: ResolvedSeed;
  private deck!: Deck;
  private seedHash = 0;
  /** Live collision grid (weak walls become floor when cut). */
  private grid!: Tile[][];
  private layer!: Phaser.Tilemaps.TilemapLayer;

  private player!: Sprite;
  private playerShadow!: Phaser.GameObjects.Image;
  private drones!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.StaticGroup;
  private exitPad!: Phaser.Physics.Arcade.Image;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private muzzle!: Phaser.GameObjects.Image;
  private lamps: Phaser.GameObjects.Image[] = [];

  private keys!: Keys;
  private touch!: TouchControls;
  private darkness!: Phaser.GameObjects.RenderTexture;
  private hud!: Phaser.GameObjects.Graphics;
  private hpLabel!: Phaser.GameObjects.Text;
  private o2Label!: Phaser.GameObjects.Text;
  private salvageText!: Phaser.GameObjects.Text;
  private weaponText!: Phaser.GameObjects.Text;
  private seedText!: Phaser.GameObjects.Text;
  private endScreen: Phaser.GameObjects.GameObject[] = [];

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
    this.seedHash = hashString(data.seed);
    this.hp = MAX_HP;
    this.oxygen = createOxygen();
    this.salvage = 0;
    this.weapons = [WEAPONS.blaster, WEAPONS.scattergun];
    this.weaponIndex = 0;
    this.lastShotAt = 0;
    this.lastTorchAt = 0;
    this.invulnerableUntil = 0;
    this.ended = false;
    this.lamps = [];
    this.endScreen = [];
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
    const tileset = map.addTilesetImage('tiles', 'tiles', TILE_SIZE, TILE_SIZE, 0, 0);
    if (!tileset) throw new Error('Tileset missing');
    const layer = map.createLayer(0, tileset, 0, 0);
    if (!layer) throw new Error('Layer missing');
    this.layer = layer;
    this.layer.setCollision([...SOLID_DISPLAY_TILES]);

    // Blinking warning lamps on some bulkheads.
    for (const p of lampPositions(display, this.seedHash)) {
      const lamp = this.add.image(p.x * TILE_SIZE + 8, p.y * TILE_SIZE + 9, 'lamp').setDepth(3);
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
    this.drones = this.physics.add.group();
    this.bullets = this.physics.add.group();

    for (const s of this.deck.spawns) {
      const { x, y } = toWorld(s);
      if (s.kind === 'drone') {
        const d = this.drones.create(x, y, 'drone', 0) as Sprite;
        d.setDepth(10).setCircle(5, 2, 2).setCollideWorldBounds(true);
        d.anims.play({ key: 'drone-idle', startFrame: (s.x + s.y) % 2 });
        const shadow = this.add.image(x, y + 9, 'shadow').setDepth(4);
        d.setData({ hp: DRONE_HP, alertUntil: 0, nextWander: 0, shadow });
      } else {
        const item = this.pickups.create(x, y, s.kind) as Sprite;
        item.setDepth(5).setData({ kind: s.kind, value: s.value });
        this.tweens.add({ targets: item, y: y - 2, yoyo: true, repeat: -1, duration: 600 });
      }
    }

    const start = toWorld(this.deck.start);
    this.playerShadow = this.add.image(start.x, start.y + 7, 'shadow').setDepth(4);
    this.player = this.physics.add.sprite(start.x, start.y, 'player', 0);
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

    this.darkness = this.add
      .renderTexture(0, 0, this.scale.width, this.scale.height)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(90);
  }

  private setupInput() {
    const kb = this.input.keyboard;
    if (!kb) throw new Error('Keyboard input unavailable');
    this.keys = kb.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT,Q,F,R,ENTER,ONE,TWO') as Keys;
    this.input.mouse?.disableContextMenu();
    this.input.on('wheel', () => this.switchWeapon());
    this.touch = new TouchControls(this);
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
    const fixed = (t: Phaser.GameObjects.Text) => t.setScrollFactor(0).setDepth(101);
    this.hud = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hpLabel = fixed(this.add.text(0, 0, 'HP', FONT));
    this.o2Label = fixed(this.add.text(0, 0, 'O₂', FONT));
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
    const help = this.touch.enabled
      ? 'Left thumb: move · right thumb: aim + fire\nGUN: swap · TORCH: cut cracked walls\nReach the green EXIT'
      : 'WASD move · mouse aim + fire · Q swap gun\nF / right-click: torch cracked walls · reach the green EXIT';
    const title = this.add
      .text(w / 2, h * 0.22, 'BOARDING DERELICT', { ...FONT, fontSize: '16px', color: '#ffd166' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    const hint = this.add
      .text(w / 2, h * 0.68, help, { ...FONT, fontSize: '9px', color: '#9fb0d0', align: 'center' })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(200);
    this.tweens.add({ targets: title, alpha: 0, delay: 1800, duration: 600 });
    this.tweens.add({ targets: hint, alpha: 0, delay: 7000, duration: 800 });
  }

  // ---------------------------------------------------------------- loop

  update(time: number, delta: number) {
    this.touch.draw();
    if (this.ended) return;
    const seconds = delta / 1000;

    this.updatePlayer(time);
    this.updateDrones(time);

    this.oxygen = tickOxygen(this.oxygen, seconds);
    if (isOxygenEmpty(this.oxygen)) {
      this.hp -= SUFFOCATION_DPS * seconds;
      if (this.hp <= 0) return this.endRun(false, 'Oxygen depleted');
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
    this.player.setVelocity(ix * PLAYER_SPEED, iy * PLAYER_SPEED);
    const moving = Math.abs(ix) + Math.abs(iy) > 0.05;
    if (moving) this.player.anims.play('player-walk', true);
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

    const torch =
      Phaser.Input.Keyboard.JustDown(k.F) || t.consume('torch') || (!t.enabled && pointer.rightButtonDown());
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
      (d.getData('shadow') as Phaser.GameObjects.Image).setPosition(d.x, d.y + 9);
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

      this.oxygen = spendOxygen(this.oxygen, TORCH_OXYGEN_COST);
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
      const ring = this.add.circle(drone.x, drone.y, 4).setStrokeStyle(2, 0xffd166).setDepth(19);
      this.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
      this.cameras.main.shake(80, 0.006);
      (drone.getData('shadow') as Phaser.GameObjects.Image).destroy();
      drone.destroy();
    }
  }

  private hurtPlayer(amount: number, source: Sprite) {
    if (this.time.now < this.invulnerableUntil || this.ended) return;
    this.invulnerableUntil = this.time.now + 800;
    this.hp -= amount;
    this.cameras.main.shake(140, 0.012);
    this.cameras.main.flash(80, 120, 0, 0);
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
    this.player.anims.stop();
    this.drawHud();

    const best = loadBestSalvage();
    const banked = extracted ? this.salvage : 0;
    const newBest = banked > best;
    if (newBest) saveBestSalvage(banked);

    const { width: w, height: h } = this.scale;
    const ui = <T extends Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle>(o: T) => {
      o.setScrollFactor(0).setDepth(300);
      this.endScreen.push(o);
      return o;
    };

    ui(this.add.rectangle(w / 2, h / 2, w, h, 0x05070c, 0.8));
    ui(
      this.add
        .text(w / 2, h / 2 - 48, extracted ? 'EXTRACTED' : 'SIGNAL LOST', {
          ...FONT,
          fontSize: '20px',
          color: extracted ? '#3dff9a' : '#ff3b4e',
        })
        .setOrigin(0.5),
    );
    const lines = extracted
      ? [`Salvage banked: ${banked}`, newBest ? 'New best!' : `Best: ${Math.max(best, banked)}`]
      : [reason, `Salvage lost: ${this.salvage}`];
    ui(this.add.text(w / 2, h / 2 - 10, lines.join('\n'), { ...FONT, fontSize: '11px', align: 'center' }).setOrigin(0.5));

    const retry = () => this.scene.restart(this.run);
    const fresh = () => {
      const seed = randomSeed();
      try {
        window.history.replaceState(null, '', `?seed=${seed}`);
      } catch {
        /* ignore */
      }
      this.scene.restart({ seed, mode: 'random' } satisfies ResolvedSeed);
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
    this.time.delayedCall(400, () => {
      button(h / 2 + 26, this.touch.enabled ? 'RETRY THIS SHIP' : 'RETRY THIS SHIP  [ENTER]', retry);
      button(h / 2 + 52, this.touch.enabled ? 'NEW DERELICT' : 'NEW DERELICT  [R]', fresh);
      this.input.keyboard?.once('keydown-ENTER', retry);
      this.input.keyboard?.once('keydown-R', fresh);
    });
  }

  // ---------------------------------------------------------------- drawing

  /** Darkens the ship, then cuts soft light holes for the player, exit and lamps. */
  private drawLighting() {
    const cam = this.cameras.main;
    const view = cam.worldView;
    const rt = this.darkness;
    rt.clear().fill(0x000000, DARKNESS);
    const light = (key: string, x: number, y: number, size: number) => {
      if (x < view.x - size || x > view.right + size || y < view.y - size || y > view.bottom + size) return;
      rt.erase(key, x - view.x - size, y - view.y - size);
    };
    light('light', this.player.x, this.player.y, 120);
    light('light-small', this.exitPad.x, this.exitPad.y, 32);
    for (const lamp of this.lamps) light('light-small', lamp.x, lamp.y + 8, 32);
  }

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
        .map((w, i) => (i === this.weaponIndex ? `[${w.name}]` : ` ${w.name} `))
        .join(' '),
    );

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

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, { ...FONT, fontSize: '9px', color })
      .setOrigin(0.5)
      .setDepth(95);
    this.tweens.add({ targets: t, y: y - 14, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private tileAt(x: number, y: number): Point {
    return { x: Math.floor(x / TILE_SIZE), y: Math.floor(y / TILE_SIZE) };
  }
}
