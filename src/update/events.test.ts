import { describe, expect, it } from 'vitest';
import type { LiveMatch } from './feedTypes';
import { liveState } from './events';

// A 56 draw (wta1000-56): R64 R32 R16 QF SF F W.
const table = ['R64', 'R32', 'R16', 'QF', 'SF', 'F', 'W'].map((round) => ({ round }));
const m = (over: Partial<LiveMatch>): LiveMatch => ({ DrawMatchType: 'S', DrawLevelType: 'M', RoundID: 1, MatchState: 'U', PlayerIDA: '7', PlayerIDB: '8', ...over });

describe('liveState', () => {
  it('reads the round from the match id when the feed publishes an upcoming match with the wrong round (Wuhan 2026)', () => {
    // Ostapenko's first-round match came through as RoundID 6 (the final) with match id LS062.
    expect(liveState([m({ RoundID: 6, MatchID: 'LS062' })], 7, table, false)).toEqual({ state: 'alive', round: 'R64' });
    // Sakkari won her first round (LS046), and her next match came through as RoundID 5 (the semifinal) with id LS023.
    const sakkari = [m({ RoundID: '1', MatchID: 'LS046', MatchState: 'F', Winner: '2' }), m({ RoundID: 5, MatchID: 'LS023' })];
    expect(liveState(sakkari, 7, table, false)).toEqual({ state: 'alive', round: 'R32' });
  });

  it('falls back to the round id when there is no match id', () => {
    expect(liveState([m({ RoundID: 'Q', MatchState: 'F', Winner: '3' })], 7, table, false)).toEqual({ state: 'eliminated', round: 'QF' });
  });

  it("records a withdrawal before her first match (a walkover she gave, with a bye before it)", () => {
    // Player 7 has a bye; her R32 match (LS023) went to player 8 by walkover: she withdrew.
    const gave = m({ RoundID: 2, MatchID: 'LS023', MatchState: 'F', Winner: '3', ScoreString: '' });
    expect(liveState([gave], 7, table, true)).toEqual({ state: 'eliminated', round: 'R32', withdrew: true, walkoversOnly: true });
  });

  it('records walkovers only, when every win so far came without playing (Mertens at Singapore)', () => {
    // A walkover win in the R32, then a loss on court in the R16.
    const wo = m({ RoundID: 2, MatchID: 'LS023', MatchState: 'F', Winner: '2', ScoreString: 'W/O' });
    const lost = m({ RoundID: 3, MatchID: 'LS012', MatchState: 'F', Winner: '3', ScoreString: '6-2,6-2' });
    expect(liveState([wo, lost], 7, table, true)).toEqual({ state: 'eliminated', round: 'R16', walkoversOnly: true });
    expect(liveState([wo], 7, table, true)).toEqual({ state: 'alive', round: 'R16', walkoversOnly: true });
  });

  it('records neither once she has won a match on court', () => {
    const won = m({ RoundID: 2, MatchID: 'LS023', MatchState: 'F', Winner: '2', ScoreString: '6-1,6-1' });
    const gave = m({ RoundID: 3, MatchID: 'LS012', MatchState: 'F', Winner: '3', ScoreString: '' });
    expect(liveState([won, gave], 7, table, true)).toEqual({ state: 'eliminated', round: 'R16' });
  });
});
