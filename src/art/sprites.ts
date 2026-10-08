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

// ------------------------------------------------------------------ tileset

/**
 * Tileset strip, one 16x16 tile per DisplayTile index:
 * 0 wall top, 1 floor, 2 weak wall, 3 void, 4 wall face, 5 grate,
 * 6 vent, 7 hazard floor, 8 void (alt), 9 floor in wall shadow.
 */
export function paintTileset(ctx: CanvasRenderingContext2D) {
  const S = TILE_SIZE;
  let ox = 0;
  const px = (x: number, y: number, c: string, w = 1, h = 1) => {
    ctx.fillStyle = c;
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

  // 2 — weak wall: cracked bulkhead, hazard stripes, glowing seams
  ox = S * 2;
  px(0, 0, '#45434c', S, S);
  px(0, 0, '#5a5864', S, 1);
  for (let i = 0; i < S; i += 4) {
    px(i, 1, '#d9a21b', 2, 2);
    px(i + 2, S - 3, '#d9a21b', 2, 2);
  }
  const crack: Pixel[] = [[3, 5], [4, 6], [5, 6], [6, 7], [7, 8], [8, 8], [9, 9], [10, 10], [11, 10], [12, 11], [7, 9], [6, 10], [5, 11], [9, 7], [10, 6]];
  for (const [x, y] of crack) px(x, y, '#ff9a3c');
  for (const [x, y] of crack) px(x + 1, y, '#15151a');

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
  ctx.fillStyle = '#3a4560';
  ctx.beginPath();
  ctx.arc(ox + 8, 8, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#10141e';
  ctx.beginPath();
  ctx.arc(ox + 8, 8, 5, 0, Math.PI * 2);
  ctx.fill();
  px(3, 8, '#2f3a52', 10, 1);
  px(8, 3, '#2f3a52', 1, 10);
  px(7, 7, '#4b5875', 3, 3);

  // 7 — floor with hazard band
  ox = S * 7;
  floorBase();
  for (let y = 11; y < 15; y++) {
    for (let x = 1; x < S - 1; x++) px(x, y, (x + y) % 4 < 2 ? '#c9961a' : '#1a1a1a');
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
