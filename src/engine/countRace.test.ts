import { describe, expect, it } from 'vitest';
import { countRace, officialRace } from './countRace';
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

  it('requires only the best `count` results of a group; the surplus competes for open slots', () => {
    const r: Rules = {
      ...rules,
      maxCountedResults: 3,
      requiredGroups: [{ categories: ['GS'], count: 1 }, { categories: ['WTA500', 'WTA250'], count: 1 }],
    };
    const race = countRace(results('ana'), tournaments, r);
    // Required: slam 1000, c500 100. One open slot: best of c250 40, m1000 20, live 10.
    expect(race.total).toBe(1140);
    expect(ids(race.counted)).toEqual(['c250', 'c500', 'slam']);
    expect(ids(race.dropped)).toEqual(['live', 'm1000']);
  });

  it('never counts excluded categories', () => {
    const race = countRace(results('ana'), tournaments, { ...rules, excludedCategories: ['WTA250'] });
    // Required: slam 1000 + m1000 20. Open: c500 100, live 10. c250 is excluded.
    expect(race.total).toBe(1130);
    expect(ids(race.dropped)).toEqual(['c250']);
  });

  it('counts a zero-pointer ahead of positive results in the open pool', () => {
    const withZp = results('ana').map((r) => (r.tournamentId === 'live' ? { tournamentId: 'live', round: 'ZP', points: 0 } : r));
    const race = countRace(withZp, tournaments, rules);
    // Required: slam 1000 + m1000 20. Two open slots: the zero-pointer, then c500 100. c250 40 drops.
    expect(race.total).toBe(1120);
    expect(ids(race.counted)).toEqual(['c500', 'live', 'm1000', 'slam']);
    expect(ids(race.dropped)).toEqual(['c250']);
  });

  it('lets a zero-pointer fill its required group ahead of a positive result', () => {
    const r: Rules = { ...rules, maxCountedResults: 2, requiredGroups: [{ categories: ['WTA500', 'WTA1000'], count: 1 }] };
    const zpAndMore = [
      { tournamentId: 'c500', round: 'W', points: 100 },
      { tournamentId: 'live', round: 'ZP', points: 0 },
      { tournamentId: 'slam', round: 'W', points: 1000 },
      { tournamentId: 'm1000', round: 'SF', points: 20 },
    ];
    const race = countRace(zpAndMore, tournaments, r);
    // The group's one required slot goes to the zero-pointer; the one open slot to slam 1000.
    expect(race.total).toBe(1000);
    expect(ids(race.counted)).toEqual(['live', 'slam']);
    expect(ids(race.dropped)).toEqual(['c500', 'm1000']);
  });

  it('does not let a qualifying loss fill a required group (it was never a main-draw result)', () => {
    // m1000 is the only combined 1000, lost in qualifying: it competes as an optional result instead.
    const rs = [
      { tournamentId: 'slam', round: 'W', points: 1000 },
      { tournamentId: 'm1000', round: 'Q1', points: 3 },
      { tournamentId: 'c500', round: 'W', points: 100 },
      { tournamentId: 'c250', round: 'F', points: 40 },
      { tournamentId: 'live', round: 'QF', points: 10 },
    ];
    const race = countRace(rs, tournaments, rules);
    expect(race.total).toBe(1150);
    expect(ids(race.dropped)).toEqual(['m1000']);
  });

  it('lets a player who qualified (Q) fill a required group', () => {
    const rs = [
      { tournamentId: 'slam', round: 'W', points: 1000 },
      { tournamentId: 'm1000', round: 'Q', points: 3 },
      { tournamentId: 'c500', round: 'W', points: 100 },
      { tournamentId: 'c250', round: 'F', points: 40 },
      { tournamentId: 'live', round: 'QF', points: 10 },
    ];
    expect(countRace(rs, tournaments, rules).total).toBe(1143);
  });
});

describe('officialRace', () => {
  it('leaves out results at an in-progress event that the WTA has not credited yet', () => {
    const rs = [
      { tournamentId: 'slam', round: 'W', points: 1000 },
      { tournamentId: 'live', round: 'R32', points: 0 },
    ];
    expect(ids(officialRace(rs, tournaments, rules).counted)).toEqual(['slam']);
  });

  it('keeps in-progress points once they are credited, and zero-pointers', () => {
    const rs = [
      { tournamentId: 'slam', round: 'ZP', points: 0 },
      { tournamentId: 'live', round: 'QF', points: 10 },
    ];
    expect(ids(officialRace(rs, tournaments, rules).counted)).toEqual(['live', 'slam']);
  });
});
