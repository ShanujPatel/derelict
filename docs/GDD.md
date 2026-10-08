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
- *Cosmetic:* palette swaps, helmet / head-unit parts, suit / chassis parts, trail effects.
- *Loadout:* starting gun, tool and one perk, chosen from what you've unlocked.

## 4. Setting and mystery

**Premise:** A mega-corporation's ships are turning up dead in the outer belt. Salvage rights are cheap. Nobody asks why.

**The hidden story:** The corporation's ship AI was running experiments on an alien organism. The AI turned, the organism got loose, and a rival salvager crew has been quietly stripping evidence before anyone else arrives.

**How it's told (light mystery):**
- **Data logs** — short crew logs, AI terminal dumps and audio-log transcripts, found in each wreck.
- **Codex** — logs collect into a codex across runs, ordered into chapters. Completing a chapter unlocks a new ship type or item.
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
| Keyboard + mouse | WASD | Mouse / left click | Right click | E |
| Gamepad | Left stick | Right stick / RT | LT | A |
| Touch | Left virtual stick | Right virtual stick (auto-fire) | Button | Button |

## 10. Art and audio

- **Pixel art**, 16×16 tiles, limited palette per ship type (cold blues for freighters, sickly greens for research vessels).
- Start with free CC0 asset packs (credited in the README), replace over time.
- Chiptune / synth ambience; punchy SFX. Screen shake and hit-flash for feedback.

## 11. Tech

| Area | Choice |
|---|---|
| Language | TypeScript |
| Engine | Phaser 3 |
| Build | Vite |
| Tests | Vitest (RNG, map generator, game rules) |
| CI/CD | GitHub Actions → lint, test, build, deploy to GitHub Pages |
| Leaderboard | Supabase (Postgres + REST), added in v0.4 |
| Save data | localStorage (unlocks, codex, settings) |

**Code structure**
```
src/
  core/      pure logic — RNG, map generation, rules (no Phaser; fully unit-tested)
  scenes/    Phaser scenes — Boot, Game, UI
  entities/  player, enemies, projectiles
docs/        this document
tests/       unit tests
```
Keeping game logic out of Phaser makes it testable and shows clean architecture.

## 12. Roadmap

Each version is a tagged GitHub release with notes.

| Version | Scope |
|---|---|
| **v0.1** | Salvager only; corporate freighter; patrol drones; blaster + scattergun; cutting torch; seeded deck generation; oxygen; extraction; tests; auto-deploy |
| **v0.2** | Robot character; customisation; Hub with permanent unlocks; save data |
| **v0.3** | Research vessel + alien enemies; codex chapter 1; touch controls; hacking tool |
| **v0.4** | Daily Derelict; online leaderboard; rival salvager events; grav tool; railgun |
| **Later** | Bosses; codex chapters 2–3; more ship types; gamepad polish; accessibility options |

## 13. Open questions

- Final game name.
- Single deck per run, or several decks with a lift between them?
- Leaderboard anti-cheat level (server-side seed validation vs trust).
- Music: commission, CC0, or generate?
