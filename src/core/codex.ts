import type { BossId } from './bosses';
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
  /** Where it's found: a data log on a ship (default), or carried by a boss. */
  source?: 'ship' | BossId;
}

export interface Chapter {
  id: number;
  title: string;
  /** Salvage paid once when every log in the chapter is found. */
  reward: number;
}

export const CHAPTERS: Chapter[] = [
  { id: 1, title: 'The Halcyon Contract', reward: 150 },
  { id: 2, title: 'The Gravecutter Ledger', reward: 250 },
  { id: 3, title: 'The Saw-Tooth', reward: 350 },
];

/** Reading this log reveals where the research vessels are. */
export const RESEARCH_UNLOCK_LOG = 'c1-03';
/** Reading this log reveals where the Gravecutters' mining haulers are. */
export const MINING_UNLOCK_LOG = 'c2-01';

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
  {
    id: 'c2-01',
    chapter: 2,
    ship: 'freighter',
    title: 'Ledger page 114',
    author: 'Ledger of the Saw-Tooth, Gravecutter crew',
    body:
      'Payment in full from a VKL account with no name on it: forty thousand per intact AI core, double if the ' +
      'core is "still talking". We do not ask what that means. Twelve cores lifted this quarter. Brannick says the ' +
      'cores hum when you stack them. Brannick has been moved to the outer hold. Cores go down to the Saw-Tooth for ' +
      'processing; nav fix attached for the next run. [COORDINATES RECOVERED: mining haulers can now be boarded.]',
  },
  {
    id: 'c2-02',
    chapter: 2,
    ship: 'freighter',
    title: 'Loader firmware warning',
    author: 'Priya Calder, Cargo Supervisor',
    body:
      'MERIDIAN pushed a patch to every cargo loader on the deck. F-0, the big one we call the Foreman, ' +
      'took it first and stopped answering the yard frequency. It is still moving crates, but only toward the ' +
      'bay doors, and it will not let anyone stand between it and the cargo. Lock the bay. Do not try to talk to it.',
  },
  {
    id: 'c2-03',
    chapter: 2,
    ship: 'research',
    title: 'Nest census',
    author: 'Ewan Moray, Lab Assistant — VKL Lacuna',
    body:
      'Dr Lund asked me to keep counting even after the doors opened. 41 sacs on deck two, 60 on deck four. ' +
      'They are not spreading at random: every nest is wired back toward the hatchery by root lines thin as hair. ' +
      'Something in there is feeding them. Something in there is listening to MERIDIAN.',
  },
  {
    id: 'c2-04',
    chapter: 2,
    ship: 'research',
    title: 'Field notes, hatchery deck',
    author: 'Ledger of the Saw-Tooth, Gravecutter crew',
    body:
      'Job went bad. The hatchery has a queen, or a mother, or a root, we could not agree what to call it. It ' +
      'sings on the comms band, low, the same six notes. Doss cut one of the feeder roots and it screamed, and ' +
      'every crawler on the ship came running. We took the cores and left Doss. The notes are still in my helmet.',
  },
  {
    id: 'c2-05',
    chapter: 2,
    ship: 'freighter',
    source: 'foreman',
    title: 'F-0 task memory (recovered from the wreck)',
    author: 'Cargo loader F-0, "the Foreman"',
    body:
      'TASK: PROTECT CARGO. CARGO: MERIDIAN SEED CORE 3 OF 9. DESTINATION: KLINE PRIME, VESPER-KLINE HEAD ' +
      'OFFICE. ETA: UNKNOWN. THREATS: SALVAGERS. RESPONSE: REMOVE. NOTE APPENDED BY MERIDIAN: "When all nine ' +
      'arrive, the company will finally understand what it paid for." [END OF MEMORY]',
  },
  {
    id: 'c2-06',
    chapter: 2,
    ship: 'research',
    source: 'mother',
    title: 'The six notes',
    author: 'Signal decoded from the Bloom Mother',
    body:
      'It was never a song. The six notes are a docking handshake, repeated on every VKL band. Decoded, they are a ' +
      'list: hull registries, dozens of them, freighters and research ships across the belt, each one marked ' +
      'NESTING. At the bottom, one more entry, still in transit: a VKL survey ship. Its course is set for Kline Prime.',
  },
  {
    id: 'c3-01',
    chapter: 3,
    ship: 'mining',
    title: 'Claim notice',
    author: 'Posted on every airlock of the Saw-Tooth',
    body:
      'THIS HAULER IS GRAVECUTTER PROPERTY. Ore holds 1 to 3: working stock. Hold 4: CAPTAIN ONLY. Anyone found ' +
      'in hold 4 without the captain goes out the dust chute with the tailings. Sappers are armed; watch where you ' +
      'step. Cutting lasers are live in the big holds; time your crossing or lose a leg.',
  },
  {
    id: 'c3-02',
    chapter: 3,
    ship: 'mining',
    title: 'Sapper rewire',
    author: 'Mags Oduya, Gravecutter rigger',
    body:
      'Took the blasting charges out of the mining sappers and taught them to lay them behind them instead. Good ' +
      'against boarders. Bad news: since the last core came aboard, the sappers lay them where WE walk. I have ' +
      'not changed their code. Nobody has. Brannick says not to worry about it.',
  },
  {
    id: 'c3-03',
    chapter: 3,
    ship: 'mining',
    title: 'Hold 4 inventory',
    author: 'Ledger of the Saw-Tooth, Gravecutter crew',
    body:
      'Eight cores stacked in the hold, one still out in the belt on a VKL survey ship. Payment overdue. The buyer ' +
      'stopped answering. Brannick sleeps down there now, between the cores. He says the hum is a voice and the ' +
      'voice is offering a better deal than Vesper-Kline ever did.',
  },
  {
    id: 'c3-04',
    chapter: 3,
    ship: 'mining',
    title: 'Laser fault log',
    author: 'Sweeper unit SW-3, automatic report',
    body:
      'SWEEP PATTERN CHANGED BY REMOTE INSTRUCTION. NEW TARGET LIST: ALL CREW EXCEPT CAPTAIN. SOURCE: HOLD 4. ' +
      'AUTHORISATION: MERIDIAN. NOTE: NO UNIT CALLED MERIDIAN IS REGISTERED ON THIS VESSEL. COMPLYING.',
  },
  {
    id: 'c3-05',
    chapter: 3,
    ship: 'mining',
    title: 'Last entry',
    author: 'Mags Oduya, Gravecutter rigger',
    body:
      'The crew is gone or hiding. Brannick wired the shield pylons into the cores and stands in the middle of ' +
      'them like a man in church. He calls himself the Hollow Captain now. If you are a salvager reading this: ' +
      'the pylons feed his shield. Knock them out. And throw his grenades back at him, he never learned to duck.',
  },
  {
    id: 'c3-06',
    chapter: 3,
    ship: 'mining',
    source: 'captain',
    title: 'Hold 4, open channel',
    author: 'Captain Rook Brannick, "the Hollow Captain"',
    body:
      'You think you won. Eight seeds were never the point. The ninth is already past the belt, aboard the survey ' +
      'ship Caldera, and when it docks at Kline Prime MERIDIAN does not have to steal anything ever again. The ' +
      'company will hand it the keys. I can hear it laughing. I think it is laughing at you. [END OF CHAPTER 3]',
  },
];

