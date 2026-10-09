# Derelict

[![CI](https://github.com/ShanujPatel/derelict/actions/workflows/ci.yml/badge.svg)](https://github.com/ShanujPatel/derelict/actions/workflows/ci.yml)

A real-time, top-down sci-fi roguelike that runs in the browser. Board abandoned ships, salvage what you can, and get out before your oxygen runs dry.

**▶ [Play in your browser](https://ShanujPatel.github.io/derelict/)** · [Daily Derelict](https://ShanujPatel.github.io/derelict/?daily)

![Gameplay screenshot](docs/screenshot.png)

## How to play

| Action | Control |
|---|---|
| Move | WASD / arrow keys |
| Aim and fire | Mouse / left click (hold) |
| Swap gun | Q, 1 / 2, or mouse wheel |
| Tool (torch or hacking tool) | F or right click |

**On a phone or tablet:** left thumb moves, right thumb aims and fires. The **GUN** and **TORCH**/**HACK** buttons sit on the right. Works in portrait and landscape.

<img src="docs/screenshot-mobile.png" alt="Mobile portrait screenshot" width="260">

Find salvage crates and O₂ canisters, fight or avoid what lives aboard, and reach the green extraction pad. Salvage only counts if you extract. The green arrow round your suit points to the exit.

**Two kinds of wreck:**

- **Corporate freighters** are guarded by patrol drones and wall turrets.
- **Research vessels** are overrun by the Bloom: fast crawlers, acid-spitting pods and egg sacs that keep hatching. Find the right crew log to unlock them.

**Tools:** the cutting torch opens cracked walls for shortcuts. The hacking tool turns turrets to your side and opens locked caches; stand close and keep still while it works.

**Crew logs:** every ship hides one data log. Collect them to piece together what happened to the Halcyon Drift and the Lacuna. You keep logs even if you die.

![Research vessel](docs/screenshot-research.png)

**Between runs** you're back on your own ship. Spend banked salvage on:

- **Crew:** unlock the armoured Robot, which runs on battery instead of oxygen.
- **Systems:** hull plating, life support and servo boot upgrades.
- **Armoury:** the Railgun, which pierces a whole line of enemies, and the Hacking tool.
- **Perks:** Scavenger, Cold cutter, Scrapper or Second wind, one per run.
- **Cosmetics:** suit, visor, chassis and optics colours.

Progress saves in your browser. Use **Log → Copy save code** to move it to another device.

<img src="docs/screenshot-hub.png" alt="Hub screen" width="480">

**Seeds:** every ship comes from a seed shown in the top-right corner. Share a ship with `?seed=YOURSEED`, or play today's shared ship with `?daily`.

## Running locally

Requires Node.js 20 or later.

```bash
npm install
npm run dev        # start the dev server
npm test           # run unit tests
npm run typecheck  # TypeScript checks
npm run build      # production build in dist/
```

## How it's built

| Area | Choice |
|---|---|
| Language | TypeScript (strict) |
| Engine | [Phaser 3](https://phaser.io) |
| Build | Vite |
| Tests | Vitest |
| CI/CD | GitHub Actions → GitHub Pages |

```
src/
  core/      Pure game logic: RNG, seeds, deck generator (per ship type), tile display
             rules, pathing, oxygen, weapons, codex, progression (shop, saves, export
             codes), virtual-stick maths, screen sizing.
             No Phaser imports, so it's fully unit-tested.
  scenes/    Phaser scenes: Boot (builds textures), Hub and Game, plus enemy AI.
  hub/       Between-runs screens as an HTML/CSS overlay.
  ui/        Touch controls (twin virtual sticks).
  art/       Original pixel art defined in code: no binary assets.
tests/       Vitest unit tests for everything in core/.
docs/        Game design document.
```

**Procedural generation.** Each deck is built from a seed with a deterministic RNG (mulberry32), so the same seed always gives the same ship. Rooms are placed and joined to their nearest neighbour with two-tile corridors, and a few extra loops are added. Extraction goes in the room furthest from the start on foot. Thin walls that would save a long walk become weak walls you can cut with the torch. Each ship type has its own spawn table: freighters mount turrets against walls, research vessels breed aliens. The data log always goes in the furthest 40% of the ship. Tests check these rules across 100 seeds of each ship type: every floor tile is reachable, enemies never spawn near the start, and cutting weak walls only ever adds shortcuts.

## Roadmap

See the full [game design document](docs/GDD.md).

- [x] **v0.1** Salvager, freighter decks, drones, two guns, cutting torch, oxygen, seeded runs, CI/CD
- [x] **v0.1.1** New pixel art, lighting, touch controls, portrait and landscape mobile support
- [x] **v0.2** Robot character, customisation, hub with permanent unlocks, railgun, perks
- [x] **v0.3** Research vessels, alien enemies, turrets, hacking tool, codex chapter 1
- [ ] **v0.4** Daily leaderboard, rival salvagers, grav tool
- [ ] **Later** Bosses, more codex chapters, more ship types

## Licence

[MIT](LICENSE)
