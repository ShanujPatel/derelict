/** How many game pixels the shorter screen side should show. */
export const TARGET_SHORT_SIDE = 270;

export interface GameSize {
  width: number;
  height: number;
  zoom: number;
}

/**
 * Sizes the game to match the window's shape, so it fills the screen in both
 * landscape and portrait without letterboxing. The shorter side always shows
 * the same amount of the ship; the longer side shows more.
 */
export function computeGameSize(
  windowWidth: number,
  windowHeight: number,
  shortSide = TARGET_SHORT_SIDE,
): GameSize {
  const w = Math.max(1, windowWidth);
  const h = Math.max(1, windowHeight);
  const zoom = Math.min(w, h) / shortSide;
  return {
    // Cap very wide or tall screens so the view doesn't become a thin strip.
    width: Math.min(Math.round(w / zoom), shortSide * 3),
    height: Math.min(Math.round(h / zoom), shortSide * 3),
    zoom,
  };
}
