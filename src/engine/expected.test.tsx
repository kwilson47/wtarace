import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultsBreakdown } from '../ui/ResultsBreakdown';
import { parseOrThrow, type SeasonInput } from '../data/schema';
import { rawSeason } from '../test/fixtures';
import { playerBreakdown } from './breakdown';
import { eliminatedPlayers } from './elimination';
import { expectedZeroPointers } from './expected';
import { projectStandings } from './standings';

// The fixture's `live` event is a WTA 1000 in progress. Cat isn't in its draw; give her a commitment there.
const withCommitment = (edit: (raw: SeasonInput) => void = () => {}) => {
  const raw = rawSeason();
  raw.tournaments.find((t) => t.id === 'live')!.commitment = { deadline: '2026-09-07', ranks: { cat: 12, bea: 20 } };
  edit(raw);
  return parseOrThrow(raw);
};
const player = (s: ReturnType<typeof withCommitment>, id: string) => s.players.find((p) => p.id === id)!;

describe('expected zero-pointers', () => {
  it('gives one to a committed player who is not in the draw, and none to one who is', () => {
    const s = withCommitment();
    expect(expectedZeroPointers(player(s, 'cat'), s.tournaments)).toEqual([{ tournamentId: 'live', round: 'ZP', points: 0 }]);
    expect(expectedZeroPointers(player(s, 'bea'), s.tournaments)).toEqual([]); // in the draw (out in R16)
  });

  it('skips a WTA 1000 during a Long-Term Injury, but not a Grand Slam', () => {
    const s = withCommitment((raw) => {
      raw.players.find((p) => p.id === 'cat')!.longTermInjury = { from: '2026-06-01' };
    });
    expect(expectedZeroPointers(player(s, 'cat'), s.tournaments)).toEqual([]);
    const slam = withCommitment((raw) => {
      raw.players.find((p) => p.id === 'cat')!.longTermInjury = { from: '2026-06-01' };
      const live = raw.tournaments.find((t) => t.id === 'live')!;
      live.category = 'GS';
      live.drawType = 'gs128';
    });
    expect(expectedZeroPointers(player(slam, 'cat'), slam.tournaments)).toHaveLength(1);
  });

  it('ignores WTA 500s and events without a commitment record', () => {
    const s = withCommitment((raw) => {
      raw.tournaments.find((t) => t.id === 'live')!.category = 'WTA500';
    });
    expect(expectedZeroPointers(player(s, 'cat'), s.tournaments)).toEqual([]);
    const none = parseOrThrow(rawSeason());
    expect(expectedZeroPointers(player(none, 'cat'), none.tournaments)).toEqual([]);
  });

  it('counts in the projection and the breakdown (labelled expected), not in the current total or elimination', () => {
    // Cat has 3 results; a 4-result cap makes the zero-pointer count, pushing nothing out: totals equal, but it's listed.
    const s = withCommitment();
    const row = projectStandings(s.players, {}, s.tournaments, s.rules).find((r) => r.playerId === 'cat')!;
    expect(row.currentTotal).toBe(140);
    const entry = playerBreakdown(player(s, 'cat'), {}, s.tournaments, s.rules).entries.find((e) => e.tournamentId === 'live');
    expect(entry).toMatchObject({ round: 'ZP', points: 0, source: 'expected' });
    render(<ResultsBreakdown name="Cat Gamma" breakdown={playerBreakdown(player(s, 'cat'), {}, s.tournaments, s.rules)} />);
    expect(screen.getByText(/Live Masters zero-pointer/).parentElement).toHaveTextContent(/Live Masters zero-pointer 0 \(expected/);
    expect(eliminatedPlayers(s.players, s.tournaments, s.rules)).toEqual(eliminatedPlayers(parseOrThrow(rawSeason()).players, s.tournaments, s.rules));
  });

  it('pushes a low result out of the best results when she is at the cap', () => {
    // Cap of 3 results: Cat's 0 (slam ZP), 40 (m1000 F) and 100 (c250 W) all count today; the expected zero-pointer takes a place.
    const s = withCommitment((raw) => {
      raw.rules.maxCountedResults = 3;
      raw.rules.requiredGroups = [{ categories: ['GS'], count: 1 }, { categories: ['WTA1000'], count: 1 }];
      raw.players.find((p) => p.id === 'cat')!.officialRaceTotal = 140;
    });
    const row = projectStandings(s.players, {}, s.tournaments, s.rules).find((r) => r.playerId === 'cat')!;
    expect(row.projectedTotal).toBe(100);
  });
});
