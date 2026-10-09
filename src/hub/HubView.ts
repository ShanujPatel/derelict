import './hub.css';
import { drawCharacterPreview } from '../art/textures';
import {
  CHARACTERS,
  COSMETICS,
  findCosmetic,
  PERKS,
  STATS,
  TOOLS,
  type CharacterId,
  type PerkId,
  type StatId,
  type ToolId,
} from '../core/catalog';
import { CHAPTERS, CODEX, chapterProgress } from '../core/codex';
import { dailySeed, dailyShip } from '../core/seed';
import { dayFromDailySeed, formatDuration, type BoardEntry } from '../core/leaderboard';
import { leaderboard } from '../net/leaderboard';
import { BOARDS, boardDef, type BoardGroup, type BoardId, type HallEntry } from '../core/hallOfFame';
import { vesselName } from '../core/names';
import { ACHIEVEMENTS } from '../core/achievements';
import { conditionFor } from '../core/conditions';
import { isoWeek, weeklySeed, weeklySetup } from '../core/weekly';
import { manualSection } from './manual';
import { BOSSES, BOSS_IDS, BOSS_UNLOCK_EXTRACTIONS, type BossId } from '../core/bosses';
import { chooseName, ensureName, rollName, type NameResult } from '../net/names';
import type { ShipType } from '../core/types';
import {
  canBoard,
  computeRunStats,
  defaultSave,
  exportSave,
  importSave,
  owns,
  priceOf,
  purchase,
  selectCharacter,
  bossUnlocked,
  resetTips,
  liveStreak,
  setDestination,
  setGun,
  setLook,
  setPerk,
  setTool,
  updateSettings,
  type SaveData,
  type Settings,
  type ShopItem,
} from '../core/progression';
import { WEAPONS, type WeaponId } from '../core/weapons';
import type { SfxName } from '../core/sfx';

