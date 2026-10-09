/**
 * Original pixel art, defined as character maps so the repo needs no binary
 * assets. Each character maps to a palette colour; '.' is transparent.
 * Multi-frame sprites are painted side by side into one texture.
 */
export interface PixelSprite {
  palette: Record<string, string>;
  rows: string[];
}

export const TILE_SIZE = 16;

// ------------------------------------------------------------------ player

const PLAYER_PALETTE = {
  o: '#140d07', // outline
  B: '#f4a259', // suit highlight
  b: '#e07a2e', // suit
  d: '#a5521d', // suit shade
  v: '#3fa7d6', // visor
  w: '#d8f6ff', // visor glint
  C: '#8a93a6', // O₂ tank
  c: '#5b6374', // tank shade
  g: '#e6ecf3', // gun
  G: '#7b8494', // gun shade
};

// Salvager seen from above, facing right; rotated to the aim direction in game.
const PLAYER_BODY = [
  '................',
  '................',
  '.....oooooo.....',
  '....oBBbbbbo....',
  '...oBBbbbbbdo...',
  '.oooBbbbbbvwdo..',
  'oCCoBbbbbvwwvo..',
  'oCcobbbbbvwvvoGg',
  'oCcobbbbbvvvvoGg',
  'oCCobbbbbvvvvo..',
  '.ooobbbbbdvvdo..',
  '...odbbbbbddo...',
  '....oddddddo....',
  '.....oooooo.....',
  '................',
  '................',
];

const BOOT = '#3b2f2a';
type Pixel = [number, number];
// Boots peek out ahead/behind the body as the salvager walks.
const STRIDE_A: Pixel[] = [[12, 3], [13, 3], [13, 4], [2, 11], [3, 12], [2, 12]];
const STRIDE_B: Pixel[] = [[2, 3], [3, 3], [2, 4], [12, 12], [13, 12], [13, 11]];

/** Salvager frames: 0 idle, 1 stride A, 2 idle, 3 stride B. */
function salvagerFrames(colours: Record<string, string>): PixelSprite[] {
  return [[], STRIDE_A, [], STRIDE_B].map((boots) => ({
    palette: { ...PLAYER_PALETTE, f: BOOT, ...colours },
    rows: PLAYER_BODY.map((row, y) =>
      [...row]
        .map((ch, x) => (ch === '.' && boots.some(([bx, by]) => bx === x && by === y) ? 'f' : ch))
        .join(''),
    ),
  }));
}

export const PLAYER_FRAMES = salvagerFrames({});

// ------------------------------------------------------------------ robot

const ROBOT_PALETTE = {
  o: '#0d1117', // outline
  S: '#c3cddc', // chassis highlight
  s: '#8d99ae', // chassis
  d: '#5c6678', // chassis shade
  c: '#2b3240', // core housing
  C: '#5ef2ff', // core light
  e: '#5ef2ff', // optics
  t: '#2a2f3a', // tread
  T: '#4a5160', // tread link
  G: '#7b8494', // gun shade
  g: '#e6ecf3', // gun
};

// Salvage robot seen from above, facing right, treads top and bottom.
const ROBOT_BODY = [
  '................',
  '................',
  '.tTtTtTtTtTtT...',
  '.ooooooooooooo..',
  '.oSSSSSSSsssdo..',
  '.oSsssssssssdo..',
  '.oSssscccsssdo..',
  '.oSsscCCcsseeoGg',
  '.oSsscCCcsseeoGg',
  '.oSssscccsssdo..',
  '.oSsssssssssdo..',
  '.odddddddddddo..',
  '.ooooooooooooo..',
  '.TtTtTtTtTtTt...',
  '................',
  '................',
];

/** Robot frames: treads roll by swapping link colours. Same 4-frame layout as the salvager. */
function robotFrames(colours: Record<string, string>): PixelSprite[] {
  const rolled = ROBOT_BODY.map((row) => row.replace(/[tT]/g, (c) => (c === 't' ? 'T' : 't')));
  return [ROBOT_BODY, rolled, ROBOT_BODY, rolled].map((rows) => ({
    palette: { ...ROBOT_PALETTE, ...colours },
    rows,
  }));
}

