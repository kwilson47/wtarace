import { describe, expect, it } from 'vitest';
import { compareEntries, projectStandings, type RankEntry } from './standings';
import { pickKey } from './types';
import { rawSeason, season } from '../test/fixtures';
import { parseOrThrow, type Result, type Rules } from '../data/schema';

const { tournaments, rules } = season;
const res = (tournamentId: string, points: number, round = 'W'): Result => ({ tournamentId, round, points });
const entry = (id: string, counted: Result[]): RankEntry => ({
  id, race: { total: counted.reduce((s, r) => s + r.points, 0), counted, dropped: [] },
});
const withTiebreakers = (tiebreakers: Rules['tiebreakers']): Rules => ({ ...rules, tiebreakers });

describe('compareEntries', () => {
  it('ranks a higher total first', () => {
    expect(compareEntries(entry('a', [res('c500', 200)]), entry('b', [res('c500', 100)]), tournaments, rules)).toBeLessThan(0);
  });

  it('pointsIn sums counted points from the listed categories only', () => {
    // a has more Grand Slam points, b more combined-WTA-1000 points.
    const a = entry('a', [res('slam', 150), res('c500', 50)]);
    const b = entry('b', [res('m1000', 100), res('c500', 100)]);
    expect(compareEntries(a, b, tournaments, withTiebreakers([{ kind: 'pointsIn', categories: ['WTA1000C'] }]))).toBeGreaterThan(0);
  });

  it('highestIn compares the best counted result within the listed categories only', () => {
    // a has the best result overall (slam 150), b the best WTA 500 result.
    const a = entry('a', [res('slam', 150), res('c500', 50)]);
    const b = entry('b', [res('c500', 100), res('c250', 100)]);
    expect(compareEntries(a, b, tournaments, withTiebreakers([{ kind: 'highestIn', categories: ['WTA500'] }]))).toBeGreaterThan(0);
  });

  it('treats no result in the listed categories as 0', () => {
    const a = entry('a', [res('c500', 100)]);
    const b = entry('b', [res('c250', 100)]);
    expect(compareEntries(a, b, tournaments, withTiebreakers([{ kind: 'highestIn', categories: ['WTA250'] }]))).toBeGreaterThan(0);
  });

  it('moves to the next criterion only when the previous one ties', () => {
    const a = entry('a', [res('c500', 120), res('m1000', 40)]);
    const b = entry('b', [res('c500', 120), res('slam', 40)]);
    const r = withTiebreakers([{ kind: 'highestIn', categories: ['WTA500'] }, { kind: 'pointsIn', categories: ['WTA1000C'] }]);
    expect(compareEntries(a, b, tournaments, r)).toBeLessThan(0);
    expect(compareEntries(b, a, tournaments, r)).toBeGreaterThan(0);
  });

  it('falls back to id when every criterion ties', () => {
    const x = entry('x', [res('c500', 100)]);
    const y = entry('y', [res('c500', 100)]);
    expect(compareEntries(y, x, tournaments, rules)).toBeGreaterThan(0);
  });
});

describe('projectStandings', () => {
  it('equals the current race when there are no picks', () => {
    const rows = projectStandings(season.players, {}, tournaments, rules);
    expect(rows.map((r) => [r.playerId, r.currentRank, r.projectedRank, r.currentTotal, r.projectedTotal, r.delta, r.rankChange])).toEqual([
      ['ana', 1, 1, 1160, 1160, 0, 0],
      ['bea', 2, 2, 765, 765, 0, 0],
      ['cat', 3, 3, 140, 140, 0, 0],
    ]);
    expect(rows[0]!.qualified).toBe(true);
    expect(rows[0]!.country).toBe('ES');
  });

  it('reorders by projected totals and reports deltas and rank changes', () => {
    const raw = rawSeason();
    raw.tournaments = raw.tournaments.map((t) => (t.id === 'clash' ? { ...t, category: 'GS', drawType: 'gs128' } : t));
    const s = parseOrThrow(raw);
    // cat: mandatory 0 + 40 + 1000, plus best optional (100) = 1140.
    const rows = projectStandings(s.players, { [pickKey('cat', 'clash')]: 'W' }, s.tournaments, s.rules);
    expect(rows.map((r) => r.playerId)).toEqual(['ana', 'cat', 'bea']);
    const cat = rows.find((r) => r.playerId === 'cat')!;
    expect(cat).toMatchObject({ currentRank: 3, projectedRank: 2, rankChange: 1, projectedTotal: 1140, delta: 1000 });
    expect(rows.find((r) => r.playerId === 'bea')!.rankChange).toBe(-1);
  });

  it('ranks exact ties the same way regardless of input order', () => {
    const raw = rawSeason();
    const shared = [res('slam', 640, 'F'), res('m1000', 100), res('c500', 20, 'SF')];
    for (const p of raw.players.filter((p) => p.id !== 'ana')) {
      p.results = shared.map((r) => ({ ...r }));
      p.live = [];
      p.officialRaceTotal = 760;
    }
    const s = parseOrThrow(raw);
    const order = (players: typeof s.players) =>
      projectStandings(players, {}, s.tournaments, s.rules).map((r) => [r.playerId, r.projectedRank]);
    expect(order(s.players)).toEqual([['ana', 1], ['bea', 2], ['cat', 3]]);
    expect(order([...s.players].reverse())).toEqual([['ana', 1], ['bea', 2], ['cat', 3]]);
  });
});
