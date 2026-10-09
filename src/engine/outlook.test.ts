import { describe, expect, it } from 'vitest';
import type { Season } from '../data/schema';
import { bracketSeason, rawSeason, season } from '../test/fixtures';
import { parseOrThrow } from '../data/schema';
import { checkScenario } from './checkScenario';
import { playerOutlook, type Outlook } from './outlook';
import { projectStandings } from './standings';
import type { Scenario } from './types';

const outlook = (s: Season, id: string) => playerOutlook(id, s.players, s.tournaments, s.rules);
const open = (o: Outlook) => {
  if (o.status !== 'open') throw new Error(`expected open, got ${o.status}`);
  return o;
};
/** The example is consistent and the projection agrees whether `id` qualifies. */
const shows = (s: Season, scenario: Scenario, id: string, qualifies: boolean) => {
  expect(checkScenario(scenario, s.players, s.tournaments, s.rules)).toEqual([]);
  const row = projectStandings(s.players, scenario, s.tournaments, s.rules).find((r) => r.playerId === id)!;
  expect(row.projectedQualifier !== null).toBe(qualifies);
};

describe('playerOutlook', () => {
  it('reports qualified for an official flag or a certain place, and out for eliminated players', () => {
    expect(outlook(season, 'ana').status).toBe('qualified'); // official flag
    expect(outlook(season, 'bea').status).toBe('qualified'); // certain
    expect(outlook(season, 'cat').status).toBe('out');
    expect(outlook(bracketSeason(1, 9), 'xen').status).toBe('qualified');
  });

  it('gives a player with no events left a safe total and examples, but no route of her own', () => {
    // xen 970. Opposite halves: ana and bea can reach 1040 (W) and 980 (F); at 981 only the winner can pass.
    const s = bracketSeason(1, 17);
    const o = open(outlook(s, 'xen'));
    expect(o.safeAt).toBe(981);
    expect(o.guaranteedRoute).toBeNull();
    expect(o.eventsLeft).toBe(false);
    expect(o.qualifyExample).toEqual({}); // she is in as things stand
    expect(o.missExample).not.toBeNull();
    shows(s, o.missExample!, 'xen', false);
  });

  it('finds the smallest result of her own that qualifies, and her route to the safe total', () => {
    // bea 950 (alive, QF). With nobody else earning more, a semifinal (960) passes ana's 950.
    // Safe at 971: then only ana (up to 1040) can pass her, because xen is stuck on 970.
    const s = bracketSeason(1, 17);
    const o = open(outlook(s, 'bea'));
    expect(o.qualifyExample).toEqual({ 'bea|live': 'SF' });
    shows(s, o.qualifyExample!, 'bea', true);
    expect(o.safeAt).toBe(971);
    expect(o.guaranteedRoute).toEqual({ 'bea|live': 'F' });
    expect(o.eventsLeft).toBe(true);
    expect(o.eligibleNow).toBe(true);
    // As things stand (nobody earns more) she is third, so that is the simplest way she misses out.
    expect(o.missExample).toEqual({});
    shows(s, o.missExample!, 'bea', false);
  });

  it('counts the places her own results take when finding the results that guarantee her a place', () => {
    // cara (950, QF) shares the top half with ana; bea is in the bottom half; xen is stuck on 970.
    // Any total of 981+ is safe however it is reached, and only a title (1040) gets her there. But
    // reaching the final (980) is enough: it knocks ana out, so only bea can pass her.
    const s = bracketSeason(1, 17, 130, 9);
    const o = open(outlook(s, 'cara'));
    expect(o.safeAt).toBe(981);
    expect(o.guaranteedRoute).toEqual({ 'cara|live': 'F' });
  });

  it('builds the miss example from the fewest passers, using the champion place when it takes fewer', () => {
    // 3 places; the 3rd goes to a Grand Slam champion ranked 3rd-6th. xen (500) is 2nd. cham, a champion
    // on 100, is certain to stay inside the window, so one passer is enough to push xen to 3rd, where cham
    // takes the place. Filling all three places above her instead would need two passers.
    const raw = rawSeason();
    raw.rules.maxCountedResults = 10;
    raw.rules.trackedPlayerCount = 6;
    raw.rules.qualification = { places: 3, championPlace: { categories: ['GS'], fromRank: 3, toRank: 6 }, minEvents: null };
    raw.tournaments = raw.tournaments.filter((t) => t.status !== 'in-progress');
    const player = (id: string, results: { tournamentId: string; round: string; points: number }[]) =>
      ({ id, name: id.toUpperCase(), country: 'US', officialRaceTotal: 0, results });
    raw.players = [
      player('top', [{ tournamentId: 'slam', round: 'F', points: 2000 }]),
      player('xen', [{ tournamentId: 'slam', round: 'F', points: 500 }]),
      player('p1', [{ tournamentId: 'slam', round: 'F', points: 470 }]),
      player('p2', [{ tournamentId: 'slam', round: 'F', points: 469 }]),
      player('p3', [{ tournamentId: 'slam', round: 'F', points: 468 }]),
      player('cham', [{ tournamentId: 'slam', round: 'W', points: 100 }]),
    ];
    const s = parseOrThrow(raw);
    const o = open(outlook(s, 'xen'));
    expect(o.missExample).not.toBeNull();
    const passers = new Set(Object.keys(o.missExample!).map((k) => k.split('|')[0]));
    expect([...passers]).toHaveLength(1);
    shows(s, o.missExample!, 'xen', false);
  });
});
