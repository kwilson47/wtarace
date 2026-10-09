import { describe, expect, it } from 'vitest';
import type { DrawFile, DrawMatch } from './drawSchema';
import { buildBracket, finalists } from './bracket';

const player = (wtaId: number) => ({ wtaId, name: `P${wtaId}`, country: null, seed: null, entry: null });
const played = (round: number, a: number, b: number, winner: number, score = '6-1 6-1'): DrawMatch => ({ round, a, b, winner, score, outcome: 'played' });

// Six players in an 8 bracket: 1 and 6 have byes (Toronto-style, a seed first in each half with its bye).
const six: DrawFile = {
  drawSize: 6,
  players: [1, 2, 3, 4, 5, 6].map(player),
  matches: [played(1, 2, 3, 3), played(1, 4, 5, 4), played(2, 1, 3, 1), played(2, 4, 6, 6), played(3, 1, 6, 6, '7-6(3) 6-4')],
};

describe('buildBracket', () => {
  it('rebuilds a draw with byes, round by round', () => {
    const bracket = buildBracket(six)!;
    expect(bracket.size).toBe(8);
    expect(bracket.rounds.map((r) => r.map((m) => [m.top, m.bottom, m.winner, m.outcome]))).toEqual([
      [[1, 'bye', 1, 'bye'], [2, 3, 3, 'played'], [4, 5, 4, 'played'], [6, 'bye', 6, 'bye']],
      [[1, 3, 1, 'played'], [4, 6, 6, 'played']],
      [[1, 6, 6, 'played']],
    ]);
    expect(finalists(bracket)).toEqual({ champion: 6, runnerUp: 1, score: '7-6(3) 6-4' });
  });

  it('leaves undecided matches open, naming players the feed already pairs', () => {
    const live: DrawFile = { ...six, matches: [played(1, 2, 3, 3), played(1, 4, 5, 4), { round: 2, a: 3, b: 1, winner: null, score: '', outcome: 'scheduled' }] };
    const bracket = buildBracket(live)!;
    expect(bracket.rounds[1]!.map((m) => [m.top, m.bottom, m.winner, m.outcome])).toEqual([[1, 3, null, 'scheduled'], [4, 6, null, 'pending']]);
    expect(bracket.rounds[2]![0]).toMatchObject({ top: null, bottom: null, outcome: 'pending' });
    expect(finalists(bracket)).toEqual({ champion: null, runnerUp: null, score: '' });
  });

  it('handles a draw without byes, and refuses one whose first round does not fit', () => {
    const four: DrawFile = { drawSize: 4, players: [1, 2, 3, 4].map(player), matches: [played(1, 1, 2, 1), played(1, 3, 4, 4), played(2, 1, 4, 1)] };
    expect(finalists(buildBracket(four)!).champion).toBe(1);
    expect(buildBracket({ ...six, matches: [] })).toBeNull();
  });
});

describe('buildBracket: a match the feed never published', () => {
  it('fills it in as a walkover when the next round shows who went through', () => {
    // 4 → 6's match is missing, but 6 plays the final.
    const draw: DrawFile = { ...six, matches: six.matches.filter((m) => !(m.round === 2 && m.a === 4)) };
    const bracket = buildBracket(draw)!;
    expect(bracket.rounds[1]![1]).toMatchObject({ top: 4, bottom: 6, winner: 6, outcome: 'walkover', score: '' });
  });
});
