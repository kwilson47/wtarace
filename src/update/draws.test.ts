import { describe, expect, it } from 'vitest';
import type { EventPlayersFeed, LiveMatch } from './feedTypes';
import { isDrawOut, toDrawFile, updateDrawFiles } from './draws';
import { updaterSeason } from './testFeeds';

const table = [{ round: 'R32' }, { round: 'R16' }, { round: 'QF' }, { round: 'SF' }, { round: 'F' }, { round: 'W' }];
const players: EventPlayersFeed = {
  events: [
    { eventTypeCode: 'RS', eventPlayers: [] },
    {
      eventTypeCode: 'LS',
      eventPlayers: [
        { players: [{ id: 1, fullName: 'Ana Alpha', countryCode: 'ESP' }], seed: '1', entryType: '' },
        { players: [{ id: 2, fullName: 'Bea Beta', countryCode: 'USA' }], seed: '', entryType: 'Q' },
        { players: [{ id: 3, fullName: 'Cat Gamma', countryCode: null }], seed: '', entryType: 'WC' },
      ],
    },
  ],
};
const m = (over: Partial<LiveMatch>): LiveMatch => ({ DrawMatchType: 'S', DrawLevelType: 'M', RoundID: 1, MatchState: 'F', PlayerIDA: '2', PlayerIDB: '3', ...over });

describe('toDrawFile', () => {
  it('keeps the draw order and every main-draw singles match, as published', () => {
    const draw = toDrawFile(table, players, [
      m({ Winner: '3', ScoreString: '6-4,6-4' }),
      m({ RoundID: 'Q', PlayerIDA: '1', PlayerIDB: '3', Winner: '4', ScoreString: "6-1,3-0 Ret'd" }),
      m({ RoundID: 'S', PlayerIDA: '1', PlayerIDB: '9', MatchState: 'U' }),
      m({ DrawLevelType: 'Q', PlayerIDA: '5', PlayerIDB: '6' }),
      m({ DrawMatchType: 'D' }),
    ]);
    expect(draw.drawSize).toBe(3);
    expect(draw.players).toEqual([
      { wtaId: 1, name: 'Ana Alpha', country: 'ES', seed: 1, entry: null },
      { wtaId: 2, name: 'Bea Beta', country: 'US', seed: null, entry: 'Q' },
      { wtaId: 3, name: 'Cat Gamma', country: null, seed: null, entry: 'WC' },
    ]);
    expect(draw.matches).toEqual([
      { round: 1, a: 2, b: 3, winner: 3, score: '6-4 6-4', outcome: 'played' },
      { round: 3, a: 1, b: 3, winner: 1, score: '6-1 3-0', outcome: 'retired' },
      { round: 4, a: 1, b: 9, winner: null, score: '', outcome: 'scheduled' },
    ]);
  });

  it('marks a walkover, and knows when the draw is out', () => {
    const draw = toDrawFile(table, players, [m({ Winner: '2', ScoreString: '' })]);
    expect(draw.matches[0]).toMatchObject({ winner: 2, outcome: 'walkover' });
    expect(isDrawOut([])).toBe(false);
    expect(isDrawOut([m({ DrawLevelType: 'Q' })])).toBe(false);
    expect(isDrawOut([m({ MatchState: 'U' })])).toBe(true);
  });
});

describe('rounds of upcoming matches', () => {
  it('takes the round from the match id, which the feed numbers from the final down', () => {
    // An unplayed semifinal published with RoundID 2: the match id LS003 still places it in the semifinals.
    const draw = toDrawFile(table, players, [m({ RoundID: 2, MatchState: 'U', MatchID: 'LS003' }), m({ RoundID: '1', MatchID: 'LS016', Winner: '2', ScoreString: '6-1,6-1' })]);
    expect(draw.matches.map((x) => x.round)).toEqual([1, 4]);
  });
});

describe('updateDrawFiles', () => {
  const raw = updaterSeason();
  const feeds = (matches: LiveMatch[]) => ({ players: { '905-2026': players }, matches: { '905-2026': matches } });

  it('writes a draw once it is out, and only when it changes', () => {
    expect(updateDrawFiles(raw, feeds([]), {}, []).files).toEqual({});
    const first = updateDrawFiles(raw, feeds([m({ Winner: '3', ScoreString: '6-4,6-4' })]), {}, []);
    expect(Object.keys(first.files)).toEqual(['live']);
    expect(first.changes).toEqual(['Draw: Live Masters added']);
    expect(updateDrawFiles(raw, feeds([m({ Winner: '3', ScoreString: '6-4,6-4' })]), first.files, []).files).toEqual({});
    const more = updateDrawFiles(raw, feeds([m({ Winner: '3', ScoreString: '6-4,6-4' }), m({ RoundID: 2, PlayerIDA: '1', PlayerIDB: '3', MatchState: 'U' })]), first.files, []);
    expect(more.changes).toEqual(['Draw: Live Masters updated']);
  });

  it("keeps the previous draw when an event's feeds failed", () => {
    const out = updateDrawFiles(raw, { players: {}, matches: {} }, { live: { drawSize: 0, players: [], matches: [] } }, ['live']);
    expect(out.files).toEqual({});
    expect(out.notes).toEqual(["Live Masters: its draw feeds didn't load, so the previous draw was kept."]);
  });
});

describe('updateDrawFiles: review fixes', () => {
  const key = '905-2026';

  it("never uses another year's feed for an event that shares its WTA id", () => {
    const raw = updaterSeason();
    const other = { players: { '905-2025': players }, matches: { '905-2025': [m({ Winner: '3', ScoreString: '6-4,6-4' })] } };
    expect(updateDrawFiles(raw, other, {}, []).files).toEqual({});
  });

  it('keeps the previous draw when an event feed has something it cannot read', () => {
    const raw = updaterSeason();
    const out = updateDrawFiles(raw, { players: { [key]: players }, matches: { [key]: [m({ RoundID: 'X', MatchID: undefined, Winner: '3' })] } }, {}, []);
    expect(out.files).toEqual({});
    expect(out.notes[0]).toMatch(/^Live Masters: its draw feed had something unexpected/);
  });

  it('keeps the previous draw when the draw list comes back empty or short', () => {
    const raw = updaterSeason();
    const empty = { events: [{ eventTypeCode: 'RS', eventPlayers: [] }] };
    const out = updateDrawFiles(raw, { players: { [key]: empty }, matches: { [key]: [m({ Winner: '3', ScoreString: '6-4,6-4' })] } }, { live: { drawSize: 3, players: [], matches: [] } }, []);
    expect(out.files).toEqual({});
    expect(out.notes[0]).toMatch(/^Live Masters: its draw list came back empty or short/);
  });
});