/** 3_725_000 ms -> "1h 02m"; under an hour -> "12m". */
const formatHours = (ms: number) => {
  const mins = Math.floor(ms / 60000);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m` : `${mins}m`;
};

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

type Tab = 'crew' | 'loadout' | 'upgrades' | 'daily' | 'log';

const TABS: { id: Tab; label: string }[] = [
  { id: 'crew', label: 'CREW' },
  { id: 'loadout', label: 'LOADOUT' },
  { id: 'upgrades', label: 'UPGRADES' },
  { id: 'daily', label: 'DAILY' },
  { id: 'log', label: 'LOG' },
];

export interface HubCallbacks {
  onLaunch: (daily: boolean, boss?: BossId) => void;
  onWeekly?: () => void;
  onSave: (save: SaveData) => void;
  onReset: () => void;
  onSound?: (name: SfxName) => void;
  onSettings?: (settings: Settings) => void;
}

/**
 * The between-runs hub as an HTML overlay. All game rules live in
 * core/progression; this class only renders the save and forwards clicks.
 */
export class HubView {
  private root: HTMLDivElement;
  private body!: HTMLElement;
  private toastEl!: HTMLElement;
  private toastTimer = 0;
  private tab: Tab = 'crew';
  private confirmReset = false;
  private board: { day: string; at: number; loading: boolean; entries: BoardEntry[] | null; error: string | null } = {
    day: '',
    at: 0,
    loading: false,
    entries: null,
    error: null,
  };
  /** All-time boards, each cached for a minute. */
  private hall: { board: BoardId; cache: Partial<Record<BoardId, { at: number; entries: HallEntry[] | null; error: string | null }>>; loading: BoardId | null } = {
    board: 'banked',
    cache: {},
    loading: null,
  };
  private exportCode = '';
  private naming = false;

  constructor(
    private save: SaveData,
    private callbacks: HubCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'hub';
    this.root.innerHTML = `
      <div class="hub-frame" role="dialog" aria-label="Your ship">
        <header class="hub-top">
          <div class="hub-brand">DERELICT<small>SALVAGE VESSEL · BETWEEN JOBS</small></div>
          <div class="hub-credits">SHIP'S HOLD<b data-credits></b></div>
        </header>
        <nav class="hub-tabs" role="tablist">
          ${TABS.map((t) => `<button class="hub-tab" role="tab" data-tab="${t.id}">${t.label}</button>`).join('')}
        </nav>
        <main class="hub-body"></main>
        <footer class="hub-launch">
          <div class="dest" role="radiogroup" aria-label="Destination" data-dest></div>
          <button class="btn launch" data-action="launch">LAUNCH ▸</button>
          <button class="btn ghost daily" data-action="daily"></button>
        </footer>
      </div>
      <div class="hub-toast" role="status" aria-live="polite"></div>`;
    this.body = this.root.querySelector('.hub-body')!;
    this.toastEl = this.root.querySelector('.hub-toast')!;
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('input', this.onInput);
    window.addEventListener('keydown', this.onKey);
    document.body.appendChild(this.root);
    this.render();
    this.checkName();
  }

  /** Reserves the current name in the background; rolls a new one if it's been taken. */
  private checkName() {
    void ensureName(this.save, leaderboard).then(({ save, renamedFrom }) => {
      if (save === this.save || !this.root.isConnected) return;
      this.save = save;
      this.callbacks.onSave(save);
      this.render();
      if (renamedFrom) this.toast(`${renamedFrom} was taken. You're now ${save.callsign}`, true);
    });
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    window.clearTimeout(this.toastTimer);
    this.root.remove();
  }

  // ---------------------------------------------------------------- events

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && 'callsign' in e.target.dataset) {
      e.preventDefault();
      return this.rename(chooseName(this.save, e.target.value, leaderboard));
    }
    if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      this.callbacks.onLaunch(false);
    }
  };

  private onClick = (e: Event) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action],[data-tab]');
    if (!el) return;
    const d = el.dataset;

    if (d.tab) {
      this.sound('ui');
      this.tab = d.tab as Tab;
      this.confirmReset = false;
      this.render();
      this.body.scrollTop = 0;
      return;
    }

    switch (d.action) {
      case 'launch':
        return this.callbacks.onLaunch(false);
      case 'daily':
        return this.callbacks.onLaunch(true);
      case 'reset-tips':
        this.update(resetTips(this.save));
        return this.toast('Tips will show again');
      case 'weekly':
        return this.callbacks.onWeekly?.();
      case 'boss': {
        const id = d.boss as BossId;
        if (!bossUnlocked(this.save, id)) {
          this.sound('denied');
          return this.toast(this.bossLockReason(id), true);
        }
        return this.callbacks.onLaunch(false, id);
      }
      case 'buy':
        return this.buy(JSON.parse(d.item!) as ShopItem, d.label ?? 'Purchased');
      case 'character': {
        const id = d.id as CharacterId;
        if (owns(this.save, { kind: 'character', id })) return this.update(selectCharacter(this.save, id));
        return this.buy({ kind: 'character', id }, `${CHARACTERS[id].name} unlocked`);
      }
      case 'look': {
        const item: ShopItem = {
          kind: 'cosmetic',
          character: this.save.loadout.character,
          slot: d.slot as 'body' | 'accent',
          id: d.id!,
        };
        if (owns(this.save, item)) return this.update(setLook(this.save, item.character, item.slot, item.id));
        const trophy = findCosmetic(item.character, item.slot, item.id).trophy;
        if (trophy) {
          this.sound('denied');
          return this.toast(`🏆 Trophy colours: ${trophy.label} to unlock`, true);
        }
        return this.buy(item, 'New colours applied');
      }
      case 'gun':
        return this.update(setGun(this.save, Number(d.slot) as 0 | 1, d.id as WeaponId));
      case 'perk':
        return this.update(setPerk(this.save, (d.id || null) as PerkId | null));
      case 'tool':
        return this.update(setTool(this.save, d.id as ToolId));
      case 'destination': {
        const ship = d.ship as ShipType;
        if (!canBoard(this.save, ship)) return this.toast('Find more crew logs to locate research vessels', true);
        return this.update(setDestination(this.save, ship));
      }
      case 'callsign': {
        const field = this.root.querySelector<HTMLInputElement>('[data-callsign]');
        return this.rename(chooseName(this.save, field?.value ?? '', leaderboard));
      }
      case 'reroll':
        return this.rename(rollName(this.save, leaderboard));
      case 'refresh-board':
        this.board.at = 0;
        return this.render();
      case 'hall-board':
        this.hall.board = d.board as BoardId;
        return this.render();
      case 'refresh-hall':
        delete this.hall.cache[this.hall.board];
        return this.render();
      case 'export':
        return this.doExport();
      case 'import':
        return this.doImport();
      case 'reset':
        if (!this.confirmReset) {
          this.confirmReset = true;
          return this.render();
        }
        this.confirmReset = false;
        this.callbacks.onReset();
        this.save = defaultSave();
        this.toast('Progress erased');
        return this.render();
    }
  };

  private buy(item: ShopItem, label: string) {
    const result = purchase(this.save, item);
    if (!result.ok) {
      this.sound('denied');
      return this.toast(result.reason, true);
    }
    this.sound('buy');
    this.update(result.save);
    this.toast(label);
  }

  /** Applies a name change once the leaderboard has answered. */
  private rename(pending: Promise<NameResult>) {
    if (this.naming) return;
    this.naming = true;
    this.render();
    void pending.then((r) => {
      this.naming = false;
      if (!this.root.isConnected) return;
      if (!r.ok) {
        this.sound('denied');
        this.render();
        return this.toast(r.reason, true);
      }
      this.sound('buy');
      this.save = r.save;
      this.callbacks.onSave(r.save);
      this.board.at = 0;
      this.render();
      this.toast(r.offline ? `Name set to ${r.save.callsign}. We'll check it's free next time you're online` : `You're ${r.save.callsign}`);
    });
  }

  private sound(name: SfxName) {
    this.callbacks.onSound?.(name);
  }

  /** Volume sliders and toggles in the Log tab apply live. */
  private onInput = (e: Event) => {
    const el = e.target as HTMLInputElement;
    const key = el.dataset.setting as keyof Settings | undefined;
    if (!key) return;
    const value = el.type === 'checkbox' ? el.checked : Number(el.value) / 100;
    this.save = updateSettings(this.save, { [key]: value });
    this.callbacks.onSave(this.save);
    this.callbacks.onSettings?.(this.save.settings);
    if (el.type === 'checkbox' || e.type === 'change') this.sound('ui');
  };

  private update(next: SaveData) {
    if (next === this.save) return;
    if (next.credits === this.save.credits) this.sound('ui');
    this.save = next;
    this.callbacks.onSave(next);
    this.render();
  }

  private doExport() {
    this.exportCode = exportSave(this.save);
    navigator.clipboard?.writeText(this.exportCode).then(
      () => this.toast('Save code copied'),
      () => this.toast('Copy the code below'),
    );
    this.render();
  }

  private doImport() {
    const field = this.root.querySelector<HTMLTextAreaElement>('[data-import]');
    const imported = importSave(field?.value ?? '');
    if (!imported) return this.toast("That code didn't work", true);
    this.update(imported);
    this.toast('Save imported');
  }

  private toast(message: string, bad = false) {
    this.toastEl.textContent = message;
    this.toastEl.classList.toggle('bad', bad);
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 1800);
  }

  // ---------------------------------------------------------------- rendering

  private render() {
    this.root.querySelector('[data-credits]')!.textContent = String(this.save.credits);
    this.root.querySelectorAll<HTMLElement>('.hub-tab').forEach((t) => {
      t.setAttribute('aria-selected', String(t.dataset.tab === this.tab));
    });
    const views: Record<Tab, () => string> = {
      crew: () => this.crewTab(),
      loadout: () => this.loadoutTab(),
      upgrades: () => this.upgradesTab(),
      daily: () => this.dailyTab(),
      log: () => this.logTab(),
    };
    this.body.innerHTML = views[this.tab]();
    this.renderLaunchBar();

    const canvas = this.body.querySelector<HTMLCanvasElement>('canvas[data-preview]');
    if (canvas) {
      const stats = computeRunStats(this.save);
      drawCharacterPreview(canvas, stats.character.id, stats.colours);
    }
  }

  private renderLaunchBar() {
    const dest = this.save.loadout.destination;
    const option = (ship: ShipType, label: string) => {
      const locked = !canBoard(this.save, ship);
      return `<button class="dest-option ${locked ? 'locked' : ''}" role="radio" data-action="destination" data-ship="${ship}"
        aria-checked="${dest === ship}">${locked ? '🔒 ' : ''}${label}</button>`;
    };
    this.root.querySelector('[data-dest]')!.innerHTML =
      option('freighter', 'FREIGHTER') + option('research', 'RESEARCH');
    const mission = this.dailyMission();
    const daily = this.root.querySelector<HTMLElement>('.hub-launch [data-action="daily"]')!;
    daily.className = `btn daily theme-${mission.ship} ${mission.best === null ? 'fresh' : 'played'}`;
    daily.innerHTML = `
      <span class="d-top"><i class="d-dot"></i>DAILY · ${mission.best === null ? 'NEW' : `BEST ${mission.best}`}</span>
      <span class="d-ship">${mission.icon} ${mission.label} ▸</span>
      <span class="d-name">${mission.vessel}</span>`;
    daily.title = `Today's shared ship: ${mission.vessel}, a ${mission.label.toLowerCase()}. ${mission.threat} Condition: ${mission.condition.name}.`;
  }

  /** Today's shared ship, for the themed DAILY button and the DAILY tab. */
  private dailyMission() {
    const seed = dailySeed(new Date());
    const ship = dailyShip(seed);
    const day = this.today();
    return {
      ship,
      vessel: vesselName(seed, ship),
      label: ship === 'research' ? 'RESEARCH' : 'FREIGHTER',
      icon: ship === 'research' ? '☣' : '⛭',
      threat: ship === 'research' ? 'Overrun by the Bloom.' : 'Guarded by drones and turrets.',
      condition: conditionFor(seed, ship),
      best: this.save.daily.day === day ? this.save.daily.best : null,
    };
  }

  private priceTag(item: ShopItem): { label: string; cls: string } {
    const price = priceOf(this.save, item);
    if (price === null) return { label: '', cls: '' };
    return { label: String(price), cls: price > this.save.credits ? 'unaffordable' : '' };
  }

  private buyButton(item: ShopItem, label: string, toast: string): string {
    const price = priceOf(this.save, item);
    if (price === null) return `<button class="btn owned" disabled>${label === 'UPGRADE' ? 'MAX' : 'OWNED'}</button>`;
    const attrs = `data-action="buy" data-item='${JSON.stringify(item)}' data-label="${toast}"`;
    return `<button class="btn" ${attrs} ${price > this.save.credits ? 'disabled' : ''}>${label} · ${price}</button>`;
  }

  private crewTab(): string {
    const s = this.save;
    const stats = computeRunStats(s);
    const c = stats.character;
    const resource = c.resource === 'oxygen' ? 'O₂' : 'Battery';

    const characters = (Object.keys(CHARACTERS) as CharacterId[])
      .map((id) => {
        const def = CHARACTERS[id];
        const tag = this.priceTag({ kind: 'character', id });
        return `<button class="choice ${tag.label ? 'locked' : ''} ${tag.cls}" data-action="character" data-id="${id}"
          aria-pressed="${s.loadout.character === id}">
          <span>${def.name}</span>
          <small>${tag.label ? `<span class="price">🔒 ${tag.label} salvage</span>` : def.resource === 'oxygen' ? 'Breathes O₂' : 'Runs on battery'}</small>
        </button>`;
      })
      .join('');

    const swatches = (slot: 'body' | 'accent') =>
      COSMETICS[c.id][slot]
        .map((o) => {
          const item = { kind: 'cosmetic', character: c.id, slot, id: o.id } as const;
          const tag = this.priceTag(item);
          const colour = slot === 'body' ? (o.colours.b ?? o.colours.s) : (o.colours.v ?? o.colours.e);
          const trophyLocked = !!o.trophy && !owns(s, item);
          const label = o.trophy ? '🏆' : tag.label;
          const title = o.trophy ? `${o.name}: ${trophyLocked ? `trophy, ${o.trophy.label}` : 'trophy'}` : `${o.name}${tag.label ? ` (${tag.label})` : ''}`;
          return `<button class="swatch ${tag.cls} ${o.trophy ? 'trophy' : ''} ${trophyLocked ? 'locked' : ''}" data-action="look" data-slot="${slot}" data-id="${o.id}"
            aria-pressed="${s.loadout.looks[c.id][slot] === o.id}" title="${esc(title)}">
            <i style="background:${colour}"></i>${label}
          </button>`;
        })
        .join('');

    return `
      ${this.nameSection()}
      <section class="card preview">
        <canvas data-preview width="16" height="16" aria-label="${c.name} preview"></canvas>
        <div>
          <h2>${c.name.toUpperCase()}</h2>
          <p>${c.blurb}</p>
          <div class="statline">
            <span>HP <b>${stats.maxHp}</b></span>
            <span>${resource} <b>${stats.capacity}</b></span>
            <span>Speed <b>${Math.round(stats.speedMultiplier * 100)}%</b></span>
            ${stats.armour ? `<span>Armour <b>${Math.round(stats.armour * 100)}%</b></span>` : ''}
          </div>
        </div>
      </section>
      <section class="hub-section"><h3>Crew</h3><div class="choices">${characters}</div></section>
      <section class="hub-section"><h3>${c.id === 'robot' ? 'Chassis' : 'Suit'}</h3><div class="swatches">${swatches('body')}</div></section>
      <section class="hub-section"><h3>${c.id === 'robot' ? 'Optics' : 'Visor'}</h3><div class="swatches">${swatches('accent')}</div></section>`;
  }

  private nameSection(): string {
    const busy = this.naming ? 'disabled' : '';
    return `<section class="hub-section name-section"><h3>Your name</h3>
      <div class="callsign-row">
        <input data-callsign maxlength="16" value="${esc(this.save.callsign)}" aria-label="Your name" autocomplete="off" spellcheck="false" ${busy} />
        <button class="btn ghost" data-action="callsign" ${busy}>SAVE</button>
        <button class="btn ghost dice" data-action="reroll" title="Random name" aria-label="Random name" ${busy}>⚄</button>
      </div>
      <p class="hub-note" style="margin-top:6px">Shown on the daily leaderboard. Every name is unique. Tap ⚄ for a random one.</p>
    </section>`;
  }

  private loadoutTab(): string {
    const s = this.save;
    const gunSlot = (slot: 0 | 1) =>
      s.weapons
        .map((id) => {
          const w = WEAPONS[id];
          return `<button class="choice" data-action="gun" data-slot="${slot}" data-id="${id}" aria-pressed="${s.loadout.guns[slot] === id}">
            <span>${w.name}</span><small>${w.blurb}</small>
          </button>`;
        })
        .join('');

    const perks = [
      `<button class="choice" data-action="perk" data-id="" aria-pressed="${s.loadout.perk === null}"><span>None</span><small>No perk this run</small></button>`,
      ...s.perks.map(
        (id) => `<button class="choice" data-action="perk" data-id="${id}" aria-pressed="${s.loadout.perk === id}">
          <span>${PERKS[id].name}</span><small>${PERKS[id].blurb}</small></button>`,
      ),
    ].join('');

    const tools = s.tools
      .map(
        (id) => `<button class="choice" data-action="tool" data-id="${id}" aria-pressed="${s.loadout.tool === id}">
          <span>${TOOLS[id].name}</span><small>${TOOLS[id].blurb}</small></button>`,
      )
      .join('');

    const missing = Object.keys(PERKS).length - s.perks.length;
    return `
      <section class="hub-section"><h3>Primary gun · key 1</h3><div class="choices">${gunSlot(0)}</div></section>
      <section class="hub-section"><h3>Secondary gun · key 2</h3><div class="choices">${gunSlot(1)}</div></section>
      <section class="hub-section"><h3>Perk</h3><div class="choices">${perks}</div>
        ${missing ? `<p class="hub-note" style="margin-top:8px">${missing} more perk${missing > 1 ? 's' : ''} available in Upgrades.</p>` : ''}
      </section>
      <section class="hub-section"><h3>Tool · F / right-click</h3><div class="choices">${tools}</div>
        ${(() => {
          const forSale = (Object.keys(TOOLS) as ToolId[]).filter((id) => !s.tools.includes(id)).map((id) => TOOLS[id].name);
          return forSale.length ? `<p class="hub-note" style="margin-top:8px">For sale in Upgrades: ${forSale.join(', ')}.</p>` : '';
        })()}
      </section>`;
  }

  private upgradesTab(): string {
    const s = this.save;
    const character = CHARACTERS[s.loadout.character];

    const stats = (Object.keys(STATS) as StatId[])
      .map((id) => {
        const def = STATS[id];
        const level = s.upgrades[id];
        const pips = def.costs.map((_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
        return `<div class="row">
          <div><div class="row-name">${def.name}<span class="pips">${pips}</span></div><div class="row-desc">${def.describe(character)}</div></div>
          ${this.buyButton({ kind: 'stat', id }, 'UPGRADE', `${def.name} upgraded`)}
        </div>`;
      })
      .join('');

    const armoury = (Object.keys(WEAPONS) as WeaponId[])
      .filter((id) => priceOf(defaultSave(), { kind: 'weapon', id }) !== null)
      .map(
        (id) => `<div class="row">
          <div><div class="row-name">${WEAPONS[id].name}</div><div class="row-desc">${WEAPONS[id].blurb}</div></div>
          ${this.buyButton({ kind: 'weapon', id }, 'BUY', `${WEAPONS[id].name} added to armoury`)}
        </div>`,
      )
      .join('');

    const toolRows = (Object.keys(TOOLS) as ToolId[])
      .filter((id) => TOOLS[id].cost > 0)
      .map(
        (id) => `<div class="row">
          <div><div class="row-name">${TOOLS[id].name}</div><div class="row-desc">${TOOLS[id].blurb}</div></div>
          ${this.buyButton({ kind: 'tool', id }, 'BUY', `${TOOLS[id].name} added to your kit`)}
        </div>`,
      )
      .join('');

    const perks = (Object.keys(PERKS) as PerkId[])
      .map(
        (id) => `<div class="row">
          <div><div class="row-name">${PERKS[id].name}</div><div class="row-desc">${PERKS[id].blurb}</div></div>
          ${this.buyButton({ kind: 'perk', id }, 'BUY', `${PERKS[id].name} perk learned`)}
        </div>`,
      )
      .join('');

    const robot = CHARACTERS.robot;
    return `
      <p class="hub-note">Bank salvage by reaching the exit. Upgrades are permanent and apply to every crew member.</p>
      <section class="hub-section"><h3>Crew</h3><div class="rows">
        <div class="row"><div><div class="row-name">${robot.name} chassis</div><div class="row-desc">${robot.blurb}</div></div>
        ${this.buyButton({ kind: 'character', id: 'robot' }, 'BUY', `${robot.name} unlocked`)}</div>
      </div></section>
      <section class="hub-section"><h3>Systems</h3><div class="rows">${stats}</div></section>
      <section class="hub-section"><h3>Armoury</h3><div class="rows">${armoury}${toolRows}</div></section>
      <section class="hub-section"><h3>Perks</h3><div class="rows">${perks}</div></section>`;
  }

  private today(): string {
    return dayFromDailySeed(dailySeed(new Date()))!;
  }

  /** Fetches the board at most every 30 s; re-renders when it arrives if the tab is still open. */
  private loadBoard() {
    const day = this.today();
    const fresh = this.board.day === day && Date.now() - this.board.at < 30_000;
    if (!leaderboard.enabled || this.board.loading || fresh) return;
    this.board = { ...this.board, day, loading: true, error: null };
    leaderboard
      .board(day, this.save.playerId)
      .then((entries) => (this.board = { day, at: Date.now(), loading: false, entries, error: null }))
      .catch((e: Error) => (this.board = { day, at: Date.now(), loading: false, entries: null, error: e.message }))
      .finally(() => this.tab === 'daily' && this.render());
  }

  private dailyTab(): string {
    this.loadBoard();
    const day = this.today();
    const mission = this.dailyMission();
    const ship = mission.ship === 'research' ? 'Research vessel' : 'Freighter';
    const date = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const best = this.save.daily.day === day ? this.save.daily.best : null;

    let board: string;
    if (!leaderboard.enabled) {
      board = '<p class="hub-note">The online leaderboard isn\'t switched on for this build. Your best is still saved here.</p>';
    } else if (this.board.error) {
      board = `<p class="hub-note">Couldn't load the board: ${esc(this.board.error)}</p>
        <div class="btn-row"><button class="btn ghost" data-action="refresh-board">TRY AGAIN</button></div>`;
    } else if (!this.board.entries) {
      board = '<p class="hub-note">Loading today\'s board…</p>';
    } else if (this.board.entries.length === 0) {
      board = '<p class="hub-note">No scores yet today. Extract and you\'re top of the board.</p>';
    } else {
      board = `<ol class="board">${this.board.entries
        .map(
          (r) => `<li class="${r.isYou ? 'you' : ''}">
            <span class="b-rank">${r.rank}</span>
            <span class="b-name">${esc(r.callsign)}${r.isYou ? ' <small>YOU</small>' : ''}</span>
            <span class="b-score">${r.score}</span>
            <span class="b-time">${formatDuration(r.durationMs)}</span>
            <span class="b-crew" title="${esc(r.character)}">${r.character === 'robot' ? '⚙' : '◉'}</span>
          </li>`,
        )
        .join('')}</ol>
        <div class="btn-row"><button class="btn ghost" data-action="refresh-board">REFRESH</button></div>`;
    }

    return `
      <section class="card daily-card theme-${mission.ship}">
        <div class="daily-head"><span>${date.toUpperCase()}</span><b>${mission.icon} ${ship.toUpperCase()}</b></div>
        <div class="daily-vessel">${mission.vessel}</div>
        <div class="daily-condition"><b>${mission.condition.name.toUpperCase()}</b> ${mission.condition.blurb}</div>
        <p class="hub-note">${mission.threat} Same ship for everyone today. Extract to post your salvage; only your best run counts. Ties go to the faster run.</p>
        <div class="daily-best">Your best today <b>${best ?? '—'}</b>${(() => {
          const n = liveStreak(this.save, day);
          return n ? ` <span class="streak">🔥 ${n}-day streak${this.save.streak.best > n ? ` · best ${this.save.streak.best}` : ''}</span>` : '';
        })()}</div>
        <p class="hub-note">Extract once a day to build a streak: +10 salvage per day in a row (up to +70).</p>
        <div class="btn-row"><button class="btn daily-play theme-${mission.ship}" data-action="daily">BOARD ${mission.vessel} ▸</button></div>
      </section>
      ${this.weeklySection()}
      ${this.contractsSection()}
      <section class="hub-section"><h3>Top salvagers · ${day}</h3>${board}</section>
      ${this.hallSection()}
      <p class="hub-note">Posting as <b>${esc(this.save.callsign)}</b>. Change your name in <button class="text-link" data-tab="crew">CREW</button>. No account needed; your save code carries it to other devices.</p>`;
  }

  /** Fetches the chosen all-time board at most once a minute. */
  private loadHall() {
    const id = this.hall.board;
    const cached = this.hall.cache[id];
    if (!leaderboard.enabled || this.hall.loading === id || (cached && Date.now() - cached.at < 60_000)) return;
    this.hall.loading = id;
    leaderboard
      .hallOfFame(id, this.save.playerId)
      .then((entries) => (this.hall.cache[id] = { at: Date.now(), entries, error: null }))
      .catch((e: Error) => (this.hall.cache[id] = { at: Date.now(), entries: null, error: e.message }))
      .finally(() => {
        if (this.hall.loading === id) this.hall.loading = null;
        if (this.tab === 'daily') this.render();
      });
  }

  /** All-time boards: salvage, records, boss times and kills by hostile type. */
  private hallSection(): string {
    if (!leaderboard.enabled) return '';
    this.loadHall();
    const current = boardDef(this.hall.board);
    const groups: BoardGroup[] = ['Salvage', 'Records', 'Bosses', 'Kills'];
    const picker = groups
      .map(
        (g) => `<div class="hall-group"><span class="hall-group-name">${g}</span><div class="hall-chips">${BOARDS.filter((b) => b.group === g)
          .map(
            (b) =>
              `<button class="chip" data-action="hall-board" data-board="${b.id}" aria-pressed="${b.id === current.id}">${esc(b.label)}</button>`,
          )
          .join('')}</div></div>`,
      )
      .join('');
    const cached = this.hall.cache[current.id];
    let list: string;
    if (cached?.error) {
      list = `<p class="hub-note">Couldn't load the hall of fame: ${esc(cached.error)}</p>`;
    } else if (!cached?.entries) {
      list = '<p class="hub-note">Loading…</p>';
    } else if (cached.entries.length === 0) {
      list = '<p class="hub-note">Nobody on this board yet. It could be you.</p>';
    } else {
      list = `<ol class="board hall">${cached.entries
        .map(
          (r) => `<li class="${r.isYou ? 'you' : ''} ${r.rank <= 3 ? 'top' : ''}">
            <span class="b-rank">${r.rank}</span>
            <span class="b-name">${esc(r.callsign)}${r.isYou ? ' <small>YOU</small>' : ''}</span>
            <span class="b-score">${esc(current.format(Number(r.value)))}</span>
          </li>`,
        )
        .join('')}</ol>`;
    }
    return `<section class="hub-section"><h3>Hall of fame · all time</h3>
      <div class="hall-picker">${picker}</div>
      <div class="hall-title">${esc(current.label)}</div>
      ${list}
      <div class="btn-row"><button class="btn ghost" data-action="refresh-hall">REFRESH</button></div>
      <p class="hub-note">Every run you finish adds to your totals once your name is claimed (assist mode runs don't count). Lost runs still count kills; salvage only counts when you extract.</p>
    </section>`;
  }

  /** This week's challenge: ship, mutators, your best. */
  private weeklySection(): string {
    const seed = weeklySeed(new Date());
    const week = isoWeek(new Date());
    const { ship, mutators } = weeklySetup(seed);
    const best = this.save.weekly.week === week ? this.save.weekly.best : null;
    return `<section class="hub-section"><h3>Weekly challenge · ${week}</h3>
      <article class="card weekly-card">
        <div class="daily-head"><span>${vesselName(seed, ship)}</span><b>${ship === 'research' ? '☣ RESEARCH VESSEL' : '⛭ FREIGHTER'}</b></div>
        <ul class="mutators">${mutators.map((m) => `<li><b>${m.name.toUpperCase()}</b> ${m.blurb}</li>`).join('')}</ul>
        <div class="daily-best">Your best this week <b>${best ?? '—'}</b></div>
        <div class="btn-row"><button class="btn weekly-play" data-action="weekly">PLAY THE WEEKLY ▸</button></div>
      </article>
    </section>`;
  }

  private bossLockReason(id: BossId): string {
    const left = BOSS_UNLOCK_EXTRACTIONS - this.save.stats.extractions;
    if (left > 0) return `Extract ${left} more time${left === 1 ? '' : 's'} to take boss contracts`;
    return BOSSES[id].ship === 'research' ? 'Find the coordinates log to reach research vessels first' : 'Locked';
  }

  /** Boss contracts: one card per boss, with how to beat it and your record. */
  private contractsSection(): string {
    const cards = BOSS_IDS.map((id) => {
      const b = BOSSES[id];
      const rec = this.save.bosses[id];
      const open = bossUnlocked(this.save, id);
      const record = rec.kills
        ? `<span class="c-record">★ DEFEATED ×${rec.kills} · BEST ${formatDuration(rec.bestMs)}</span>`
        : `<span class="c-record">FIRST KILL +${b.firstKillReward}</span>`;
      return `<article class="contract theme-${b.ship} ${open ? '' : 'locked'}">
        <header><b>${b.name}</b><small>${b.arena.toUpperCase()} · ${b.ship === 'research' ? 'RESEARCH VESSEL' : 'FREIGHTER'}</small></header>
        <p>${b.blurb}</p>
        <ul>${b.tips.map((t) => `<li>${t}</li>`).join('')}</ul>
        <footer>${record}
          <button class="btn daily-play" data-action="boss" data-boss="${id}">${open ? 'TAKE CONTRACT ▸' : `🔒 ${esc(this.bossLockReason(id).toUpperCase())}`}</button>
        </footer>
      </article>`;
    }).join('');
    return `<section class="hub-section"><h3>Boss contracts</h3><div class="contracts">${cards}</div></section>`;
  }

  private settingsSection(): string {
    const st = this.save.settings;
    const slider = (key: 'master' | 'music' | 'sfx', label: string) => `
      <label class="setting">
        <span>${label}</span>
        <input type="range" min="0" max="100" step="5" value="${Math.round(st[key] * 100)}" data-setting="${key}" aria-label="${label} volume" />
      </label>`;
    const toggle = (key: 'screenShake' | 'flashes' | 'minimap' | 'assist' | 'tips', label: string) => `
      <label class="setting toggle">
        <span>${label}</span>
        <input type="checkbox" ${st[key] ? 'checked' : ''} data-setting="${key}" />
      </label>`;
    return `<section class="hub-section"><h3>Sound &amp; display</h3>
      <div class="card settings">
        ${slider('master', 'Master')}
        ${slider('music', 'Music')}
        ${slider('sfx', 'Effects')}
        ${toggle('screenShake', 'Screen shake')}
        ${toggle('flashes', 'Damage flashes')}
        <p class="hub-note">All sound is synthesised live in your browser. Press M any time to mute.</p>
      </div>
    </section>
    <section class="hub-section"><h3>Assist &amp; accessibility</h3>
      <div class="card settings">
        ${toggle('tips', 'First-time tips')}
        ${toggle('minimap', 'Corner minimap')}
        ${toggle('assist', 'Assist mode')}
        <div class="btn-row"><button class="btn ghost" data-action="reset-tips">SHOW TIPS AGAIN (${this.save.tips.length} SEEN)</button></div>
        <p class="hub-note">Assist mode gives you 50% more oxygen or battery and halves the damage you take. Daily runs played with it on aren't posted to the leaderboard. Turn off screen shake and damage flashes above if motion bothers you.</p>
      </div>
    </section>`;
  }

  private codexSection(): string {
    const found = this.save.codex;
    return CHAPTERS.map((chapter) => {
      const progress = chapterProgress(found, chapter.id);
      const entries = CODEX.filter((e) => e.chapter === chapter.id)
        .map((e, i) => {
          if (!found.includes(e.id)) {
            const where =
              e.source && e.source !== 'ship'
                ? `carried by ${e.source === 'foreman' ? 'the Foreman' : 'the Bloom Mother'}`
                : e.ship === 'research'
                  ? 'research vessel'
                  : 'freighter';
            return `<div class="log locked"><span class="log-n">${String(i + 1).padStart(2, '0')}</span> ??? <small>Not yet recovered · ${where}</small></div>`;
          }
          return `<details class="log">
            <summary><span class="log-n">${String(i + 1).padStart(2, '0')}</span> ${e.title}</summary>
            <p class="log-author">${e.author}</p>
            <p>${e.body}</p>
          </details>`;
        })
        .join('');
      const reward = progress.complete
        ? '<span class="log-reward done">Chapter complete</span>'
        : `<span class="log-reward">Complete for +${chapter.reward} salvage</span>`;
      return `<section class="hub-section"><h3>Codex · Chapter ${chapter.id}: ${chapter.title} · ${progress.found}/${progress.total}</h3>
        <div class="logs">${entries}</div>${reward}
        <p class="hub-note" style="margin-top:6px">${
          chapter.id === 1
            ? "One data log is hidden deep in each ship. You keep logs even if you don't make it out."
            : 'Chapter 2 logs turn up on ships once chapter 1 is read; two are only carried by the bosses.'
        }</p>
      </section>`;
    }).join('');
  }

  /** Personal bests across every mode. */
  private bestsSection(): string {
    const s = this.save;
    const st = s.stats;
    const fmtBoss = (ms: number) => (ms ? formatDuration(ms) : '—');
    const week = isoWeek(new Date());
    const rows: [string, string][] = [
      ['Biggest haul', st.bestHaul ? `${st.bestHaul} salvage` : '—'],
      ["Today's daily", s.daily.day === this.today() ? `${s.daily.best} salvage` : '—'],
      ["This week's challenge", s.weekly.week === week ? `${s.weekly.best} salvage` : '—'],
      ['Deepest dive', st.deepestDive > 1 ? `Depth ${st.deepestDive}` : '—'],
      ['Longest combo', st.bestCombo > 1 ? `${st.bestCombo} pickups` : '—'],
      ['Daily streak', s.streak.best ? `${s.streak.best} days` : '—'],
      ['Bounties claimed', String(st.bountiesClaimed)],
      ['Fastest Foreman', fmtBoss(s.bosses.foreman.bestMs)],
      ['Fastest Bloom Mother', fmtBoss(s.bosses.mother.bestMs)],
    ];
    return `<section class="hub-section"><h3>Personal bests</h3>
      <dl class="bests">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
    </section>`;
  }

  /** The last few runs, newest first. */
  private historySection(): string {
    const runs = this.save.history;
    if (!runs.length) return '';
    const rows = runs
      .map((r) => {
        const when = new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const what = r.boss
          ? BOSSES[r.boss].name.replace('THE ', '')
          : r.mode === 'daily'
            ? 'DAILY'
            : r.ship === 'research'
              ? 'RESEARCH'
              : 'FREIGHTER';
        const result = r.extracted ? `+${r.salvage}` : r.abandoned ? 'ABANDONED' : 'LOST';
        return `<li class="${r.extracted ? 'ok' : 'lost'}">
          <span class="h-when">${when}</span>
          <span class="h-what">${what}${r.character === 'robot' ? ' ⚙' : ''}</span>
          <span class="h-time">${formatDuration(r.durationMs)}</span>
          <span class="h-kills">${r.kills}✕</span>
          <b class="h-result">${result}</b>
        </li>`;
      })
      .join('');
    return `<section class="hub-section"><h3>Recent runs</h3><ol class="history">${rows}</ol></section>`;
  }

  private achievementsSection(): string {
    const have = new Set(this.save.achievements);
    const items = ACHIEVEMENTS.map(
      (a) => `<li class="ach ${have.has(a.id) ? 'got' : ''}">
        <i aria-hidden="true">${have.has(a.id) ? '★' : '☆'}</i>
        <span><b>${a.name}</b><small>${a.description}</small></span>
        <em>${have.has(a.id) ? 'DONE' : `+${a.reward}`}</em>
      </li>`,
    ).join('');
    return `<section class="hub-section"><h3>Achievements · ${have.size}/${ACHIEVEMENTS.length}</h3>
      <ul class="achievements">${items}</ul></section>`;
  }

  private logTab(): string {
    const st = this.save.stats;
    const stat = (value: number, label: string) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`;
    return `
      <section class="hub-section"><h3>Service record</h3>
        <div class="stats-grid">
          ${stat(st.runs, 'RUNS')}
          ${stat(st.extractions, 'EXTRACTIONS')}
          ${stat(st.bestHaul, 'BEST HAUL')}
          ${stat(st.totalBanked, 'TOTAL BANKED')}
          ${stat(st.dronesDestroyed, 'HOSTILES DOWN')}
          ${stat(this.save.codex.length, 'LOGS FOUND')}
          ${stat(st.elitesKilled, 'ELITES DOWN')}
          ${stat(st.drumsDetonated, 'DRUMS BLOWN')}
          ${stat(st.dodges, 'ROLLS')}
          ${stat(this.save.bosses.foreman.kills + this.save.bosses.mother.kills, 'BOSSES BEATEN')}
          <div class="stat"><b>${formatHours(st.timeAboardMs)}</b><span>TIME ABOARD</span></div>
          ${stat(st.extractions && st.runs ? Math.round((st.extractions / st.runs) * 100) : 0, 'EXTRACT %')}
        </div>
      </section>
      ${this.bestsSection()}
      ${this.historySection()}
      ${this.achievementsSection()}
      ${manualSection()}
      ${this.codexSection()}
      ${this.settingsSection()}
      <section class="hub-section"><h3>Move your save</h3>
        <p class="hub-note">Progress is saved in this browser. Copy a save code to carry it to another device.</p>
        <div class="btn-row"><button class="btn ghost" data-action="export">COPY SAVE CODE</button></div>
        ${this.exportCode ? `<textarea readonly aria-label="Your save code">${this.exportCode}</textarea>` : ''}
        <textarea data-import placeholder="Paste a save code here" aria-label="Save code to import" style="margin-top:8px"></textarea>
        <div class="btn-row"><button class="btn ghost" data-action="import">IMPORT</button></div>
      </section>
      <section class="hub-section"><h3>Danger zone</h3>
        <button class="btn ${this.confirmReset ? 'danger' : 'ghost'}" data-action="reset">
          ${this.confirmReset ? 'TAP AGAIN TO ERASE EVERYTHING' : 'RESET PROGRESS'}
        </button>
      </section>`;
  }
}
