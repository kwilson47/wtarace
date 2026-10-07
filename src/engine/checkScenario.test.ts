import { describe, expect, it } from 'vitest';
import { checkScenario } from './checkScenario';
import { pickKey, type Scenario } from './types';
import { rawSeason, season } from '../test/fixtures';
import { parseOrThrow } from '../data/schema';

const check = (scenario: Scenario, s = season) => checkScenario(scenario, s.players, s.tournaments, s.rules);

describe('checkScenario', () => {
  it('returns no warnings for a consistent scenario', () => {
    expect(check({ [pickKey('ana', 'live')]: 'W', [pickKey('bea', 'next')]: 'F' })).toEqual([]);
  });

  it('flags more players picked for a round than it can hold', () => {
    expect(check({ [pickKey('ana', 'next')]: 'W', [pickKey('bea', 'next')]: 'W' })).toEqual([
      { kind: 'round-capacity', mode: 'exact', tournamentId: 'next', round: 'W', count: 2, limit: 1, playerIds: ['ana', 'bea'] },
    ]);
  });

  it('counts alive, unpicked players toward how many can reach a round', () => {
    const raw = rawSeason();
    for (const p of raw.players) {
      const round = p.id === 'cat' ? 'SF' : 'F';
      p.results = [...p.results.filter((r) => r.tournamentId !== 'live'), { tournamentId: 'live', round, points: 0 }];
      p.live = [{ tournamentId: 'live', state: 'alive', round }];
    }
    const s = parseOrThrow({ ...raw, players: raw.players.map((p) => ({ ...p, officialRaceTotal: 0 })) });
    expect(check({ [pickKey('cat', 'live')]: 'W' }, s)).toEqual([
      { kind: 'round-capacity', mode: 'at-least', tournamentId: 'live', round: 'F', count: 3, limit: 2, playerIds: ['ana', 'bea', 'cat'] },
    ]);
  });

  it('flags a player picked for two overlapping events', () => {
    expect(check({ [pickKey('ana', 'next')]: 'SF', [pickKey('ana', 'clash')]: 'R32' })).toEqual([
      { kind: 'same-week', playerId: 'ana', tournamentIds: ['next', 'clash'] },
    ]);
  });

  it('does not flag back-to-back events that share a boundary date', () => {
    // ana is alive at live (ends 2026-10-12); next starts 2026-10-12.
    expect(check({ [pickKey('ana', 'next')]: 'SF' })).toEqual([]);
  });

  it('flags picks that contradict live status', () => {
    const warnings = check({
      [pickKey('bea', 'live')]: 'W',
      [pickKey('ana', 'live')]: 'R16',
      [pickKey('cat', 'live')]: 'W',
    });
    expect(warnings).toContainEqual({ kind: 'pick-conflict', playerId: 'bea', tournamentId: 'live', problem: 'eliminated' });
    expect(warnings).toContainEqual({ kind: 'pick-conflict', playerId: 'ana', tournamentId: 'live', problem: 'below-current-round' });
    expect(warnings).toContainEqual({ kind: 'pick-conflict', playerId: 'cat', tournamentId: 'live', problem: 'not-in-draw' });
  });

  it('ignores picks for unknown players or events', () => {
    expect(check({ [pickKey('zed', 'next')]: 'W', [pickKey('ana', 'nope')]: 'W' })).toEqual([]);
  });
});