export function characterFrames(id: 'salvager' | 'robot', colours: Record<string, string>): PixelSprite[] {
  return id === 'robot' ? robotFrames(colours) : salvagerFrames(colours);
}

/** Power cell pickup, shown instead of O₂ canisters for the robot. */
export const POWER_CELL: PixelSprite = {
  palette: { k: '#1a1a08', y: '#ffd166', Y: '#fff2c2', g: '#3a3a2a' },
  rows: [
    '..kkkk..',
    '.kggggk.',
    '.kyyyyk.',
    '.kyYyyk.',
    '.kyyYyk.',
    '.kyYYyk.',
    '.kyyYyk.',
    '.kyYyyk.',
    '.kyyyyk.',
    '..kkkk..',
  ],
};

// ------------------------------------------------------------------ drone

const DRONE_ROWS = [
  '......ll......',
  '.....hhhh.....',
  '...hhMMMmhh...',
  '..hMMmmmmmmh..',
  '..hMmeeeemmh..',
  '.hMmeerReemmh.',
  'phmmerrrremmhp',
  'lhmmerrrremmhl',
  '.hmmeerreemmh.',
  '..hmmeeeemmh..',
  '..hmmmmmmmmh..',
  '...hhmmmmhh...',
  '.....hhhh.....',
  '..............',
];
const DRONE_BASE = { h: '#1c2333', M: '#a3b2cc', m: '#6b7a93', e: '#2a0f14', p: '#9aa7bd' };

/** Two-frame idle: the eye and running lights pulse. */
export const DRONE_FRAMES: PixelSprite[] = [
  { palette: { ...DRONE_BASE, r: '#ff3b4e', R: '#ffd0d5', l: '#ff3b4e' }, rows: DRONE_ROWS },
  { palette: { ...DRONE_BASE, r: '#b8263a', R: '#ff3b4e', l: '#4a1820' }, rows: DRONE_ROWS },
];

// ------------------------------------------------------------------ items & effects

export const BULLET: PixelSprite = {
  palette: { y: '#ffd166', w: '#fffbe6' },
  rows: ['.yy.', 'ywwy', 'ywwy', '.yy.'],
};

export const FLASH: PixelSprite = {
  palette: { y: '#ffd166', w: '#ffffff' },
  rows: ['..y...', '.ywy.y', 'ywwwy.', '.ywwwy', 'y.ywy.', '...y..'],
};

export const OXYGEN: PixelSprite = {
  palette: { k: '#10202a', s: '#c8d0dc', c: '#3fa7ff', w: '#bfe6ff', t: '#f2f2f2' },
  rows: [
    '..kkkk..',
    '..kssk..',
    '.kcccck.',
    '.kcwcck.',
    '.kcwcck.',
    '.kttttk.',
    '.kttttk.',
    '.kcccck.',
    '.kcccck.',
    '..kkkk..',
  ],
};

/** Overdrive chip: a lightning bolt on a red card. */
export const OVERDRIVE: PixelSprite = {
  palette: { k: '#2a0a08', r: '#c8331f', y: '#ffd166', w: '#fff6d6' },
  rows: ['kkkkkkkk', 'krrryyrk', 'krryyrrk', 'kryywyrk', 'krrwyyrk', 'krryyrrk', 'kryrrrrk', 'kkkkkkkk'],
};

/** Aegis cell: a little hex shield. */
export const AEGIS: PixelSprite = {
  palette: { k: '#06141a', c: '#5ef2ff', C: '#c8fbff', d: '#2a8fa0' },
  rows: ['..kkkk..', '.kcCCck.', 'kcCccdck', 'kcCcccdk', 'kccccddk', 'kdccdddk', '.kddddk.', '..kkkk..'],
};

/** Explosive fuel drum: red with a hazard band. Shoot it. */
export const FUEL_DRUM: PixelSprite = {
  palette: { k: '#1a0a08', r: '#c8331f', d: '#8e2214', h: '#ff6a4a', y: '#ffd166', b: '#222' },
  rows: [
    '.kkkkkk.',
    'kddrrrdk',
    'kdrhrrdk',
    'kdrhrrdk',
    'kybybybk',
    'kbybybyk',
    'kdrhrrdk',
    'kdrrrrdk',
    'kddrrddk',
    '.kkkkkk.',
  ],
};

