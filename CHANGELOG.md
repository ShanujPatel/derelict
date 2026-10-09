# Changelog

## [0.9.0] — Unreleased: Hall of fame

### Added
- **All-time hall of fame** (DAILY tab): 19 boards in four groups. *Salvage*: total banked, biggest single haul. *Records*: ships cleared, deepest dive, longest daily streak. *Bosses*: fastest Foreman and Bloom Mother kills. *Kills*: all hostiles, elites, bounties, and one board per hostile type (drones, turrets, mimics, crawlers, stalkers, spitters, egg sacs, raiders, brutes). Shows the top 20 plus your own row; each board is cached for a minute.
- Every finished run (extracted or not) adds to your totals once your name is claimed. Kills count either way; salvage, extractions and boss times only count when you get out. Assist mode runs aren't posted. Kills by type, elites and bounties carry down deep-dive lifts.
- Database: `player_totals` table, `submit_run` (checks run length, depth, salvage rate, kills per kind and per second, elites, bounties, boss times, and 200 runs a day per player) and `get_hall_of_fame`. Rules mirrored in `src/core/hallOfFame.ts`; both are tested (the SQL in PGlite).

### Upgrading
- Re-run `docs/supabase.sql` in the Supabase SQL Editor. Until then the hall of fame shows an error and runs aren't counted; the daily board keeps working.

## [0.8.0] — 2026-10-09: Deep salvage

### Added
- **Gamepad support** through the browser Gamepad API: left stick move, right stick aim, RT (or a full right-stick push) fire, A/LB roll, X/RB tool, Y swap, Back/B scanner, Start pause. Works in the hub (Start launches, Y boards the daily), the pause menu and the results screen. Moving the mouse hands aim back to it. Radial deadzone maths in `src/core/gamepad.ts`.
- **Deep dive**: ordinary runs have a purple lift pad. Descending carries health, oxygen, salvage, kills and logs to a deeper deck (`SEED-D2`, up to depth 5) with +7% elite chance, +25% salvage and +5% hostile speed per level. The run clock spans every deck; retry starts from the top. Achievement *Deep diver*.
- **Weekly Challenge**: one ship per ISO week with two mutators out of six (Glass cannon, Thin air, Swarm, Bloodthirsty, Jackpot, Lights out). Card in the DAILY tab, local best per week, `?weekly` link, achievement *Mutant*.
- **Daily streaks**: the first Daily extraction each day extends your streak and pays +10 salvage per day in a row (up to +70). Shown on the daily card.
- **Arc caster** (220 salvage): instant chain lightning that jumps between up to 4 targets, ignores riot shields, and sets off drums.
- **Sentry drone** tool (220 salvage): a friendly auto-turret for 12 seconds.
- **Perks**: Adrenaline (roll recharges twice as fast), Demolitionist (bigger blasts that never hurt you), Field medic (+60% healing).
- **Mimic crates** on freighters and cloaked **stalkers** on research vessels, each on their own random stream.
- **Shock floors**: electrified patches that flicker, go live, then rest. They hurt you and walking hostiles (drones hover over them). Marked on the scanner.
- **Bounties**: one named, tougher, tracked hostile per ordinary run, worth 40–70 salvage. Achievement *Bounty hunter*.
- **Salvage combos**: pickups within 4 s of each other build a multiplier up to ×1.5. Achievement *Hoover*.
- **Codex chapter 2**, *The Gravecutter Ledger*: four ship logs plus one carried by each boss (dropped on the kill). Pays 250 on completion.
- **Run history** (last 10 runs) and a bigger lifetime service record in the Log tab.
- **First-time tips** for ten situations, worded for keyboard, touch or gamepad; switch off or reset in settings.
- **Field manual** in the Log tab: a controls table for all three input types and a guide to everything aboard.
- **Assist mode** (+50% oxygen, half damage; daily runs not posted) and an always-on **corner minimap**, in settings; the minimap toggle is also in the pause menu.
- **Trophy cosmetics**: five colour options that can't be bought, only earned through achievements and boss kills.
- **Share card**: results screen SHARE (S / Y) copies a text card with a replay link, or opens the phone's share sheet.
- **Pause summary**: vessel, time, salvage, condition or mutators, bounty and data log status.
- **Power-ups**: Overdrive (double fire rate, 8 s) and Aegis (soaks the next 2 hits). Elites and bounties always drop one; other kills 4% of the time.
- **Self-repair** perk (robot only): out of combat for 4 s, battery is turned into hull repairs.
- **Turret laser sights**: hostile turrets lock on for 0.55 s, showing a red sight, before their first shot.
- **Personal bests** panel in the Log tab: biggest haul, today's daily, this week's challenge, deepest dive, longest combo, streak, bounties and fastest boss kills.

### Changed
- Intro texts wrap on narrow screens, and the ship condition label moves below the weapon line in portrait.
- Results buttons stay on screen on short landscape phones.

### Notes
- Every new spawn (mimics, stalkers, shock floors, lift) uses its own random stream, so existing seeds keep their layouts; tests check it.

## [0.7.0] — 2026-10-09: Contracts

