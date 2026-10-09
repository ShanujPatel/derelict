import { describe, expect, it } from 'vitest';
import { generateDeck } from '../src/core/deckGenerator';
import {
  SCORE_LIMITS,
  checkSubmission,
  cleanCallsign,
  dayFromDailySeed,
  formatDuration,
  type ScoreSubmission,
} from '../src/core/leaderboard';
import { bfsDistances, findPath, nearestByWalking } from '../src/core/pathing';
import { defaultSave, recordDaily, sanitizeSave, setCallsign } from '../src/core/progression';
import { GRAV_RANGE, hitsShield, inGravCone, rivalEvent } from '../src/core/rivals';
import { Tile } from '../src/core/types';

const grid = (rows: string[]): Tile[][] => rows.map((r) => [...r].map((c) => (c === '.' ? Tile.Floor : Tile.Wall)));

describe('findPath', () => {
  const tiles = grid([
    '#######',
    '#...#.#',
    '#.#.#.#',
    '#.#...#',
    '#######',
  ]);

  it('walks round walls one step at a time', () => {
    const path = findPath(tiles, { x: 1, y: 1 }, { x: 5, y: 1 })!;
    expect(path).toHaveLength(8);
    expect(path.at(-1)).toEqual({ x: 5, y: 1 });
    let prev = { x: 1, y: 1 };
    for (const p of path) {
      expect(Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y)).toBe(1);
      expect(tiles[p.y][p.x]).toBe(Tile.Floor);
      prev = p;
    }
  });

  it('returns [] when already there and null when blocked', () => {
    expect(findPath(tiles, { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([]);
    expect(findPath(tiles, { x: 1, y: 1 }, { x: 2, y: 2 })).toBeNull();
  });

  it('matches BFS distance on real decks', () => {
    for (const seed of ['p1', 'p2', 'p3']) {
      const deck = generateDeck(seed, 'research');
      const path = findPath(deck.tiles, deck.start, deck.extraction)!;
      expect(path.length).toBe(bfsDistances(deck.tiles, deck.start)[deck.extraction.y][deck.extraction.x]);
    }
  });

  it('nearestByWalking prefers the shorter walk over the closer straight line', () => {
    // Target 0 is 2 tiles away as the crow flies but behind a wall; target 1 is 3 steps away.
    const t = grid(['#####', '#.#.#', '#...#', '#####']);
    expect(nearestByWalking(t, { x: 1, y: 1 }, [{ x: 3, y: 1 }, { x: 1, y: 2 }])).toEqual({ index: 1, steps: 1 });
    expect(nearestByWalking(t, { x: 1, y: 1 }, [])).toBeNull();
  });
});

describe('rivalEvent', () => {
  it('is deterministic and arrives 45–75s in', () => {
    expect(rivalEvent('daily-2026-10-09', 'freighter')).toEqual(rivalEvent('daily-2026-10-09', 'freighter'));
    for (let i = 0; i < 50; i++) {
      const e = rivalEvent(`s${i}`, i % 2 ? 'research' : 'freighter');
      expect(e.arrivesAfter).toBeGreaterThanOrEqual(45);
      expect(e.arrivesAfter).toBeLessThanOrEqual(75);
      expect(e.party).toContain('brute');
      expect(e.party.filter((k) => k === 'raider').length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('hitsShield', () => {
  it('blocks shots from the front only', () => {
    // Brute faces right (0). A bullet flying left (PI) is coming at its front.
    expect(hitsShield(0, Math.PI, false)).toBe(true);
    // A bullet flying right hits it from behind.
    expect(hitsShield(0, 0, false)).toBe(false);
    // From the side.
    expect(hitsShield(0, Math.PI / 2, false)).toBe(false);
  });

  it('lets piercing shots through', () => {
    expect(hitsShield(0, Math.PI, true)).toBe(false);
  });
});

describe('inGravCone', () => {
  it('covers a cone in front of the player', () => {
    expect(inGravCone(0, 0, 0, 50, 0)).toBe(true);
    expect(inGravCone(0, 0, 0, 50, 20)).toBe(true);
    expect(inGravCone(0, 0, 0, -50, 0)).toBe(false);
    expect(inGravCone(0, 0, 0, 0, 50)).toBe(false);
    expect(inGravCone(0, 0, 0, GRAV_RANGE + 1, 0)).toBe(false);
  });
});

describe('leaderboard rules', () => {
  const ok: ScoreSubmission = {
    day: '2026-10-09',
    seed: 'daily-2026-10-09',
    ship: 'freighter',
    callsign: 'ACE',
    score: 240,
    kills: 7,
    durationMs: 180_000,
    character: 'salvager',
    playerId: '123e4567-e89b-42d3-a456-426614174000',
  };

  it('accepts a normal run', () => {
    expect(checkSubmission(ok)).toEqual({ ok: true });
  });

  it.each([
    [{ seed: 'ABC123' }, 'Not a daily seed'],
    [{ day: '2026-10-08' }, 'Not a daily seed'],
    [{ callsign: 'x' }, 'Invalid callsign'],
    [{ callsign: '<script>' }, 'Invalid callsign'],
    [{ playerId: 'nope' }, 'Invalid player id'],
    [{ score: -1 }, 'Score out of range'],
    [{ score: 2.5 }, 'Score out of range'],
    [{ score: SCORE_LIMITS.maxScore + 1, durationMs: 3_600_000 }, 'Score out of range'],
    [{ durationMs: 5_000 }, 'Run length out of range'],
    [{ score: 900, durationMs: 30_000 }, 'Score too fast'],
  ] as [Partial<ScoreSubmission>, string][])('rejects %o', (patch, reason) => {
    expect(checkSubmission({ ...ok, ...patch })).toEqual({ ok: false, reason });
  });

  it('cleans callsigns', () => {
    expect(cleanCallsign('  ace   pilot ')).toBe('ACE PILOT');
    expect(cleanCallsign('ab')).toBeNull();
    expect(cleanCallsign('a'.repeat(17))).toBeNull();
    expect(cleanCallsign('ok_name-1')).toBe('OK_NAME-1');
  });

  it('reads the day from daily seeds only', () => {
    expect(dayFromDailySeed('daily-2026-10-09')).toBe('2026-10-09');
    expect(dayFromDailySeed('HULK42')).toBeNull();
  });

  it('formats run times', () => {
    expect(formatDuration(65_400)).toBe('1:05');
    expect(formatDuration(0)).toBe('0:00');
  });
});

describe('save: callsign and daily best', () => {
  it('only accepts valid callsigns', () => {
    const s = defaultSave();
    expect(setCallsign(s, 'nova').callsign).toBe('NOVA');
    expect(setCallsign(s, '!!')).toBe(s);
  });

  it('keeps the best score per day and resets on a new day', () => {
    let s = recordDaily(defaultSave(), '2026-10-09', 120);
    s = recordDaily(s, '2026-10-09', 80);
    expect(s.daily).toEqual({ day: '2026-10-09', best: 120 });
    s = recordDaily(s, '2026-10-10', 40);
    expect(s.daily).toEqual({ day: '2026-10-10', best: 40 });
  });

  it('sanitises identity fields', () => {
    const s = sanitizeSave({ playerId: 'bad', callsign: '<b>', daily: { day: 'x', best: 5 } });
    expect(s.playerId).toBe('');
    expect(s.callsign).toBe('');
    expect(s.daily).toEqual({ day: '', best: 0 });
    const good = sanitizeSave({ playerId: '123e4567-e89b-42d3-a456-426614174000', callsign: 'nova', daily: { day: '2026-10-09', best: 50 } });
    expect(good.callsign).toBe('NOVA');
    expect(good.daily.best).toBe(50);
  });
});