/** Health pack: a white case with a red cross. */
export const MEDKIT: PixelSprite = {
  palette: { k: '#2a1015', w: '#eef0f4', g: '#b8bec9', r: '#e8283d', h: '#ff8a96' },
  rows: [
    '...kk...',
    '..k..k..',
    'kkkkkkkk',
    'kwwrrwwk',
    'kwwrhwwk',
    'krrrrrrk',
    'krrhrrrk',
    'kwwrrwwk',
    'kggrrggk',
    'kkkkkkkk',
  ],
};

/** The robot's version: a repair kit with a green wrench-cross. */
export const REPAIR_KIT: PixelSprite = {
  palette: { k: '#14201a', w: '#c9d2cf', g: '#8e9a96', r: '#3ddc84', h: '#b6ffd4' },
  rows: MEDKIT.rows,
};

export const SALVAGE: PixelSprite = {
  palette: { k: '#2a1a08', y: '#e8b04a', Y: '#ffd98a', d: '#8a5a1c' },
  rows: [
    'kkkkkkkkkk',
    'kYYYYYYYyk',
    'kYdyyyydyk',
    'kyydyydyyk',
    'kyyyddyyyk',
    'kyyyddyyyk',
    'kyydyydyyk',
    'kydyyyydyk',
    'kyyyyyyyyk',
    'kkkkkkkkkk',
  ],
};

/** Mimic frames: 0 looks exactly like salvage; 1–2 open-mouthed, chomping. */
export const MIMIC_FRAMES: PixelSprite[] = [
  SALVAGE,
  {
    palette: { k: '#2a1a08', y: '#e8b04a', Y: '#ffd98a', d: '#8a5a1c', m: '#3a0a10', w: '#f2efe6', r: '#ff3b4e' },
    rows: [
      'kkkkkkkkkk',
      'kYYYYYYYyk',
      'kwkwkwkwyk',
      'kmmmmmmmmk',
      'kmmrmmrmmk',
      'kmmmmmmmmk',
      'kwkwkwkwyk',
      'kydyyyydyk',
      'kyyyyyyyyk',
      'kkkkkkkkkk',
    ],
  },
  {
    palette: { k: '#2a1a08', y: '#e8b04a', Y: '#ffd98a', d: '#8a5a1c', m: '#3a0a10', w: '#f2efe6', r: '#ff3b4e' },
    rows: [
      'kkkkkkkkkk',
      'kYYYYYYYyk',
      'kYdyyyydyk',
      'kwkwkwkwyk',
      'kmmrmmrmmk',
      'kwkwkwkwyk',
      'kyydyydyyk',
      'kydyyyydyk',
      'kyyyyyyyyk',
      'kkkkkkkkkk',
    ],
  },
];

export const LAMP: PixelSprite = {
  palette: { k: '#1a1208', r: '#ff9a3c', w: '#ffe2b8' },
  rows: ['.kk.', 'krrk', 'krwk', '.kk.'],
};

export const SPARK: PixelSprite = {
  palette: { w: '#ffffff' },
  rows: ['ww', 'ww'],
};

/** Draws a pixel sprite onto a 2D canvas context. */
export function paintSprite(ctx: CanvasRenderingContext2D, sprite: PixelSprite, ox = 0, oy = 0) {
  sprite.rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      const colour = sprite.palette[ch];
      if (!colour) return;
      ctx.fillStyle = colour;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    });
  });
}

/** Soft radial light used to cut holes in the darkness layer. */
export function paintLight(ctx: CanvasRenderingContext2D, radius: number) {
  const g = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, radius * 2, radius * 2);
}

// ------------------------------------------------------------------ v0.3: aliens, turrets, caches, logs

const CRAWLER_PALETTE = { k: '#0a1408', g: '#62c24a', G: '#b4f58a', e: '#fff27a', l: '#3d7a2c' };
const CRAWLER_BODY = [
  '..kkkkkkk.',
  '.kgGGggek.',
  '.kgGggggk.',
  '.kggggggk.',
  '.kgggggek.',
  '..kkkkkkk.',
];
/** Small fast alien, facing right; legs scuttle between frames. */
export const CRAWLER_FRAMES: PixelSprite[] = [
  ['..l...l...', '...l.l.l..', '...l.l.l..', '..l...l...'],
  ['...l...l..', '..l.l.l...', '..l.l.l...', '...l...l..'],
].map(([a, b, c, d]) => ({ palette: CRAWLER_PALETTE, rows: [a, b, ...CRAWLER_BODY, c, d] }));

