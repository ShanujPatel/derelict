import './map.css';
import { generateDeck, type Deck } from '../core/deckGenerator';
import { bountyFor, BOUNTY_KINDS } from '../core/bounty';
import { conditionFor } from '../core/conditions';
import { placeLift } from '../core/depth';
import { weeklySeed, weeklySetup } from '../core/weekly';
import { vesselName } from '../core/names';
import { bfsDistances } from '../core/pathing';
import { dailySeed, dailyShip, randomSeed } from '../core/seed';
import { SHIP_TYPES, Tile, type EnemyKind, type ShipType, type Spawn } from '../core/types';

/**
 * Seed explorer: draws the whole deck for any seed, the same one the game
 * builds, with everything on it. A separate small page (no Phaser), so it
 * loads instantly and shows off the procedural generator.
 */

type Layer = 'hostiles' | 'loot' | 'hazards';

const SHIPS: Record<ShipType, { label: string; floor: string; wall: string; edge: string; accent: string }> = {
  freighter: { label: 'Freighter', floor: '#1d2b45', wall: '#0b1120', edge: '#6f8fc0', accent: '#6fd6ff' },
  research: { label: 'Research vessel', floor: '#173a36', wall: '#081311', edge: '#4fd8d0', accent: '#9bff5c' },
  mining: { label: 'Mining hauler', floor: '#3a2d1f', wall: '#120d07', edge: '#c99a5a', accent: '#ffb347' },
};

const HOSTILE_NAMES: Record<EnemyKind, string> = {
  drone: 'Patrol drones',
  turret: 'Wall turrets',
  crawler: 'Crawlers',
  spitter: 'Spitters',
  egg: 'Egg sacs',
  raider: 'Raiders',
  brute: 'Brutes',
  mimic: 'Mimic crates',
  stalker: 'Stalkers',
  sapper: 'Sappers',
  sweeper: 'Sweeper lasers',
};

const ENEMY = new Set<string>(Object.keys(HOSTILE_NAMES));

interface State {
  seed: string;
  ship: ShipType;
  layers: Record<Layer, boolean>;
}

const params = new URLSearchParams(location.search);
const state: State = {
  seed: (params.get('seed') ?? randomSeed()).slice(0, 32),
  ship: SHIP_TYPES.includes(params.get('ship') as ShipType) ? (params.get('ship') as ShipType) : 'freighter',
  layers: { hostiles: true, loot: true, hazards: true },
};

