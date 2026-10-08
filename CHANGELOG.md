# Changelog

## [0.1.1] — Unreleased

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
