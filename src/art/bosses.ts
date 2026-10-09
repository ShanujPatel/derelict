/**
 * Boss art, painted pixel by pixel onto canvases at boot (still no image
 * files). Each painter draws one texture; sizes are in BOSS_TEXTURES.
 */
type Ctx = CanvasRenderingContext2D;

const rect = (ctx: Ctx, x: number, y: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
};

/** Filled ellipse made of whole pixels, so edges stay crisp like the rest of the art. */
const blob = (ctx: Ctx, cx: number, cy: number, rx: number, ry: number, c: string) => {
  ctx.fillStyle = c;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) ctx.fillRect(x, y, 1, 1);
    }
  }
};

/** Rect with a one-pixel dark outline. */
const box = (ctx: Ctx, x: number, y: number, w: number, h: number, c: string, outline = '#0d0f14') => {
  rect(ctx, x - 1, y - 1, w + 2, h + 2, outline);
  rect(ctx, x, y, w, h, c);
};

/** The Foreman: a hazard-yellow cargo loader with fork arms, facing right. */
function foreman(ctx: Ctx, stunned: boolean) {
  // Treads
  for (const ty of [1, 24]) {
    box(ctx, 2, ty, 26, 5, '#2a2d33');
    for (let x = 3; x < 28; x += 3) rect(ctx, x, ty + 1, 1, 3, '#45494f');
  }
  // Body with hazard stripes on the back half
  box(ctx, 4, 6, 24, 18, '#d89a1c');
  for (let x = 5; x < 15; x += 4) rect(ctx, x, 7, 2, 16, '#1a1a1a');
  rect(ctx, 4, 6, 24, 1, '#ffd166');
  rect(ctx, 4, 23, 24, 1, '#8e6210');
  // Exhaust and warning lamp
  rect(ctx, 6, 3, 3, 3, '#45494f');
  rect(ctx, 9, 13, 3, 4, stunned ? '#5ef2ff' : '#ff3b4e');
  // Cab
  box(ctx, 16, 9, 9, 12, '#3a3f48');
  rect(ctx, 19, 11, 5, 8, stunned ? '#2a3a44' : '#6fd6ff');
  rect(ctx, 20, 12, 1, 3, stunned ? '#3a4a54' : '#e0f8ff');
  // Fork arms
  for (const fy of [8, 19]) {
    box(ctx, 28, fy, 6, 3, '#9aa3b0');
    box(ctx, 33, fy - 1, 3, 5, '#c8d0dc');
  }
  if (stunned) {
    // Sparks over the cab
    for (const [x, y] of [[14, 4], [22, 3], [26, 6], [12, 26]]) rect(ctx, x, y, 2, 2, '#ffd166');
  }
}

/** The Bloom Mother: a huge rooted growth with a carapace and a maw. */
function mother(ctx: Ctx, open: boolean) {
  blob(ctx, 24, 26, 23, 15, '#1a0d20');
  blob(ctx, 24, 25, 22, 14, '#5a2a6e');
  blob(ctx, 24, 30, 20, 9, '#43204f');
  // Carapace plates
  for (const [cx, cy, rx, ry] of [
    [11, 20, 8, 7],
    [37, 20, 8, 7],
    [17, 13, 8, 6],
    [31, 13, 8, 6],
  ]) {
    blob(ctx, cx, cy, rx + 1, ry + 1, '#123a32');
    blob(ctx, cx, cy, rx, ry, '#2f7f6a');
    blob(ctx, cx - 2, cy - 2, rx - 4, ry - 3, '#4fb894');
  }
  // Spots
  for (const [x, y] of [[6, 28], [42, 28], [9, 33], [39, 33], [24, 37]]) blob(ctx, x, y, 1.6, 1.6, '#c06bff');
  // Tendrils into the floor
  for (const x of [5, 13, 35, 43]) rect(ctx, x, 36, 2, 5, '#43204f');
  if (open) {
    blob(ctx, 24, 24, 9, 9, '#0a0410');
    blob(ctx, 24, 24, 5, 5, '#9bff5c');
    blob(ctx, 24, 24, 3, 3, '#e8ffb0');
    for (const [x, y] of [[17, 18], [30, 18], [16, 28], [31, 28], [24, 15]]) rect(ctx, x, y, 2, 2, '#e8e0d0');
  } else {
    rect(ctx, 23, 15, 2, 18, '#1a0d20');
    rect(ctx, 23, 22, 2, 4, '#9bff5c');
  }
}

function coupling(ctx: Ctx, dead: boolean) {
  box(ctx, 1, 12, 10, 3, '#3a3f48');
  box(ctx, 3, 3, 6, 9, '#5a6270');
  rect(ctx, 4, 4, 4, 7, dead ? '#1a1a1a' : '#5ef2ff');
  if (!dead) rect(ctx, 5, 5, 1, 4, '#e0f8ff');
  else {
    rect(ctx, 5, 6, 1, 2, '#ff7b3a');
    rect(ctx, 6, 8, 1, 2, '#ff7b3a');
  }
  box(ctx, 2, 1, 8, 2, '#9aa3b0');
}

