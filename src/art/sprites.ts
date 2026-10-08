/**
 * Placeholder pixel art, defined as character maps so the repo needs no
 * binary assets yet. Each character maps to a palette colour; '.' is transparent.
 * Swap these for a sprite sheet later without touching game code.
 */
export interface PixelSprite {
  palette: Record<string, string>;
  rows: string[];
}

export const PLAYER: PixelSprite = {
  // Salvager seen from above, facing right (rotated to the aim direction in game).
  palette: { o: '#1a1208', b: '#e07a2e', v: '#6fd6ff', c: '#8a93a6', g: '#cfd6e0' },
  rows: [
    '................',
    '................',
    '................',
    '.....oooooo.....',
    '....obbbbbbo....',
    '...obbbbbbbbo...',
    '.ccobbbbbbbvvo..',
    '.ccobbbbbbvvvvo.',
    '.ccobbbbbbvvvvgg',
    '.ccobbbbbbvvvvgg',
    '.ccobbbbbbvvvvo.',
    '.ccobbbbbbbvvo..',
    '...obbbbbbbbo...',
    '....obbbbbbo....',
    '.....oooooo.....',
    '................',
  ],
};

export const DRONE: PixelSprite = {
  palette: { h: '#1c2333', m: '#6b7a93', e: '#2a0f14', r: '#ff3b4e', p: '#9aa7bd' },
  rows: [
    '..............',
    '.....hhhh.....',
    '...hhmmmmhh...',
    '..hmmmmmmmmh..',
    '..hmmeeeemmh..',
    '.hmmeerreemmh.',
    'phmmerrrremmhp',
    'phmmerrrremmhp',
    '.hmmeerreemmh.',
    '..hmmeeeemmh..',
    '..hmmmmmmmmh..',
    '...hhmmmmhh...',
    '.....hhhh.....',
    '..............',
  ],
};

export const BULLET: PixelSprite = {
  palette: { y: '#ffd166', w: '#fffbe6' },
  rows: ['.yy.', 'ywwy', 'ywwy', '.yy.'],
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
  palette: { k: '#2a1a08', y: '#e8b04a', d: '#8a5a1c' },
  rows: [
    'kkkkkkkkkk',
    'kyyyyyyyyk',
    'kydyyyydyk',
    'kyydyydyyk',
    'kyyyddyyyk',
    'kyyyddyyyk',
    'kyydyydyyk',
    'kydyyyydyk',
    'kyyyyyyyyk',
    'kkkkkkkkkk',
  ],
};

export const SPARK: PixelSprite = {
  palette: { w: '#ffffff' },
  rows: ['ww', 'ww'],
};

export const TILE_SIZE = 16;

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

/**
 * Tileset strip, one 16x16 tile per Tile value:
 * 0 wall, 1 floor, 2 weak wall, 3 void (space).
 */
export function paintTileset(ctx: CanvasRenderingContext2D) {
  const S = TILE_SIZE;
  const px = (x: number, y: number, c: string, w = 1, h = 1) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };

  // 0 — hull wall
  px(0, 0, '#3a4a66', S, S);
  px(0, 0, '#5a7096', S, 2);
  px(0, S - 3, '#26324a', S, 3);
  px(3, 6, '#2c3a54', 10, 1);
  px(3, 9, '#2c3a54', 10, 1);

  // 1 — deck plating
  const f = S;
  px(f, 0, '#1b2230', S, S);
  px(f, 0, '#232c3d', S, 1);
  px(f, 0, '#232c3d', 1, S);
  for (const [x, y] of [
    [2, 2],
    [13, 2],
    [2, 13],
    [13, 13],
  ]) px(f + x, y, '#2e3a50');

  // 2 — weak wall: cracked hull with hazard stripes
  const w = S * 2;
  px(w, 0, '#4a4a52', S, S);
  for (let i = 0; i < S; i += 4) px(w + i, 0, '#d9a21b', 2, 2);
  for (let i = 0; i < S; i += 4) px(w + i + 2, S - 2, '#d9a21b', 2, 2);
  for (const [x, y] of [
    [4, 4],
    [5, 5],
    [6, 6],
    [6, 7],
    [7, 8],
    [9, 8],
    [10, 9],
    [11, 10],
    [8, 9],
    [7, 10],
  ]) px(w + x, y, '#15151a');

  // 3 — void with a few stars
  const v = S * 3;
  px(v, 0, '#05070c', S, S);
  px(v + 4, 3, '#2a3550');
  px(v + 11, 9, '#3d4a6a');
  px(v + 7, 13, '#202a40');
}
