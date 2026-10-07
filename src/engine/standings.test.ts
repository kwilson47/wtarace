import { describe, expect, it } from 'vitest';
import { compareEntries, projectStandings, type RankEntry } from './standings';
import { pickKey } from './types';
import { rawSeason, season } from '../test/fixtures';
import { parseOrThrow, type Result, type Rules } from '../data/schema';

const { tournaments, rules } = season;
const res = (tournamentId: string, points: number, round = 'W'): Result => ({ tournamentId, round, points });
const entry = (id: string, name: string, counted: Result[], dropped: Result[] = []): RankEntry => ({
  id, name, race: { total: counted.reduce((s, r) => s + r.points, 0), counted, dropped },
});
const withTiebreakers = (tiebreakers: Rules['tiebreakers']): Rules => ({ ...rules, tiebreakers });

describe('compareEntries', () => {
  it('ranks a higher total first', () => {
    expect(compareEntries(entry('a', 'A', [res('c500', 200)]), entry('b', 'B', [res('c500', 100)]), tournaments, rules)).toBeLessThan(0);
  });

  it('breaks ties by mostMandatoryPoints', () => {
    const a = entry('a', 'A', [res('slam', 100), res('c500', 100)]);
    const b = entry('b', 'B', [res('c250', 100), res('c500', 100)]);
    expect(compareEntries(b, a, tournaments, withTiebreakers(['mostMandatoryPoints']))).toBeGreaterThan(0);
  });

  it('breaks ties by highestSingleResult', () => {
    const a = entry('a', 'A', [res('c500', 150), res('c250', 50)]);
    const b = entry('b', 'B', [res('c500', 100), res('c250', 100)]);
    expect(compareEntries(b, a, tournaments, withTiebreakers(['highestSingleResult']))).toBeGreaterThan(0);
  });

  it('breaks ties by fewestResults, ignoring zero-pointers', () => {
    const a = entry('a', 'A', [res('c500', 100), res('slam', 0, 'ZP')]);
    const b = entry('b', 'B', [res('c500', 50), res('c250', 50)]);
    expect(compareEntries(b, a, tournaments, withTiebreakers(['fewestResults']))).toBeGreaterThan(0);
  });

  it('breaks ties by name', () => {
    const zed = entry('a', 'Zed', [res('c500', 100)]);
    const amy = entry('b', 'Amy', [res('c500', 100)]);
    expect(compareEntries(zed, amy, tournaments, withTiebreakers(['name']))).toBeGreaterThan(0);
  });

  it('falls back to id when every criterion ties', () => {
    const x = entry('x', 'Same', [res('c500', 100)]);
    const y = entry('y', 'Same', [res('c500', 100)]);
    expect(compareEntries(y, x, tournaments, withTiebreakers(['name']))).toBeGreaterThan(0);
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
