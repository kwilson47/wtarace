import { describe, expect, it } from 'vitest';
import { season } from '../test/fixtures';
import type { DrawFile, DrawMatch } from './drawSchema';
import { tournamentFacts } from './facts';

const player = (wtaId: number, name: string) => ({ wtaId, name, country: null, seed: null, entry: null });
const played = (round: number, a: number, b: number, winner: number): DrawMatch => ({ round, a, b, winner, score: '6-1 6-1', outcome: 'played' });

describe('tournamentFacts', () => {
  it("names a completed draw's champion, a live event's current round, and whether a draw is out", () => {
    // A 2-player "draw" for each: c500 done (Zed won), live still to play its only round.
    const done: DrawFile = { drawSize: 2, players: [player(7, 'Zed Zulu'), player(8, 'Yan Yu')], matches: [played(1, 7, 8, 7)] };
    const live: DrawFile = { drawSize: 2, players: [player(7, 'Zed Zulu'), player(8, 'Yan Yu')], matches: [{ round: 1, a: 7, b: 8, winner: null, score: '', outcome: 'scheduled' }] };
    const facts = tournamentFacts(season, { c500: done, live, next: live });
    expect(facts.c500).toEqual({ champion: 'Zed Zulu', round: null, drawOut: true });
    expect(facts.live).toEqual({ champion: null, round: 'Round of 32', drawOut: true });
    expect(facts.next).toMatchObject({ drawOut: true });
    expect(facts.clash).toEqual({ champion: null, round: null, drawOut: false });
  });

  it('falls back to a tracked winner when a completed event has no draw file', () => {
    // The fixture's ana won the slam and c500.
    expect(tournamentFacts(season, {}).slam).toEqual({ champion: 'Ana Alpha', round: null, drawOut: false });
  });
});
