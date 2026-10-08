import Phaser from 'phaser';
import { computeGameSize } from './core/viewport';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HubScene } from './scenes/HubScene';

const initial = computeGameSize(window.innerWidth, window.innerHeight);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: initial.width,
  height: initial.height,
  pixelArt: true,
  backgroundColor: '#05070c',
  physics: { default: 'arcade', arcade: { debug: false } },
  // FIT + a game size matching the window's shape fills the screen in any orientation.
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  scene: [BootScene, HubScene, GameScene],
});

let pending = 0;
const resize = () => {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(() => {
    const size = computeGameSize(window.innerWidth, window.innerHeight);
    game.scale.setGameSize(size.width, size.height);
  });
};
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// Handy for poking at the game from the browser console during development.
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
