import { cleanCallsign } from '../core/leaderboard';
import { randomName } from '../core/names';
import { setCallsign, setClaimedName, type SaveData } from '../core/progression';
import type { LeaderboardClient } from './leaderboard';

/**
 * Name handling on top of the leaderboard: every name is reserved on the
 * server so no two players share one. Without a leaderboard (local builds)
 * names are just kept in the save.
 */
export type NameResult =
  | { ok: true; save: SaveData; offline?: boolean }
  | { ok: false; save: SaveData; reason: string };

type Claimer = Pick<LeaderboardClient, 'enabled' | 'claimName'>;

const RANDOM_TRIES = 6;

/** Sets a name the player typed. */
export async function chooseName(save: SaveData, raw: string, client: Claimer): Promise<NameResult> {
  const name = cleanCallsign(raw);
  if (!name) return { ok: false, save, reason: 'Names are 3–16 letters, numbers, spaces, - or _' };
  if (name === save.callsignClaimed) return { ok: true, save: setClaimedName(save, name) };
  if (!client.enabled) return { ok: true, save: setCallsign(save, name) };
  try {
    if (!(await client.claimName(save.playerId, name))) return { ok: false, save, reason: `${name} is taken` };
    return { ok: true, save: setClaimedName(save, name) };
  } catch {
    // Keep it for now; it's checked again next time the board is reachable.
    return { ok: true, save: setCallsign(save, name), offline: true };
  }
}

/** Rolls a new random name that nobody else has. */
export async function rollName(save: SaveData, client: Claimer, random: () => number = Math.random): Promise<NameResult> {
  if (!client.enabled) return { ok: true, save: setCallsign(save, randomName(random)) };
  try {
    for (let i = 0; i < RANDOM_TRIES; i++) {
      const name = randomName(random);
      if (name === save.callsign) continue;
      if (await client.claimName(save.playerId, name)) return { ok: true, save: setClaimedName(save, name) };
    }
    return { ok: false, save, reason: 'Couldn’t find a free name, try again' };
  } catch {
    return { ok: false, save, reason: 'Leaderboard unreachable' };
  }
}

/**
 * Makes sure the current name is reserved. Called when the hub opens. If
 * someone else got there first, the player gets a fresh random name.
 */
export async function ensureName(
  save: SaveData,
  client: Claimer,
  random: () => number = Math.random,
): Promise<{ save: SaveData; renamedFrom?: string }> {
  if (!client.enabled || !save.playerId || !save.callsign || save.callsign === save.callsignClaimed) return { save };
  try {
    if (await client.claimName(save.playerId, save.callsign)) return { save: setClaimedName(save, save.callsign) };
  } catch {
    return { save };
  }
  const rolled = await rollName(save, client, random);
  return rolled.ok ? { save: rolled.save, renamedFrom: save.callsign } : { save };
}
