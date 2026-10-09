import type { Season } from '../data/schema';
import type { MatchRecord } from '../season/matchSchema';
import { season as fixture } from '../test/fixtures';

/** A match record with defaults for everything a test doesn't care about. */
export function rec(o: Omit<Partial<MatchRecord>, 'opponent'> & { opponent?: Partial<MatchRecord['opponent']> }): MatchRecord {
  return {
    tournamentId: 1, year: 2026, tournament: 'X', level: 'WTA 500', team: false, surface: 'Hard', indoor: false,
    startDate: '2026-03-02', endDate: '2026-03-08', qualifying: false, round: 1, roundName: 'R32',
    won: true, score: '6-1 6-1', outcome: 'played', points: null,
    ...o,
    opponent: { id: 10, name: 'Opp', country: null, seed: null, entry: null, rank: null, ...o.opponent },
  };
}

/** The fixture season with WTA ids: ana 1, bea 2, cat 3. */
export const withIds = (): Season => {
  const s = structuredClone(fixture);
  s.players.forEach((p, i) => (p.wtaId = i + 1));
  return s;
};
