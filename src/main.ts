import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 480,
  height: 270,
  pixelArt: true,
  backgroundColor: '#05070c',
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, GameScene],
});

// Handy for poking at the game from the browser console during development.
if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
