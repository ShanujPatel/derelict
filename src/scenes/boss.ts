import Phaser from 'phaser';
import {
  BOSSES,
  CAPTAIN,
  FOREMAN,
  MOTHER,
  bossPhase,
  captainDamage,
  fanAngles,
  foremanDamage,
  motherDamage,
  motherHeal,
  ringAngles,
  type BossDef,
  type BossId,
} from '../core/bosses';
import type { SfxName } from '../core/sfx';
import type { EnemyKind, Point } from '../core/types';

type Sprite = Phaser.Physics.Arcade.Sprite;

/** What a boss needs from the game. Implemented by GameScene. */
export interface BossHost extends Phaser.Scene {
  player: Sprite;
  sfx(name: SfxName, x: number, y: number): void;
  shake(duration: number, intensity: number): void;
  hitStop(ms: number): void;
  floatText(x: number, y: number, text: string, color: string): void;
  showBanner(title: string, subtitle: string, colour?: number): void;
  shootAtPlayer(x: number, y: number, angle: number, speed: number, damage: number, texture: string, lifetimeMs?: number): void;
  spawnEnemy(kind: EnemyKind, x: number, y: number): Sprite;
  hurtPlayer(amount: number, source?: Sprite): void;
  canSee(from: Point, to: Point): boolean;
  /** Sets off a fuel drum the boss ran into. */
  explodeDrum(drum: Sprite): void;
  explosionAt(x: number, y: number, size: number): void;
  onBossDefeated(boss: BossFight): void;
}

/** A coupling or root: a weak point the player can break. */
export type Part = Sprite;

export interface BossStatus {
  name: string;
  hp: number;
  max: number;
  /** Short state shown under the bar, e.g. "ARMOURED" or "STUNNED". */
  state: string;
  vulnerable: boolean;
}

/** Shared parts of both fights: health, the sprite, waking up, dying. */
export abstract class BossFight {
  readonly def: BossDef;
  readonly sprite: Sprite;
  hp: number;
  awake = false;
  dead = false;
  /** When the fight started (for the best-time record). */
  startedAt = 0;
  protected nextArmourText = 0;
  protected phase2 = false;

  constructor(
    protected host: BossHost,
    id: BossId,
    x: number,
    y: number,
    texture: string,
    readonly parts: Part[],
  ) {
    this.def = BOSSES[id];
    this.hp = this.def.hp;
    this.sprite = host.physics.add.sprite(x, y, texture).setDepth(10);
  }

  abstract get radius(): number;
  abstract status(): BossStatus;
  /** Applies a bullet hit; returns the damage actually done. */
  abstract hit(amount: number, pierce: boolean, x: number, y: number): number;
  /** A fuel drum went off nearby. */
  abstract blast(): void;
  abstract partDestroyed(part: Part): void;
  protected abstract tick(time: number, seconds: number): void;

  wake(time: number) {
    if (this.awake) return;
    this.awake = true;
    this.startedAt = time;
    this.host.sfx('bossRoar', this.sprite.x, this.sprite.y);
    this.host.shake(400, 0.012);
    this.host.showBanner(this.def.name, this.def.title, 0xff5a6a);
  }

  update(time: number, delta: number) {
    if (!this.awake || this.dead) return;
    if (!this.phase2 && bossPhase(this.hp, this.def.hp) === 2) {
      this.phase2 = true;
      this.enterPhase2();
    }
    this.tick(time, delta / 1000);
  }

  protected enterPhase2() {
    this.host.sfx('bossRoar', this.sprite.x, this.sprite.y);
    this.host.shake(300, 0.01);
  }

  /** Damage a part takes from one shot; destroys it at zero. */
  damagePart(part: Part, amount: number) {
    if (!part.getData('alive')) return;
    const hp = (part.getData('hp') as number) - amount;
    part.setData('hp', hp);
    part.setTintFill(0xffffff);
    this.host.time.delayedCall(50, () => part.clearTint());
    if (hp <= 0) this.breakPart(part);
    else this.host.sfx('hit', part.x, part.y);
  }

