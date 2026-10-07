import { describe, expect, it } from 'vitest';
import { pickOptions, pickProblem } from './picks';
import { season } from '../test/fixtures';

const { rules } = season;
const player = (id: string) => season.players.find((p) => p.id === id)!;
const tournament = (id: string) => season.tournaments.find((t) => t.id === id)!;
const rounds = (o: ReturnType<typeof pickOptions>) => (o.kind === 'open' ? o.rounds.map((r) => r.round) : o.label);

describe('pickOptions', () => {
  it('offers Not playing and every round at an upcoming event', () => {
    const o = pickOptions(player('bea'), tournament('clash'), rules);
    expect(o).toMatchObject({ kind: 'open', allowNone: true, currentRound: null });
    expect(rounds(o)).toEqual(['R32', 'R16', 'QF', 'SF', 'F', 'W']);
  });

  it('skips the first round for a player with a bye', () => {
    expect(rounds(pickOptions(player('ana'), tournament('next'), rules))).toEqual(['R16', 'QF', 'SF', 'F', 'W']);
  });

  it('starts at the current round for an alive player and has no Not playing', () => {
    const o = pickOptions(player('ana'), tournament('live'), rules);
    expect(o).toMatchObject({ kind: 'open', allowNone: false, currentRound: { round: 'QF' } });
    expect(rounds(o)).toEqual(['QF', 'SF', 'F', 'W']);
  });

  it('locks an eliminated player', () => {
    expect(pickOptions(player('bea'), tournament('live'), rules)).toEqual({ kind: 'locked', label: 'Out in Round of 16' });
  });

  it('locks a player not in the draw of an in-progress event', () => {
    expect(pickOptions(player('cat'), tournament('live'), rules)).toEqual({ kind: 'locked', label: 'Not in draw' });
  });
});

describe('pickProblem', () => {
  it.each([
    ['ana', 'live', 'SF', null],
    ['ana', 'next', 'W', null],
    ['ana', 'slam', 'W', 'completed'],
    ['bea', 'live', 'W', 'eliminated'],
    ['cat', 'live', 'W', 'not-in-draw'],
    ['ana', 'live', 'R16', 'below-current-round'],
    ['ana', 'next', 'R32', 'invalid-round'],
    ['ana', 'clash', 'XX', 'invalid-round'],
  ])('%s at %s picking %s → %s', (playerId, tournamentId, round, expected) => {
    expect(pickProblem(player(playerId), tournament(tournamentId), round, rules)).toBe(expected);
  });
});
