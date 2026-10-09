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
import { CHAPTERS, CODEX, MINING_UNLOCK_EXTRACTIONS, chapterProgress } from '../core/codex';
import { dailySeed, dailyShip } from '../core/seed';
import { dayFromDailySeed, formatDuration, type BoardEntry } from '../core/leaderboard';
import { leaderboard } from '../net/leaderboard';
import { CLAN, checkClanName, checkClanTag, clanGoal, type ClanBoardRow, type MyClan, type OpenClan } from '../core/clans';
import { ACHIEVEMENTS as ALL_ACHIEVEMENTS } from '../core/achievements';
import { BOARDS, boardDef, fastestFirst, formatCell, type BoardGroup, type BoardId, type HallRow } from '../core/hallOfFame';
import { vesselName } from '../core/names';
import { ACHIEVEMENTS } from '../core/achievements';
import { conditionFor } from '../core/conditions';
import { isoWeek, weeklySeed, weeklySetup } from '../core/weekly';
import { manualSection } from './manual';
import { BOSSES, BOSS_IDS, BOSS_UNLOCK_EXTRACTIONS, type BossId } from '../core/bosses';
import { baseSeed } from '../core/depth';
import { chooseName, ensureName, rollName, type NameResult } from '../net/names';
import type { ShipType } from '../core/types';
import {
  awardAchievements,
  canBoard,
  claimClanGoal,
  setClanCache,
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

type Tab = 'crew' | 'loadout' | 'upgrades' | 'daily' | 'ranks' | 'log';

/** How each ship type is named and described in the hub. */
const SHIP_LABEL: Record<ShipType, { short: string; long: string; icon: string; threat: string }> = {
  freighter: { short: 'FREIGHTER', long: 'Freighter', icon: '⛭', threat: 'Guarded by drones and turrets.' },
  research: { short: 'RESEARCH', long: 'Research vessel', icon: '☣', threat: 'Overrun by the Bloom.' },
  mining: { short: 'MINING', long: 'Mining hauler', icon: '⛏', threat: 'Sapper mines and sweeping cutting lasers.' },
};

const TABS: { id: Tab; label: string }[] = [
  { id: 'crew', label: 'CREW' },
  { id: 'loadout', label: 'LOADOUT' },
  { id: 'upgrades', label: 'UPGRADES' },
  { id: 'daily', label: 'DAILY' },
  { id: 'ranks', label: 'RANKS' },
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
  private hall: { board: BoardId; cache: Partial<Record<BoardId, { at: number; rows: HallRow[] | null; error: string | null }>>; loading: BoardId | null } = {
    board: 'banked',
    cache: {},
    loading: null,
  };
  private hallScroll = 0;
  /** Your clan as the server last reported it (undefined: not loaded yet). */
  private clan: { at: number; loading: boolean; data: MyClan | null | undefined; error: string | null; busy: boolean } = {
    at: 0,
    loading: false,
    data: undefined,
    error: null,
    busy: false,
  };
  /** What's typed in the clan forms, kept across re-renders. */
  private clanForm: { name: string; tag: string; open: boolean | null; code: string; query: string } = {
    name: '',
    tag: '',
    open: null,
    code: '',
    query: '',
  };
  private openClans: { at: number; query: string; list: OpenClan[] | null; error: string | null } = { at: 0, query: '', list: null, error: null };
  /** Second tap confirms leaving or kicking. */
  private clanConfirm = '';
  private rankView: 'players' | 'clans' = 'players';
  private clanScope: 'week' | 'all' = 'week';
  private clanBoards: Partial<Record<'week' | 'all', { at: number; rows: ClanBoardRow[] | null; error: string | null }>> = {};
  /** Clan tags for names on the boards ('' = looked up, no clan). */
  private tags: Record<string, string> = {};
  private tagsPending = false;
  private weeklyBoard: { week: string; at: number; loading: boolean; entries: BoardEntry[] | null; error: string | null } = {
    week: '',
    at: 0,
    loading: false,
    entries: null,
    error: null,
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
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.dataset.clanField) {
      e.preventDefault();
      const f = e.target.dataset.clanField;
      if (f === 'code') return this.clanJoin({ code: this.clanForm.code });
      if (f === 'query') return this.loadOpenClans(true);
      return this.clanCreate();
    }
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
      this.clanConfirm = '';
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
        if (!canBoard(this.save, ship)) {
          return this.toast(
            ship === 'mining'
              ? `Find the Gravecutter ledger log, or extract ${Math.max(0, MINING_UNLOCK_EXTRACTIONS - this.save.stats.extractions)} more times, to locate mining haulers`
              : 'Find more crew logs to locate research vessels',
            true,
          );
        }
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
      case 'clan-open-choice':
        this.clanForm.open = d.open === 'true';
        return this.render();
      case 'clan-create':
        return this.clanCreate();
      case 'clan-join-code':
        return this.clanJoin({ code: this.clanForm.code });
      case 'clan-join':
        return this.clanJoin({ id: Number(d.id) });
      case 'clan-search':
        return this.loadOpenClans(true);
      case 'clan-refresh':
        this.clan.at = 0;
        return this.render();
      case 'clan-copy': {
        const code = this.clan.data?.inviteCode ?? '';
        navigator.clipboard?.writeText(code).then(
          () => this.toast(`Invite code ${code} copied`),
          () => this.toast(`Invite code: ${code}`),
        );
        return;
      }
      case 'clan-leave':
        if (this.clanConfirm !== 'leave') {
          this.clanConfirm = 'leave';
          return this.render();
        }
        return this.clanLeave();
      case 'clan-kick':
        if (this.clanConfirm !== `kick:${d.name}`) {
          this.clanConfirm = `kick:${d.name}`;
          return this.render();
        }
        return this.clanManage({ kind: 'kick', callsign: d.name! }, `${d.name} removed`);
      case 'clan-leader':
        if (this.clanConfirm !== `leader:${d.name}`) {
          this.clanConfirm = `leader:${d.name}`;
          return this.render();
        }
        return this.clanManage({ kind: 'leader', callsign: d.name! }, `${d.name} now leads the clan`);
      case 'clan-set-open':
        return this.clanManage({ kind: 'open', open: d.open === 'true' }, d.open === 'true' ? 'Clan is open to anyone' : 'Clan is invite only');
      case 'clan-new-code':
        return this.clanManage({ kind: 'code' }, 'New invite code made. The old one no longer works');
      case 'rank-view':
        this.rankView = d.view === 'clans' ? 'clans' : 'players';
        return this.render();
      case 'clan-scope':
        this.clanScope = d.scope === 'all' ? 'all' : 'week';
        return this.render();
      case 'refresh-clans':
        delete this.clanBoards[this.clanScope];
        return this.render();
      case 'hall-sort':
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
    const field = el.dataset.clanField as 'name' | 'tag' | 'code' | 'query' | undefined;
    if (field) {
      this.clanForm[field] = el.value;
      return;
    }
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
      ranks: () => this.ranksTab(),
      log: () => this.logTab(),
    };
    // Keep the RANKS table's sideways scroll when it re-sorts or refreshes.
    const shown = this.body.querySelector('.hall-scroll');
    if (shown) this.hallScroll = shown.scrollLeft;
    this.body.innerHTML = views[this.tab]();
    const table = this.body.querySelector('.hall-scroll');
    if (table) table.scrollLeft = this.hallScroll;
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
      option('freighter', 'FREIGHTER') + option('research', 'RESEARCH') + option('mining', 'MINING');
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
      label: SHIP_LABEL[ship].short,
      icon: SHIP_LABEL[ship].icon,
      threat: SHIP_LABEL[ship].threat,
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
      ${this.clanSection()}
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

  // ---------------------------------------------------------------- clans (v1.1)

  /** Fetches your clan at most every 30 s. */
  private loadClan() {
    if (!leaderboard.enabled || this.clan.loading || !this.save.playerId) return;
    if (this.clan.data !== undefined && Date.now() - this.clan.at < 30_000) return;
    this.clan.loading = true;
    leaderboard
      .myClan(this.save.playerId)
      .then((data) => this.applyClan(data))
      .catch((e: Error) => (this.clan = { ...this.clan, at: Date.now(), error: e.message }))
      .finally(() => {
        this.clan.loading = false;
        if (this.tab === 'crew' || this.tab === 'ranks') this.render();
      });
  }

  /** Takes a fresh copy of your clan: remembers it, and pays the weekly goal bonus or podium trophy if due. */
  private applyClan(data: MyClan | null) {
    this.clan = { ...this.clan, at: Date.now(), data, error: null };
    let save = setClanCache(this.save, data ? { tag: data.tag, name: data.name } : null);
    if (data && data.weekSalvage >= clanGoal(data.members.length)) {
      const goal = claimClanGoal(save, data.week, CLAN.goalBonus);
      if (goal.paid) {
        save = goal.save;
        this.toast(`Clan goal reached! +${CLAN.goalBonus} salvage`);
      }
    }
    if (data?.lastWeekRank && data.lastWeekRank <= 3 && !save.achievements.includes('clan-podium')) {
      const podium = ALL_ACHIEVEMENTS.find((a) => a.id === 'clan-podium')!;
      save = awardAchievements(save, [podium]);
      this.toast(`★ PODIUM CREW: your clan finished #${data.lastWeekRank} last week (+${podium.reward})`);
    }
    if (save !== this.save) {
      this.save = save;
      this.callbacks.onSave(save);
    }
    if (data) this.tags[this.save.callsign] = data.tag;
    else if (this.save.callsign in this.tags) this.tags[this.save.callsign] = '';
  }

  /** Runs a clan request with the buttons disabled, then shows the result. */
  private clanRequest(work: Promise<MyClan | null>, done: string) {
    if (this.clan.busy) return;
    this.clan.busy = true;
    this.clanConfirm = '';
    this.render();
    work
      .then((data) => {
        this.applyClan(data);
        delete this.clanBoards.week;
        delete this.clanBoards.all;
        this.openClans.at = 0;
        this.sound('buy');
        this.toast(done);
      })
      .catch((e: Error) => {
        this.sound('denied');
        this.toast(e.message.charAt(0).toUpperCase() + e.message.slice(1), true);
      })
      .finally(() => {
        this.clan.busy = false;
        if (this.root.isConnected) this.render();
      });
  }

  private clanCreate() {
    const name = checkClanName(this.clanForm.name);
    if (!name.ok) return this.toast(name.reason, true);
    const tag = checkClanTag(this.clanForm.tag);
    if (!tag.ok) return this.toast(tag.reason, true);
    if (this.clanForm.open === null) return this.toast('Choose open or invite only', true);
    const open = this.clanForm.open;
    this.clanRequest(
      leaderboard.createClan(this.save.playerId, name.value, tag.value, open).then((c) => {
        this.clanForm = { name: '', tag: '', open: null, code: '', query: '' };
        return c;
      }),
      `[${tag.value}] ${name.value} founded`,
    );
  }

  private clanJoin(by: { code: string } | { id: number }) {
    if ('code' in by && !by.code.trim()) return this.toast('Enter an invite code', true);
    this.clanRequest(leaderboard.joinClan(this.save.playerId, by), 'Welcome aboard');
  }

  private clanLeave() {
    const tag = this.clan.data?.tag ?? '';
    this.clanRequest(
      leaderboard.leaveClan(this.save.playerId).then(() => null),
      `You left [${tag}]. You can join another clan in ${CLAN.rejoinHours} hours`,
    );
  }

  private clanManage(action: Parameters<typeof leaderboard.manageClan>[1], done: string) {
    this.clanRequest(leaderboard.manageClan(this.save.playerId, action), done);
  }

  private loadOpenClans(force = false) {
    const query = this.clanForm.query.trim();
    if (!leaderboard.enabled || (!force && this.openClans.at && Date.now() - this.openClans.at < 60_000)) return;
    this.openClans = { ...this.openClans, at: Date.now(), query };
    leaderboard
      .browseClans(query)
      .then((list) => (this.openClans = { at: Date.now(), query, list, error: null }))
      .catch((e: Error) => (this.openClans = { at: Date.now(), query, list: null, error: e.message }))
      .finally(() => this.tab === 'crew' && this.render());
  }

  /** The clan card in CREW: create or join one, or see and run yours. */
  private clanSection(): string {
    if (!leaderboard.enabled) {
      return `<section class="hub-section"><h3>Clan</h3><p class="hub-note">Clans need the online leaderboard, which isn't switched on for this build.</p></section>`;
    }
    this.loadClan();
    const c = this.clan.data;
    if (c === undefined) {
      return `<section class="hub-section"><h3>Clan</h3><p class="hub-note">${this.clan.error ? `Couldn't reach the clan list: ${esc(this.clan.error)}` : 'Checking your clan…'}</p></section>`;
    }
    return c ? this.myClanCard(c) : this.noClanCard();
  }

  private noClanCard(): string {
    this.loadOpenClans();
    const busy = this.clan.busy ? 'disabled' : '';
    const f = this.clanForm;
    const claimed = this.save.callsign === this.save.callsignClaimed;
    const open = this.openClans.list;
    const list = this.openClans.error
      ? `<p class="hub-note">Couldn't load open clans: ${esc(this.openClans.error)}</p>`
      : !open
        ? '<p class="hub-note">Loading open clans…</p>'
        : !open.length
          ? `<p class="hub-note">${this.openClans.query ? 'No open clans match.' : 'No open clans with room yet. Found one!'}</p>`
          : `<ul class="clan-list">${open
              .map(
                (o) => `<li>
                  <span class="ctag">[${esc(o.tag)}]</span>
                  <span class="cl-name">${esc(o.name)}</span>
                  <span class="cl-meta">${o.members}/${CLAN.maxMembers} · ${o.weekSalvage.toLocaleString('en-GB')} this week</span>
                  <button class="btn ghost small" data-action="clan-join" data-id="${o.id}" ${busy}>JOIN</button>
                </li>`,
              )
              .join('')}</ul>`;
    return `<section class="hub-section clan-section"><h3>Clan</h3>
      <div class="card clan-card">
        <p class="hub-note">Team up: every member's banked salvage counts towards the clan, each week and all time. Up to ${CLAN.maxMembers} salvagers per clan.</p>
        ${claimed ? '' : '<p class="hub-note warn">Your name is still being reserved. Save it above first.</p>'}
        <h4>Join with an invite code</h4>
        <div class="clan-row">
          <input data-clan-field="code" placeholder="RUST-7KQ2" maxlength="10" value="${esc(f.code)}" autocomplete="off" spellcheck="false" aria-label="Invite code" ${busy} />
          <button class="btn ghost" data-action="clan-join-code" ${busy}>JOIN</button>
        </div>
        <h4>Open clans</h4>
        <div class="clan-row">
          <input data-clan-field="query" placeholder="Search by name or tag" maxlength="20" value="${esc(f.query)}" autocomplete="off" spellcheck="false" aria-label="Search clans" ${busy} />
          <button class="btn ghost" data-action="clan-search" ${busy}>SEARCH</button>
        </div>
        ${list}
        <h4>Found a clan</h4>
        <div class="clan-row">
          <input data-clan-field="name" placeholder="Clan name" maxlength="20" value="${esc(f.name)}" autocomplete="off" spellcheck="false" aria-label="Clan name" ${busy} />
          <input class="tag-input" data-clan-field="tag" placeholder="TAG" maxlength="4" value="${esc(f.tag)}" autocomplete="off" spellcheck="false" aria-label="Clan tag" ${busy} />
        </div>
        <div class="clan-choice" role="radiogroup" aria-label="Who can join">
          <button class="choice" role="radio" data-action="clan-open-choice" data-open="true" aria-checked="${f.open === true}" ${busy}><span>Open</span><small>Anyone can join from the list</small></button>
          <button class="choice" role="radio" data-action="clan-open-choice" data-open="false" aria-checked="${f.open === false}" ${busy}><span>Invite only</span><small>Members share the invite code</small></button>
        </div>
        <div class="btn-row"><button class="btn" data-action="clan-create" ${busy}>FOUND CLAN</button></div>
      </div>
    </section>`;
  }

  private myClanCard(c: MyClan): string {
    const busy = this.clan.busy ? 'disabled' : '';
    const goal = clanGoal(c.members.length);
    const pct = Math.min(100, Math.round((c.weekSalvage / goal) * 100));
    const n = (v: number) => v.toLocaleString('en-GB');
    const members = c.members
      .map((m) => {
        const tools =
          c.isLeader && !m.you
            ? `<span class="cm-tools">
                <button class="btn ghost small" data-action="clan-leader" data-name="${esc(m.callsign)}" ${busy}>${this.clanConfirm === `leader:${m.callsign}` ? 'CONFIRM' : 'MAKE LEADER'}</button>
                <button class="btn ghost small danger" data-action="clan-kick" data-name="${esc(m.callsign)}" ${busy}>${this.clanConfirm === `kick:${m.callsign}` ? 'CONFIRM' : 'KICK'}</button>
              </span>`
            : '';
        return `<li class="${m.you ? 'you' : ''}">
          <span class="cm-name">${m.leader ? '★ ' : ''}${esc(m.callsign)}${m.you ? ' <small>YOU</small>' : ''}</span>
          <span class="cm-week">${n(m.weekSalvage)}</span>
          <span class="cm-all">${n(m.allSalvage)}</span>
          ${tools}
        </li>`;
      })
      .join('');
    const leader = c.isLeader
      ? `<h4>Leader tools</h4>
        <div class="clan-choice" role="radiogroup" aria-label="Who can join">
          <button class="choice" role="radio" data-action="clan-set-open" data-open="true" aria-checked="${c.open}" ${busy}><span>Open</span><small>Listed for anyone to join</small></button>
          <button class="choice" role="radio" data-action="clan-set-open" data-open="false" aria-checked="${!c.open}" ${busy}><span>Invite only</span><small>Code needed</small></button>
        </div>
        <div class="btn-row"><button class="btn ghost" data-action="clan-new-code" ${busy}>NEW INVITE CODE</button></div>`
      : '';
    return `<section class="hub-section clan-section"><h3>Clan</h3>
      <div class="card clan-card mine">
        <div class="clan-head">
          <span class="ctag big">[${esc(c.tag)}]</span>
          <span class="clan-name">${esc(c.name)}</span>
          <span class="clan-badge">${c.open ? 'OPEN' : 'INVITE ONLY'} · ${c.members.length}/${CLAN.maxMembers}</span>
        </div>
        <div class="clan-stats">
          <div><b>${n(c.weekSalvage)}</b><span>THIS WEEK${c.weekRank ? ` · #${c.weekRank}` : ''}</span></div>
          <div><b>${n(c.allSalvage)}</b><span>ALL TIME</span></div>
          <div><b>${c.lastWeekRank ? `#${c.lastWeekRank}` : '—'}</b><span>LAST WEEK</span></div>
        </div>
        <div class="clan-goal" title="Weekly goal: ${n(goal)} salvage">
          <div class="goal-bar"><i style="width:${pct}%"></i></div>
          <span>Weekly goal ${n(c.weekSalvage)} / ${n(goal)}${pct >= 100 ? ' · REACHED' : ''} · +${CLAN.goalBonus} salvage each when reached</span>
        </div>
        <div class="clan-invite">
          <span>Invite code</span><b>${esc(c.inviteCode)}</b>
          <button class="btn ghost small" data-action="clan-copy">COPY</button>
        </div>
        <h4>Members <small>this week · all time</small></h4>
        <ol class="clan-members">${members}</ol>
        ${leader}
        <div class="btn-row">
          <button class="btn ghost small" data-action="clan-refresh" ${busy}>REFRESH</button>
          <button class="btn ghost small danger" data-action="clan-leave" ${busy}>${this.clanConfirm === 'leave' ? `CONFIRM: LEAVE [${esc(c.tag)}]` : 'LEAVE CLAN'}</button>
        </div>
        <p class="hub-note">Only salvage you bank while you're a member counts, and it stays with the clan if you leave. After leaving you wait ${CLAN.rejoinHours} hours before joining another. Top-3 clans each week earn their members a banner trophy colour.</p>
      </div>
    </section>`;
  }

  // ---------------------------------------------------------------- clan tags on the boards

  /** Looks up clan tags for names on screen (once each), then re-renders if any turned up. */
  private ensureTags(names: string[]) {
    if (!leaderboard.enabled || this.tagsPending) return;
    const missing = [...new Set(names)].filter((n) => !(n in this.tags));
    if (!missing.length) return;
    this.tagsPending = true;
    for (const n of missing) this.tags[n] = '';
    leaderboard
      .clanTags(missing)
      .then((found) => {
        Object.assign(this.tags, found);
        if (Object.keys(found).length && this.root.isConnected) this.render();
      })
      .catch(() => undefined)
      .finally(() => (this.tagsPending = false));
  }

  /** A name with its clan tag in front, as HTML. */
  private tagged(callsign: string): string {
    const tag = this.tags[callsign];
    return `${tag ? `<em class="ctag">[${esc(tag)}]</em> ` : ''}${esc(callsign)}`;
  }

  /** The clan board in RANKS: clans by salvage this week or all time. */
  private clanBoardSection(): string {
    const scope = this.clanScope;
    const cached = this.clanBoards[scope];
    if (!cached || (cached.rows && Date.now() - cached.at > 60_000)) {
      this.clanBoards[scope] = { at: Date.now(), rows: cached?.rows ?? null, error: null };
      leaderboard
        .clanBoard(scope, this.save.playerId)
        .then((rows) => (this.clanBoards[scope] = { at: Date.now(), rows, error: null }))
        .catch((e: Error) => (this.clanBoards[scope] = { at: Date.now(), rows: null, error: e.message }))
        .finally(() => this.tab === 'ranks' && this.render());
    }
    const n = (v: number) => v.toLocaleString('en-GB');
    const now = this.clanBoards[scope];
    let body: string;
    if (now?.error) body = `<p class="hub-note">Couldn't load the clan board: ${esc(now.error)}</p>`;
    else if (!now?.rows) body = '<p class="hub-note">Loading…</p>';
    else if (!now.rows.length) body = '<p class="hub-note">No clans yet. Found the first one in CREW.</p>';
    else
      body = `<div class="hall-scroll"><table class="hall-table clan-table">
        <thead><tr><th class="h-rank">#</th><th class="h-name">Clan</th><th class="num sorted">Salvage ▼</th><th class="num">Crew</th><th class="num">Runs</th><th class="num">Bosses</th></tr></thead>
        <tbody>${now.rows
          .map(
            (r) => `<tr class="${r.isYours ? 'you' : ''} ${r.rank <= 3 ? 'top' : ''}">
              <td class="h-rank">${r.rank}</td>
              <td class="h-name"><em class="ctag">[${esc(r.tag)}]</em> ${esc(r.name)}${r.isYours ? ' <small>YOURS</small>' : ''}</td>
              <td class="num sorted">${n(r.salvage)}</td>
              <td class="num">${r.members}/${CLAN.maxMembers}${r.open ? '' : ' 🔒'}</td>
              <td class="num">${n(r.runs)}</td>
              <td class="num">${n(r.bosses)}</td>
            </tr>`,
          )
          .join('')}</tbody></table></div>`;
    return `<section class="hub-section"><h3>Top clans · ${scope === 'week' ? 'this week' : 'all time'}</h3>
      <div class="seg" role="tablist">
        <button class="seg-btn" role="tab" data-action="clan-scope" data-scope="week" aria-selected="${scope === 'week'}">THIS WEEK</button>
        <button class="seg-btn" role="tab" data-action="clan-scope" data-scope="all" aria-selected="${scope === 'all'}">ALL TIME</button>
      </div>
      ${body}
      <div class="btn-row"><button class="btn ghost" data-action="refresh-clans">REFRESH</button></div>
      <p class="hub-note">A clan's score is every member's banked salvage while they're in it. The weekly season resets with the Weekly Challenge; the top three clans earn their members a banner trophy colour. Make or join a clan in <button class="text-link" data-tab="crew">CREW</button>.</p>
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
    const ship = SHIP_LABEL[mission.ship].long;
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
      this.ensureTags(this.board.entries.map((r) => r.callsign));
      board = `<ol class="board">${this.board.entries
        .map(
          (r) => `<li class="${r.isYou ? 'you' : ''}">
            <span class="b-rank">${r.rank}</span>
            <span class="b-name">${this.tagged(r.callsign)}${r.isYou ? ' <small>YOU</small>' : ''}</span>
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
        <p class="hub-note">Extract once a day to build a streak: +10 salvage per day in a row (up to +70).${
          this.save.settings.ghost ? " You'll race a see-through ghost of the day's best run (switch it off in LOG → Settings)." : ''
        }</p>
        <div class="btn-row"><button class="btn daily-play theme-${mission.ship}" data-action="daily">BOARD ${mission.vessel} ▸</button></div>
      </section>
      ${this.weeklySection()}
      ${this.contractsSection()}
      <section class="hub-section"><h3>Top salvagers · ${day}</h3>${board}</section>
      <p class="hub-note">Posting as <b>${esc(this.save.callsign)}</b>. Change your name in <button class="text-link" data-tab="crew">CREW</button>. No account needed; your save code carries it to other devices.</p>`;
  }

  /** Fetches the chosen all-time board at most once a minute. */
  private loadHall() {
    const id = this.hall.board;
    const cached = this.hall.cache[id];
    if (!leaderboard.enabled || this.hall.loading === id || (cached && Date.now() - cached.at < 60_000)) return;
    this.hall.loading = id;
    leaderboard
      .hallTable(id, this.save.playerId)
      .then((rows) => (this.hall.cache[id] = { at: Date.now(), rows, error: null }))
      .catch((e: Error) => (this.hall.cache[id] = { at: Date.now(), rows: null, error: e.message }))
      .finally(() => {
        if (this.hall.loading === id) this.hall.loading = null;
        if (this.tab === 'ranks') this.render();
      });
  }

  /**
   * RANKS: the all-time hall of fame as one table, a row per player and a
   * column per stat. Sorted by total salvage banked; tap a heading to re-sort.
   */
  private ranksTab(): string {
    if (!leaderboard.enabled) {
      return `<section class="hub-section"><h3>Hall of fame · all time</h3>
        <p class="hub-note">The online leaderboard isn't switched on for this build, so there are no all-time rankings. Your own records are under <button class="text-link" data-tab="log">LOG</button>.</p></section>`;
    }
    const view = this.rankView;
    const switcher = `<div class="seg rank-switch" role="tablist">
        <button class="seg-btn" role="tab" data-action="rank-view" data-view="players" aria-selected="${view === 'players'}">SALVAGERS</button>
        <button class="seg-btn" role="tab" data-action="rank-view" data-view="clans" aria-selected="${view === 'clans'}">CLANS</button>
      </div>`;
    if (view === 'clans') return switcher + this.clanBoardSection();
    return switcher + this.playerRanks();
  }

  private playerRanks(): string {
    this.loadHall();
    const sort = boardDef(this.hall.board);
    const cached = this.hall.cache[sort.id];
    const groups: BoardGroup[] = ['Salvage', 'Records', 'Bosses', 'Kills'];
    const groupRow = groups
      .map((g) => `<th colspan="${BOARDS.filter((b) => b.group === g).length}" class="g-${g.toLowerCase()}">${g}</th>`)
      .join('');
    const heads = BOARDS.map((b) => {
      const on = b.id === sort.id;
      const arrow = on ? (fastestFirst(b.id) ? ' ▲' : ' ▼') : '';
      return `<th class="num ${on ? 'sorted' : ''}" aria-sort="${on ? (fastestFirst(b.id) ? 'ascending' : 'descending') : 'none'}">
        <button data-action="hall-sort" data-board="${b.id}" title="${esc(b.label)}">${esc(b.short)}${arrow}</button></th>`;
    }).join('');

    let body: string;
    if (cached?.error) {
      body = `<p class="hub-note">Couldn't load the hall of fame: ${esc(cached.error)}</p>`;
    } else if (!cached?.rows) {
      body = '<p class="hub-note">Loading…</p>';
    } else {
      this.ensureTags(cached.rows.map((r) => r.callsign));
      const rows = cached.rows
        .map(
          (r) => `<tr class="${r.isYou ? 'you' : ''} ${r.rank <= 3 ? 'top' : ''}">
            <td class="h-rank">${r.rank}</td>
            <td class="h-name">${this.tagged(r.callsign)}${r.isYou ? ' <small>YOU</small>' : ''}</td>
            ${BOARDS.map((b) => `<td class="num ${b.id === sort.id ? 'sorted' : ''}">${formatCell(b.id, r.values[b.id])}</td>`).join('')}
          </tr>`,
        )
        .join('');
      const empty = cached.rows.length
        ? ''
        : `<p class="hub-note">Nobody has a ${esc(sort.label.toLowerCase())} yet. It could be you.</p>`;
      body = `<div class="hall-scroll"><table class="hall-table">
          <thead><tr><th class="h-rank" rowspan="2">#</th><th class="h-name" rowspan="2">Salvager</th>${groupRow}</tr><tr>${heads}</tr></thead>
          <tbody>${rows}</tbody>
        </table></div>${empty}`;
    }
    return `<section class="hub-section"><h3>Hall of fame · all time</h3>
      <div class="hall-title">Sorted by ${esc(sort.label.toLowerCase())}${sort.id === 'bounty' ? ' claimed' : sort.group === 'Kills' ? ' destroyed' : ''}${fastestFirst(sort.id) ? ' (fastest first)' : ''}</div>
      <p class="hub-note hall-hint">Tap a column heading to sort by it. Scroll sideways for boss times and kills by hostile type.</p>
      ${body}
      <div class="btn-row">${sort.id !== 'banked' ? '<button class="btn ghost" data-action="hall-sort" data-board="banked">SORT BY SALVAGE</button>' : ''}<button class="btn ghost" data-action="refresh-hall">REFRESH</button></div>
      <p class="hub-note">Every run you finish adds to your totals once your name is claimed (assist mode runs don't count). Lost runs still count kills; salvage only counts when you extract.</p>
    </section>
    <p class="hub-note">Ranked as <b>${esc(this.save.callsign)}</b>. Change your name in <button class="text-link" data-tab="crew">CREW</button>. Today's board is under <button class="text-link" data-tab="daily">DAILY</button>.</p>`;
  }

  /** Fetches this week's board at most every 30 s. */
  private loadWeeklyBoard(week: string) {
    const b = this.weeklyBoard;
    if (!leaderboard.enabled || b.loading || (b.week === week && Date.now() - b.at < 30_000)) return;
    this.weeklyBoard = { ...b, week, loading: true, error: null };
    leaderboard
      .weeklyBoard(week, this.save.playerId, 5)
      .then((entries) => (this.weeklyBoard = { week, at: Date.now(), loading: false, entries, error: null }))
      .catch((e: Error) => (this.weeklyBoard = { week, at: Date.now(), loading: false, entries: null, error: e.message }))
      .finally(() => this.tab === 'daily' && this.render());
  }

  private weeklyBoardHtml(): string {
    if (!leaderboard.enabled) return '';
    const b = this.weeklyBoard;
    if (b.error) return `<p class="hub-note">Couldn't load the weekly board: ${esc(b.error)}</p>`;
    if (!b.entries) return '<p class="hub-note">Loading the weekly board…</p>';
    if (!b.entries.length) return '<p class="hub-note">Nobody has extracted this week yet. Top spot is open.</p>';
    this.ensureTags(b.entries.map((r) => r.callsign));
    return `<ol class="board weekly-board">${b.entries
      .map(
        (r) => `<li class="${r.isYou ? 'you' : ''}">
          <span class="b-rank">${r.rank}</span>
          <span class="b-name">${this.tagged(r.callsign)}${r.isYou ? ' <small>YOU</small>' : ''}</span>
          <span class="b-score">${r.score}</span>
          <span class="b-time">${formatDuration(r.durationMs)}</span>
          <span class="b-crew">${r.character === 'robot' ? '⚙' : '◉'}</span>
        </li>`,
      )
      .join('')}</ol>`;
  }

  /** This week's challenge: ship, mutators, your best, and the week's board. */
  private weeklySection(): string {
    const seed = weeklySeed(new Date());
    const week = isoWeek(new Date());
    this.loadWeeklyBoard(week);
    const { ship, mutators } = weeklySetup(seed);
    const best = this.save.weekly.week === week ? this.save.weekly.best : null;
    return `<section class="hub-section"><h3>Weekly challenge · ${week}</h3>
      <article class="card weekly-card">
        <div class="daily-head"><span>${vesselName(seed, ship)}</span><b>${SHIP_LABEL[ship].icon} ${SHIP_LABEL[ship].long.toUpperCase()}</b></div>
        <ul class="mutators">${mutators.map((m) => `<li><b>${m.name.toUpperCase()}</b> ${m.blurb}</li>`).join('')}</ul>
        <div class="daily-best">Your best this week <b>${best ?? '—'}</b></div>
        <div class="btn-row"><button class="btn weekly-play" data-action="weekly">PLAY THE WEEKLY ▸</button></div>
        ${leaderboard.enabled ? `<h4 class="weekly-board-title">Top this week</h4>${this.weeklyBoardHtml()}` : ''}
      </article>
    </section>`;
  }

  private bossLockReason(id: BossId): string {
    const left = BOSS_UNLOCK_EXTRACTIONS - this.save.stats.extractions;
    if (left > 0) return `Extract ${left} more time${left === 1 ? '' : 's'} to take boss contracts`;
    if (BOSSES[id].ship === 'research') return 'Find the coordinates log to reach research vessels first';
    if (BOSSES[id].ship === 'mining') return 'Locate the mining haulers first';
    return 'Locked';
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
    const toggle = (key: 'screenShake' | 'flashes' | 'minimap' | 'assist' | 'tips' | 'ghost', label: string) => `
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
        ${toggle('ghost', 'Daily ghost to race')}
        ${toggle('assist', 'Assist mode')}
        <div class="btn-row"><button class="btn ghost" data-action="reset-tips">SHOW TIPS AGAIN (${this.save.tips.length} SEEN)</button></div>
        <p class="hub-note">Assist mode gives you 50% more oxygen or battery and halves the damage you take. Daily runs played with it on aren't posted to the leaderboard. Turn off screen shake and damage flashes above if motion bothers you. The daily ghost is a see-through replay of the day's best run.</p>
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
            : r.mode === 'weekly'
              ? 'WEEKLY'
              : SHIP_LABEL[r.ship].short;
        // Ordinary ships open in the seed explorer.
        const map = r.boss ? null : `./map.html?seed=${encodeURIComponent(baseSeed(r.seed))}${r.ship === 'freighter' ? '' : `&ship=${r.ship}`}`;
        const result = r.extracted ? `+${r.salvage}` : r.abandoned ? 'ABANDONED' : 'LOST';
        return `<li class="${r.extracted ? 'ok' : 'lost'}">
          <span class="h-when">${when}</span>
          <span class="h-what">${map ? `<a href="${map}" target="_blank" rel="noopener" title="Open this ship in the seed explorer">${what}</a>` : what}${r.character === 'robot' ? ' ⚙' : ''}</span>
          <span class="h-time">${formatDuration(r.durationMs)}</span>
          <span class="h-kills">${r.kills}✕</span>
          <b class="h-result">${result}</b>
        </li>`;
      })
      .join('');
    return `<section class="hub-section"><h3>Recent runs</h3><ol class="history">${rows}</ol>
      <p class="hub-note">Tap a ship to see its whole layout in the <a href="./map.html" target="_blank" rel="noopener">seed explorer</a>.</p></section>`;
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
          ${stat(BOSS_IDS.reduce((n, id) => n + this.save.bosses[id].kills, 0), 'BOSSES BEATEN')}
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
