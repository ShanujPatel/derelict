/**
 * First-time tips: short hints shown once each, the first time the situation
 * comes up. Which ones you've seen is kept in the save.
 */
export type TipId = 'salvage' | 'oxygen-low' | 'weak-wall' | 'hostile' | 'exit' | 'drum' | 'scanner' | 'datalog' | 'medkit' | 'shock' | 'lift';

export type ControlScheme = 'keyboard' | 'touch' | 'pad';

interface Tip {
  id: TipId;
  text: Record<ControlScheme, string> | string;
}

export const TIPS: Record<TipId, Tip> = {
  salvage: { id: 'salvage', text: 'Salvage only counts if you make it out. Grab what you can, then find the exit.' },
  'oxygen-low': {
    id: 'oxygen-low',
    text: 'Running low! Grab O₂ canisters (or power cells) or head for the exit: when it runs out you start to suffocate.',
  },
  'weak-wall': {
    id: 'weak-wall',
    text: {
      keyboard: 'Cracked wall ahead: face it and press F to cut a shortcut with your torch.',
      touch: 'Cracked wall ahead: face it and tap TORCH to cut a shortcut.',
      pad: 'Cracked wall ahead: face it and press X to cut a shortcut.',
    },
  },
  hostile: {
    id: 'hostile',
    text: {
      keyboard: "Hostile spotted! Shoot it, or roll through its attacks with Shift: you can't be hit mid-roll.",
      touch: "Hostile spotted! Push the right stick to shoot; tap ROLL to dodge (you can't be hit mid-roll).",
      pad: "Hostile spotted! Pull RT to shoot; press A to roll (you can't be hit mid-roll).",
    },
  },
  exit: { id: 'exit', text: "That green pad is the exit. Step on it whenever you're ready to bank your salvage." },
  drum: { id: 'drum', text: 'Red fuel drum: two hits and it blows, hurting everything nearby. Stand well clear.' },
  scanner: {
    id: 'scanner',
    text: {
      keyboard: 'Lost? Tab opens the scanner map: it fills in as you explore.',
      touch: 'Lost? Tap MAP to open the scanner: it fills in as you explore.',
      pad: 'Lost? Press Back to open the scanner map.',
    },
  },
  datalog: { id: 'datalog', text: 'A data log: a piece of the story. You keep logs even if you die. Read them in the hub under LOG.' },
  lift: {
    id: 'lift',
    text: 'Purple pad: a lift to a deeper deck. You keep everything you carry; deeper is richer but nastier. The green exit banks it.',
  },
  shock: { id: 'shock', text: 'Shock floor: it flickers, then goes live. Cross while it is dark, or roll over it. Crawlers fry on it too.' },
  medkit: { id: 'medkit', text: "Health pack. Walk over it when you're hurt; at full health it stays put for later." },
};

export const TIP_IDS = Object.keys(TIPS) as TipId[];

export function tipText(id: TipId, scheme: ControlScheme): string {
  const t = TIPS[id].text;
  return typeof t === 'string' ? t : t[scheme];
}

/** The tip to show now, if any: the first triggered one you haven't seen. */
export function nextTip(triggered: readonly TipId[], seen: readonly string[]): TipId | null {
  return triggered.find((id) => !seen.includes(id)) ?? null;
}