const STALKER_PALETTE = { k: '#120a1c', g: '#8a7fb0', G: '#d8d0ff', e: '#ff3b8e', l: '#5a4f80' };
/** Stalker: a crawler cousin that bends light round itself until it's close. */
export const STALKER_FRAMES: PixelSprite[] = CRAWLER_FRAMES.map((f) => ({ palette: STALKER_PALETTE, rows: f.rows }));

const SPITTER_ROWS = (mouth: string[]) => [
  '..............',
  '.....kkkk.....',
  '...kkPPppkk...',
  '..kPPppppspk..',
  '..kPpsppppppk.',
  '.kPpppkkkkppk.',
  ...mouth,
  '.kppppkkkkspk.',
  '..kpspppppppk.',
  '..kkpppppppk..',
  '...kkkpppkkk..',
  '.....kkkkk....',
  '..............',
];
const SPITTER_PALETTE = { k: '#160a1c', p: '#7a3f8f', P: '#b06ac4', s: '#c94a6b', m: '#2a0f2e', a: '#9bff5c' };
/** Bulbous alien that lobs acid; its mouth gapes open when it fires. */
export const SPITTER_FRAMES: PixelSprite[] = [
  { palette: SPITTER_PALETTE, rows: SPITTER_ROWS(['.kpppkmmmmkpk.', '.kpppkmmmmkpk.']) },
  { palette: SPITTER_PALETTE, rows: SPITTER_ROWS(['.kppkmmaammkk.', '.kppkmaammmkk.']) },
];

const EGG_ROWS = [
  '....kkkk....',
  '..kkeEEekk..',
  '.keEEeeeeek.',
  '.kEeeyyeeek.',
  'keeeyyyyeeek',
  'keeyyyyyyeek',
  'keeyyyyyyeek',
  'keeeyyyyeeek',
  '.keeeyyeeek.',
  '.keeeeeeeek.',
  '..kkeeeekk..',
  '....kkkk....',
];
/** Pulsing egg sac that hatches crawlers. */
export const EGG_FRAMES: PixelSprite[] = [
  { palette: { k: '#132010', e: '#3e6b2f', E: '#6aa84f', y: '#c9f27a' }, rows: EGG_ROWS },
  { palette: { k: '#132010', e: '#3e6b2f', E: '#6aa84f', y: '#7fb24f' }, rows: EGG_ROWS },
];

export const ACID: PixelSprite = {
  palette: { g: '#9bff5c', G: '#e6ffcc', d: '#3f8f3a' },
  rows: ['.gg..', 'gGgg.', 'ggggd', '.ggd.', '..d..'],
};

const TURRET_ROWS = [
  '..............',
  '...kkkkkkkk...',
  '..kBBBBBBBBk..',
  '.kBbbbbbbbbbk.',
  '.kBbbkkkkbbbk.',
  '.kBbkcccckbbk.',
  '.kBbkcrrckbbk.',
  '.kBbkcrrckbbk.',
  '.kBbkcccckbbk.',
  '.kBbbkkkkbbbk.',
  '.kBbbbbbbbbbk.',
  '..kbbbbbbbbk..',
  '...kkkkkkkk...',
  '..............',
];
const TURRET_BASE = { k: '#0d1117', b: '#4a5160', B: '#6b7486', c: '#2b3240' };
/** Turret mount. Frame 0 hostile (red eye), frame 1 hacked (cyan eye). */
export const TURRET_FRAMES: PixelSprite[] = [
  { palette: { ...TURRET_BASE, r: '#ff3b4e' }, rows: TURRET_ROWS },
  { palette: { ...TURRET_BASE, r: '#5ef2ff' }, rows: TURRET_ROWS },
];

export const TURRET_BARREL: PixelSprite = {
  palette: { k: '#0d1117', g: '#9aa5b8', G: '#d0d7e2' },
  rows: ['kkkkkkkkkkk.', 'kGGGGGGGGGGk', 'kggggggggggk', 'kkkkkkkkkkk.'],
};

