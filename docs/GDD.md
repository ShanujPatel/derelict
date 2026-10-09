# Derelict — Game Design Document

> Working title. Final name to be decided.
> Version 0.1 · October 2026

## 1. Concept

A real-time, top-down sci-fi roguelike that runs in the browser. You are a salvager boarding abandoned spaceships. Each ship is a procedurally generated set of decks full of hostile drones, failing systems and loot. Push deeper, grab upgrades, and extract with your haul — or die trying. Between runs, spend what you saved on permanent upgrades, and piece together what really happened to these ships.

**Pillars**
1. **Tense, readable action** — short runs (10–20 min), fast twin-stick combat, clear pixel art.
2. **Every run teaches you something** — new codex pages, unlocks and routes, even on a death.
3. **Tools, not just guns** — cutting, hacking and gravity tools open alternative paths through a deck.
4. **Playable anywhere** — opens from a link, works with keyboard, mouse, gamepad or touch.

**Showcase goals (GitHub):** playable from the README via GitHub Pages; tested deterministic procedural generation; CI/CD; a small backend integration (leaderboard); versioned releases with changelogs.

## 2. Core loop

```
Hub (your salvage ship)
  → choose character + loadout
  → dock with a derelict (seeded)
  → explore decks: fight, loot, read logs, manage oxygen/battery
  → reach extraction (escape pod / docking clamp) OR die
  → bank salvage → spend on unlocks → codex updates
  → back to Hub
```

**Run pressure:** a depleting resource acts as a soft timer.
- Salvager: **oxygen** — refilled by O₂ canisters and life-support rooms.
- Robot: **battery** — refilled by power cells and charging stations.

**Health packs (v0.5.3):** three per ship, 35 health each (repair kits for the robot). Placed from their own seeded stream so existing seeds keep their layouts; left in place if picked up at full health.

Dying loses unbanked loot; codex pages found are always kept.

## 3. Characters

Players choose and customise their character before each run.

| | Salvager (human) | Robot |
|---|---|---|
| Health | High | Medium, plus armour plating |
| Run resource | Oxygen | Battery |
| Strength | Uses medkits; reads logs faster | Faster hacking; immune to toxic gas |
| Weakness | Toxic gas, vacuum breaches | EMP damage; can't use medkits (uses repair kits) |

**Customisation**
- *Cosmetic:* suit/visor colours (salvager) and chassis/optics colours (robot), bought with salvage. Later: helmet / head-unit parts, trail effects.
- *Loadout:* starting gun, tool and one perk, chosen from what you've unlocked.

## 4. Setting and mystery

**Premise:** A mega-corporation's ships are turning up dead in the outer belt. Salvage rights are cheap. Nobody asks why.

**The hidden story:** The corporation's ship AI was running experiments on an alien organism. The AI turned, the organism got loose, and a rival salvager crew has been quietly stripping evidence before anyone else arrives.

**How it's told (light mystery):**
- **Data logs** — short crew logs, AI terminal dumps and audio-log transcripts, found in each wreck.
- **Codex** — logs collect into a codex across runs, ordered into chapters. Chapter 1 (*The Halcyon Contract*, 8 logs) is in: log 3 reveals the research vessels' coordinates, and completing the chapter pays 150 salvage. One log slot is generated per ship; it's filled with the next unread log for that ship type.
- **Environmental clues** — scorch marks, sealed labs, salvager graffiti.
- No cutscenes; the story never blocks gameplay.

## 5. Ships and enemies

Each ship type has its own tileset, room templates and main enemy faction. Rival salvagers can appear on any ship as a random event.

| Ship type | Faction | Enemy examples |
|---|---|---|
| Corporate freighter | Rogue AI | Patrol drone, turret, shield drone, repair bot |
| Research vessel | Alien infestation | Crawler swarm, spitter, egg sacs that spawn crawlers |
| Any ship (event) | Rival salvagers | Gunner, shield-bearer, hacker who turns your turrets |

**Hazards:** vacuum breaches, toxic gas, electrified floors, failing doors, fires.

**Bosses (later):** one per ship type — e.g. *Overseer* core AI, *Brood Mother*, rival crew captain.

## 6. Weapons and tools

Loadout = **2 gun slots + 1 tool slot**. Mods found during a run modify guns (fire rate, piercing, ricochet, damage type).

**Guns**
| Gun | Role |
|---|---|
| Blaster | Reliable all-rounder, infinite ammo, overheats |
| Scattergun | Close range spread, good vs swarms |
| Railgun | Slow charge, pierces lines of enemies |

**Tools**
| Tool | Use |
|---|---|
| Cutting torch | Cut through weak walls and vents to make shortcuts |
| Hacking tool | Take over turrets and doors; open locked caches |
| Grav tool | Push / pull enemies and crates into hazards |