  breakPart(part: Part) {
    if (!part.getData('alive')) return;
    part.setData('alive', false);
    part.setTexture(`${part.getData('kind')}-dead`);
    this.host.explosionAt(part.x, part.y, 14);
    this.partDestroyed(part);
  }

  protected damage(amount: number, x: number, y: number) {
    if (amount <= 0 || this.dead) return;
    this.hp = Math.max(0, this.hp - amount);
    this.sprite.setTintFill(0xffffff);
    this.host.time.delayedCall(60, () => this.sprite.active && this.restoreTint());
    this.host.sfx('hit', x, y);
    if (this.hp <= 0) this.die();
  }

  protected restoreTint() {
    this.sprite.clearTint();
  }

  protected armourPing(x: number, y: number, label: string) {
    this.host.sfx('bossArmour', x, y);
    if (this.host.time.now > this.nextArmourText) {
      this.nextArmourText = this.host.time.now + 900;
      this.host.floatText(this.sprite.x, this.sprite.y - this.radius - 6, label, '#9fb0d0');
    }
  }

  protected die() {
    this.dead = true;
    this.sprite.setVelocity(0, 0);
    this.host.sfx('bossDie', this.sprite.x, this.sprite.y);
    const { x, y } = this.sprite;
    for (let i = 0; i < 7; i++) {
      this.host.time.delayedCall(i * 160, () =>
        this.host.explosionAt(x + Phaser.Math.Between(-16, 16), y + Phaser.Math.Between(-14, 14), 18 + i * 2),
      );
    }
    this.host.shake(1000, 0.016);
    this.host.tweens.add({
      targets: this.sprite,
      alpha: 0,
      scale: 0.7,
      delay: 900,
      duration: 500,
      onComplete: () => {
        this.sprite.destroy();
        this.host.onBossDefeated(this);
      },
    });
  }

  livingParts() {
    return this.parts.filter((p) => p.getData('alive'));
  }

  protected angleToPlayer() {
    return Phaser.Math.Angle.Between(this.sprite.x, this.sprite.y, this.host.player.x, this.host.player.y);
  }
}

// ---------------------------------------------------------------- the Foreman

type ForemanState = 'walk' | 'windup' | 'charge' | 'stunned';

export class ForemanFight extends BossFight {
  private state: ForemanState = 'walk';
  private stateUntil = 0;
  private nextCharge = 0;
  private nextSpray = 0;
  private nextDrone = 0;
  private chargeAngle = 0;
  private chargeHitPlayer = false;
  private armourGone = false;
  private drones: Sprite[] = [];
  private warning: Phaser.GameObjects.Graphics;

  constructor(host: BossHost, x: number, y: number, parts: Part[], private hatches: Point[]) {
    super(host, 'foreman', x, y, 'foreman', parts);
    this.sprite.setCircle(13, 5, 2).setCollideWorldBounds(true).setPushable(false);
    this.warning = host.add.graphics().setDepth(9);
  }

  get radius() {
    return 15;
  }

  private get stunned() {
    return this.state === 'stunned';
  }

  wake(time: number) {
    super.wake(time);
    this.nextCharge = time + 2500;
    this.nextSpray = time + 1500;
  }

  status(): BossStatus {
    const couplings = this.livingParts().length;
    let state = this.armourGone ? 'ARMOUR OFFLINE' : `ARMOURED · ${couplings} COUPLINGS`;
    if (this.stunned) state = 'STUNNED: OPEN FIRE';
    else if (this.state === 'windup') state = 'CHARGING';
    return { name: this.def.name, hp: this.hp, max: this.def.hp, state, vulnerable: this.stunned || this.armourGone };
  }

  hit(amount: number, pierce: boolean, x: number, y: number): number {
    const done = foremanDamage(amount, { stunned: this.stunned, armourGone: this.armourGone, pierce });
    if (done > 0) this.damage(done, x, y);
    else this.armourPing(x, y, 'ARMOURED');
    return done;
  }

  blast() {
    if (this.dead) return;
    this.stun(FOREMAN.blastStunMs, 'BLAST STUN');
    this.damage(FOREMAN.blastDamage, this.sprite.x, this.sprite.y);
  }

