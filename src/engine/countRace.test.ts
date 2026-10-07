import { describe, expect, it } from 'vitest';
import { countRace } from './countRace';
import { season } from '../test/fixtures';
import type { Rules } from '../data/schema';

const { tournaments, rules } = season;
const results = (id: string) => season.players.find((p) => p.id === id)!.results;
const ids = (rs: { tournamentId: string }[]) => rs.map((r) => r.tournamentId).sort();

describe('countRace', () => {
  it('counts mandatory results plus the best optional results up to the cap', () => {
    const race = countRace(results('ana'), tournaments, rules);
    expect(race.total).toBe(1160);
    expect(ids(race.counted)).toEqual(['c250', 'c500', 'm1000', 'slam']);
    expect(ids(race.dropped)).toEqual(['live']);
  });

  it('counts everything when under the cap', () => {
    const race = countRace(results('bea'), tournaments, rules);
    expect(race.total).toBe(765);
    expect(race.dropped).toEqual([]);
  });

  it('counts a zero-pointer as a mandatory result', () => {
    const race = countRace(results('cat'), tournaments, rules);
    expect(race.total).toBe(140);
    expect(ids(race.counted)).toContain('slam');
  });

  it('always counts mandatory results, even when better optional results exist', () => {
    const capTwo: Rules = { ...rules, maxCountedResults: 2 };
    const race = countRace(results('ana'), tournaments, capTwo);
    expect(race.total).toBe(1020);
    expect(ids(race.counted)).toEqual(['m1000', 'slam']);
  });

  it('counts all mandatory results even if they exceed the cap', () => {
    const capOne: Rules = { ...rules, maxCountedResults: 1 };
    expect(countRace(results('ana'), tournaments, capOne).total).toBe(1020);
  });

  it('throws on a result at an unknown tournament', () => {
    expect(() => countRace([{ tournamentId: 'nope', round: 'W', points: 1 }], tournaments, rules))
      .toThrow('Unknown tournament "nope"');
  });
});