**Damage types (later):** kinetic, energy, EMP — EMP is strong vs drones and robot players.

## 7. Progression (permanent unlocks)

The **Hub** is your salvage ship. Banked salvage (credits) buys:
- **Suit / chassis upgrades** — max health, resource capacity, move speed.
- **Armoury** — adds guns, tools and mods to the loot pool.
- **Workshop** — cosmetics and character parts.
- **Codex terminal** — read collected logs; chapter rewards.

Unlocks widen options rather than making runs trivially easy.

## 8. Procedural generation

- Every run is built from a **seed** using a deterministic RNG; the same seed always produces the same ship.
- Decks are generated as connected rooms and corridors on a tile grid, then dressed with room templates (life support, armoury, lab, cargo bay).
- Generator rules (tested): every room reachable from the start; extraction always reachable; spawn never next to enemies.
- **Daily Derelict:** a seed derived from the UTC date, so everyone plays the same ship each day.

## 9. Controls

| Input | Move | Aim / fire | Tool | Interact |
|---|---|---|---|---|
| Keyboard + mouse | WASD | Mouse / left click | Right click / F | E |
| Gamepad | Left stick | Right stick / RT | LT | A |
| Touch | Left virtual stick | Right virtual stick (auto-fire) | Button | Button |

**v0.6 additions:** dodge roll on Shift/Space (touch: ROLL), scanner map on Tab (touch: MAP).

## 9b. Field kit and ship conditions (v0.6)