const CACHE_ROWS = [
  'kkkkkkkkkkkkkk',
  'kMMMMMMMMMMMMk',
  'kMmmmmmmmmmmMk',
  'kmyymmkkmmyymk',
  'kmyymkllkmyymk',
  'kmyymkllkmyymk',
  'kmyymmkkmmyymk',
  'kmmmmmmmmmmmmk',
  'kddddddddddddk',
  'kkkkkkkkkkkkkk',
];
const CACHE_BASE = { k: '#1a1208', m: '#5b6374', M: '#8a93a6', y: '#d9a21b', d: '#3a404c' };
/** Locked salvage cache. Frame 0 locked (red light), frame 1 open (green). */
export const CACHE_FRAMES: PixelSprite[] = [
  { palette: { ...CACHE_BASE, l: '#ff3b4e' }, rows: CACHE_ROWS },
  { palette: { ...CACHE_BASE, l: '#3dff9a' }, rows: CACHE_ROWS },
];

export const DATALOG: PixelSprite = {
  palette: { k: '#06141a', c: '#2fb6d6', C: '#a8f0ff', g: '#ffd166' },
  rows: ['.g.g.g..', 'kkkkkkk.', 'kcCccck.', 'kCcCcck.', 'kccCcCk.', 'kcccCck.', 'kkkkkkk.', '.g.g.g..'],
};

// ------------------------------------------------------------------ v0.4: Gravecutter rivals

const RAIDER_ROWS = [
  '..............',
  '....kkkkk.....',
  '...kgRRrrk....',
  '..kggRrrrrk...',
  '.kkgrrrrvvwk..',
  'kggkrrsrvvvkGG',
  'kggkrsssrvvkGG',
  'kggkrrsrvvvk..',
  '.kkgrrrrvvk...',
  '..kggrrrrrk...',
  '...kggrrrk....',
  '....kkkkk.....',
  '..............',
  '..............',
];
/** Gravecutter raider in a welding rig, facing right. Saw-blade insignia on the chest. */
export const RAIDER: PixelSprite = {
  palette: { k: '#120808', r: '#7a2e2e', R: '#a8453c', g: '#4a4f5a', v: '#ff9a3c', w: '#ffe0b0', G: '#c9ced8', s: '#e8b04a' },
  rows: RAIDER_ROWS,
};

const BRUTE_ROWS = [
  '................',
  '................',
  '....kkkkkk..kk..',
  '...kmmBBbbk.kSk.',
  '..kmmBBbbbbkkSsk',
  '..kmBBbbbbbbkSsk',
  '.kmmBbbbbbeekSyk',
  '.kmmBbbbbbeekSyk',
  '.kmmBbbbbbbbkSsk',
  '.kmmBbbbbbbbkSsk',
  '..kmbbbbbbbbkSsk',
  '..kmmbbbbbbkkSsk',
  '...kmmbbbbk.kSk.',
  '....kkkkkk..kk..',
  '................',
  '................',
];
/** Gravecutter brute carrying a riot shield on its right (front) side. */
export const BRUTE: PixelSprite = {
  palette: { k: '#0e0b0b', b: '#5a2b26', B: '#7d3a33', m: '#3a3d45', S: '#9aa5b8', s: '#6b7486', y: '#e8b04a', e: '#ff3b4e' },
  rows: BRUTE_ROWS,
};

// ------------------------------------------------------------------ v1.0: mining hauler

const SAPPER_ROWS = [
  '..............',
  '..kkkk..kkkk..',
  '..kttk..kttk..',
  '.kkyyyyyyyykk.',
  '.kyYYYYYYYyyk.',
  '.kyYccccccYyk.',
  'kkyYcrrrrcYyGk',
  'kkyYcrRRrcYyGg',
  'kkyYcrrrrcYyGk',
  '.kyYccccccYyk.',
  '.kyyyyyyyyyyk.',
  '.kkyyyyyyyykk.',
  '..kttk..kttk..',
  '..kkkk..kkkk..',
];
const SAPPER_BASE = { k: '#120d06', y: '#b8741c', Y: '#e8a33a', c: '#2b2418', t: '#3a3328', G: '#7b8494', g: '#c8d0dc' };
/** Sapper: a tracked mining bot carrying charges. Two frames: the sensor blinks. */
export const SAPPER_FRAMES: PixelSprite[] = [
  { palette: { ...SAPPER_BASE, r: '#ff3b4e', R: '#ffd0d5' }, rows: SAPPER_ROWS },
  { palette: { ...SAPPER_BASE, r: '#8e1f2c', R: '#ff3b4e' }, rows: SAPPER_ROWS },
];

