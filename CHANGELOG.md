# Changelog

## [0.4.0] — Unreleased

### Added
- Online Daily Derelict leaderboard on Supabase. A new DAILY tab shows today's ship, your best, the top 20 and your callsign; extracted daily runs post automatically and the end screen shows your rank.
- `docs/supabase.sql`: a locked-down table plus `submit_score`/`get_daily_board` functions with server-side checks (today's seed only, score and speed limits, callsign rules, best-only, 30 attempts a day). Tested in CI against a real Postgres engine (PGlite).
- `docs/LEADERBOARD.md` setup guide, `.env.example`, and optional `SUPABASE_URL`/`SUPABASE_KEY` repository variables in CI.
- Gravecutter rivals dock 45–75 seconds into every run (seeded, so the same for everyone on the daily ship). Raiders walk round walls to steal loose salvage and fire three-round bursts. The brute's riot shield blocks shots from the front; the railgun pierces it. Killing a rival drops everything it stole.
- Grav tool (200 salvage): cone-shaped push that shoves and stuns enemies for 0.7 s, does 1 damage and destroys incoming shots.
- Pathfinding (`findPath`, `nearestByWalking`) for enemies that need to navigate the ship.
- Anonymous player id and editable callsign in the save; they travel with save codes.

### Fixed
- Bullet damage is read before the bullet is removed. A refactor in this release had briefly made hits deal no damage, which the browser tests caught.

## [0.3.0] — 2026-10-09

### Added
- Research vessels: a second ship type with teal lab tiles, Bloom growth on the floors and darker lighting.
- Alien enemies: crawlers (fast swarmers), spitters (lob acid, back away when you get close) and egg sacs (keep hatching crawlers while you're in sight).
- Wall turrets on freighters, with a rotating barrel.
- Hacking tool (160 salvage): hack a turret to make it fight for you, or open a locked cache for 30–60 salvage. Robots hack twice as fast.
- Locked caches on every ship.
- Codex chapter 1, *The Halcyon Contract*: eight crew logs, one hidden deep in each ship and read in the hub. Logs are kept even if you die. The third log unlocks research vessels, and finishing the chapter pays 150 salvage.
- Destination picker in the hub. The Daily Derelict alternates ship type by date.
- Shareable research-vessel links: `?seed=XYZ&ship=research`.

### Changed
- Drones, turrets and aliens now share one enemy system (`src/scenes/enemies.ts`).
- The tool slot is chosen in the Loadout, and the touch button shows TORCH or HACK.
- The "Drones down" stat is now "Hostiles down".

## [0.2.0] — 2026-10-08

### Added
- Hub between runs, with Crew, Loadout, Upgrades and Log screens. Built as a responsive HTML overlay that works on phones.
- Robot character (150 salvage): 30% armour, larger battery, slower, picks up power cells instead of O₂.
- Permanent upgrades: hull plating, life support and servo boots (3 tiers each).
- Railgun (180 salvage): heavy slug that pierces lines of drones.
- Perks, one per run: Scavenger (+25% salvage), Cold cutter (cheap torch), Scrapper (drones always drop salvage), Second wind (survive one lethal hit).
- Cosmetics: suit and visor colours for the salvager, chassis and optics colours for the robot.
- Drones can drop salvage when destroyed.
- Save data in browser storage, with export/import save codes and a reset option. Carries over the v0.1 best score.
- End-of-run screen shows drones destroyed and your ship's hold, with Return to ship and Retry.

### Changed
- The game opens in the hub. Shared `?seed=` and `?daily` links still board that ship directly.

## [0.1.1] — 2026-10-08

### Added
- Touch controls: floating twin sticks (move / aim + auto-fire), GUN and TORCH buttons, tappable end-screen buttons.
- Responsive screen sizing: fills phones in portrait and landscape, adapts live when the window or orientation changes.
- Lighting: the ship is dark except round the player, the exit and blinking warning lamps.
- New pixel art: 3/4 wall faces, wall shadows, floor grates, vents and hazard markings, starfield gaps.
- Animated salvager (walk cycle) and drones (pulsing lights), drop shadows, muzzle flash, explosion rings.

### Fixed
- Walls next to cracked walls were drawn as open space.

## [0.1.0] — 2026-10-08

### Added
- Seeded procedural ship decks: rooms, two-tile corridors, loops, extraction in the furthest room.
- Salvager with twin-stick controls (WASD + mouse).
- Blaster and Scattergun, swappable with Q / 1 / 2 / mouse wheel.
- Cutting torch: opens cracked walls for shortcuts, costs oxygen.
- Patrol drones with line-of-sight detection and chase behaviour.
- Oxygen timer, O₂ canisters and salvage crates.
- Extraction / death screens, retry same seed, best score saved locally.
- `?seed=` and `?daily` URL options.
- Unit tests for RNG, seeds, pathing, deck generation, oxygen and weapons.
- GitHub Actions: typecheck, test, build and deploy to GitHub Pages.
