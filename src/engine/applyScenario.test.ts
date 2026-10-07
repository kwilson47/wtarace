import { describe, expect, it } from 'vitest';
import { applyScenario, projectedPoints } from './applyScenario';
import { countRace } from './countRace';
import { pickKey, type Scenario } from './types';
import { rawSeason, season } from '../test/fixtures';
import { parseOrThrow, type Rules } from '../data/schema';

const { tournaments, rules } = season;
const player = (id: string) => season.players.find((p) => p.id === id)!;
const tournament = (id: string) => tournaments.find((t) => t.id === id)!;
const projectedTotal = (id: string, scenario: Scenario, r: Rules = rules) =>
  countRace(applyScenario(player(id), scenario, tournaments, r), tournaments, r).total;

describe('applyScenario', () => {
  it('returns the existing results when there are no picks', () => {
    expect(applyScenario(player('ana'), {}, tournaments, rules)).toEqual(player('ana').results);
  });

  it('adds a result for a pick at an upcoming event', () => {
    const results = applyScenario(player('ana'), { [pickKey('ana', 'clash')]: 'SF' }, tournaments, rules);
    expect(results).toContainEqual({ tournamentId: 'clash', round: 'SF', points: 20 });
    expect(results).toHaveLength(player('ana').results.length + 1);
  });

  it('replaces, not adds to, points already earned at an in-progress event', () => {
    const results = applyScenario(player('ana'), { [pickKey('ana', 'live')]: 'W' }, tournaments, rules);
    expect(results.filter((r) => r.tournamentId === 'live')).toEqual([{ tournamentId: 'live', round: 'W', points: 100 }]);
    // Optional best 2 of (c500 100, c250 40, live 100) = 200; 1000 + 20 + 200.
    expect(projectedTotal('ana', { [pickKey('ana', 'live')]: 'W' })).toBe(1220);
  });

  it('ignores picks for completed events', () => {
    expect(applyScenario(player('ana'), { [pickKey('ana', 'slam')]: 'QF' }, tournaments, rules)).toEqual(player('ana').results);
  });

  it('ignores picks belonging to other players', () => {
    expect(applyScenario(player('ana'), { [pickKey('bea', 'clash')]: 'W' }, tournaments, rules)).toEqual(player('ana').results);
  });

  it('leaves a capped total unchanged when the pick is worse than every counted optional result', () => {
    expect(projectedTotal('ana', { [pickKey('ana', 'clash')]: 'R32' })).toBe(1160);
  });

  it('never lowers a total by adding a pick', () => {
    expect(projectedTotal('bea', { [pickKey('bea', 'clash')]: 'R32' })).toBeGreaterThanOrEqual(765);
  });
});

describe('projectedPoints and byes', () => {
  it('scores a bye player losing her first match per byeRule = points-of-previous-round', () => {
    expect(projectedPoints('ana', tournament('next'), 'R16', rules)).toBe(1);
  });

  it('scores a bye player losing her first match per byeRule = points-of-round-lost', () => {
    expect(projectedPoints('ana', tournament('next'), 'R16', { ...rules, byeRule: 'points-of-round-lost' })).toBe(5);
  });

  it('does not apply the bye rule beyond the first match', () => {
    expect(projectedPoints('ana', tournament('next'), 'QF', rules)).toBe(10);
  });

  it('does not apply the bye rule to players without a bye', () => {
    expect(projectedPoints('bea', tournament('next'), 'R16', rules)).toBe(5);
  });

  it('throws on a round that is not in the table', () => {
    expect(() => projectedPoints('ana', tournament('next'), 'XX', rules)).toThrow('Round "XX" is not valid for next');
  });
});

describe('applyScenario banks live-round points when there is no pick', () => {
  const withLivePoints = (points: Record<string, number>) => {
    const raw = rawSeason();
    for (const p of raw.players) {
      const r = p.results.find((x) => x.tournamentId === 'live');
      if (r && p.id in points) r.points = points[p.id]!;
    }
    return parseOrThrow(raw);
  };
  const run = (s: typeof season, id: string) =>
    applyScenario(s.players.find((p) => p.id === id)!, {}, s.tournaments, s.rules);

  it('credits the live round to an alive player whose stored points are 0', () => {
    const s = withLivePoints({ ana: 0 });
    expect(run(s, 'ana')).toContainEqual({ tournamentId: 'live', round: 'QF', points: 10 });
    const total = countRace(run(s, 'ana'), s.tournaments, s.rules).total;
    expect(total).toBe(1160);
  });

  it('credits the round lost to an eliminated player whose stored points are 0', () => {
    const s = withLivePoints({ bea: 0 });
    expect(run(s, 'bea')).toContainEqual({ tournamentId: 'live', round: 'R16', points: 5 });
  });

  it('keeps stored points when they exceed the live-round points', () => {
    const s = withLivePoints({ ana: 50 });
    expect(run(s, 'ana')).toContainEqual({ tournamentId: 'live', round: 'QF', points: 50 });
  });

  it('still lets a pick replace the result exactly', () => {
    const s = withLivePoints({ ana: 0 });
    const r = applyScenario(s.players.find((p) => p.id === 'ana')!, { [pickKey('ana', 'live')]: 'SF' }, s.tournaments, s.rules);
    expect(r.filter((x) => x.tournamentId === 'live')).toEqual([{ tournamentId: 'live', round: 'SF', points: 20 }]);
  });
});