### Added
- **Boss contracts**, taken from a new section of the DAILY tab once you've extracted 3 times (the Bloom Mother also needs research vessels unlocked). Each card explains how to win and shows your record.
- **Boss arenas** (`src/core/arena.ts`): handcrafted, mirrored three-part maps with seeded cover layouts: a staging bay (supplies and guards), the arena (pillars, weak points, drums) and a vault behind a sealed bulkhead that opens when the boss dies.
- **The Foreman**, freighter cargo bay: armour blocks normal fire. Telegraphed charges (red warning line, aim locks late) stun it when it hits a wall or pillar; 4 power couplings each overload it, and destroying all of them strips its armour; drum blasts stun and damage it; the railgun does half damage through armour. Phase 2 at half health: faster, wider rivet sprays, drones through floor hatches.
- **The Bloom Mother**, research hatchery: only takes damage while her mouth is open (after a visible wobble), when she also spits an acid fan. Three feeder roots (tethered to her) heal her, can be shot or burned with the torch, and regrow after 20 s. Drums beside her hit through the carapace. Births crawlers; phase 2 adds slow spore rings.
- Boss health bar with the boss's current state (ARMOURED, STUNNED, CORE EXPOSED...), at the bottom on desktop and under the top buttons on touch.
- First-kill bonuses (200 / 220 salvage), best times, two boss achievements (*Fired*, *Root and branch*), boss loot drops, new sounds (charge, slam, roar, armour ping, death, vault door) and pixel art for both bosses, couplings, roots and the bulkhead.
- Shareable fights: `?boss=foreman&seed=ABC123`.

### Changed
- Only one banner shows at a time; a new one replaces the old.

## [0.6.0] — 2026-10-09: Field kit

### Added
- **Dodge roll** (Shift / Space, or the ROLL touch button): a quick dash of about three tiles you can't be hit during, with a short cooldown shown as a bar under your feet. The robot rolls a little shorter and recharges slower. The roll covers a fixed distance, so it behaves the same on slow devices.
- **Scanner map** (Tab, or the MAP touch button): fills in as you explore (a radius round you plus each room you enter) and marks the exit, salvage, O₂, health, data logs, caches and fuel drums you've seen, with the percentage of the ship mapped.
- **Explosive fuel drums**: 3–4 per ship, sometimes in pairs. Two hits set one off: area damage to enemies (and you, unless you roll through it), cracked walls in the blast give way, and nearby drums chain. Hostile shots can set them off too.
- **Supply drops**: enemies sometimes drop O₂/power or health on top of salvage, more often when you're low, leaning towards whatever you need. Crawlers hatched from egg sacs never drop supplies.
- **Ship conditions**: each derelict rolls one from its seed: Quiet, Power failure, Hull breach, Rich manifest, Hardened security or Scanner jammed. Shown on boarding, in the HUD and on the daily card.
- **Elite hostiles**: gold, double health, a little faster, and always drop extra salvage. About 8% of enemies, 30% on hardened ships. Chosen from the seed.
- **Achievements**: 13 run goals, each paying salvage once (25–100). Listed under Log with your progress; new ones show on the results screen with a fanfare.
- New sounds: roll, explosion, scanner, achievement.

### Fixed
- Grav pulses and blasts that killed one enemy could skip the next enemy in the list.

### Notes
- Drums use their own random stream, like health packs, so every existing seed keeps the same layout; tests check it.

## [0.5.3] — 2026-10-09

### Added
- Health packs: three on every ship, each in a different room and at least 8 tiles from the start. Each restores 35 health; the robot finds green repair kits instead. They glow in the dark, and if you're already at full health you walk over them and they stay put for later.
- A heal sound.

### Notes
- Health packs are placed with their own random stream, so every existing seed keeps exactly the same layout, enemies and loot; packs are only added. A test checks this for both ship types.

## [0.5.2] — 2026-10-09

### Changed
- The DAILY button is now themed by today's mission: hazard-striped amber for a freighter, teal with Bloom spores for a research vessel. It shows the ship type, the wreck's name and NEW (pulsing) or your best today. The pulse respects reduced-motion settings.
- Each daily wreck has a name from its seed, e.g. *CSV BRIGAND* or *RV SOMERVILLE*, the same for everyone. The DAILY tab's card uses the same theme and says what's aboard.

## [0.5.1] — 2026-10-09

### Added
- Name your salvager at the top of the **Crew** tab. New players get a random sci-fi name (*NYX HARROW*, *COLD COMET*, *VOSS-27*); the ⚄ button rolls another. Old `SALVAGER-0000` placeholders are replaced automatically.
- Names are unique across all players. A new `players` table and `claim_callsign` function in `docs/supabase.sql` reserve each name; posting under someone else's name is refused, and the board shows each player's current name, so renaming updates past entries. **Re-run `docs/supabase.sql` in Supabase after updating.**
- If your name was taken while you were offline, you get a new random one when the hub opens and a message saying so.
- `tests/names.test.ts`, plus SQL tests for unique names.

### Changed
- The name box moved from the DAILY tab to the Crew tab; DAILY shows who you're posting as.

## [0.5.0] — Unreleased

### Added
- Sound: 29 synthesised sound effects (weapons, hits, deaths, pickups, tools, alarms, footsteps, hub clicks), generated with Web Audio at runtime. No audio files. Sounds in the world are panned and faded by distance.
- Generative music: a theme each for the hub, freighters and research vessels (drone + seeded melody), with a combat layer that fades in when enemies are hunting you.
- Settings in **Log → Settings**: master, music and SFX volume, screen shake, flashes. Saved with your progress.
- Pause menu (Esc / P, or the **II** touch button): resume, sound on/off, screen shake, abandon run. The run clock stops while paused, and the game pauses itself when the tab loses focus.
- M mutes from anywhere.
- Game feel: hit-pause on kills and when you're hit, low-oxygen heartbeat, aim look-ahead on the camera, a slow-motion death and an extraction beam before the results screen.
- `tests/audio-core.test.ts`: sound definitions, spatial audio, music theory and settings.

## [0.4.0] — 2026-10-09

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
