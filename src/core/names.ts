import { CALLSIGN_PATTERN } from './leaderboard';

/**
 * Random sci-fi names for new players, e.g. "NYX HARROW", "COLD COMET",
 * "VOSS-27". Every name fits the leaderboard's callsign rules. The server
 * makes sure no two players hold the same one.
 */
const FIRST = [
  'ASH', 'CASS', 'CYRA', 'DEX', 'ECHO', 'ENZO', 'FINN', 'HOLT', 'IKE', 'JAX',
  'JUNO', 'KAI', 'KIRA', 'LEX', 'LYRA', 'MIRA', 'NOVA', 'NYX', 'ODA', 'ORION',
  'PIKE', 'QUILL', 'REX', 'RHEA', 'RIGG', 'SABLE', 'SOL', 'TAL', 'TESS', 'ULA',
  'VEGA', 'VEX', 'VOLK', 'WREN', 'YURI', 'ZARA', 'ZEPH', 'ARLO', 'BRAM', 'CORA',
] as const;

const LAST = [
  'ASHFORD', 'BRAND', 'CALLOWAY', 'CROSS', 'DRAKE', 'DUNMORE', 'HALE', 'HARROW', 'IBARRA', 'KADE',
  'KANE', 'KESSLER', 'MBEKI', 'MORROW', 'NAKAMURA', 'OKAFOR', 'QUARRY', 'RASK', 'REYES', 'ROOK',
  'SATO', 'STARKE', 'STROM', 'THORNE', 'VANCE', 'VOLKOV', 'VOSS', 'WEBB', 'YORKE', 'ZHAO',
] as const;

const ADJECTIVE = [
  'COLD', 'DARK', 'DEEP', 'DUST', 'GHOST', 'GREY', 'HOLLOW', 'IRON', 'LAST', 'LONE',
  'NULL', 'QUIET', 'RED', 'RUST', 'SILENT', 'STATIC', 'STRAY', 'VOID', 'WILD', 'ZERO',
] as const;

const NOUN = [
  'ANCHOR', 'COMET', 'DRIFTER', 'EMBER', 'HALO', 'HAWK', 'KESTREL', 'LANTERN', 'MOTH', 'NOMAD',
  'ORBIT', 'PILOT', 'QUASAR', 'RAVEN', 'SIGNAL', 'SPARROW', 'TALON', 'VAGRANT', 'VECTOR', 'WRAITH',
] as const;

const pick = <T>(list: readonly T[], random: () => number): T => list[Math.floor(random() * list.length) % list.length];

/** One random name. Call again if the server says it's taken. */
export function randomName(random: () => number = Math.random): string {
  for (;;) {
    const style = random();
    const name =
      style < 0.5
        ? `${pick(FIRST, random)} ${pick(LAST, random)}`
        : style < 0.8
          ? `${pick(ADJECTIVE, random)} ${pick(NOUN, random)}`
          : `${pick(LAST, random)}-${String(Math.floor(random() * 100)).padStart(2, '0')}`;
    if (CALLSIGN_PATTERN.test(name)) return name;
  }
}

/** How many different names the generator can make. */
export const NAME_SPACE = FIRST.length * LAST.length + ADJECTIVE.length * NOUN.length + LAST.length * 100;

/** Names from before v0.5.1 ("SALVAGER-0421") were placeholders, not chosen by the player. */
export const isPlaceholderName = (name: string) => /^SALVAGER-\d{4}$/.test(name);