function root(ctx: Ctx, dead: boolean) {
  if (dead) {
    blob(ctx, 7, 10, 5, 3, '#2a1a12');
    blob(ctx, 7, 9, 4, 2, '#4a3322');
    return;
  }
  blob(ctx, 7, 10, 6, 4, '#123a20');
  blob(ctx, 7, 9, 5, 3, '#3f8f4a');
  for (const [x, y] of [[3, 9], [10, 10], [6, 11]]) rect(ctx, x, y, 2, 1, '#c06bff');
  blob(ctx, 7, 4, 3.5, 3.5, '#123a20');
  blob(ctx, 7, 4, 2.6, 2.6, '#9bff5c');
  rect(ctx, 6, 3, 1, 1, '#e8ffb0');
}

/** The Hollow Captain: a Gravecutter in a heavy welding rig, cables trailing to the cores. Facing right. */
function captain(ctx: Ctx, glow: string) {
  // Cables
  for (const [x, y] of [[1, 6], [1, 22], [2, 14]]) rect(ctx, x, y, 6, 2, '#2a2d33');
  // Shoulders and rig
  blob(ctx, 16, 15, 12, 12, '#120808');
  blob(ctx, 16, 15, 11, 11, '#5a2b26');
  blob(ctx, 14, 15, 9, 9, '#7d3a33');
  // Chest plate with the saw-blade insignia
  blob(ctx, 15, 15, 5, 5, '#3a3d45');
  for (const [x, y] of [[15, 9], [21, 15], [15, 21], [9, 15], [19, 11], [19, 19], [11, 19], [11, 11]]) rect(ctx, x, y, 2, 2, '#e8b04a');
  blob(ctx, 15.5, 15.5, 2.5, 2.5, glow);
  // Helmet visor (front, right)
  box(ctx, 22, 10, 5, 11, '#2b2f38');
  rect(ctx, 23, 11, 3, 9, glow);
  rect(ctx, 24, 12, 1, 3, '#ffffff');
  // Rifle
  box(ctx, 26, 21, 9, 3, '#9aa5b8');
  rect(ctx, 26, 22, 9, 1, '#c9ced8');
}

function pylon(ctx: Ctx, dead: boolean) {
  box(ctx, 2, 13, 10, 3, '#3a3f48');
  box(ctx, 4, 2, 6, 11, '#4a5160');
  rect(ctx, 5, 3, 4, 9, dead ? '#1a1a1a' : '#c06bff');
  if (!dead) {
    rect(ctx, 6, 4, 1, 6, '#f0d8ff');
    rect(ctx, 3, 0, 8, 2, '#e0c0ff');
  } else {
    rect(ctx, 6, 5, 1, 2, '#ff7b3a');
    rect(ctx, 7, 8, 1, 2, '#ff7b3a');
    rect(ctx, 3, 0, 8, 2, '#3a3f48');
  }
}

function bulkhead(ctx: Ctx) {
  rect(ctx, 0, 0, 32, 16, '#0d0f14');
  rect(ctx, 1, 1, 30, 14, '#3a3f48');
  for (let x = -16; x < 32; x += 6) {
    for (let i = 0; i < 3; i++) rect(ctx, x + i + 8, 5 + i, 3, 1, '#ffd166');
    for (let i = 0; i < 3; i++) rect(ctx, x + i + 8, 8 + i, 3, 1, '#1a1a1a');
  }
  rect(ctx, 15, 1, 2, 14, '#1a1a1a');
  rect(ctx, 6, 12, 4, 2, '#ff3b4e');
  rect(ctx, 22, 12, 4, 2, '#ff3b4e');
}

export const BOSS_TEXTURES: Record<string, { w: number; h: number; paint: (ctx: Ctx) => void }> = {
  foreman: { w: 37, h: 30, paint: (c) => foreman(c, false) },
  'foreman-stunned': { w: 37, h: 30, paint: (c) => foreman(c, true) },
  mother: { w: 48, h: 42, paint: (c) => mother(c, false) },
  'mother-open': { w: 48, h: 42, paint: (c) => mother(c, true) },
  coupling: { w: 12, h: 16, paint: (c) => coupling(c, false) },
  'coupling-dead': { w: 12, h: 16, paint: (c) => coupling(c, true) },
  root: { w: 14, h: 14, paint: (c) => root(c, false) },
  'root-dead': { w: 14, h: 14, paint: (c) => root(c, true) },
  bulkhead: { w: 32, h: 16, paint: bulkhead },
  captain: { w: 36, h: 31, paint: (c) => captain(c, '#c06bff') },
  'captain-exposed': { w: 36, h: 31, paint: (c) => captain(c, '#ff3b4e') },
  pylon: { w: 14, h: 16, paint: (c) => pylon(c, false) },
  'pylon-dead': { w: 14, h: 16, paint: (c) => pylon(c, true) },
};
