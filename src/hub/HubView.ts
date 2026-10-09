import './hub.css';
import { drawCharacterPreview } from '../art/textures';
import {
  CHARACTERS,
  COSMETICS,
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
  setDestination,
  setGun,
  setLook,
  setPerk,
  setTool,
  type SaveData,
  type ShopItem,
} from '../core/progression';
import { WEAPONS, type WeaponId } from '../core/weapons';

type Tab = 'crew' | 'loadout' | 'upgrades' | 'log';

const TABS: { id: Tab; label: string }[] = [
  { id: 'crew', label: 'CREW' },
  { id: 'loadout', label: 'LOADOUT' },
  { id: 'upgrades', label: 'UPGRADES' },
  { id: 'log', label: 'LOG' },
];

export interface HubCallbacks {
  onLaunch: (daily: boolean) => void;
  onSave: (save: SaveData) => void;
  onReset: () => void;
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
  private exportCode = '';

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
    window.addEventListener('keydown', this.onKey);
    document.body.appendChild(this.root);
    this.render();
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    window.clearTimeout(this.toastTimer);
    this.root.remove();
  }

  // ---------------------------------------------------------------- events

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      this.callbacks.onLaunch(false);
    }
  };

  private onClick = (e: Event) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action],[data-tab]');
    if (!el) return;
    const d = el.dataset;

    if (d.tab) {
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
    if (!result.ok) return this.toast(result.reason, true);
    this.update(result.save);
    this.toast(label);
  }

  private update(next: SaveData) {
    if (next === this.save) return;
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
    this.root.querySelectorAll<HTMLElement>('[data-tab]').forEach((t) => {
      t.setAttribute('aria-selected', String(t.dataset.tab === this.tab));
    });
    const views: Record<Tab, () => string> = {
      crew: () => this.crewTab(),
      loadout: () => this.loadoutTab(),
      upgrades: () => this.upgradesTab(),
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
    const todays = dailyShip(dailySeed(new Date())) === 'research' ? 'research vessel' : 'freighter';
    const daily = this.root.querySelector<HTMLElement>('[data-action="daily"]')!;
    daily.textContent = 'DAILY';
    daily.title = `Today's shared ship: a ${todays}`;
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
          const tag = this.priceTag({ kind: 'cosmetic', character: c.id, slot, id: o.id });
          const colour = slot === 'body' ? (o.colours.b ?? o.colours.s) : (o.colours.v ?? o.colours.e);
          return `<button class="swatch ${tag.cls}" data-action="look" data-slot="${slot}" data-id="${o.id}"
            aria-pressed="${s.loadout.looks[c.id][slot] === o.id}" title="${o.name}${tag.label ? ` (${tag.label})` : ''}">
            <i style="background:${colour}"></i>${tag.label}
          </button>`;
        })
        .join('');

    return `
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
        ${s.tools.length < Object.keys(TOOLS).length ? '<p class="hub-note" style="margin-top:8px">The hacking tool is for sale in Upgrades.</p>' : ''}
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

  private codexSection(): string {
    const found = this.save.codex;
    return CHAPTERS.map((chapter) => {
      const progress = chapterProgress(found, chapter.id);
      const entries = CODEX.filter((e) => e.chapter === chapter.id)
        .map((e, i) => {
          if (!found.includes(e.id)) {
            const where = e.ship === 'research' ? 'research vessel' : 'freighter';
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
        <p class="hub-note" style="margin-top:6px">One data log is hidden deep in each ship. You keep logs even if you don't make it out.</p>
      </section>`;
    }).join('');
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
        </div>
      </section>
      ${this.codexSection()}
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
