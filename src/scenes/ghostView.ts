import Phaser from 'phaser';
import { formatDuration } from '../core/leaderboard';
import { ghostAt, ghostDuration, type Ghost } from '../core/ghost';

/**
 * A see-through replay of another run on the same daily ship: a tinted copy of
 * your character with a name tag, moving along the recorded path.
 */
export class GhostView {
  private sprite: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private finished = false;

  constructor(
    private scene: Phaser.Scene,
    private ghost: Ghost,
    texture: string,
    private name: string,
  ) {
    const start = ghost.points[0];
    this.sprite = scene.add.image(start.x, start.y, texture, 0).setDepth(8).setAlpha(0).setTint(0x7fe9ff).setBlendMode(Phaser.BlendModes.ADD);
    this.label = scene.add
      .text(start.x, start.y - 14, name, { fontFamily: 'monospace', fontSize: '7px', color: '#9ff6ff' })
      .setOrigin(0.5)
      .setDepth(8)
      .setAlpha(0);
    scene.tweens.add({ targets: [this.sprite, this.label], alpha: { from: 0, to: 0.55 }, duration: 600 });
  }

  /** `ms` is time since the run started. */
  update(ms: number) {
    if (this.finished) return;
    const at = ghostAt(this.ghost, ms);
    if (!at) {
      // Their run ended here (at the exit): leave a marker with their time.
      this.finished = true;
      this.label.setText(`${this.name} · OUT ${formatDuration(ghostDuration(this.ghost))}`);
      this.scene.tweens.add({ targets: this.sprite, alpha: 0, scale: 0.4, duration: 500 });
      this.scene.tweens.add({ targets: this.label, alpha: 0.85, duration: 300 });
      return;
    }
    const dx = at.x - this.sprite.x;
    const dy = at.y - this.sprite.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.3) this.sprite.setRotation(Math.atan2(dy, dx));
    this.sprite.setPosition(at.x, at.y);
    this.label.setPosition(at.x, at.y - 14);
  }

  destroy() {
    this.sprite.destroy();
    this.label.destroy();
  }
}