- **Dodge roll:** ~3 tiles, untouchable for the whole roll, 0.9 s cooldown (robot 1.15 s, shorter roll).
- **Scanner:** reveals a 5-tile radius plus the room you're in; marks the exit and seen loot. Feeds the *Cartographer* achievement.
- **Fuel drums:** 2 hits; 44 px blast, 6 damage to enemies and 30 to you at the centre, a third at the edge; opens cracked walls; chains. Own seeded stream.
- **Supply drops:** 12% per kill (+18% when below 35% health or oxygen), weighted to what you need.
- **Conditions:** seeded per ship: Quiet, Power failure, Hull breach, Rich manifest, Hardened security, Scanner jammed. Modifiers only; layouts never change.
- **Elites:** 2× HP, 1.12× speed, guaranteed extra salvage; 8% base chance, 30% on hardened ships.
- **Achievements:** 13 one-off goals paying 25–100 salvage, checked at the end of each run (some don't need you to extract).

## 9c. Boss contracts (v0.7)

Opt-in runs from the DAILY tab (unlocked after 3 extractions; the Bloom Mother also needs research vessels). Each boss has its own arena (`core/arena.ts`): **staging bay** (supplies, 2–3 guards) → **arena** (34×21, mirrored cover pillars from 3 seeded layouts, weak points, drums) → **vault** behind a 2-tile bulkhead that opens on the kill (exit, two caches, salvage). No conditions, elites, rivals or data logs in contracts.

| | The Foreman (freighter) | The Bloom Mother (research) |
|---|---|---|
| HP | 70 | 80 |
| Defence | Armour: 0 damage unless stunned or stripped; railgun 50% | Carapace: 0 damage unless mouth open (2.2 s every 5.2 s / 3.9 s) |
| Weak points | 4 power couplings (5 HP): each stuns 2.2 s; all gone = no armour | 3 feeder roots (6 HP, torch one-shots): heal her 0.4 HP/s each, regrow after 20 s |
| Stuns / burst | Charge into wall/pillar: 3 s stun; drum: 1.8 s stun + 8 | Drum near her: 10 through the carapace |
| Attacks | Telegraphed charge (28), rivet fan (5→9 shots), contact (18) | Acid fan when opening (5→7), crawler births (max 4), contact (20) |
| Phase 2 (≤50%) | Faster, shorter wind-up, drones from hatches (max 3) | Opens more often, spore rings (14 slow shots) |
| First kill | +200 | +220 |

## 9d. Deep salvage (v0.8)

- **Deep dive:** lift pad on random/custom runs (own seeded stream, ≥50% of the walking distance from the start, never in the exit room). Descending restarts the scene on `SEED-Dn` carrying HP, O₂, salvage, kills and logs; depth n adds +7% elite chance, +25% salvage, +5% hostile speed per level below the first; maximum depth 5.
- **Weekly Challenge:** `weekly-YYYY-Www` seed (ISO week, UTC), ship type and two of six mutators from the seed. Mutators fold into the ship condition where they overlap (drain, salvage, elites, darkness); damage, hostile speed and heal-on-kill are applied directly.
- **Daily streak:** first daily extraction per day; +10 per consecutive day, capped at +70.
- **New hostiles:** mimic crates (freighters, 2, wake within 34 px), stalkers (research, 2, cloaked beyond 52 px or for 2.5 s after a hit).
- **Shock floors:** 2 per freighter, 1 per research vessel; 3.2 s cycle, 1.2 s live after a 0.6 s warning; 12 damage to you, 1 per 0.45 s to walking hostiles.
- **Bounty:** one drone/crawler/spitter per ordinary run, 3× HP, 40–70 salvage, tracked on the scanner.
- **Combos:** 4 s window, +0.1× per link, cap ×1.5.
- **Arc caster:** 130 px reach in a 0.6 rad cone, then 80 px hops, up to 4 targets, 2 then 1 damage. **Sentry:** 12 s, fires every 0.42 s within 150 px, costs 6 O₂.
- **Gamepad:** standard mapping via the Gamepad API, radial deadzone 0.2.
- **Power-ups:** Overdrive (×2 fire rate, 8 s), Aegis (absorbs 2 hits); guaranteed from elites/bounties, 4% otherwise. **Turrets** lock on for 0.55 s with a visible laser before firing. **Self-repair** perk (robot): 3 HP/s for 2.4 battery/s after 4 s without damage.
- **Accessibility:** assist mode (+50% O₂, ×0.5 damage, no leaderboard post), corner minimap, first-time tips (10), field manual, motion toggles.

## 9e. Hall of fame (v0.9)

- Shown in the hub's own **RANKS** tab (between DAILY and LOG) as one table from `get_hall_table`: a row per player, a column per stat, sorted by total salvage banked by default; tapping a heading re-sorts (boss times fastest first). Rank and name are sticky so the 19 stat columns scroll sideways on phones. Top 25 plus your own row.
- One `player_totals` row per claimed player, updated by `submit_run` at the end of every run (not assist mode). Lost runs add kills, elites, bounties and run count; extractions also add salvage banked, best haul, deepest dive and boss best times.
- 19 boards: banked, haul, extractions, depth, streak (computed from consecutive `daily_scores` days), foreman, mother (fastest first), kills, elite, bounty, and one per hostile type. Top 20 plus your own row.
- Anti-cheat limits live in `src/core/hallOfFame.ts` (client) and `submit_run` (server).

## 9f. The Saw-Tooth (v1.0)

- **Mining hauler** (`mining`): 66×50, up to 10 rooms of 7–13 tiles, 14 thin-wall shortcuts plus 9 rock ore veins (own stream `:ore`; floor on exactly one side, so cutting makes an alcove). Spawns: 4 drones, 5 sappers, 3 sweepers (centre of rooms ≥7×7, never the exit room), 6 drums, 1 shock floor. Ore veins drop 7–15 salvage (× condition). Unlock: log c2-01 or 6 extractions.
- **Sapper**: HP 3, keeps 70–130 px, lays a mine every 2.6 s (max 3 out). **Mine**: arms 0.7 s, triggers within 22 px, 0.38 s fuse, radius 38, 22 damage to you, 5 to hostiles, fizzles after 20 s; it's a drum underneath, so shots and blasts set it off.
- **Sweeper**: HP 9, solid; beam 120 px stopped by walls, 0.9 rad/s (1.5 once it has seen you), 16 damage; hacked, it burns hostiles for 1 every 0.35 s.
- **The Hollow Captain**: HP 90; shield while any of 3 pylons (HP 6) stands; all down = 7 s window, then reboot. Bursts of 4/6 shots, grenades 1/3 (0.9 s flight, 0.5 s fuse, radius 34, 20 damage; 9 to him if they land on him); grav tool returns grenades. Phase 2: blink every 7 s, up to 2 raiders.
- **Weekly board**: `weekly_scores`, best per player per ISO week; limits 2,500 salvage, 18/s, 60 attempts.
- **Ghosts**: `G1.<interval>.<base64url>`: start position (int16 ×2) then int8 dx/dy per 100 ms sample; capped at 6,000 samples (≤24,000 chars). Stored only against the exact score and time on the board.
- **Seed explorer**: `map.html`, core modules only (no Phaser).
- **App**: manifest, icons, service worker (network-first pages, cache-first hashed assets, `ignoreVary`).

## 9g. Clans (v1.1)

- Tables `clans` (name, tag, leader, open, invite code), `clan_members` (one row per player), `clan_scores` (clan × player × period, where period is an ISO week or `all`; rows outlive membership).
- `submit_run` credits the player's clan (salvage only if extracted; runs, kills and boss kills always) and returns `{tag, name, added, weekSalvage, weekRank}` for the results screen.
- Clan score = sum of `clan_scores.salvage` for the period. Weekly goal `max(5000, 2500 × members)`, +100 each, paid client-side once per week. Podium (top 3 last week) awards the *Podium crew* achievement.
- Limits: 15 members, 24 h rejoin wait after leaving (not after a kick), leader hand-over on leave, empty clans deleted.
- UI: CREW clan card (join by code, browse open clans, found one with a required open/invite-only choice; or your clan with leader tools); RANKS Salvagers/Clans switch; tags on boards via `get_clan_tags`.

## 10. Art and audio

- **Pixel art**, 16×16 tiles, limited palette per ship type (cold blues for freighters, sickly greens for research vessels).
- Start with free CC0 asset packs (credited in the README), replace over time.
- **Audio is synthesised in code (v0.5)** with Web Audio, like the art: no audio files. 29 sound effects are defined as synth layers (`src/core/sfx.ts`), with pitch jitter, cooldowns and voice limits, and are panned and faded by distance from the camera.
- **Generative music** (`src/core/music.ts`): each place has a theme (hub, freighter, research) built from a drone, a seeded melody phrase in its own mode and tempo, and a combat layer (kick, hats, bass) that fades in with the number of enemies hunting you.
- **Game feel:** hit-pause on kills and hits taken, screen shake, damage flashes, a low-oxygen heartbeat, aim look-ahead, a slow-motion death and an extraction beam.
- **Settings:** master, music and SFX volume, screen shake and flashes on/off; M mutes anywhere. Pause menu on Esc/P or the touch II button, and the game pauses itself when the tab loses focus.

## 11. Tech

| Area | Choice |
|---|---|
| Language | TypeScript |
| Engine | Phaser 3 |
| Build | Vite |
| Tests | Vitest (RNG, map generator, game rules) |
| CI/CD | GitHub Actions → lint, test, build, deploy to GitHub Pages |
| Leaderboard | Supabase: Postgres functions + RLS, plain `fetch` client, SQL tested with PGlite (v0.4) |
| Save data | localStorage (unlocks, codex, settings) |

**Code structure**
```
src/
  core/      pure logic — RNG, map generation, rules (no Phaser; fully unit-tested)
  audio/     Web Audio engine — synth voices, mixer, music player
  scenes/    Phaser scenes — Boot, Hub, Game, Pause
  entities/  player, enemies, projectiles
docs/        this document
tests/       unit tests
```
Keeping game logic out of Phaser makes it testable and shows clean architecture.

## 12. Roadmap

Each version is a tagged GitHub release with notes.

| Version | Scope |
|---|---|
| **v0.1** ✅ | Salvager only; corporate freighter; patrol drones; blaster + scattergun; cutting torch; seeded deck generation; oxygen; extraction; tests; auto-deploy |
| **v0.1.1** ✅ | Original pixel art pass, lighting, touch controls, portrait/landscape mobile |
| **v0.2** ✅ | Robot character; customisation; Hub with permanent unlocks; save data |
| **v0.3** ✅ | Research vessel + alien enemies; turrets; codex chapter 1; hacking tool; locked caches |
| **v0.4** ✅ | Online daily leaderboard (Supabase); Gravecutter rival boarding party (raiders + shielded brute); grav tool |
| **v0.5** ✅ | Synthesised SFX and generative music; settings and volume; pause menu; hit-pause; death and extraction moments |
| **v0.5.1** ✅ | Player names: random unique sci-fi names, editable in the Crew tab, shown on the leaderboard |
| **v0.5.3** ✅ | Health packs / repair kits on every ship |
| **v0.6** ✅ | Field kit: dodge roll, scanner map, explosive drums, supply drops, ship conditions, elites, achievements |
| **v0.7** ✅ | Boss contracts: the Foreman and the Bloom Mother in handcrafted three-part arenas |
| **v0.8** ✅ | Deep salvage: gamepad, deep dive, weekly challenge, streaks, arc caster, sentry, 3 perks, mimics, stalkers, shock floors, bounties, combos, codex chapter 2, run history, tips, field manual, assist mode, trophy cosmetics, share card |
| **v0.9** ✅ | All-time hall of fame: salvage, records, boss times, kills by hostile type |
| **v1.0** ✅ | The Saw-Tooth: mining haulers, the Hollow Captain, codex chapter 3, weekly board, ghosts, seed explorer, installable offline app, faster loading |
| **v1.1** ✅ | Clans: open or invite-only, 15 members, weekly and all-time clan boards, goals, tags |
| **Later** | Codex chapter 4 (the survey ship Caldera); ghost races against friends; more bosses |

## 13. Open questions

- Final game name.
- Single deck per run, or several decks with a lift between them?
- ~~Leaderboard anti-cheat level~~ Decided: light checks, enforced in both the client and the SQL.
- ~~Music: commission, CC0, or generate?~~ Decided: generated in code (v0.5).
