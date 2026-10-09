import { describe, expect, it } from 'vitest';
import type { MatchRecord } from './matchSchema';
import { seasonSummary } from './seasonSummary';

const m = (over: Omit<Partial<MatchRecord>, 'opponent'> & { opponent?: Partial<MatchRecord['opponent']> }): MatchRecord => ({
  tournamentId: 1, year: 2026, tournament: 'Alpha', level: 'WTA 500', team: false, surface: 'Hard', indoor: false,
  startDate: '2026-02-01', endDate: '2026-02-07', qualifying: false, round: 1, roundName: 'R32',
  won: true, score: '6-1 6-1', outcome: 'played', points: 30,
  ...over,
  opponent: { id: 50, name: 'Opp', country: 'US', seed: null, entry: null, rank: 40, ...over.opponent },
});

// Alpha (500, hard): won the title over a top-10 player. Beta (Slam, clay, indoor): lost in the R32, after a walkover win.
// Gamma (ITF, grass): lost in qualifying R2. Delta (1000, hard): still going on 2026-10-09.
const season: MatchRecord[] = [
  m({ round: 1, roundName: 'R32' }),
  m({ round: 2, roundName: 'R16' }),
  m({ round: 3, roundName: 'Q' }),
  m({ round: 4, roundName: 'S' }),
  m({ round: 5, roundName: 'F', points: 500, opponent: { rank: 7 } }),
  m({ tournamentId: 2, tournament: 'Beta', level: 'Grand Slam', surface: 'Clay', indoor: true, startDate: '2026-05-24', endDate: '2026-06-07', round: 1, roundName: 'R128', outcome: 'walkover', score: '', points: 10 }),
  m({ tournamentId: 2, tournament: 'Beta', level: 'Grand Slam', surface: 'Clay', indoor: true, startDate: '2026-05-24', endDate: '2026-06-07', round: 2, roundName: 'R64', points: 70 }),
  m({ tournamentId: 2, tournament: 'Beta', level: 'Grand Slam', surface: 'Clay', indoor: true, startDate: '2026-05-24', endDate: '2026-06-07', round: 3, roundName: 'R32', won: false, outcome: 'retired', score: '4-6 2-0', points: 130 }),
  m({ tournamentId: 3, tournament: 'Gamma', level: 'ITF', surface: 'Grass', startDate: '2026-06-15', endDate: '2026-06-21', qualifying: true, round: 1, roundName: 'R32', points: null }),
  m({ tournamentId: 3, tournament: 'Gamma', level: 'ITF', surface: 'Grass', startDate: '2026-06-15', endDate: '2026-06-21', qualifying: true, round: 2, roundName: 'R16', won: false, points: null }),
  m({ tournamentId: 4, tournament: 'Delta', level: 'WTA 1000', startDate: '2026-10-05', endDate: '2026-10-18', round: 2, roundName: 'R32', points: 65 }),
];

describe('seasonSummary', () => {
  const s = seasonSummary(season, '2026-10-09');

  it('counts the record, leaving walkovers out and keeping retirements', () => {
    expect([s.wins, s.losses]).toEqual([8, 2]);
  });

  it('splits by surface, indoor and level, leaving out empty rows', () => {
    expect(s.surfaces).toEqual([
      { label: 'Hard', wins: 6, losses: 0 },
      { label: 'Clay', wins: 1, losses: 1 },
      { label: 'Grass', wins: 1, losses: 1 },
    ]);
    expect(s.indoor).toEqual({ label: 'Indoor', wins: 1, losses: 1 });
    expect(s.levels.map((l) => `${l.label} ${l.wins}-${l.losses}`)).toEqual(['Grand Slam 1-1', 'WTA 1000 1-0', 'WTA 500 5-0', 'ITF 1-1']);
  });

  it('finds titles, finals and top-10 wins', () => {
    expect(s.titles).toEqual(['Alpha']);
    expect(s.finals).toBe(1);
    expect(s.top10Wins).toBe(1);
  });

  it('builds tournament blocks, newest first, with results and points', () => {
    expect(s.tournaments.map((t) => [t.name, t.result, t.points, t.inProgress])).toEqual([
      ['Delta', 'In progress', null, true],
      ['Gamma', 'Lost in qualifying R2', null, false],
      ['Beta', 'R32', 130, false],
      ['Alpha', 'Winner', 500, false],
    ]);
    expect(s.tournaments[3]!.matches.map((x) => x.roundName)).toEqual(['F', 'S', 'Q', 'R16', 'R32']);
  });
});