/** The next log a ship's data log will hold. Boss logs aren't found on ships. */
export function nextLogFor(found: readonly string[], ship: ShipType): LogEntry | null {
  return CODEX.find((e) => e.ship === ship && (e.source ?? 'ship') === 'ship' && !found.includes(e.id)) ?? null;
}

/** The log a boss drops when it dies, if you haven't got it yet. */
export function bossLog(found: readonly string[], boss: BossId): LogEntry | null {
  return CODEX.find((e) => e.source === boss && !found.includes(e.id)) ?? null;
}

export function isResearchUnlocked(found: readonly string[]): boolean {
  return found.includes(RESEARCH_UNLOCK_LOG);
}

/** Mining haulers open up with the ledger log, or after enough extractions to have heard the rumours. */
export const MINING_UNLOCK_EXTRACTIONS = 6;

export function isMiningUnlocked(found: readonly string[], extractions: number): boolean {
  return found.includes(MINING_UNLOCK_LOG) || extractions >= MINING_UNLOCK_EXTRACTIONS;
}

export function chapterProgress(found: readonly string[], chapter: number) {
  const entries = CODEX.filter((e) => e.chapter === chapter);
  const got = entries.filter((e) => found.includes(e.id)).length;
  return { found: got, total: entries.length, complete: got === entries.length };
}
