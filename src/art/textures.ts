import Phaser from 'phaser';
import { characterFrames, paintSprite, type PixelSprite } from './sprites';
import type { CharacterId } from '../core/catalog';

/** Paints frames side by side into one canvas texture with numbered frames. */
export function makeSpriteSheet(scene: Phaser.Scene, key: string, frames: PixelSprite[]) {
  if (scene.textures.exists(key)) return;
  const w = frames[0].rows[0].length;
  const h = frames[0].rows.length;
  const tex = scene.textures.createCanvas(key, w * frames.length, h);
  if (!tex) return;
  frames.forEach((sprite, i) => {
    paintSprite(tex.getContext(), sprite, i * w, 0);
    tex.add(i, 0, i * w, 0, w, h);
  });
  tex.refresh();
}

/**
 * Builds (once) a texture and walk animation for a character in a given set of
 * colours, so cosmetics are just palette swaps. Returns the keys to use.
 */
export function ensureCharacterTexture(
  scene: Phaser.Scene,
  id: CharacterId,
  colours: Record<string, string>,
): { texture: string; walk: string } {
  const suffix = Object.values(colours).join('').replace(/#/g, '');
  const texture = `char-${id}-${suffix}`;
  const walk = `${texture}-walk`;
  makeSpriteSheet(scene, texture, characterFrames(id, colours));
  if (!scene.anims.exists(walk)) {
    scene.anims.create({
      key: walk,
      frames: [0, 1, 2, 3].map((frame) => ({ key: texture, frame })),
      frameRate: id === 'robot' ? 12 : 9,
      repeat: -1,
    });
  }
  return { texture, walk };
}

/** Draws a character's idle frame onto a plain canvas, for previews in the hub. */
export function drawCharacterPreview(
  canvas: HTMLCanvasElement,
  id: CharacterId,
  colours: Record<string, string>,
) {
  const frame = characterFrames(id, colours)[0];
  canvas.width = frame.rows[0].length;
  canvas.height = frame.rows.length;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paintSprite(ctx, frame);
}
