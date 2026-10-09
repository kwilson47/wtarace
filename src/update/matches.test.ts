import { describe, expect, it } from 'vitest';
import { playerMatch, updaterSeason } from './testFeeds';
import { toMatchRecords } from './matches';

const event = (over: Record<string, unknown> = {}) => ({
  tournamentGroup: { id: 903, name: 'CITY' }, year: 2026, title: 'City 500 - City', city: 'CITY', level: 'WTA 500',
  startDate: '2026-04-06', endDate: '2026-04-12', singlesDrawSize: 32, surface: 'Clay', inOutdoor: 'I', ...over,
});

describe('toMatchRecords', () => {
  it('keeps her side of each race-year match, as published', () => {
    const records = toMatchRecords(updaterSeason(), 2, [
      playerMatch({
        tourn_nbr: ' 903', player_1: '9', player_2: '2', winner: 2, round_name: 'Q', tourn_round: '3', scores: '6-1  4-6  6-2',
        reason_code: 'W', seed_1: 4, entry_type_1: 'W', rank_1: 8, points_2: 108, opponent: { id: 9, fullName: 'Opp One', countryCode: 'BEL' },
        tournament: event(),
      }),
    ]);
    expect(records).toEqual([{
      tournamentId: 903, year: 2026, tournament: 'City 500', level: 'WTA 500', team: false, surface: 'Clay', indoor: true,
      startDate: '2026-04-06', endDate: '2026-04-12', qualifying: false, round: 3, roundName: 'Q',
      opponent: { id: 9, name: 'Opp One', country: 'BE', seed: 4, entry: 'WC', rank: 8 },
      won: true, score: '6-1 4-6 6-2', outcome: 'played', points: 108,
    }]);
  });

  it('marks retirements and walkovers, drops byes, the previous WTA Finals and anything outside the race year', () => {
    const raw = updaterSeason();
    const base = { tourn_nbr: '903', player_1: '2', tournament: event() };
    const records = toMatchRecords(raw, 2, [
      playerMatch({ ...base, tourn_round: '1', round_name: 'R32', reason_code: 'R', scores: '4-6  2-0', winner: 1 }),
      playerMatch({ ...base, tourn_round: '2', round_name: 'R16', reason_code: 'D', scores: '', winner: 2 }),
      playerMatch({ ...base, tourn_round: '1', round_name: 'R32', reason_code: 'B', winner: 1 }),
      playerMatch({ tourn_nbr: '808', player_1: '2', tournament: event({ tournamentGroup: { id: 808, name: 'WTA FINALS' }, level: 'Finals', startDate: '2026-01-20' }) }),
      playerMatch({ tourn_nbr: '903', player_1: '2', tournament: event({ startDate: '2025-06-01' }) }),
    ]);
    expect(records.map((r) => [r.round, r.outcome, r.won, r.score])).toEqual([[1, 'retired', true, '4-6 2-0'], [2, 'walkover', false, '']]);
  });

  it('names events we do not track by city, falls back for a missing level, and spots team events', () => {
    const raw = updaterSeason();
    const records = toMatchRecords(raw, 2, [
      playerMatch({ tourn_nbr: '4463', player_1: '2', tournament: event({ tournamentGroup: { id: 4463, name: 'X', level: 'ITF' }, level: undefined, city: 'SZEKESFEHERVAR', title: 'W75 Szekesfehervar' }) }),
      playerMatch({ tourn_nbr: '2084', player_1: '2', round_name: '', tourn_round: '9', tournament: event({ tournamentGroup: { id: 2084, name: 'UNITED CUP' }, title: 'United Cup - Perth', city: 'PERTH', startDate: '2026-01-15' }) }),
    ]);
    expect(records.map((r) => [r.tournament, r.level, r.team])).toEqual([['Perth', 'WTA 500', true], ['Szekesfehervar', 'ITF', false]]);
  });
});
