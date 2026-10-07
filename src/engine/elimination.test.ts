import { describe, expect, it } from 'vitest';
import { eliminatedPlayers, maxUntrackedPassers, raceBounds, remainingWeeks } from './elimination';
import { rawSeason, season } from '../test/fixtures';
import { parseOrThrow, type Rules, type Season, type SeasonInput } from '../data/schema';

const out = (s: Season) => [...eliminatedPlayers(s.players, s.tournaments, s.rules)].sort();
const withQualification = (s: Season, q: Partial<Rules['qualification']>): Season => ({
  ...s,
  rules: { ...s.rules, qualification: { ...s.rules.qualification, ...q } },
});

/** A 4th, tiny player (dee) plus cat as a Grand Slam champion (641, below bea's 765). */
function championSeason(): Season {
  const raw: SeasonInput = rawSeason();
  raw.rules.trackedPlayerCount = 4;
  raw.players[2]!.results = [
    { tournamentId: 'slam', round: 'W', points: 500 },
    { tournamentId: 'm1000', round: 'F', points: 40 },
    { tournamentId: 'c250', round: 'W', points: 100 },
    { tournamentId: 'c500', round: 'R32', points: 1 },
  ];
  raw.players.push({ id: 'dee', name: 'Dee Delta', country: 'FR', officialRaceTotal: 1, results: [{ tournamentId: 'c250', round: 'R32', points: 1 }] });
  return parseOrThrow(raw);
}

describe('remainingWeeks', () => {
  it('groups overlapping remaining events into one week', () => {
    expect(remainingWeeks(season.tournaments).map((w) => w.map((t) => t.id))).toEqual([['live'], ['next', 'clash']]);
  });
});

describe('raceBounds', () => {
  const bounds = (id: string) => raceBounds(season.players.find((p) => p.id === id)!, season.tournaments, season.rules);

  it('floor keeps current points; ceiling wins every playable event, one per week', () => {
    // ana: live W replaces QF 10, plus next W; best 2 open of (100, 100, 100, 40).
    expect(bounds('ana')).toEqual({ floor: 1160, ceiling: 1220 });
    // bea is out of live; next or clash W adds 100, replacing her weakest counted result (live 5).
    expect(bounds('bea')).toEqual({ floor: 765, ceiling: 860 });
    // cat is not in the live draw; one W in the overlapping week.
    expect(bounds('cat')).toEqual({ floor: 140, ceiling: 240 });
  });
});

describe('eliminatedPlayers', () => {
  it('marks a player out when enough eligible players are certain to finish above her', () => {
    // cat's best (240) is below both ana's and bea's current totals, and both places are taken.
    expect(out(season)).toEqual(['cat']);
  });

  it('marks a player out when she can no longer reach the event minimum', () => {
    // Everyone has 3 qualifying events and can add at most 1 (next); 5 are required.
    expect(out(withQualification(season, { minEvents: { count: 5, categories: ['WTA1000C', 'WTA1000', 'WTA500'] } })))
      .toEqual(['ana', 'bea', 'cat']);
  });

  it('marks the next player out when a lower-ranked champion is certain to take the champion place', () => {
    // bea's best is 2nd (ana certain above), but cat — a champion certain to stay inside ranks 2–3 — takes the last place.
    // cat herself is not out: as a champion she can qualify from 3rd. dee cannot catch three players.
    expect(out(championSeason())).toEqual(['bea', 'dee']);
  });

  it('keeps the next player alive when the champion might fall outside the window', () => {
    // With the window ending at rank 2, cat (who can be passed by ana and bea) is not certain to be in it.
    expect(out(withQualification(championSeason(), { championPlace: { categories: ['GS'], fromRank: 2, toRank: 2 } })))
      .toEqual(['cat', 'dee']);
  });

  it('treats a tie at the boundary as still alive', () => {
    const raw = rawSeason();
    raw.players[2]!.results.push({ tournamentId: 'c500', round: 'W', points: 625 });
    // cat: 0 + 40 required, open c500 625 + c250 100 = 765. Her best case equals bea's floor, and tiebreakers
    // decide equal totals, so bea is not certain to finish above her.
    const s = parseOrThrow(raw);
    expect(out(s)).not.toContain('cat');
  });

  it('does not mark anyone out when no places are decided by points', () => {
    expect(out(withQualification(season, { places: 3, championPlace: null }))).toEqual([]);
  });
});

describe('maxUntrackedPassers', () => {
  const weeks = [
    [{ points: 100, capacity: 1 }, { points: 40, capacity: 1 }],
    [{ points: 100, capacity: 1 }],
  ];

  it('counts how many outside players could each gain the points needed', () => {
    expect(maxUntrackedPassers(weeks, 140, 5)).toBe(1);
    expect(maxUntrackedPassers(weeks, 100, 5)).toBe(2);
    expect(maxUntrackedPassers(weeks, 40, 5)).toBe(3);
  });

  it('stops at the limit and treats a non-positive need as unlimited', () => {
    expect(maxUntrackedPassers(weeks, 40, 2)).toBe(2);
    expect(maxUntrackedPassers(weeks, 0, 7)).toBe(7);
  });
});
