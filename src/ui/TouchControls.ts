import Phaser from 'phaser';
import { CENTRED, clampKnob, readStick, type StickState } from '../core/stick';

const STICK_RADIUS = 28;
const BUTTON_RADIUS = 15;
/** Aim stick must be pushed this far (0–1) before the gun fires. */
const FIRE_THRESHOLD = 0.35;

interface ActiveStick {
  pointerId: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
}

interface Button {
  id: 'swap' | 'torch';
  label: string;
  x: number;
  y: number;
}

/**
 * Twin floating virtual sticks for phones and tablets.
 * Left half of the screen moves, right half aims (and fires when pushed),
 * plus swap-gun and torch buttons. Turns itself on at the first touch.
 */
export class TouchControls {
  enabled: boolean;
  move: StickState = CENTRED;
  aim: StickState = CENTRED;
  /** Last aim direction, kept after the thumb lifts. */
  lastAimAngle: number | null = null;

  private left: ActiveStick | null = null;
  private right: ActiveStick | null = null;
  private buttons: Button[] = [];
  private pressed = new Set<Button['id']>();
  private queued = new Set<Button['id']>();
  private gfx: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private width = 0;
  private height = 0;

  constructor(
    private scene: Phaser.Scene,
    private toolLabel = 'TORCH',
  ) {
    // Phones report a coarse pointer; show the controls straight away there.
    this.enabled = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    scene.input.addPointer(2);
    this.gfx = scene.add.graphics().setScrollFactor(0).setDepth(150);

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);
    scene.input.on('pointerupoutside', this.onUp, this);

    this.layout(scene.scale.width, scene.scale.height);
  }

  get firing(): boolean {
    return this.aim.magnitude >= FIRE_THRESHOLD;
  }

  /** True once per button tap. */
  consume(id: Button['id']): boolean {
    const hit = this.queued.has(id);
    this.queued.delete(id);
    return hit;
  }

  layout(width: number, height: number) {
    this.width = width;
    this.height = height;
    const x = width - 26;
    this.buttons = [
      { id: 'swap', label: 'GUN', x, y: height * 0.5 },
      { id: 'torch', label: this.toolLabel, x, y: height * 0.5 - 40 },
    ];
    this.labels.forEach((l) => l.destroy());
    this.labels = this.buttons.map((b) =>
      this.scene.add
        .text(b.x, b.y, b.label, { fontFamily: 'monospace', fontSize: '7px', color: '#d7e3ff' })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(151)
        .setVisible(this.enabled),
    );
  }

  draw() {
    const g = this.gfx.clear();
    this.labels.forEach((l) => l.setVisible(this.enabled));
    if (!this.enabled) return;

    const drawStick = (s: ActiveStick | null, restX: number, accent: number) => {
      const ox = s?.originX ?? restX;
      const oy = s?.originY ?? this.height - 52;
      g.lineStyle(2, 0xd7e3ff, s ? 0.45 : 0.18).strokeCircle(ox, oy, STICK_RADIUS);
      const knob = s ? clampKnob(ox, oy, s.x, s.y, STICK_RADIUS) : { x: ox, y: oy };
      g.fillStyle(accent, s ? 0.6 : 0.2).fillCircle(knob.x, knob.y, 11);
    };
    drawStick(this.left, 52, 0xd7e3ff);
    drawStick(this.right, this.width - 52, this.firing ? 0xffd166 : 0xd7e3ff);

    for (const b of this.buttons) {
      const down = this.pressed.has(b.id);
      g.fillStyle(0x0d1220, down ? 0.85 : 0.55).fillCircle(b.x, b.y, BUTTON_RADIUS);
      g.lineStyle(1, b.id === 'torch' ? 0xffd166 : 0xd7e3ff, down ? 0.9 : 0.5).strokeCircle(b.x, b.y, BUTTON_RADIUS);
    }
  }

  destroy() {
    this.scene.input.off('pointerdown', this.onDown, this);
    this.scene.input.off('pointermove', this.onMove, this);
    this.scene.input.off('pointerup', this.onUp, this);
    this.scene.input.off('pointerupoutside', this.onUp, this);
  }

  private onDown(p: Phaser.Input.Pointer) {
    if (!p.wasTouch) return;
    this.enabled = true;

    const button = this.buttons.find((b) => Phaser.Math.Distance.Between(p.x, p.y, b.x, b.y) <= BUTTON_RADIUS + 6);
    if (button) {
      this.pressed.add(button.id);
      this.queued.add(button.id);
      return;
    }

    const stick = { pointerId: p.id, originX: p.x, originY: p.y, x: p.x, y: p.y };
    if (p.x < this.width / 2) {
      if (!this.left) this.left = stick;
    } else if (!this.right) {
      this.right = stick;
    }
  }

  private onMove(p: Phaser.Input.Pointer) {
    for (const s of [this.left, this.right]) {
      if (s && s.pointerId === p.id) {
        s.x = p.x;
        s.y = p.y;
      }
    }
    this.update();
  }

  private onUp(p: Phaser.Input.Pointer) {
    if (this.left?.pointerId === p.id) this.left = null;
    if (this.right?.pointerId === p.id) this.right = null;
    this.pressed.clear();
    this.update();
  }

  private update() {
    this.move = this.left
      ? readStick(this.left.originX, this.left.originY, this.left.x, this.left.y, STICK_RADIUS)
      : CENTRED;
    this.aim = this.right
      ? readStick(this.right.originX, this.right.originY, this.right.x, this.right.y, STICK_RADIUS)
      : CENTRED;
    if (this.aim.magnitude > 0) this.lastAimAngle = this.aim.angle;
  }
}