const SWEEPER_ROWS = [
  '................',
  '.....kkkkkk.....',
  '...kkmmmmmmkk...',
  '..kmMMMMMMMMmk..',
  '.kmMMbbbbbbMMmk.',
  '.kmMbbccccbbMmkk',
  'kmMbbcllllcbbMLL',
  'kmMbbclwwlcbbMLW',
  'kmMbbclwwlcbbMLW',
  'kmMbbcllllcbbMLL',
  '.kmMbbccccbbMmkk',
  '.kmMMbbbbbbMMmk.',
  '..kmMMMMMMMMmk..',
  '...kkmmmmmmkk...',
  '.....kkkkkk.....',
  '................',
];
const SWEEPER_BASE = { k: '#0d1117', m: '#3a3f48', M: '#5a6270', b: '#2b2f38', c: '#14171c' };
/** Sweeper turntable seen from above, emitter on the right. Frame 0 hostile (orange), 1 hacked (cyan). */
export const SWEEPER_FRAMES: PixelSprite[] = [
  { palette: { ...SWEEPER_BASE, l: '#ff7b3a', w: '#ffe0b0', L: '#ff9a3c', W: '#fff2d0' }, rows: SWEEPER_ROWS },
  { palette: { ...SWEEPER_BASE, l: '#2fb8c9', w: '#d8faff', L: '#5ef2ff', W: '#e0fbff' }, rows: SWEEPER_ROWS },
];

const MINE_ROWS = ['..kkkk..', '.kmmmmk.', 'kmmrrmmk', 'kmrRRrmk', 'kmrRRrmk', 'kmmrrmmk', '.kmmmmk.', '..kkkk..'];
/** Proximity mine: frame 0 dim (arming or idle blink), frame 1 lit. */
export const MINE_FRAMES: PixelSprite[] = [
  { palette: { k: '#0d0b08', m: '#4a4236', r: '#5a1a20', R: '#8e1f2c' }, rows: MINE_ROWS },
  { palette: { k: '#0d0b08', m: '#4a4236', r: '#ff3b4e', R: '#ffd0d5' }, rows: MINE_ROWS },
];

export const GRENADE: PixelSprite = {
  palette: { k: '#0d0b08', g: '#5b6b3a', G: '#8a9b5c', y: '#ffd166' },
  rows: ['..y..', '.kkk.', 'kgGgk', 'kggGk', '.kkk.'],
};

/** Ore chunk dropped from a cut vein: worth salvage like any other. */
export const ORE_CHUNK: PixelSprite = {
  palette: { k: '#120d06', r: '#5a4a3a', R: '#7d6a55', o: '#ffb347', O: '#ffe0a0' },
  rows: ['..kkkk..', '.kRRrrk.', 'kRoOrrrk', 'kRooRrok', 'krrRRoOk', 'krorrrrk', '.krrrrk.', '..kkkk..'],
};

// ------------------------------------------------------------------ tileset

export interface TileTheme {
  /** Freighter colour -> this theme's colour. Anything not listed is unchanged. */
  remap: Record<string, string>;
  /** Replace hazard stripes with alien growth. */
  bio: boolean;
  /** Mining haulers: cracked walls are ore veins, and the floor has rubble instead of stripes. */
  ore?: boolean;
}

export const FREIGHTER_THEME: TileTheme = { remap: {}, bio: false };

/** Research vessels: teal lab panels, green light strips, Bloom growth on the floor. */
export const RESEARCH_THEME: TileTheme = {
  bio: true,
  remap: {
    '#1d2433': '#1a2724',
    '#29324a': '#26382f',
    '#131824': '#111a17',
    '#38445f': '#3a5248',
    '#222a3b': '#1f2c28',
    '#2d3750': '#2b3d36',
    '#1b2130': '#18231f',
    '#2a3349': '#273832',
    '#4b5d80': '#4d7366',
    '#34435d': '#355349',
    '#56698f': '#6fb39a',
    '#2a374e': '#294239',
    '#6f86ad': '#8fd1b8',
    '#1a2130': '#16201c',
    '#171c28': '#15201c',
    '#0a0d14': '#09100d',
    '#3a4560': '#38544a',
    '#10141e': '#0e1613',
    '#2f3a52': '#2d473e',
    '#4b5875': '#4a6d60',
    '#0f131c': '#0d1512',
    '#151a26': '#131d19',
  },
};

