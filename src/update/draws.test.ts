import { describe, expect, it } from 'vitest';
import type { EventPlayersFeed, LiveMatch } from './feedTypes';
import { isDrawOut, toDrawFile } from './draws';

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
