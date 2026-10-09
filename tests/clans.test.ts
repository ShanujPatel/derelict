import { describe, expect, it, vi } from 'vitest';
import { CLAN, checkClanName, checkClanTag, clanGoal, clanNameBlocked, parseMyClan, withTag } from '../src/core/clans';
import { claimClanGoal, defaultSave, sanitizeSave, setClanCache } from '../src/core/progression';
import { createLeaderboardClient } from '../src/net/leaderboard';
import SQL from '../docs/supabase.sql?raw';

const PLAYER = '123e4567-e89b-42d3-a456-426614174000';
const config = { url: 'https://x.supabase.co', key: 'sb_publishable_abc' };
const reply = (body: unknown) => new Response(body === null ? null : JSON.stringify(body), { status: body === null ? 204 : 200 });

describe('clan rules', () => {
  it('match the database limits', () => {
    expect(CLAN.maxMembers).toBe(15);
    expect(SQL).toContain('>= 15');
    expect(SQL).toContain(`interval '1 day'`);
    expect(CLAN.rejoinHours).toBe(24);
  });

  it('tidy and check names and tags', () => {
    expect(checkClanName('  Rust   Raiders ')).toEqual({ ok: true, value: 'Rust Raiders' });
    expect(checkClanName('ab').ok).toBe(false);
    expect(checkClanName('a'.repeat(21)).ok).toBe(false);
    expect(checkClanName('Crew <script>').ok).toBe(false);
    expect(checkClanTag(' rst ')).toEqual({ ok: true, value: 'RST' });
    expect(checkClanTag('R').ok).toBe(false);
    expect(checkClanTag('RUST1').ok).toBe(false);
    expect(clanNameBlocked('S.h.i.t crew')).toBe(true);
    expect(checkClanName('Sh1t Crew').ok).toBe(true); // a light filter, like the database's
  });

  it('scales the weekly goal with the crew', () => {
    expect(clanGoal(1)).toBe(CLAN.goalMinimum);
    expect(clanGoal(10)).toBe(25_000);
    expect(withTag('NOVA', 'RUST')).toBe('[RUST] NOVA');
    expect(withTag('NOVA', null)).toBe('NOVA');
  });

  it('pays the goal bonus once a week and keeps the clan in the save', () => {
    let s = defaultSave();
    const credits = s.credits;
    const first = claimClanGoal(s, '2026-W41', 100);
    expect(first.paid).toBe(true);
    expect(first.save.credits).toBe(credits + 100);
    expect(claimClanGoal(first.save, '2026-W41', 100).paid).toBe(false);
    expect(claimClanGoal(first.save, '2026-W42', 100).paid).toBe(true);
    s = setClanCache(first.save, { tag: 'RUST', name: 'Rust Raiders' });
    const back = sanitizeSave(JSON.parse(JSON.stringify(s)));
    expect(back.clan).toEqual({ tag: 'RUST', name: 'Rust Raiders' });
    expect(back.clanGoalWeek).toBe('2026-W41');
    expect(setClanCache(back, { tag: 'RUST', name: 'Rust Raiders' })).toBe(back);
    expect(sanitizeSave({ clan: { tag: 'lower', name: 'x' } }).clan).toBeNull();
  });

  it('reads the clan the database returns', () => {
    const c = parseMyClan({ id: '7', name: 'Rust', tag: 'RUST', open: false, inviteCode: 'RUST-7KQ2', isLeader: true, weekSalvage: '300', weekRank: '2', lastWeekRank: null, members: [{ callsign: 'NOVA', leader: true, you: true, weekSalvage: '300', allSalvage: '900', runs: 4 }] });
    expect(c).toMatchObject({ id: 7, weekSalvage: 300, weekRank: 2, lastWeekRank: null, members: [{ callsign: 'NOVA', allSalvage: 900 }] });
    expect(parseMyClan(null)).toBeNull();
    expect(parseMyClan([])).toBeNull();
    expect(parseMyClan({})).toBeNull();
  });
});

describe('clan client', () => {
  it('creates, joins, manages, leaves and reads boards', async () => {
    const clan = { id: 1, name: 'Rust', tag: 'RUST', open: true, inviteCode: 'RUST-7KQ2', isLeader: true, members: [] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(clan))
      .mockResolvedValueOnce(reply(clan))
      .mockResolvedValueOnce(reply({ ...clan, open: false }))
      .mockResolvedValueOnce(reply(null))
      .mockResolvedValueOnce(reply([{ rank: 1, clan_id: 1, name: 'Rust', tag: 'RUST', members: 3, is_open: true, salvage: '900', runs: 5, bosses: 1, is_yours: true }]))
      .mockResolvedValueOnce(reply([{ clan_id: 1, name: 'Rust', tag: 'RUST', members: 3, week_salvage: 900 }]))
      .mockResolvedValueOnce(reply([{ callsign: 'NOVA', tag: 'RUST' }]))
      .mockResolvedValueOnce(reply({ tag: 'RUST', name: 'Rust', added: 120, weekSalvage: 1020, weekRank: 1 }));
    const c = createLeaderboardClient(config, fetchMock);
    const body = (i: number) => JSON.parse((fetchMock.mock.calls[i][1] as RequestInit).body as string);
    const url = (i: number) => fetchMock.mock.calls[i][0] as string;

    await c.createClan(PLAYER, ' Rust ', 'rust', true);
    expect(url(0)).toMatch(/create_clan$/);
    expect(body(0)).toEqual({ p_player: PLAYER, p_name: 'Rust', p_tag: 'RUST', p_open: true });
    await c.joinClan(PLAYER, { code: ' rust-7kq2 ' });
    expect(body(1)).toEqual({ p_player: PLAYER, p_code: 'rust-7kq2', p_clan: null });
    expect((await c.manageClan(PLAYER, { kind: 'open', open: false })).open).toBe(false);
    expect(body(2)).toEqual({ p_player: PLAYER, p_action: 'open', p_target: null, p_open: false });
    await c.leaveClan(PLAYER);
    expect((await c.clanBoard('week', PLAYER))[0]).toMatchObject({ tag: 'RUST', salvage: 900, isYours: true });
    expect((await c.browseClans())[0]).toMatchObject({ id: 1, weekSalvage: 900 });
    expect(await c.clanTags(['NOVA', 'NOVA', 'ACE'])).toEqual({ NOVA: 'RUST' });
    expect(body(6)).toEqual({ p_callsigns: ['NOVA', 'ACE'] });
    const added = await c.submitRun(PLAYER, {
      extracted: true, salvage: 120, durationMs: 120_000, depth: 1, kills: {}, elites: 0, bounties: 0, boss: null, bossMs: null,
    });
    expect(added).toMatchObject({ tag: 'RUST', added: 120, weekRank: 1 });
  });

  it('refuses bad names before sending', async () => {
    const fetchMock = vi.fn();
    const c = createLeaderboardClient(config, fetchMock);
    await expect(c.createClan(PLAYER, 'x', 'RU', true)).rejects.toThrow('Clan name');
    await expect(c.createClan(PLAYER, 'Rust', 'R', true)).rejects.toThrow('Tag');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
