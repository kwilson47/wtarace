import { describe, expect, it } from 'vitest';
import { parseSeason, type SeasonInput } from './schema';
import { rawSeason } from '../test/fixtures';

function errorsFor(mutate: (raw: SeasonInput) => void): string {
  const raw = rawSeason();
  mutate(raw);
  const result = parseSeason(raw);
  return result.ok ? '' : result.errors.join('\n');
}

const player = (raw: SeasonInput, id: string) => raw.players.find((p) => p.id === id)!;

describe('parseSeason', () => {
  it('accepts valid data and fills defaults', () => {
    const raw = rawSeason();
    delete raw.tournaments[0]!.byes;
    const result = parseSeason(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.season.tournaments[0]!.byes).toEqual([]);
  });

  it('rejects a result at an unknown tournament', () => {
    expect(errorsFor((raw) => { player(raw, 'ana').results[0]!.tournamentId = 'nope'; }))
      .toContain('ana: result references unknown tournament "nope"');
  });

  it('rejects a round that does not exist for the draw type', () => {
    expect(errorsFor((raw) => { player(raw, 'ana').results[1]!.round = 'R128'; }))
      .toContain('ana at m1000: round "R128" is not valid for draw type d32');
  });

  it('accepts qualifying rounds', () => {
    expect(errorsFor((raw) => { player(raw, 'cat').results[2]!.round = 'Q2'; })).toBe('');
  });

  it('rejects a zero-pointer with points', () => {
    expect(errorsFor((raw) => { player(raw, 'cat').results[0]!.points = 5; }))
      .toContain('cat at slam: zero-pointer must have 0 points');
  });

  it('rejects two results at the same tournament', () => {
    expect(errorsFor((raw) => { player(raw, 'cat').results.push({ tournamentId: 'c250', round: 'F', points: 40 }); }))
      .toContain('cat: more than one result for c250');
  });

  it('rejects a live entry with no matching result', () => {
    expect(errorsFor((raw) => { player(raw, 'cat').live = [{ tournamentId: 'live', state: 'alive', round: 'R32' }]; }))
      .toContain('cat: live status at live but no result recording points earned there');
  });

  it('rejects a live entry for an event that is not in progress', () => {
    expect(errorsFor((raw) => { player(raw, 'ana').live = [{ tournamentId: 'c500', state: 'alive', round: 'QF' }]; }))
      .toContain('ana: live status for c500, which is not in progress');
  });

  it('rejects a draw type with no points table', () => {
    expect(errorsFor((raw) => { raw.tournaments[2]!.drawType = 'd64'; }))
      .toContain('Tournament c500: drawType "d64" has no points table');
  });

  it('rejects a start date after the end date', () => {
    expect(errorsFor((raw) => { raw.tournaments[2]!.startDate = '2026-04-20'; }))
      .toContain('Tournament c500: startDate is after endDate');
  });

  it('rejects a player count that differs from trackedPlayerCount', () => {
    expect(errorsFor((raw) => { raw.rules.trackedPlayerCount = 25; }))
      .toContain('players.json has 3 players but rules.trackedPlayerCount is 25');
  });

  it('rejects duplicate ids', () => {
    expect(errorsFor((raw) => { raw.players[2]!.id = 'bea'; })).toContain('Duplicate player id "bea"');
  });

  it('accepts draw positions inside the draw', () => {
    expect(errorsFor((raw) => {
      raw.tournaments[4]!.drawSize = 32;
      player(raw, 'ana').live![0]!.drawPosition = 9;
    })).toBe('');
  });

  it('rejects a draw position without a draw size', () => {
    expect(errorsFor((raw) => { player(raw, 'ana').live![0]!.drawPosition = 9; }))
      .toContain('ana at live: drawPosition needs the tournament\'s drawSize');
  });

  it('rejects a draw position outside the draw', () => {
    expect(errorsFor((raw) => {
      raw.tournaments[4]!.drawSize = 32;
      player(raw, 'ana').live![0]!.drawPosition = 33;
    })).toContain('ana at live: drawPosition 33 is outside the 32-player draw');
  });

  it('rejects two players at the same draw position', () => {
    expect(errorsFor((raw) => {
      raw.tournaments[4]!.drawSize = 32;
      player(raw, 'ana').live![0]!.drawPosition = 9;
      player(raw, 'bea').live![0]!.drawPosition = 9;
    })).toContain('live: draw position 9 is used by more than one player');
  });

  it('reports field-level problems with their path', () => {
    expect(errorsFor((raw) => { raw.meta.lastUpdated = 'yesterday'; })).toContain('meta.lastUpdated');
  });
});
