import Phaser from 'phaser';
import { computeGameSize } from './core/viewport';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { HubScene } from './scenes/HubScene';
import { PauseScene } from './scenes/PauseScene';
import { audio } from './audio/engine';
import { loadSave } from './storage';

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
  scene: [BootScene, HubScene, GameScene, PauseScene],
});

// Sound: browsers only start audio after the first tap or key press.
audio.setSettings(loadSave().settings);
audio.unlockOnFirstGesture();
window.addEventListener('keydown', (e) => {
  const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
  if (!typing && e.key.toLowerCase() === 'm' && !game.scene.isActive('Pause')) audio.toggleMute();
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

// The splash in index.html covers the download; fade it once the game is running.
game.events.once('ready', () => {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('gone');
  setTimeout(() => splash.remove(), 400);
});

// Installable app + offline play: the service worker is built with the game (see vite.config.ts).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}

// Handy for poking at the game from the browser console during development.
if (import.meta.env.DEV) Object.assign(window, { game, audio });
