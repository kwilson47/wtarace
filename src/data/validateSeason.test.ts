import { describe, expect, it } from 'vitest';
import { validateSeason } from './validateSeason';
import { rawSeason } from '../test/fixtures';

describe('validateSeason', () => {
  it('passes when every official total is reproduced', () => {
    expect(validateSeason(rawSeason())).toEqual([]);
  });

  it('reports a player whose official total does not match the engine', () => {
    const raw = rawSeason();
    raw.players[1]!.officialRaceTotal = 770;
    expect(validateSeason(raw)).toEqual(['Bea Beta (bea): engine total 765 ≠ official 770']);
  });

  it('reports schema errors without running the cross-check', () => {
    const raw = rawSeason();
    raw.players[0]!.results[0]!.tournamentId = 'nope';
    raw.players[1]!.officialRaceTotal = 770;
    expect(validateSeason(raw)).toEqual(['ana: result references unknown tournament "nope"']);
  });
});
