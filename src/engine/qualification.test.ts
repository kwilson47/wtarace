import { describe, expect, it } from 'vitest';
import { selectQualifiers, type QualifierCandidate } from './qualification';
import { projectStandings } from './standings';
import { pickKey, type Scenario } from './types';
import { rawSeason, season } from '../test/fixtures';
import { parseOrThrow, type Rules, type Season } from '../data/schema';

const c = (playerId: string, rank: number, eligible = true, champion = false): QualifierCandidate => ({ playerId, rank, eligible, champion });
const withQualification = (q: Partial<Rules['qualification']>): Rules => ({
  ...season.rules,
  qualification: { ...season.rules.qualification, ...q },
});
const qualifiers = (m: Map<string, string>) => Object.fromEntries([...m.entries()].sort());

describe('selectQualifiers', () => {
  it('takes the top places in rank order when there is no champion place', () => {
    expect(qualifiers(selectQualifiers([c('c', 3), c('a', 1), c('b', 2)], withQualification({ championPlace: null }))))
      .toEqual({ a: 'direct', b: 'direct' });
  });

  it('skips ineligible players', () => {
    expect(qualifiers(selectQualifiers([c('a', 1, false), c('b', 2), c('c', 3)], withQualification({ championPlace: null }))))
      .toEqual({ b: 'direct', c: 'direct' });
  });

  it('gives the last place to the best-ranked eligible champion inside the window', () => {
    expect(qualifiers(selectQualifiers([c('a', 1), c('b', 2), c('c', 3, true, true)], season.rules)))
      .toEqual({ a: 'direct', c: 'champion' });
  });

  it('ignores champions outside the window', () => {
    expect(qualifiers(selectQualifiers([c('a', 1), c('b', 2), c('c', 4, true, true)], season.rules)))
      .toEqual({ a: 'direct', b: 'direct' });
  });

  it('ignores ineligible champions', () => {
    expect(qualifiers(selectQualifiers([c('a', 1), c('b', 2), c('c', 3, false, true)], season.rules)))
      .toEqual({ a: 'direct', b: 'direct' });
  });

  it('does not reserve a place for a champion who already qualified directly', () => {
    expect(qualifiers(selectQualifiers([c('a', 1, true, true), c('b', 2)], season.rules)))
      .toEqual({ a: 'direct', b: 'direct' });
  });
});

describe('projectStandings qualification', () => {
  const rows = (s: Season, scenario: Scenario = {}) =>
    Object.fromEntries(projectStandings(s.players, scenario, s.tournaments, s.rules).map((r) => [r.playerId, [r.eligible, r.projectedQualifier]]));

  it('marks eligibility and projected qualifiers', () => {
    expect(rows(season)).toEqual({ ana: [true, 'direct'], bea: [true, 'direct'], cat: [false, null] });
  });

  it('counts picked events toward the event minimum', () => {
    expect(rows(season, { [pickKey('cat', 'next')]: 'R32' }).cat).toEqual([true, null]);
  });

  it('does not count zero-pointers as events played', () => {
    const raw = rawSeason();
    raw.players[2]!.results.push({ tournamentId: 'c500', round: 'ZP', points: 0 });
    expect(rows(parseOrThrow(raw)).cat).toEqual([false, null]);
  });

  it('honours an event-minimum waiver', () => {
    const raw = rawSeason();
    raw.players[2]!.eventMinimumWaived = true;
    expect(rows(parseOrThrow(raw)).cat).toEqual([true, null]);
  });

  it('gives the last place to a lower-ranked champion', () => {
    const raw = rawSeason();
    // cat: required slam 500 + m1000 40, open c250 100 + c500 1 = 641, below bea's 765.
    raw.players[2]!.results = [
      { tournamentId: 'slam', round: 'W', points: 500 },
      { tournamentId: 'm1000', round: 'F', points: 40 },
      { tournamentId: 'c250', round: 'W', points: 100 },
      { tournamentId: 'c500', round: 'R32', points: 1 },
    ];
    expect(rows(parseOrThrow(raw))).toEqual({ ana: [true, 'direct'], bea: [true, null], cat: [true, 'champion'] });
  });

  it('passes over an ineligible player ranked inside the places', () => {
    const raw = rawSeason();
    raw.tournaments = raw.tournaments.map((t) => (t.id === 'clash' ? { ...t, category: 'GS', drawType: 'gs128' } : t));
    // cat wins clash: 1140, rank 2, but has played only 1 counting event.
    expect(rows(parseOrThrow(raw), { [pickKey('cat', 'clash')]: 'W' })).toEqual({ ana: [true, 'direct'], bea: [true, 'direct'], cat: [false, null] });
  });
});