  partDestroyed() {
    const left = this.livingParts().length;
    if (left === 0 && !this.armourGone) {
      this.armourGone = true;
      this.host.showBanner('ARMOUR OFFLINE', 'Every coupling is down: it takes full damage now', 0x3dff9a);
    } else {
      this.host.floatText(this.sprite.x, this.sprite.y - 24, `COUPLING DOWN · ${left} LEFT`, '#5ef2ff');
    }
    // The power surge overloads it for a moment.
    if (this.awake) this.stun(FOREMAN.couplingStunMs, 'OVERLOAD');
  }

  /** Called when its body hits a wall or pillar. */
  hitWall() {
    if (this.state !== 'charge') return;
    this.host.sfx('bossSlam', this.sprite.x, this.sprite.y);
    this.host.explosionAt(
      this.sprite.x + Math.cos(this.chargeAngle) * 16,
      this.sprite.y + Math.sin(this.chargeAngle) * 16,
      10,
    );
    this.host.shake(280, 0.016);
    this.host.hitStop(80);
    this.stun(FOREMAN.wallStunMs, 'STUNNED');
  }

  /** Touching you hurts; a charge hurts more. */
  touchPlayer() {
    if (this.dead || !this.awake || this.stunned) return;
    if (this.state === 'charge') {
      if (this.chargeHitPlayer) return;
      this.chargeHitPlayer = true;
      this.host.hurtPlayer(FOREMAN.chargeDamage, this.sprite);
    } else this.host.hurtPlayer(FOREMAN.contactDamage, this.sprite);
  }

  get charging() {
    return this.state === 'charge';
  }

  private stun(ms: number, label: string) {
    const now = this.host.time.now;
    this.state = 'stunned';
    this.stateUntil = Math.max(this.stateUntil, now + ms);
    this.sprite.setVelocity(0, 0).setTexture('foreman-stunned');
    this.warning.clear();
    this.host.floatText(this.sprite.x, this.sprite.y - 22, label, '#ffd166');
  }

  protected restoreTint() {
    this.sprite.clearTint();
    if (this.phase2) this.sprite.setTint(0xffb0a0);
  }

  protected enterPhase2() {
    super.enterPhase2();
    this.sprite.setTint(0xffb0a0);
    this.host.showBanner('OVERDRIVE', 'The Foreman is calling in drones', 0xff5a6a);
    this.nextDrone = this.host.time.now + 1500;
  }

