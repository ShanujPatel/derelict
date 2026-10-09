import type { Deck } from './deckGenerator';
import type { Hazard } from './fieldkit';
import type { ControlScheme } from './tips';
import { Tile, type Point, type Room, type Spawn } from './types';

/**
 * The training run: a small handcrafted ship of seven rooms in a row. Each
 * step teaches one thing, and the door to the next room opens once it's done.
 *
 *   [1 move]|[2 salvage]|[3 supplies]|[4 shoot]|[5 roll · live floor]#[6 drum]|[7 map + exit]
 *
 * '|' is a sealed door; '#' is a cracked wall you cut with the torch (step 6).
 */
export type TrainingStepId = 'move' | 'salvage' | 'supplies' | 'shoot' | 'roll' | 'torch' | 'drum' | 'scanner' | 'extract';

export interface TrainingStep {
  id: TrainingStepId;
  title: string;
  text: Record<ControlScheme, string> | string;
}

export const TRAINING_STEPS: readonly TrainingStep[] = [
  {
    id: 'move',
    title: 'MOVE',
    text: {
      keyboard: 'Move with WASD or the arrow keys. Walk to the glowing marker.',
      touch: 'Drag your left thumb to move. Walk to the glowing marker.',
      pad: 'Move with the left stick. Walk to the glowing marker.',
    },
  },
  {
    id: 'salvage',
    title: 'SALVAGE',
    text: 'Pick up all 3 salvage crates by walking over them. Salvage only counts if you make it out alive.',
  },
  {
    id: 'supplies',
    title: 'SUPPLIES',
    text: "Your air is running low and you're hurt. Grab the blue O₂ canister (a power cell for robots) and the health pack.",
  },
  {
    id: 'shoot',
    title: 'SHOOT',
    text: {
      keyboard: 'Aim with the mouse and hold the left button to fire. Destroy both training drones.',
      touch: 'Push your right thumb towards a drone to aim and fire. Destroy both training drones.',
      pad: 'Aim with the right stick and hold RT to fire. Destroy both training drones.',
    },
  },
  {
    id: 'roll',
    title: 'DODGE ROLL',
    text: {
      keyboard: "The floor ahead is live. Press Shift or Space to roll across it: you can't be hurt mid-roll.",
      touch: "The floor ahead is live. Tap ROLL to roll across it: you can't be hurt mid-roll.",
      pad: "The floor ahead is live. Press A to roll across it: you can't be hurt mid-roll.",
    },
  },
  {
    id: 'torch',
    title: 'CUTTING TORCH',
    text: {
      keyboard: 'A cracked wall blocks the way. Face it and press F (or right-click) to cut through with your torch.',
      touch: 'A cracked wall blocks the way. Face it and tap TORCH to cut through.',
      pad: 'A cracked wall blocks the way. Face it and press X to cut through with your torch.',
    },
  },
  {
    id: 'drum',
    title: 'FUEL DRUMS',
    text: 'Three drones guard a red fuel drum. Shoot the drum to take them all out at once, but stand well clear of the blast.',
  },
  {
    id: 'scanner',
    title: 'SCANNER',
    text: {
      keyboard: 'Press Tab to open your scanner map. It fills in as you explore and marks the exit.',
      touch: 'Tap MAP to open your scanner. It fills in as you explore and marks the exit.',
      pad: 'Press Back to open your scanner map. It fills in as you explore and marks the exit.',
    },
  },
  {
    id: 'extract',
    title: 'EXTRACT',
    text: 'Step on the green EXIT pad to bank your salvage. That is a whole run!',
  },
];

export const trainingText = (step: TrainingStep, scheme: ControlScheme) =>
  typeof step.text === 'string' ? step.text : step.text[scheme];

/** Paid once, the first time you finish training. */
export const TRAINING_REWARD = 100;
export const TRAINING_SEED = 'training';

const TOP = 4;
const HEIGHT = 8;
/** The door gap in each wall between rooms. */
const DOOR_ROWS = [7, 8];

export const TRAINING_ROOMS: readonly Room[] = [
  { x: 2, y: TOP, w: 8, h: HEIGHT },
  { x: 11, y: TOP, w: 8, h: HEIGHT },
  { x: 20, y: TOP, w: 8, h: HEIGHT },
  { x: 29, y: TOP, w: 10, h: HEIGHT },
  { x: 40, y: TOP, w: 10, h: HEIGHT },
  { x: 51, y: TOP, w: 10, h: HEIGHT },
  { x: 62, y: TOP, w: 10, h: HEIGHT },
];

export interface TrainingDeck extends Deck {
  /** Door tiles that open when each step is done, keyed by step id. */
  gates: Partial<Record<TrainingStepId, Point[]>>;
  /** Where step 1 asks you to walk. */
  marker: Point;
  /** Training drones, spawned when their step starts. */
  drones: Partial<Record<TrainingStepId, Point[]>>;
  /** Past this column you've crossed the live floor (step 5). */
  rollLine: number;
}

export function generateTraining(): TrainingDeck {
  const width = 74;
  const height = 16;
  const tiles: Tile[][] = Array.from({ length: height }, () => Array.from({ length: width }, (): Tile => Tile.Wall));
  for (const r of TRAINING_ROOMS) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[y][x] = Tile.Floor;
  }
  const wallBetween = (i: number) => TRAINING_ROOMS[i].x + TRAINING_ROOMS[i].w;
  const door = (i: number) => DOOR_ROWS.map((y) => ({ x: wallBetween(i), y }));
  // The cracked wall between rooms 5 and 6 starts as weak wall; every other door is sealed wall.
  const cracked = door(4);
  for (const p of cracked) tiles[p.y][p.x] = Tile.WeakWall;

  const spawns: Spawn[] = [
    { x: 13, y: 5, kind: 'salvage', value: 10 },
    { x: 15, y: 10, kind: 'salvage', value: 10 },
    { x: 17, y: 7, kind: 'salvage', value: 10 },
    { x: 23, y: 6, kind: 'oxygen', value: 35 },
    { x: 26, y: 10, kind: 'medkit', value: 35 },
    { x: 56, y: 4, kind: 'drum', value: 0 },
    { x: 66, y: 6, kind: 'salvage', value: 15 },
  ];
  const hazards: Hazard[] = [{ x: 44, y: TOP, w: 2, h: HEIGHT, phaseMs: 0, alwaysOn: true }];

  return {
    seed: TRAINING_SEED,
    ship: 'freighter',
    width,
    height,
    tiles,
    rooms: [...TRAINING_ROOMS],
    start: { x: 4, y: 7 },
    extraction: { x: 70, y: 8 },
    spawns,
    weakWalls: cracked,
    hazards,
    gates: {
      move: door(0),
      salvage: door(1),
      supplies: door(2),
      shoot: door(3),
      drum: door(5),
    },
    marker: { x: 8, y: 8 },
    drones: {
      shoot: [
        { x: 35, y: 6 },
        { x: 36, y: 10 },
      ],
      drum: [
        { x: 55, y: 5 },
        { x: 57, y: 5 },
        { x: 56, y: 6 },
      ],
    },
    rollLine: 46,
  };
}
