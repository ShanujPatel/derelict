/**
 * Ghost replays: the path of a Daily Derelict run, recorded as positions at a
 * fixed interval and packed small enough to store with the score.
 *
 *   "G1.<intervalMs>.<base64url>"
 *
 * The bytes are the start position (two little-endian int16s, in pixels)
 * followed by one signed byte each for x and y movement per sample. A step
 * bigger than ±127 px is clamped; at 10 samples a second nobody moves that fast.
 */
export interface Point2 {
  x: number;
  y: number;
}

export interface Ghost {
  intervalMs: number;
  points: Point2[];
}

export const GHOST = {
  intervalMs: 100,
  /** Ten minutes of path at most; longer runs just stop recording. */
  maxPoints: 6000,
  /** The database refuses anything longer. */
  maxLength: 24000,
} as const;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out;
}

function fromBase64Url(text: string): Uint8Array | null {
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of text) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

const clampStep = (n: number) => Math.max(-127, Math.min(127, Math.round(n)));

export function encodeGhost(points: readonly Point2[], intervalMs: number = GHOST.intervalMs): string {
  const pts = points.slice(0, GHOST.maxPoints);
  if (!pts.length) return `G1.${intervalMs}.`;
  const bytes = new Uint8Array(4 + (pts.length - 1) * 2);
  const view = new DataView(bytes.buffer);
  let x = Math.round(pts[0].x);
  let y = Math.round(pts[0].y);
  view.setInt16(0, x, true);
  view.setInt16(2, y, true);
  for (let i = 1; i < pts.length; i++) {
    // Steps are taken from where the ghost actually is, so clamping never drifts.
    const dx = clampStep(pts[i].x - x);
    const dy = clampStep(pts[i].y - y);
    x += dx;
    y += dy;
    view.setInt8(4 + (i - 1) * 2, dx);
    view.setInt8(5 + (i - 1) * 2, dy);
  }
  return `G1.${intervalMs}.${toBase64Url(bytes)}`;
}

export function decodeGhost(text: string | null | undefined): Ghost | null {
  if (!text) return null;
  const m = /^G1\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(text);
  if (!m) return null;
  const intervalMs = Number(m[1]);
  const bytes = fromBase64Url(m[2]);
  if (!bytes || bytes.length < 4 || intervalMs <= 0 || (bytes.length - 4) % 2 !== 0) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let x = view.getInt16(0, true);
  let y = view.getInt16(2, true);
  const points: Point2[] = [{ x, y }];
  for (let i = 4; i < bytes.length; i += 2) {
    x += view.getInt8(i);
    y += view.getInt8(i + 1);
    points.push({ x, y });
  }
  return { intervalMs, points };
}

/** Where the ghost is after `ms`, smoothly between samples; null once it's finished. */
export function ghostAt(ghost: Ghost, ms: number): Point2 | null {
  if (ms < 0 || !ghost.points.length) return ghost.points[0] ?? null;
  const f = ms / ghost.intervalMs;
  const i = Math.floor(f);
  if (i >= ghost.points.length - 1) return null;
  const a = ghost.points[i];
  const b = ghost.points[i + 1];
  const t = f - i;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** How long the recorded run lasts. */
export const ghostDuration = (ghost: Ghost) => Math.max(0, ghost.points.length - 1) * ghost.intervalMs;

/** Records a path, sampling at a fixed interval however uneven the frames are. */
export class GhostRecorder {
  private points: Point2[] = [];
  private nextAt = 0;

  constructor(private intervalMs: number = GHOST.intervalMs) {}

  /** Call every frame with the time since the run started. */
  sample(ms: number, x: number, y: number) {
    while (ms >= this.nextAt && this.points.length < GHOST.maxPoints) {
      this.points.push({ x, y });
      this.nextAt += this.intervalMs;
    }
  }

  get length() {
    return this.points.length;
  }

  encode(): string {
    return encodeGhost(this.points, this.intervalMs);
  }
}
