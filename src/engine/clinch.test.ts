import { describe, expect, it } from 'vitest';
import { clinchedPlayers } from './clinch';
import { rawSeason, season } from '../test/fixtures';
import { parseOrThrow, type Season, type SeasonInput } from '../data/schema';

const clinched = (s: Season) => [...clinchedPlayers(s.players, s.tournaments, s.rules)].sort();

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

/**
 * xen (970) can only be passed by ana and bea (950 each), and each needs to reach the final of the
 * in-progress `live` event (F = 980, W = 1040). Two places, no champion place, no other remaining
 * events, and a 0-point tracked player so nobody outside the list can get close.
 */
function bracketSeason(anaPosition: number, beaPosition: number, xenQualifyingPoints = 130): Season {
  const raw: SeasonInput = rawSeason();
  raw.rules.maxCountedResults = 10;
  raw.rules.trackedPlayerCount = 4;
  raw.rules.qualification = { places: 2, championPlace: null, minEvents: null };
  raw.tournaments = raw.tournaments
    .filter((t) => t.status !== 'upcoming')
    .map((t) => (t.id === 'live' ? { ...t, drawSize: 32 } : t));
  const contender = (id: string, name: string, drawPosition: number) => ({
    id, name, country: 'US', officialRaceTotal: 0,
    results: [
      { tournamentId: 'slam', round: 'F', points: 640 },
      { tournamentId: 'm1000', round: 'W', points: 100 },
      { tournamentId: 'c500', round: 'W', points: 100 },
      { tournamentId: 'c250', round: 'W', points: 100 },
      { tournamentId: 'live', round: 'QF', points: 10 },
    ],
    live: [{ tournamentId: 'live', state: 'alive' as const, round: 'QF', drawPosition }],
  });
  raw.players = [
    {
      id: 'xen', name: 'Xen Xi', country: 'US', officialRaceTotal: 0,
      results: [
        { tournamentId: 'slam', round: 'F', points: 640 },
        { tournamentId: 'm1000', round: 'W', points: 100 },
        { tournamentId: 'c500', round: 'W', points: 100 },
        { tournamentId: 'c250', round: 'Q', points: xenQualifyingPoints },
      ],
    },
    contender('ana', 'Ana Alpha', anaPosition),
    contender('bea', 'Bea Beta', beaPosition),
    { id: 'low', name: 'Low Lima', country: 'US', officialRaceTotal: 0, results: [] },
  ];
  return parseOrThrow(raw);
}

describe('clinchedPlayers', () => {
  it('clinches players nobody can push out of the qualifying places', () => {
    // 2 places: ana and bea can't both be passed by cat, whose best is 240.
    expect(clinched(season)).toEqual(['ana', 'bea']);
  });

  it('never clinches a player who is not yet eligible', () => {
    // Without c500 and m1000, ana has played only 1 of the 2 required events.
    const raw = rawSeason();
    raw.players[0]!.results = raw.players[0]!.results.filter((r) => r.tournamentId !== 'c500' && r.tournamentId !== 'm1000');
    expect(clinched(parseOrThrow(raw))).not.toContain('ana');
  });

  it('respects the champion place: a lower-ranked champion can take the last place', () => {
    // cat (Grand Slam champion, 3rd) is certain to take the second place, so bea has not clinched — cat has.
    expect(clinched(championSeason())).toEqual(['ana', 'cat']);
  });

  it('uses the draw: two players in the same half cannot both reach the final', () => {
    // Positions 1 and 9 share the top half of a 32 draw, so at most one of ana and bea can pass xen.
    expect(clinched(bracketSeason(1, 9))).toContain('xen');
  });

  it('without that draw constraint the same player is not clinched', () => {
    // Positions 1 and 17 are in opposite halves: ana can win and bea reach the final, passing xen.
    expect(clinched(bracketSeason(1, 17))).not.toContain('xen');
  });

  it('treats a tie as not safe, because tiebreakers decide it', () => {
    // Opposite halves, xen 980: ana wins (1040) and bea's final (980) ties xen.
    expect(clinched(bracketSeason(1, 17, 140))).not.toContain('xen');
    // At 981, a final is no longer enough, and only one of them can win.
    expect(clinched(bracketSeason(1, 17, 141))).toContain('xen');
  });
});