/** Mining haulers: rusty ochre plating, amber lights, rock rubble, ore veins in the cracked walls. */
export const MINING_THEME: TileTheme = {
  bio: false,
  ore: true,
  remap: {
    '#1d2433': '#2a2219',
    '#29324a': '#3a2f22',
    '#131824': '#1a140e',
    '#38445f': '#55432e',
    '#222a3b': '#2e251b',
    '#2d3750': '#3d3123',
    '#1b2130': '#211a13',
    '#2a3349': '#382c20',
    '#4b5d80': '#7a5c36',
    '#34435d': '#4d3b28',
    '#56698f': '#ffb347',
    '#2a374e': '#3a2d1f',
    '#6f86ad': '#c99a5a',
    '#1a2130': '#1d1610',
    '#171c28': '#1e1811',
    '#0a0d14': '#0d0a06',
    '#3a4560': '#56442f',
    '#10141e': '#140f0a',
    '#2f3a52': '#433423',
    '#4b5875': '#6b5236',
    '#0f131c': '#120e09',
    '#151a26': '#18130d',
  },
};

/**
 * Tileset strip, one 16x16 tile per DisplayTile index:
 * 0 wall top, 1 floor, 2 weak wall, 3 void, 4 wall face, 5 grate,
 * 6 vent, 7 hazard floor (or growth), 8 void (alt), 9 floor in wall shadow.
 */
