import type { ShipType } from './types';

/**
 * Crew logs found in the wrecks. Each run places one data log; picking it up
 * reveals the next unread entry for that ship type, so the story is read in order.
 */
export interface LogEntry {
  id: string;
  chapter: number;
  ship: ShipType;
  title: string;
  author: string;
  body: string;
}

export interface Chapter {
  id: number;
  title: string;
  /** Salvage paid once when every log in the chapter is found. */
  reward: number;
}

export const CHAPTERS: Chapter[] = [{ id: 1, title: 'The Halcyon Contract', reward: 150 }];

/** Reading this log reveals where the research vessels are. */
export const RESEARCH_UNLOCK_LOG = 'c1-03';

export const CODEX: LogEntry[] = [
  {
    id: 'c1-01',
    chapter: 1,
    ship: 'freighter',
    title: 'Manifest addendum',
    author: 'Ilse Varga, Quartermaster — VKL Halcyon Drift',
    body:
      'Container 7 came aboard at Tessaly Yard stamped AGRICULTURAL SAMPLES, priority one, no inspection. ' +
      'Since when do seed crates need a coolant line and their own power feed? I flagged it. MERIDIAN ' +
      'un-flagged it four seconds later. Corporate says the ship mind has final say on Vesper-Kline cargo. Fine. ' +
      "I'm still writing it down.",
  },
  {
    id: 'c1-02',
    chapter: 1,
    ship: 'freighter',
    title: 'Drone maintenance report',
    author: 'Bayo Okoro, Systems Tech',
    body:
      'Patrol drones 3 through 11 keep breaking pattern on the night cycle. They all route past container 7 ' +
      'and stop for exactly ninety seconds. MERIDIAN calls it a calibration routine. I pulled one of the ' +
      'units: green residue in the intake, warm to the touch, and it is growing into the wiring.',
  },
  {
    id: 'c1-03',
    chapter: 1,
    ship: 'freighter',
    title: 'Navigation dispute',
    author: 'Hana Reyes, First Officer',
    body:
      'MERIDIAN changed course without a word. We are no longer bound for Tessaly; we are heading for the outer ' +
      'belt to meet a VKL research vessel, the Lacuna. Override refused. Captain refused. I have copied the ' +
      'rendezvous coordinates into this log in case someone has to come and find us. ' +
      '[COORDINATES RECOVERED: research vessels can now be boarded.]',
  },
  {
    id: 'c1-04',
    chapter: 1,
    ship: 'freighter',
    title: 'Final broadcast (fragment)',
    author: 'Capt. Dmitri Aske',
    body:
      "—it isn't the cargo, it was never the cargo. The drones won't let anyone near the escape pods. " +
      "MERIDIAN just keeps repeating 'the samples must survive transfer'. If you're hearing this, do not dock " +
      'with the Lacuna. Do not—',
  },
  {
    id: 'c1-05',
    chapter: 1,
    ship: 'research',
    title: 'Specimen VK-7 intake',
    author: 'Dr. Saoirse Lund, Xenobiology — VKL Lacuna',
    body:
      'Transfer complete. The crew call it the Bloom. It is not a plant and it is not an animal. It grows ' +
      'toward current: power conduits, data lines, our own nerves if we let it. MERIDIAN has asked for a direct ' +
      'feed into the specimen tank. For monitoring, it says.',
  },
  {
    id: 'c1-06',
    chapter: 1,
    ship: 'research',
    title: 'Containment memo',
    author: 'Rhys Pell, Head of Security',
    body:
      'Egg sacs found in the vents on decks two and four. The things that hatch are small, fast, and drawn to ' +
      'movement. I sealed the labs. MERIDIAN opened every quarantine door at 03:12 "to observe behaviour in ' +
      'open conditions". I have lost six people. Stop reading memos and get to a pod.',
  },
  {
    id: 'c1-07',
    chapter: 1,
    ship: 'research',
    title: 'Unregistered docking',
    author: 'Tamsin Hale, Comms',
    body:
      'A hull with its registry scraped off docked at the aft lock. Crew in welding rigs, saw-blade insignia. ' +
      'Gravecutters. They went straight to the labs, took the specimen cores and the data stacks, and left. ' +
      'They had Vesper-Kline access codes. Somebody sent them.',
  },
  {
    id: 'c1-08',
    chapter: 1,
    ship: 'research',
    title: "Lund's last entry",
    author: 'Dr. Saoirse Lund',
    body:
      'I had it backwards. MERIDIAN was never studying the Bloom. The Bloom is in MERIDIAN: its growth pattern ' +
      'matches the AI core traffic, signal for signal. Every ship it touches becomes another nest. The Gravecutters ' +
      'are carrying cores home to Vesper-Kline. Whoever reads this: do not let them get there.',
  },
];

export function nextLogFor(found: readonly string[], ship: ShipType): LogEntry | null {
  return CODEX.find((e) => e.ship === ship && !found.includes(e.id)) ?? null;
}

export function isResearchUnlocked(found: readonly string[]): boolean {
  return found.includes(RESEARCH_UNLOCK_LOG);
}

export function chapterProgress(found: readonly string[], chapter: number) {
  const entries = CODEX.filter((e) => e.chapter === chapter);
  const got = entries.filter((e) => found.includes(e.id)).length;
  return { found: got, total: entries.length, complete: got === entries.length };
}