/** Daily and weekly seeds always come with their own ship. */
function fixedShip(seed: string): ShipType | null {
  if (/^daily-\d{4}-\d{2}-\d{2}$/.test(seed)) return dailyShip(seed);
  if (/^weekly-\d{4}-W\d{2}$/.test(seed)) return weeklySetup(seed).ship;
  return null;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const root = document.getElementById('explorer')!;
root.innerHTML = `
  <header class="x-head">
    <a class="x-brand" href="./">DERELICT</a>
    <span class="x-sub">SEED EXPLORER</span>
  </header>
  <form class="x-controls" data-form>
    <label class="x-seed"><span>Seed</span><input data-seed maxlength="32" autocomplete="off" spellcheck="false" /></label>
    <div class="x-ships" role="radiogroup" aria-label="Ship type">
      ${SHIP_TYPES.map((s) => `<button type="button" role="radio" data-ship="${s}">${SHIPS[s].label.split(' ')[0].toUpperCase()}</button>`).join('')}
    </div>
    <div class="x-quick">
      <button type="submit" class="x-btn">SHOW</button>
      <button type="button" class="x-btn ghost" data-random>RANDOM</button>
      <button type="button" class="x-btn ghost" data-daily>TODAY'S DAILY</button>
      <button type="button" class="x-btn ghost" data-weekly>THIS WEEK</button>
    </div>
  </form>
  <section class="x-main">
    <div class="x-map"><canvas data-canvas></canvas></div>
    <aside class="x-side">
      <div class="x-title" data-title></div>
      <div class="x-layers">
        <label><input type="checkbox" data-layer="hostiles" checked /> Hostiles</label>
        <label><input type="checkbox" data-layer="loot" checked /> Loot</label>
        <label><input type="checkbox" data-layer="hazards" checked /> Hazards</label>
      </div>
      <dl class="x-stats" data-stats></dl>
      <ul class="x-legend">
        <li><i class="k-start"></i>Start</li>
        <li><i class="k-exit"></i>Exit</li>
        <li><i class="k-lift"></i>Lift (deep dive)</li>
        <li><i class="k-enemy"></i>Hostile</li>
        <li><i class="k-bounty"></i>Bounty target</li>
        <li><i class="k-salvage"></i>Salvage</li>
        <li><i class="k-cache"></i>Locked cache</li>
        <li><i class="k-oxygen"></i>Oxygen</li>
        <li><i class="k-medkit"></i>Health pack</li>
        <li><i class="k-log"></i>Crew log</li>
        <li><i class="k-drum"></i>Fuel drum</li>
        <li><i class="k-weak"></i>Cracked wall / ore vein</li>
        <li><i class="k-shock"></i>Shock floor</li>
      </ul>
      <a class="x-btn play" data-play href="./">BOARD THIS SHIP ▸</a>
      <p class="x-note">The game builds exactly this deck from the seed. Daily and weekly seeds pick their own ship type.</p>
    </aside>
  </section>`;

const $ = <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
const seedInput = $<HTMLInputElement>('[data-seed]');
const canvas = $<HTMLCanvasElement>('[data-canvas]');

function render() {
  const fixed = fixedShip(state.seed);
  if (fixed) state.ship = fixed;
  seedInput.value = state.seed;
  root.querySelectorAll<HTMLButtonElement>('[data-ship]').forEach((b) => {
    b.setAttribute('aria-checked', String(b.dataset.ship === state.ship));
    b.disabled = fixed !== null && b.dataset.ship !== fixed;
  });
  const deck = generateDeck(state.seed, state.ship);
  draw(deck);
  describe(deck);
  const query = `?seed=${encodeURIComponent(state.seed)}${state.ship === 'freighter' ? '' : `&ship=${state.ship}`}`;
  history.replaceState(null, '', query);
  const play = $<HTMLAnchorElement>('[data-play]');
  play.href = state.seed.startsWith('daily-') ? './?daily' : state.seed.startsWith('weekly-') ? './?weekly' : `./${query}`;
}

function draw(deck: Deck) {
  const look = SHIPS[deck.ship];
  const box = canvas.parentElement!.getBoundingClientRect();
  const cell = Math.max(3, Math.min(14, Math.floor(Math.min(box.width / deck.width, (window.innerHeight * 0.8) / deck.height))));
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = deck.width * cell * dpr;
  canvas.height = deck.height * cell * dpr;
  canvas.style.width = `${deck.width * cell}px`;
  canvas.style.height = `${deck.height * cell}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#05070c';
  ctx.fillRect(0, 0, deck.width * cell, deck.height * cell);

  const t = deck.tiles;
  const floorAt = (x: number, y: number) => t[y]?.[x] === Tile.Floor;
  for (let y = 0; y < deck.height; y++) {
    for (let x = 0; x < deck.width; x++) {
      const tile = t[y][x];
      if (tile === Tile.Floor) ctx.fillStyle = look.floor;
      else if (tile === Tile.WeakWall) ctx.fillStyle = state.layers.hazards ? '#d9922c' : look.edge;
      else if ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([dx, dy]) => floorAt(x + dx, y + dy))) ctx.fillStyle = look.edge;
      else continue;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  const c = (x: number) => x * cell + cell / 2;
  const dot = (x: number, y: number, r: number, colour: string) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(c(x), c(y), Math.max(1.5, r * cell), 0, Math.PI * 2);
    ctx.fill();
  };
  const square = (x: number, y: number, s: number, colour: string) => {
    ctx.fillStyle = colour;
    const size = Math.max(3, s * cell);
    ctx.fillRect(c(x) - size / 2, c(y) - size / 2, size, size);
  };

  if (state.layers.hazards) {
    for (const h of deck.hazards ?? []) {
      ctx.fillStyle = 'rgba(255, 216, 59, 0.28)';
      ctx.fillRect(h.x * cell, h.y * cell, h.w * cell, h.h * cell);
      ctx.strokeStyle = '#ffd83b';
      ctx.lineWidth = 1;
      ctx.strokeRect(h.x * cell + 0.5, h.y * cell + 0.5, h.w * cell - 1, h.h * cell - 1);
    }
    for (const s of deck.spawns.filter((s) => s.kind === 'drum')) square(s.x, s.y, 0.55, '#ff6b3a');
  }

  const eligible = deck.spawns.filter((s) => BOUNTY_KINDS.includes(s.kind as EnemyKind));
  const bounty = bountyFor(deck.seed, deck.ship, eligible.length);
  const bountySpawn: Spawn | null = bounty ? eligible[bounty.index] : null;

  for (const s of deck.spawns) {
    if (ENEMY.has(s.kind)) {
      if (!state.layers.hostiles) continue;
      if (s.kind === 'sweeper') {
        // Its beam's reach.
        ctx.strokeStyle = 'rgba(255, 123, 58, 0.45)';
        ctx.beginPath();
        ctx.arc(c(s.x), c(s.y), (120 / 16) * cell, 0, Math.PI * 2);
        ctx.stroke();
      }
      dot(s.x, s.y, s.kind === 'egg' || s.kind === 'turret' || s.kind === 'sweeper' ? 0.42 : 0.34, s === bountySpawn ? '#ffd166' : '#ff4b5c');
      if (s === bountySpawn) {
        ctx.strokeStyle = '#ffd166';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(c(s.x), c(s.y), Math.max(4, 0.8 * cell), 0, Math.PI * 2);
        ctx.stroke();
      }
      continue;
    }
    if (!state.layers.loot) continue;
    if (s.kind === 'salvage') dot(s.x, s.y, 0.28, '#ffd166');
    else if (s.kind === 'cache') square(s.x, s.y, 0.7, '#d9a21b');
    else if (s.kind === 'oxygen') dot(s.x, s.y, 0.3, '#4ea8ff');
    else if (s.kind === 'medkit') square(s.x, s.y, 0.55, '#ff6b7d');
    else if (s.kind === 'datalog') {
      ctx.fillStyle = '#ffffff';
      ctx.save();
      ctx.translate(c(s.x), c(s.y));
      ctx.rotate(Math.PI / 4);
      const size = Math.max(3, 0.55 * cell);
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  // Start, exit and the lift on top.
  const ring = (x: number, y: number, colour: string) => {
    ctx.strokeStyle = colour;
    ctx.lineWidth = Math.max(1.5, cell * 0.22);
    ctx.beginPath();
    ctx.arc(c(x), c(y), Math.max(4, cell * 0.9), 0, Math.PI * 2);
    ctx.stroke();
  };
  ring(deck.extraction.x, deck.extraction.y, '#3dff9a');
  square(deck.start.x, deck.start.y, 1, look.accent);
  // Only ordinary runs have the deep-dive lift.
  const lift = fixedShip(deck.seed) ? null : placeLift(deck, bfsDistances(deck.tiles, deck.start));
  if (lift) ring(lift.x, lift.y, '#c9a0ff');
}

function describe(deck: Deck) {
  const look = SHIPS[deck.ship];
  const condition = conditionFor(deck.seed, deck.ship);
  $('[data-title]').innerHTML = `<b style="color:${look.accent}">${esc(vesselName(deck.seed, deck.ship))}</b><span>${look.label} · seed ${esc(deck.seed)}</span>`;
  const count = (k: string) => deck.spawns.filter((s) => s.kind === k).length;
  const hostiles = Object.entries(HOSTILE_NAMES)
    .map(([k, name]) => [name, count(k)] as const)
    .filter(([, n]) => n > 0);
  const salvage = deck.spawns.filter((s) => s.kind === 'salvage').reduce((n, s) => n + s.value, 0);
  const caches = deck.spawns.filter((s) => s.kind === 'cache').reduce((n, s) => n + s.value, 0);
  const dist = bfsDistances(deck.tiles, deck.start)[deck.extraction.y][deck.extraction.x];
  const eligible = deck.spawns.filter((s) => BOUNTY_KINDS.includes(s.kind as EnemyKind));
  const bounty = bountyFor(deck.seed, deck.ship, eligible.length);
  const rows: [string, string][] = [
    ['Condition', `${condition.name}: ${condition.blurb}`],
    ['Rooms', String(deck.rooms.length)],
    ['Walk to exit', `${dist} tiles`],
    ['Loose salvage', `${salvage} (+${caches} in caches)`],
    [deck.ship === 'mining' ? 'Ore veins' : 'Cracked walls', String(deck.weakWalls.length)],
    ...hostiles.map(([name, n]) => [name, String(n)] as [string, string]),
  ];
  if (bounty) rows.push(['Bounty', `${bounty.name} (${bounty.reward} salvage)`]);
  $('[data-stats]').innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
}

root.addEventListener('submit', (e) => {
  e.preventDefault();
  const seed = seedInput.value.trim().slice(0, 32);
  if (seed) state.seed = seed;
  render();
});
root.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ship],[data-random],[data-daily],[data-weekly]');
  if (!el) return;
  if (el.dataset.ship) state.ship = el.dataset.ship as ShipType;
  if ('random' in el.dataset) state.seed = randomSeed();
  if ('daily' in el.dataset) state.seed = dailySeed(new Date());
  if ('weekly' in el.dataset) state.seed = weeklySeed(new Date());
  render();
});
root.addEventListener('change', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.dataset.layer) {
    state.layers[el.dataset.layer as Layer] = el.checked;
    render();
  }
});
let pending = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(pending);
  pending = requestAnimationFrame(render);
});
render();