export function paintTileset(ctx: CanvasRenderingContext2D, theme: TileTheme = FREIGHTER_THEME) {
  const S = TILE_SIZE;
  let ox = 0;
  const col = (c: string) => theme.remap[c] ?? c;
  const px = (x: number, y: number, c: string, w = 1, h = 1) => {
    ctx.fillStyle = col(c);
    ctx.fillRect(ox + x, y, w, h);
  };

  const floorBase = () => {
    px(0, 0, '#1d2433', S, S);
    px(0, 0, '#29324a', S, 1);
    px(0, 0, '#29324a', 1, S);
    px(0, S - 1, '#131824', S, 1);
    px(S - 1, 0, '#131824', 1, S);
    for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) px(x, y, '#38445f');
  };

  // 0 — wall top (ceiling panels seen from above)
  ox = 0;
  px(0, 0, '#222a3b', S, S);
  px(0, 0, '#2d3750', S, 1);
  px(0, 0, '#2d3750', 1, S);
  px(4, 4, '#1b2130', 8, 8);
  px(4, 4, '#2a3349', 8, 1);
  px(4, 4, '#2a3349', 1, 8);

  // 1 — deck plating
  ox = S;
  floorBase();

  // 2 — weak wall: cracked bulkhead, hazard stripes, glowing seams (or an ore vein)
  ox = S * 2;
  if (theme.ore) {
    px(0, 0, '#3a3029', S, S);
    px(0, 0, '#4d4036', S, 1);
    const rocks: [number, number, number, number, string][] = [
      [1, 2, 5, 4, '#4a3d33'], [8, 1, 6, 5, '#544538'], [2, 9, 6, 5, '#4f4134'], [10, 8, 5, 6, '#463a30'],
    ];
    for (const [x, y, w, h, c] of rocks) px(x, y, c, w, h);
    const ore: Pixel[] = [[4, 4], [5, 5], [6, 5], [7, 6], [8, 7], [9, 7], [10, 8], [6, 10], [7, 10], [11, 4], [12, 3], [3, 12]];
    for (const [x, y] of ore) px(x, y, '#ffb347');
    for (const [x, y] of [[5, 4], [8, 6], [12, 4], [7, 11]] as Pixel[]) px(x, y, '#ffe0a0');
  } else {
  px(0, 0, '#45434c', S, S);
  px(0, 0, '#5a5864', S, 1);
  for (let i = 0; i < S; i += 4) {
    px(i, 1, '#d9a21b', 2, 2);
    px(i + 2, S - 3, '#d9a21b', 2, 2);
  }
  const crack: Pixel[] = [[3, 5], [4, 6], [5, 6], [6, 7], [7, 8], [8, 8], [9, 9], [10, 10], [11, 10], [12, 11], [7, 9], [6, 10], [5, 11], [9, 7], [10, 6]];
  for (const [x, y] of crack) px(x, y, '#ff9a3c');
  for (const [x, y] of crack) px(x + 1, y, '#15151a');
  }

  // 3 — open space
  ox = S * 3;
  px(0, 0, '#05070c', S, S);
  px(4, 3, '#2a3550');
  px(11, 9, '#3d4a6a');
  px(7, 13, '#202a40');

  // 4 — wall face (front of a bulkhead, floor below)
  ox = S * 4;
  px(0, 0, '#222a3b', S, 4);
  px(0, 3, '#4b5d80', S, 1); // lip
  px(0, 4, '#34435d', S, 10);
  px(0, 6, '#56698f', S, 1); // light strip
  px(0, 4, '#2a374e', 1, 10);
  px(8, 7, '#2a374e', 1, 7);
  px(2, 10, '#6f86ad');
  px(13, 10, '#6f86ad');
  px(0, 14, '#1a2130', S, 2); // base shadow

  // 5 — floor grate
  ox = S * 5;
  px(0, 0, '#171c28', S, S);
  px(0, 0, '#29324a', S, 1);
  px(0, 0, '#29324a', 1, S);
  for (let y = 2; y < 14; y += 3) for (let x = 2; x < 14; x += 3) px(x, y, '#0a0d14', 2, 2);

  // 6 — floor vent
  ox = S * 6;
  floorBase();
  ctx.fillStyle = col('#3a4560');
  ctx.beginPath();
  ctx.arc(ox + 8, 8, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col('#10141e');
  ctx.beginPath();
  ctx.arc(ox + 8, 8, 5, 0, Math.PI * 2);
  ctx.fill();
  px(3, 8, '#2f3a52', 10, 1);
  px(8, 3, '#2f3a52', 1, 10);
  px(7, 7, '#4b5875', 3, 3);

  // 7 — floor with hazard band, or Bloom growth on research vessels
  ox = S * 7;
  floorBase();
  if (theme.bio) {
    const growth: [number, number, number, number, string][] = [
      [3, 5, 6, 4, '#24481f'], [5, 4, 4, 6, '#24481f'], [9, 9, 5, 4, '#24481f'],
      [4, 6, 4, 2, '#3f8f3a'], [10, 10, 3, 2, '#3f8f3a'], [6, 5, 1, 1, '#9be36b'],
      [11, 10, 1, 1, '#9be36b'], [12, 4, 2, 2, '#24481f'], [12, 4, 1, 1, '#57a83c'],
    ];
    for (const [x, y, w, h, c] of growth) px(x, y, c, w, h);
  } else if (theme.ore) {
    const rubble: [number, number, number, number, string][] = [
      [3, 4, 3, 2, '#4f4134'], [4, 3, 1, 1, '#6b5a48'], [10, 9, 4, 3, '#4f4134'], [11, 9, 2, 1, '#6b5a48'],
      [6, 11, 2, 2, '#463a30'], [12, 3, 2, 2, '#463a30'], [7, 6, 1, 1, '#ffb347'],
    ];
    for (const [x, y, w, h, c] of rubble) px(x, y, c, w, h);
  } else {
    for (let y = 11; y < 15; y++) {
      for (let x = 1; x < S - 1; x++) px(x, y, (x + y) % 4 < 2 ? '#c9961a' : '#1a1a1a');
    }
  }

  // 8 — open space (alt)
  ox = S * 8;
  px(0, 0, '#05070c', S, S);
  px(2, 11, '#2a3550');
  px(12, 4, '#4a5a80');
  px(12, 3, '#26304a');
  px(13, 4, '#26304a');

  // 9 — floor in the shadow of the wall above
  ox = S * 9;
  floorBase();
  px(0, 0, '#0f131c', S, 3);
  px(0, 3, '#151a26', S, 2);
}
