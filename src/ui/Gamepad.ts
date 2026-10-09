import { PAD, STILL, radialDeadzone, type PadStick } from '../core/gamepad';

/**
 * Reads the first connected gamepad straight from the browser's Gamepad API.
 * Call poll() once a frame; justPressed() then reports buttons pressed since
 * the last poll. One shared instance, because only one scene runs at a time.
 */
export class PadInput {
  connected = false;
  move: PadStick = STILL;
  aim: PadStick = STILL;
  trigger = 0;
  /** Set when the pad was the last thing used, so the mouse doesn't fight it for aim. */
  active = false;
  private now = new Set<number>();
  private before = new Set<number>();

  poll() {
    this.before = this.now;
    this.now = new Set();
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads ?? []).find((p): p is Gamepad => !!p && p.connected);
    this.connected = !!pad;
    if (!pad) {
      this.move = this.aim = STILL;
      this.trigger = 0;
      return;
    }
    pad.buttons.forEach((b, i) => {
      if (b.pressed || b.value > 0.5) this.now.add(i);
    });
    const ax = (i: number) => pad.axes[i] ?? 0;
    this.move = radialDeadzone(ax(0), ax(1));
    this.aim = radialDeadzone(ax(2), ax(3));
    this.trigger = pad.buttons[PAD.RT]?.value ?? 0;
    if (this.move.magnitude > 0 || this.aim.magnitude > 0 || this.now.size > 0) this.active = true;
  }

  pressed(button: number) {
    return this.now.has(button);
  }

  justPressed(button: number) {
    return this.now.has(button) && !this.before.has(button);
  }
}

export const pad = new PadInput();
