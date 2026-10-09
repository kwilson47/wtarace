import { describe, expect, it } from 'vitest';
import { season as realSeason } from '../data/season';
import { eliminatedPlayers } from '../engine/elimination';
import { splitPickKey } from '../engine/types';
import { readDrawFiles, readMatchFiles } from '../update/writeData';
import { prepareSimulation, simulateChances, simulateRun } from './chances';
import { mulberry32 } from './random';
import { withIds } from './testHelpers';

const small = () => {
  const s = withIds();
  s.tournaments.find((t) => t.id === 'next')!.entries = ['bea', 'cat'];
  s.tournaments.find((t) => t.id === 'clash')!.entries = ['cat'];
  return s;
};

describe('qualification chances', () => {
  it('gives every player a chance between 0 and 1, the same for the same seed; an announced qualifier is 1', () => {
    const a = simulateChances(small(), {}, {}, { runs: 200, seed: 1 });
    expect(Object.keys(a).sort()).toEqual(['ana', 'bea', 'cat']);
    for (const p of Object.values(a)) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(a.ana).toBe(1);
    expect(simulateChances(small(), {}, {}, { runs: 200, seed: 1 })).toEqual(a);
  });

  it('picks only for entrants, at most one champion per event, and simulated byes reach the engine', () => {
    const s = small();
    const prep = prepareSimulation(s, {}, {});
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const { scenario, tournaments } = simulateRun(prep, s, rng);
      for (const key of Object.keys(scenario)) {
        const { playerId, tournamentId } = splitPickKey(key);
        expect(s.tournaments.find((t) => t.id === tournamentId)!.entries).toContain(playerId);
      }
      for (const t of ['next', 'clash']) expect(Object.entries(scenario).filter(([k, r]) => k.endsWith(`|${t}`) && r === 'W').length).toBeLessThanOrEqual(1);
      // 'next' is a 32 draw (no byes), so the fixture's hand-entered bye list is replaced by the simulated one.
      expect(tournaments.find((t) => t.id === 'next')!.byes).toEqual([]);
    }
  });

  it('on real data: values in range, announced qualifiers at 1, eliminated players at 0', () => {
    const dir = 'data';
    const chances = simulateChances(realSeason, readMatchFiles(dir), readDrawFiles(dir), { runs: 200, seed: 1 });
    expect(Object.keys(chances)).toHaveLength(realSeason.players.length);
    for (const p of realSeason.players) {
      expect(chances[p.id]).toBeGreaterThanOrEqual(0);
      expect(chances[p.id]).toBeLessThanOrEqual(1);
      if (p.qualified) expect(chances[p.id]).toBe(1);
    }
    for (const id of eliminatedPlayers(realSeason.players, realSeason.tournaments, realSeason.rules)) expect(chances[id]).toBe(0);
  });
});
