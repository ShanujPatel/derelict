import { describe, expect, it, vi } from 'vitest';
import { CALLSIGN_PATTERN } from '../src/core/leaderboard';
import { NAME_SPACE, isPlaceholderName, randomName } from '../src/core/names';
import { createRng } from '../src/core/rng';
import { defaultSave, exportSave, importSave, sanitizeSave, type SaveData } from '../src/core/progression';
import { createLeaderboardClient } from '../src/net/leaderboard';
import { chooseName, ensureName, rollName } from '../src/net/names';

const PLAYER = '123e4567-e89b-42d3-a456-426614174000';
const save = (patch: Partial<SaveData> = {}): SaveData => ({ ...defaultSave(), playerId: PLAYER, callsign: 'NYX HARROW', ...patch });

/** A fake leaderboard where some names are already owned by other players. */
const fakeBoard = (taken: string[] = [], opts: { down?: boolean } = {}) => {
  const owned = new Set(taken);
  return {
    enabled: true,
    claimName: vi.fn(async (_player: string, name: string) => {
      if (opts.down) throw new Error('Leaderboard unreachable');
      return !owned.has(name);
    }),
  };
};
const offline = { enabled: false, claimName: vi.fn() };

describe('random names', () => {
  it('always fit the leaderboard rules', () => {
    const rng = createRng(7);
    for (let i = 0; i < 2000; i++) expect(randomName(() => rng.next())).toMatch(CALLSIGN_PATTERN);
  });

  it('are varied enough that clashes are rare', () => {
    const rng = createRng(42);
    const names = new Set(Array.from({ length: 500 }, () => randomName(() => rng.next())));
    expect(names.size).toBeGreaterThan(450);
    expect(NAME_SPACE).toBeGreaterThan(4000);
  });

  it('spots the old SALVAGER-0000 placeholders', () => {
    expect(isPlaceholderName('SALVAGER-0421')).toBe(true);
    expect(isPlaceholderName('SALVAGER JOE')).toBe(false);
  });
});

describe('choosing a name', () => {
  it('claims a free name', async () => {
    const board = fakeBoard();
    const r = await chooseName(save(), '  cold  comet ', board);
    expect(r.ok && r.save.callsign).toBe('COLD COMET');
    expect(r.save.callsignClaimed).toBe('COLD COMET');
    expect(board.claimName).toHaveBeenCalledWith(PLAYER, 'COLD COMET');
  });

  it("refuses a name someone else has and keeps yours", async () => {
    const r = await chooseName(save(), 'ace', fakeBoard(['ACE']));
    expect(r).toMatchObject({ ok: false, reason: 'ACE is taken' });
    expect(r.save.callsign).toBe('NYX HARROW');
  });

  it('refuses invalid names without asking the server', async () => {
    const board = fakeBoard();
    expect((await chooseName(save(), '<b>', board)).ok).toBe(false);
    expect(board.claimName).not.toHaveBeenCalled();
  });

  it('keeps the name unconfirmed when the board is unreachable', async () => {
    const r = await chooseName(save(), 'rust moth', fakeBoard([], { down: true }));
    expect(r).toMatchObject({ ok: true, offline: true });
    expect(r.save.callsign).toBe('RUST MOTH');
    expect(r.save.callsignClaimed).toBe('');
  });

  it('just saves it when there is no leaderboard', async () => {
    const r = await chooseName(save(), 'vex', offline);
    expect(r.save.callsign).toBe('VEX');
  });
});

describe('random name button', () => {
  it('skips names that are taken', async () => {
    const rng = createRng(3);
    const firstTwo = (() => {
      const peek = createRng(3);
      return [randomName(() => peek.next()), randomName(() => peek.next())];
    })();
    const board = fakeBoard([firstTwo[0]]);
    const r = await rollName(save(), board, () => rng.next());
    expect(r.ok).toBe(true);
    expect(r.save.callsign).not.toBe(firstTwo[0]);
    expect(r.save.callsign).toBe(r.save.callsignClaimed);
  });
});

describe('checking your name when the hub opens', () => {
  it('does nothing once the name is confirmed', async () => {
    const board = fakeBoard();
    const s = save({ callsignClaimed: 'NYX HARROW' });
    expect((await ensureName(s, board)).save).toBe(s);
    expect(board.claimName).not.toHaveBeenCalled();
  });

  it('confirms a free name', async () => {
    const r = await ensureName(save(), fakeBoard());
    expect(r.save.callsignClaimed).toBe('NYX HARROW');
    expect(r.renamedFrom).toBeUndefined();
  });

  it('gives you a new name if yours was taken', async () => {
    const r = await ensureName(save(), fakeBoard(['NYX HARROW']));
    expect(r.renamedFrom).toBe('NYX HARROW');
    expect(r.save.callsign).not.toBe('NYX HARROW');
    expect(r.save.callsignClaimed).toBe(r.save.callsign);
  });

  it('leaves things alone when offline', async () => {
    const s = save();
    expect((await ensureName(s, fakeBoard([], { down: true }))).save).toBe(s);
  });
});

describe('saves', () => {
  it('keep the confirmed name through sanitising and save codes', () => {
    const s = save({ callsignClaimed: 'NYX HARROW' });
    expect(sanitizeSave(JSON.parse(JSON.stringify(s))).callsignClaimed).toBe('NYX HARROW');
    expect(importSave(exportSave(s))?.callsignClaimed).toBe('NYX HARROW');
    expect(sanitizeSave({ ...s, callsignClaimed: '<script>' }).callsignClaimed).toBe('');
  });
});

describe('leaderboard client: names', () => {
  it('calls claim_callsign and reads the yes/no answer', async () => {
    const fetchMock = vi.fn(async () => new Response('false', { status: 200 }));
    const c = createLeaderboardClient({ url: 'https://x.supabase.co', key: 'sb_publishable_abc' }, fetchMock);
    await expect(c.claimName(PLAYER, 'ACE')).resolves.toBe(false);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/rest/v1/rpc/claim_callsign');
    expect(JSON.parse(init.body as string)).toEqual({ p_player: PLAYER, p_callsign: 'ACE' });
  });
});
