# Derelict

[![CI](https://github.com/ShanujPatel/derelict/actions/workflows/ci.yml/badge.svg)](https://github.com/ShanujPatel/derelict/actions/workflows/ci.yml)

A real-time, top-down sci-fi roguelike that runs in the browser. Board abandoned ships, salvage what you can, and get out before your oxygen runs dry.

**▶ [Play in your browser](https://ShanujPatel.github.io/derelict/)** · [Daily Derelict](https://ShanujPatel.github.io/derelict/?daily)

![Gameplay screenshot](docs/screenshot.png)

## How to play

| Action | Keyboard + mouse | Gamepad |
|---|---|---|
| Move | WASD / arrow keys | Left stick |
| Aim and fire | Mouse / left click (hold) | Right stick, RT |
| Swap gun | Q, 1 / 2, or mouse wheel | Y |
| Tool (torch, hacking, grav or sentry) | F or right click | X or RB |
| Dodge roll | Shift or Space | A or LB |
| Scanner map | Tab | Back or B |
| Pause | Esc or P | Start |
| Mute | M | |

Xbox and PlayStation controllers work in the browser: plug one in and press a button. In the hub, Start launches and Y boards the daily ship.

**On a phone or tablet:** left thumb moves, right thumb aims and fires. The **GUN**, tool and **ROLL** buttons sit on the right; **II** at the top pauses and **MAP** opens the scanner. Works in portrait and landscape.

**Sound:** every sound effect and the music are synthesised in the browser with Web Audio. There are no audio files. Each ship type has its own theme, and drums fade in when things are hunting you. Volume sliders, screen shake and flashes are under **Log → Settings**.

<img src="docs/screenshot-mobile.png" alt="Mobile portrait screenshot" width="260">

Find salvage crates and O₂ canisters, grab the glowing health packs (repair kits for the robot) to patch yourself up, fight or avoid what lives aboard, and reach the green extraction pad. Salvage only counts if you extract. The green arrow round your suit points to the exit.

**Two kinds of wreck:**

- **Corporate freighters** are guarded by patrol drones and wall turrets.
- **Research vessels** are overrun by the Bloom: fast crawlers, acid-spitting pods and egg sacs that keep hatching. Find the right crew log to unlock them.

**Gravecutters:** about a minute into every run, a rival salvage crew docks behind you. Raiders strip loose salvage and shoot in bursts; the brute's riot shield blocks shots from the front, so flank it, stun it or use the railgun. Take them down to get your loot back.

**Field kit:** a dodge roll you can't be hit during (short cooldown), and a scanner map that fills in as you explore, marking the exit and any loot you've seen. Red fuel drums explode when shot, hurting everything nearby (you too), blowing open cracked walls and setting off other drums. Enemies sometimes drop O₂ or health, more often when you're running low.

**Ship conditions:** every derelict has a condition picked from its seed: a power failure (darker, no lamps), a hull breach (faster oxygen drain), a rich manifest (salvage worth more), hardened security (more gold **elite** hostiles with double health and extra loot), a jammed scanner, or nothing unusual. The daily card shows today's.

**Boss contracts** (DAILY tab, after 3 extractions): two bosses, each in its own three-part arena: a staging bay with supplies, the arena itself with cover pillars and the boss's weak points, and a sealed vault with the exit and the best loot, which only opens when the boss dies.

- **The Foreman** (freighter cargo bay): an armoured loader that ignores normal fire. Bait its telegraphed charge and roll aside so it stuns itself on a wall, shoot its four power couplings (each overloads it; lose them all and the armour is gone), or catch it in a drum blast. The railgun gets through armour at half damage. At half health it goes into overdrive and calls in drones.
- **The Bloom Mother** (research hatchery): her carapace turns shots aside, so hit her core while her mouth is open to spit acid. Three feeder roots heal her: shoot or torch them before they regrow. Drums beside her hit straight through. At half health she fires slow spore rings you roll through.

Your first kill of each pays a bonus, and the contract card keeps your best time. Share a fight with `?boss=foreman&seed=ABC123`.

**Deep dive:** ordinary runs have a purple lift pad as well as the exit. Take it to drop to a deeper deck (down to depth 5) carrying your health, oxygen and salvage: each level is richer but has more elites and quicker hostiles. Or take the exit and bank it.

**More aboard:** mimic crates on freighters that look like salvage until you get close, cloaked stalkers on research vessels, electrified shock floors that cycle on and off, and one named **bounty** target per run worth a big payout (it's tracked on your scanner). Chain pickups quickly for a **salvage combo** of up to ×1.5. Elites and bounties always drop a **power-up**: *Overdrive* (double fire rate for 8 seconds) or *Aegis* (a shield that soaks two hits). Wall turrets show a red laser sight while they lock on.

**Weekly Challenge** (DAILY tab): one ship a week, the same for everyone, with two mutators such as *Glass cannon* (double damage both ways) or *Thin air* (faster oxygen drain, richer salvage). Link: `?weekly`. Daily extractions also build a **streak** worth up to +70 salvage a day.

**Achievements:** 19 goals, from *Ghost* (extract without destroying anything) to *Demolitions* (three kills with drum blasts in one run). Each pays salvage once; see them under **Log**.

**Tools:** the cutting torch opens cracked walls for shortcuts (and burns through boss roots). The hacking tool turns turrets to your side and opens locked caches. The grav tool fires a cone-shaped push that shoves and stuns enemies and swats incoming shots aside. The sentry drone deploys a little auto-turret for 12 seconds.

**Guns:** blaster, scattergun, the piercing railgun, and the **arc caster**, whose lightning jumps between up to four nearby hostiles (and sets off fuel drums).

**Crew logs:** every ship hides one data log. Collect them to piece together what happened to the Halcyon Drift and the Lacuna; chapter 2, *The Gravecutter Ledger*, follows, with two logs only the bosses carry. You keep logs even if you die.

**Help and accessibility:** first-time tips explain things as you meet them (worded for your controls), and **Log → Field manual** has every control and a guide to what's aboard. Under **Log → Settings**: assist mode (50% more oxygen, half damage; daily runs aren't posted), an always-on corner minimap, and switches for screen shake, flashes and tips. The pause menu shows your run so far, and the results screen can copy a **share card** with a link to replay the same ship.

![Research vessel](docs/screenshot-research.png)

**Between runs** you're back on your own ship. Spend banked salvage on:

- **Crew:** unlock the armoured Robot, which runs on battery instead of oxygen.
- **Systems:** hull plating, life support and servo boot upgrades.
- **Armoury:** the Railgun, the Arc caster, and the hacking, grav and sentry tools.
- **Perks:** Scavenger, Cold cutter, Scrapper, Second wind, Adrenaline, Demolitionist, Field medic or Self-repair (robot), one per run.
- **Cosmetics:** suit, visor, chassis and optics colours, plus trophy colours you can only earn (beat a boss, finish a weekly...).

**Log** also keeps your personal bests, your last 10 runs and a lifetime service record.

Progress saves in your browser. Use **Log → Copy save code** to move it to another device.

<img src="docs/screenshot-hub.png" alt="Hub screen" width="480">

**Daily Derelict:** one named wreck a day, the same for everyone; the DAILY button shows today's ship. Extract to post your salvage to the online leaderboard (DAILY tab); only your best run counts. You start with a random sci-fi name like *NYX HARROW* or *COLD COMET*; change it or roll a new one at the top of the **Crew** tab. Names are unique across all players. Setting up your own board takes about 10 minutes: see [docs/LEADERBOARD.md](docs/LEADERBOARD.md).

**Hall of fame** (**RANKS** tab): all-time boards for the best salvagers. Total salvage banked, biggest haul, ships cleared, deepest dive, longest daily streak, fastest boss kills, and most kills overall, of elites, of bounties and of each hostile type. Every run you finish adds to your totals once your name is claimed (assist mode runs don't count). If you run your own board, re-run `docs/supabase.sql` after updating to add it.

**Seeds:** every ship comes from a seed shown in the top-right corner. Share a ship with `?seed=YOURSEED` (add `&ship=research` for a research vessel), or play today's shared ship with `?daily`.

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
| Leaderboard | Supabase (Postgres functions + row level security), called with plain `fetch` |

```
src/
  core/      Pure game logic: RNG, seeds, deck generator (per ship type), tile display
             rules, pathfinding, oxygen, weapons, codex, rivals, leaderboard rules,
             field kit (dodge, drops, blasts, scanner), ship conditions, achievements,
             boss arenas and boss rules,
             progression (shop, saves, export codes), virtual-stick maths, screen sizing.
             No Phaser imports, so it's fully unit-tested.
             Sound effect and music definitions (sfx, music) live here too.
  audio/     Web Audio engine: synth voices, mixer, generative music player.
  scenes/    Phaser scenes: Boot (builds textures), Hub, Game and Pause, plus enemy AI
             and the two boss fights.
  hub/       Between-runs screens as an HTML/CSS overlay.
  net/       Leaderboard client (Supabase REST).
  ui/        Touch controls (twin virtual sticks).
  art/       Original pixel art defined in code: no binary assets.
tests/       Vitest unit tests for core/ and net/, plus the leaderboard SQL run in PGlite.
docs/        Game design document, leaderboard schema and setup guide.
```

**Procedural generation.** Each deck is built from a seed with a deterministic RNG (mulberry32), so the same seed always gives the same ship. Rooms are placed and joined to their nearest neighbour with two-tile corridors, and a few extra loops are added. Extraction goes in the room furthest from the start on foot. Thin walls that would save a long walk become weak walls you can cut with the torch. Each ship type has its own spawn table: freighters mount turrets against walls, research vessels breed aliens. The data log always goes in the furthest 40% of the ship. Tests check these rules across 100 seeds of each ship type: every floor tile is reachable, enemies never spawn near the start, and cutting weak walls only ever adds shortcuts.

## Roadmap

See the full [game design document](docs/GDD.md).

- [x] **v0.1** Salvager, freighter decks, drones, two guns, cutting torch, oxygen, seeded runs, CI/CD
- [x] **v0.1.1** New pixel art, lighting, touch controls, portrait and landscape mobile support
- [x] **v0.2** Robot character, customisation, hub with permanent unlocks, railgun, perks
- [x] **v0.3** Research vessels, alien enemies, turrets, hacking tool, codex chapter 1
- [x] **v0.4** Online daily leaderboard, Gravecutter rivals, grav tool
- [x] **v0.5** Synthesised sound and music, pause menu, settings, hit-pause, death and extraction moments
- [x] **v0.5.1–0.5.3** Unique player names, themed daily button, health packs
- [x] **v0.6** Field kit: dodge roll, scanner map, explosive drums, supply drops, ship conditions, elite hostiles, achievements
- [x] **v0.7** Boss contracts: the Foreman and the Bloom Mother, each with a handcrafted arena
- [x] **v0.8** Deep salvage: gamepad, deep dive lifts, weekly challenge, arc caster, sentry, mimics, stalkers, shock floors, bounties, combos, codex chapter 2, tips, field manual, assist mode
- [x] **v0.9** All-time hall of fame: salvage, records, boss times and kills by hostile type
- [ ] **Later** More codex chapters, more ship types, more bosses

## Licence

[MIT](LICENSE)
