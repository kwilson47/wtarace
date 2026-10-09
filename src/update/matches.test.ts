import { describe, expect, it } from 'vitest';
import { playerMatch, updaterSeason } from './testFeeds';
import { toMatchRecords, updateMatchFiles } from './matches';

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

describe('updateMatchFiles', () => {
  const raw = updaterSeason();
  const feed = [playerMatch({ tourn_nbr: '903', player_1: '2', round_name: 'R32', winner: 1, opponent: { id: 9, fullName: 'Opp One', countryCode: 'BEL' }, tournament: event() })];

  it('writes a file for each player whose matches changed, naming the new matches', () => {
    const out = updateMatchFiles(raw, { '2': feed }, [], {});
    expect(Object.keys(out.files)).toEqual(['bea']);
    expect(out.changes).toEqual(['Matches: Bea Beta +1 (first fill)']);
    const again = updateMatchFiles(raw, { '2': feed }, [], { bea: out.files.bea });
    expect(again.files).toEqual({});
    const more = [...feed, playerMatch({ tourn_nbr: '903', player_1: '2', round_name: 'R16', tourn_round: '2', winner: 2, opponent: { id: 8, fullName: 'Opp Two', countryCode: 'USA' }, tournament: event() })];
    expect(updateMatchFiles(raw, { '2': more }, [], { bea: out.files.bea }).changes).toEqual(['Matches: Opp Two d. Bea Beta (City 500 R16)']);
  });

  it('keeps her previous file when her feed failed, with a note', () => {
    const out = updateMatchFiles(raw, {}, [2], { bea: [] });
    expect(out.files).toEqual({});
    expect(out.notes).toEqual(["Bea Beta: her match feed didn't load, so her previous matches were kept."]);
  });
});

describe('matches at an event under way', () => {
  it("fills in her finished matches from the event's own feed until her match feed has them", async () => {
    const { snapshot, TOURNAMENT_IDS } = await import('./testFeeds');
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.eventMatches[TOURNAMENT_IDS.live!] = [
      {
        DrawMatchType: 'S', DrawLevelType: 'M', RoundID: 1, MatchState: 'F', PlayerIDA: '1', PlayerIDB: '102', Winner: '2',
        PlayerNameFirstA: 'Ana', PlayerNameLastA: 'Alpha', PlayerNameFirstB: 'Opp', PlayerNameLastB: 'Two', PlayerCountryB: 'BEL', SeedB: '', EntryTypeB: 'Q', ScoreString: '6-3,7-6(4)',
      },
      {
        DrawMatchType: 'S', DrawLevelType: 'M', RoundID: 'Q', MatchState: 'F', PlayerIDA: '105', PlayerIDB: '1', Winner: '4',
        PlayerNameFirstA: 'Big', PlayerNameLastA: 'Seed', PlayerCountryA: 'USA', SeedA: '3', ScoreString: "6-1,3-0 Ret'd",
      },
      { DrawMatchType: 'S', DrawLevelType: 'M', RoundID: 'S', MatchState: 'U', PlayerIDA: '1', PlayerIDB: '9' },
    ];
    snap.playerMatches = { '1': [] };
    const out = updateMatchFiles(raw, snap.playerMatches, [], {}, snap);
    expect(out.files.ana!.map((r) => [r.tournament, r.roundName, r.won, r.opponent.name, r.opponent.country, r.opponent.seed, r.opponent.entry, r.score, r.outcome, r.points])).toEqual([
      ['Live Masters', 'R32', true, 'Opp Two', 'BE', null, 'Q', '6-3 7-6(4)', 'played', null],
      ['Live Masters', 'Q', false, 'Big Seed', 'US', 3, null, '6-1 3-0', 'retired', null],
    ]);
    expect(out.files.ana![0]).toMatchObject({ level: 'WTA 1000', qualifying: false, round: 1 });
  });

  it('falls back to the event name when the feed gives no city', () => {
    const records = toMatchRecords(updaterSeason(), 2, [
      playerMatch({ tourn_nbr: '935', player_1: '2', tournament: event({ tournamentGroup: { id: 935, name: 'W100 SAINT-GAUDENS', level: 'ITF' }, city: '', level: 'ITF' }) }),
    ]);
    expect(records[0]!.tournament).toBe('W100 Saint-Gaudens');
  });

  it('keeps her previous file when the new records would not be valid', () => {
    const raw = updaterSeason();
    const bad = [playerMatch({ tourn_nbr: '903', player_1: '2', tournament: event({ startDate: 'soon' as unknown as string }) })];
    raw.tournaments[0]!.startDate = '2026-01-12';
    const out = updateMatchFiles(raw, { '2': bad.map((m) => ({ ...m, tournament: { ...m.tournament!, startDate: '2026-04-06', endDate: 'later' } })) }, [], { bea: [] });
    expect(out.files).toEqual({});
    expect(out.notes[0]).toMatch(/^Bea Beta: her match feed had something unexpected/);
  });
});