  protected tick(time: number) {
    const p = this.phase2 ? 1 : 0;
    const s = this.sprite;
    this.drones = this.drones.filter((d) => d.active);

    switch (this.state) {
      case 'stunned':
        s.setVelocity(0, 0);
        if (time > this.stateUntil) {
          this.state = 'walk';
          s.setTexture('foreman');
          this.nextCharge = Math.max(this.nextCharge, time + 1200);
        }
        return;

      case 'windup': {
        s.setVelocity(0, 0);
        // The aim locks in partway through, so you can sidestep it.
        const locked = time > this.stateUntil - FOREMAN.chargeWindupMs[p] * 0.35;
        if (!locked) this.chargeAngle = this.angleToPlayer();
        s.setRotation(this.chargeAngle);
        const g = this.warning.clear();
        const flicker = Math.floor(time / 90) % 2 === 0;
        g.lineStyle(locked ? 3 : 2, 0xff3b4e, flicker ? 0.9 : 0.4);
        g.lineBetween(s.x, s.y, s.x + Math.cos(this.chargeAngle) * 420, s.y + Math.sin(this.chargeAngle) * 420);
        if (time > this.stateUntil) {
          this.warning.clear();
          this.state = 'charge';
          this.chargeHitPlayer = false;
          this.stateUntil = time + FOREMAN.chargeMaxMs;
          s.setVelocity(Math.cos(this.chargeAngle) * FOREMAN.chargeSpeed, Math.sin(this.chargeAngle) * FOREMAN.chargeSpeed);
          this.host.shake(120, 0.006);
        }
        return;
      }

      case 'charge': {
        s.setVelocity(Math.cos(this.chargeAngle) * FOREMAN.chargeSpeed, Math.sin(this.chargeAngle) * FOREMAN.chargeSpeed);
        const b = s.body as Phaser.Physics.Arcade.Body;
        if (b.blocked.left || b.blocked.right || b.blocked.up || b.blocked.down) return this.hitWall();
        if (time > this.stateUntil) {
          this.state = 'walk';
          this.nextCharge = time + FOREMAN.chargeEveryMs[p];
        }
        return;
      }

      case 'walk': {
        const a = this.angleToPlayer();
        s.setRotation(Phaser.Math.Angle.RotateTo(s.rotation, a, 0.05));
        this.host.physics.moveToObject(s, this.host.player, FOREMAN.walkSpeed[p]);
        const sees = this.host.canSee(s, this.host.player);
        if (time > this.nextCharge && sees) {
          this.state = 'windup';
          this.stateUntil = time + FOREMAN.chargeWindupMs[p];
          this.host.sfx('bossCharge', s.x, s.y);
          return;
        }
        if (time > this.nextSpray && sees) {
          this.nextSpray = time + FOREMAN.sprayEveryMs[p];
          const shots = FOREMAN.sprayShots[p];
          for (const angle of fanAngles(a, shots, this.phase2 ? 1.4 : 0.9)) {
            this.host.shootAtPlayer(s.x + Math.cos(angle) * 18, s.y + Math.sin(angle) * 18, angle, 150, FOREMAN.sprayDamage, 'bullet', 3500);
          }
        }
        if (this.phase2 && time > this.nextDrone && this.drones.length < FOREMAN.maxDrones) {
          this.nextDrone = time + FOREMAN.droneEveryMs;
          const hatch = this.hatches[Math.floor(Math.random() * this.hatches.length)];
          const d = this.host.spawnEnemy('drone', hatch.x, hatch.y);
          d.setData('alertUntil', time + 60000);
          this.drones.push(d);
          this.host.explosionAt(hatch.x, hatch.y, 8);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- the Bloom Mother

type MotherState = 'closed' | 'tell' | 'open';

export class MotherFight extends BossFight {
  private state: MotherState = 'closed';
  private stateUntil = 0;
  private nextCrawler = 0;
  private nextSpores = 0;
  private crawlers: Sprite[] = [];
  private tethers: Phaser.GameObjects.Graphics;

  constructor(host: BossHost, x: number, y: number, parts: Part[]) {
    super(host, 'mother', x, y, 'mother', parts);
    this.sprite.setCircle(19, 5, 3).setImmovable(true).setPushable(false);
    this.tethers = host.add.graphics().setDepth(4);
  }

  get radius() {
    return 20;
  }

  private get open() {
    return this.state === 'open';
  }

  wake(time: number) {
    super.wake(time);
    this.stateUntil = time + 2200;
    this.nextCrawler = time + 4000;
  }

  status(): BossStatus {
    const roots = this.livingParts().length;
    const state = this.open ? 'CORE EXPOSED: OPEN FIRE' : roots ? `CARAPACE · ${roots} ROOTS FEEDING` : 'CARAPACE · ROOTS CUT';
    return { name: this.def.name, hp: this.hp, max: this.def.hp, state, vulnerable: this.open };
  }

  hit(amount: number, _pierce: boolean, x: number, y: number): number {
    const done = motherDamage(amount, { open: this.open });
    if (done > 0) this.damage(done, x, y);
    else this.armourPing(x, y, 'CARAPACE');
    return done;
  }

  blast() {
    if (this.dead) return;
    this.damage(MOTHER.blastDamage, this.sprite.x, this.sprite.y);
    this.host.floatText(this.sprite.x, this.sprite.y - 26, 'SCORCHED', '#ff9a3c');
  }

  partDestroyed(part: Part) {
    this.host.floatText(part.x, part.y - 10, 'ROOT CUT', '#9bff5c');
    part.setData('regrowAt', this.host.time.now + MOTHER.rootRegrowMs);
    if (this.awake) this.host.sfx('bossRoar', this.sprite.x, this.sprite.y);
  }

  touchPlayer() {
    if (this.dead || !this.awake) return;
    this.host.hurtPlayer(MOTHER.contactDamage, this.sprite);
  }

  protected enterPhase2() {
    super.enterPhase2();
    this.host.showBanner('THE BLOOM SPREADS', 'Spore rings incoming: roll through them', 0x9bff5c);
    this.nextSpores = this.host.time.now + 2000;
  }

  protected tick(time: number, seconds: number) {
    const p = this.phase2 ? 1 : 0;
    const s = this.sprite;
    this.crawlers = this.crawlers.filter((c) => c.active);

    // Roots regrow, and the living ones feed her.
    for (const part of this.parts) {
      if (!part.getData('alive') && time > (part.getData('regrowAt') ?? Infinity)) {
        part.setData({ alive: true, hp: MOTHER.rootHp }).setTexture('root');
        this.host.floatText(part.x, part.y - 10, 'ROOT REGROWN', '#c06bff');
      }
    }
    const living = this.livingParts();
    this.hp = motherHeal(this.hp, this.def.hp, living.length, seconds);
    const g = this.tethers.clear();
    const pulse = 0.35 + 0.25 * Math.sin(time / 180);
    for (const r of living) {
      g.lineStyle(2, 0x9bff5c, pulse).lineBetween(r.x, r.y - 3, s.x, s.y + 8);
    }

    switch (this.state) {
      case 'closed':
        if (time > this.stateUntil) {
          this.state = 'tell';
          this.stateUntil = time + MOTHER.tellMs;
          this.host.tweens.add({ targets: s, scaleX: 1.08, scaleY: 0.94, yoyo: true, repeat: 2, duration: 100 });
          this.host.sfx('bossRoar', s.x, s.y);
        }
        break;
      case 'tell':
        if (time > this.stateUntil) {
          this.state = 'open';
          this.stateUntil = time + MOTHER.openMs;
          s.setTexture('mother-open');
          const aim = this.angleToPlayer();
          for (const angle of fanAngles(aim, MOTHER.acidShots[p], 1.1)) {
            this.host.shootAtPlayer(s.x + Math.cos(angle) * 14, s.y + Math.sin(angle) * 14, angle, MOTHER.acidSpeed, MOTHER.acidDamage, 'acid', 3600);
          }
        }
        break;
      case 'open':
        if (time > this.stateUntil) {
          this.state = 'closed';
          this.stateUntil = time + MOTHER.openEveryMs[p];
          s.setTexture('mother');
        }
        break;
    }

    if (time > this.nextCrawler) {
      this.nextCrawler = time + MOTHER.crawlerEveryMs[p];
      if (this.crawlers.length < MOTHER.maxCrawlers) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const c = this.host.spawnEnemy('crawler', s.x + side * 22, s.y + 18);
        c.setData('alertUntil', time + 60000);
        this.crawlers.push(c);
      }
    }

    if (this.phase2 && time > this.nextSpores) {
      this.nextSpores = time + MOTHER.sporeEveryMs;
      for (const angle of ringAngles(MOTHER.sporeShots, Math.random() * Math.PI)) {
        this.host.shootAtPlayer(s.x + Math.cos(angle) * 16, s.y + Math.sin(angle) * 16, angle, MOTHER.sporeSpeed, MOTHER.sporeDamage, 'acid', 6000);
      }
    }
  }

  protected die() {
    this.tethers.clear();
    super.die();
  }
}

// ---------------------------------------------------------------- the Hollow Captain

interface Grenade {
  sprite: Phaser.GameObjects.Image;
  marker: Phaser.GameObjects.Graphics;
  tween: Phaser.Tweens.Tween | null;
  /** Thrown back at him with the grav tool. */
  returned: boolean;
  /** Landed and ticking: goes off at this time. */
  fuseAt: number | null;
}

export class CaptainFight extends BossFight {
  private shieldDownUntil = 0;
  private nextBurst = 0;
  private nextGrenade = 0;
  private nextBlink = 0;
  private nextRaider = 0;
  private side = 1;
  private nextSideFlip = 0;
  private raiders: Sprite[] = [];
  private grenades: Grenade[] = [];
  private shieldGfx: Phaser.GameObjects.Graphics;

  constructor(
    host: BossHost,
    x: number,
    y: number,
    parts: Part[],
    /** Open floor spots in the arena he can blink to and call raiders in at. */
    private spots: Point[],
  ) {
    super(host, 'captain', x, y, 'captain', parts);
    this.sprite.setCircle(12, 4, 3).setCollideWorldBounds(true).setPushable(false);
    this.shieldGfx = host.add.graphics().setDepth(11);
  }

  get radius() {
    return 14;
  }

  /** The shield is up while any pylon still stands. */
  get shielded() {
    return this.livingParts().length > 0;
  }

  wake(time: number) {
    super.wake(time);
    this.nextBurst = time + 1400;
    this.nextGrenade = time + 3200;
  }

  status(): BossStatus {
    const pylons = this.livingParts().length;
    const left = Math.max(0, Math.ceil((this.shieldDownUntil - this.host.time.now) / 1000));
    const state = this.shielded ? `SHIELDED · ${pylons} PYLON${pylons === 1 ? '' : 'S'}` : `SHIELD DOWN: OPEN FIRE · ${left}s`;
    return { name: this.def.name, hp: this.hp, max: this.def.hp, state, vulnerable: !this.shielded };
  }

  hit(amount: number, _pierce: boolean, x: number, y: number): number {
    const done = captainDamage(amount, { shielded: this.shielded });
    if (done > 0) this.damage(done, x, y);
    else this.armourPing(x, y, 'SHIELDED');
    return done;
  }

  blast() {
    if (this.dead) return;
    this.damage(CAPTAIN.blastDamage, this.sprite.x, this.sprite.y);
    this.host.floatText(this.sprite.x, this.sprite.y - 22, 'BLAST', '#ff9a3c');
  }

  partDestroyed() {
    const left = this.livingParts().length;
    if (left > 0) {
      this.host.floatText(this.sprite.x, this.sprite.y - 24, `PYLON DOWN · ${left} LEFT`, '#c06bff');
      return;
    }
    this.shieldDownUntil = this.host.time.now + CAPTAIN.shieldDownMs;
    this.sprite.setTexture('captain-exposed');
    this.host.showBanner('SHIELD DOWN', 'Open fire before the pylons reboot', 0x3dff9a);
    this.host.sfx('bossArmour', this.sprite.x, this.sprite.y);
  }

  touchPlayer() {
    if (this.dead || !this.awake) return;
    this.host.hurtPlayer(CAPTAIN.contactDamage, this.sprite);
  }

  /**
   * The grav tool caught some of his grenades: they fly back and land on him.
   * Returns how many were thrown back.
   */
  deflect(inCone: (x: number, y: number) => boolean): number {
    let n = 0;
    for (const g of this.grenades) {
      if (g.returned || !g.sprite.active || !inCone(g.sprite.x, g.sprite.y)) continue;
      n++;
      g.returned = true;
      g.fuseAt = null;
      g.tween?.stop();
      g.marker.clear();
      g.sprite.setTint(0x9ff6ff);
      this.flyGrenade(g, this.sprite.x, this.sprite.y, 420);
    }
    if (n) this.host.floatText(this.host.player.x, this.host.player.y - 16, n > 1 ? `RETURNED ×${n}` : 'RETURNED', '#5ef2ff');
    return n;
  }

  protected restoreTint() {
    this.sprite.clearTint();
    if (this.phase2) this.sprite.setTint(0xffc0d0);
  }

  protected enterPhase2() {
    super.enterPhase2();
    this.sprite.setTint(0xffc0d0);
    this.host.showBanner('ALL HANDS', 'The Captain is blinking and calling raiders', 0xff5a6a);
    this.nextBlink = this.host.time.now + 2500;
    this.nextRaider = this.host.time.now + 1500;
  }

  protected tick(time: number) {
    const p = this.phase2 ? 1 : 0;
    const s = this.sprite;
    this.raiders = this.raiders.filter((r) => r.active);

    // Pylons reboot once the shield has been down long enough.
    if (!this.shielded && time > this.shieldDownUntil) {
      for (const part of this.parts) part.setData({ alive: true, hp: CAPTAIN.pylonHp }).setTexture('pylon');
      s.setTexture('captain');
      this.host.floatText(s.x, s.y - 24, 'SHIELD REBOOTED', '#c06bff');
      this.host.sfx('bossRoar', s.x, s.y);
    }
    this.drawShield(time);

    // Keep his distance and circle.
    const a = this.angleToPlayer();
    const d = Phaser.Math.Distance.Between(s.x, s.y, this.host.player.x, this.host.player.y);
    const speed = CAPTAIN.walkSpeed[p];
    if (time > this.nextSideFlip) {
      this.side = -this.side;
      this.nextSideFlip = time + Phaser.Math.Between(1600, 2800);
    }
    if (d < CAPTAIN.range[0]) s.setVelocity(-Math.cos(a) * speed, -Math.sin(a) * speed);
    else if (d > CAPTAIN.range[1]) s.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
    else s.setVelocity(Math.cos(a + (Math.PI / 2) * this.side) * speed * 0.8, Math.sin(a + (Math.PI / 2) * this.side) * speed * 0.8);
    s.setRotation(a);

    const sees = this.host.canSee(s, this.host.player);
    if (sees && time > this.nextBurst) {
      this.nextBurst = time + CAPTAIN.burstEveryMs[p];
      for (let i = 0; i < CAPTAIN.burstShots[p]; i++) {
        this.host.time.delayedCall(i * 90, () => {
          if (this.dead || !s.active) return;
          const aim = this.angleToPlayer() + Phaser.Math.FloatBetween(-0.07, 0.07);
          this.host.shootAtPlayer(s.x + Math.cos(aim) * 16, s.y + Math.sin(aim) * 16, aim, CAPTAIN.bulletSpeed, CAPTAIN.burstDamage, 'bullet');
        });
      }
    }
    if (time > this.nextGrenade) {
      this.nextGrenade = time + CAPTAIN.grenadeEveryMs[p];
      const count = CAPTAIN.grenades[p];
      for (let i = 0; i < count; i++) {
        const spread = count === 1 ? 0 : 38;
        this.throwGrenade(
          this.host.player.x + Phaser.Math.Between(-spread, spread),
          this.host.player.y + Phaser.Math.Between(-spread, spread),
        );
      }
    }
    if (this.phase2 && time > this.nextBlink) {
      this.nextBlink = time + CAPTAIN.blinkEveryMs;
      this.blink();
    }
    if (this.phase2 && time > this.nextRaider && this.raiders.length < CAPTAIN.maxRaiders) {
      this.nextRaider = time + CAPTAIN.raiderEveryMs;
      const spot = this.farSpot(80);
      const r = this.host.spawnEnemy('raider', spot.x, spot.y);
      r.setData({ loot: [], alertUntil: time + 60000 });
      this.raiders.push(r);
      this.host.explosionAt(spot.x, spot.y, 8);
    }

    // Grenades that have landed tick down, then go off.
    for (const g of this.grenades) {
      if (g.fuseAt === null || time < g.fuseAt) continue;
      this.detonate(g);
    }
    this.grenades = this.grenades.filter((g) => g.sprite.active);
  }

  private drawShield(time: number) {
    const g = this.shieldGfx.clear();
    if (this.dead) return;
    const s = this.sprite;
    // Power lines from the pylons.
    for (const part of this.livingParts()) {
      g.lineStyle(1, 0xc06bff, 0.35 + 0.2 * Math.sin(time / 120 + part.x)).lineBetween(part.x, part.y - 6, s.x, s.y);
    }
    if (!this.shielded) return;
    const pulse = 0.25 + 0.12 * Math.sin(time / 150);
    g.fillStyle(0xc06bff, pulse * 0.4).fillCircle(s.x, s.y, 21);
    g.lineStyle(2, 0xe0c0ff, pulse + 0.3).strokeCircle(s.x, s.y, 21);
  }

  private throwGrenade(tx: number, ty: number) {
    const s = this.sprite;
    const sprite = this.host.add.image(s.x, s.y, 'grenade').setDepth(13);
    const marker = this.host.add.graphics().setDepth(3);
    marker.lineStyle(1, 0xff3b4e, 0.8).strokeCircle(tx, ty, CAPTAIN.grenadeRadius);
    marker.fillStyle(0xff3b4e, 0.12).fillCircle(tx, ty, CAPTAIN.grenadeRadius);
    const g: Grenade = { sprite, marker, tween: null, returned: false, fuseAt: null };
    this.grenades.push(g);
    this.flyGrenade(g, tx, ty, CAPTAIN.grenadeFlightMs);
    this.host.sfx('enemyShot', s.x, s.y);
  }

  /** A lobbed arc: straight line on the floor, with the sprite swelling at the top of the arc. */
  private flyGrenade(g: Grenade, tx: number, ty: number, ms: number) {
    const fromX = g.sprite.x;
    const fromY = g.sprite.y;
    const state = { t: 0 };
    g.tween = this.host.tweens.add({
      targets: state,
      t: 1,
      duration: ms,
      onUpdate: () => {
        if (!g.sprite.active) return;
        const t = state.t;
        // Thrown back at him: it follows him as he moves.
        const ex = g.returned ? this.sprite.x : tx;
        const ey = g.returned ? this.sprite.y : ty;
        g.sprite.setPosition(fromX + (ex - fromX) * t, fromY + (ey - fromY) * t - Math.sin(t * Math.PI) * 18);
        g.sprite.setScale(1 + Math.sin(t * Math.PI) * 0.6).setRotation(t * 9);
      },
      onComplete: () => {
        if (!g.sprite.active) return;
        g.fuseAt = this.host.time.now + (g.returned ? 60 : CAPTAIN.grenadeFuseMs);
        g.sprite.setScale(1);
        if (!g.returned) this.host.tweens.add({ targets: g.sprite, alpha: 0.4, yoyo: true, repeat: 3, duration: 60 });
      },
    });
  }

  private detonate(g: Grenade) {
    const { x, y } = g.sprite;
    g.sprite.destroy();
    g.marker.destroy();
    this.host.explosionAt(x, y, CAPTAIN.grenadeRadius * 0.6);
    this.host.shake(160, 0.01);
    const r = CAPTAIN.grenadeRadius;
    if (Phaser.Math.Distance.Between(x, y, this.host.player.x, this.host.player.y) < r) {
      this.host.hurtPlayer(CAPTAIN.grenadeDamage);
    }
    if (!this.dead && Phaser.Math.Distance.Between(x, y, this.sprite.x, this.sprite.y) < r + this.radius) {
      // His own grenade ignores his shield.
      this.damage(CAPTAIN.grenadeSelfDamage, x, y);
      this.host.floatText(this.sprite.x, this.sprite.y - 24, 'OWN GRENADE!', '#5ef2ff');
    }
  }

  /** Phase 2: vanish in a puff of smoke and reappear somewhere well away from you. */
  private blink() {
    const s = this.sprite;
    this.host.explosionAt(s.x, s.y, 10);
    const spot = this.farSpot(110);
    s.setAlpha(0);
    s.setPosition(spot.x, spot.y);
    (s.body as Phaser.Physics.Arcade.Body).reset(spot.x, spot.y);
    this.host.tweens.add({ targets: s, alpha: 1, duration: 300 });
    this.host.sfx('dodge', spot.x, spot.y);
  }

  private farSpot(min: number): Point {
    const p = this.host.player;
    const far = this.spots.filter((q) => Phaser.Math.Distance.Between(q.x, q.y, p.x, p.y) > min);
    const pool = far.length ? far : this.spots;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  protected die() {
    this.shieldGfx.clear();
    for (const g of this.grenades) {
      g.tween?.stop();
      g.sprite.destroy();
      g.marker.destroy();
    }
    this.grenades = [];
    super.die();
  }
}
