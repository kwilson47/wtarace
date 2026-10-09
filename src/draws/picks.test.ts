import { describe, expect, it } from 'vitest';
import type { Season } from '../data/schema';
import { season as fixture } from '../test/fixtures';
import { buildBracket } from './bracket';
import type { DrawFile, DrawMatch } from './drawSchema';
import { applyPicks, clearTournamentPicks, drawPickKey, pickedRounds, pickWinner } from './picks';

// The fixture's live event (d32 table: R32 R16 QF SF F W) with a 4-player draw: 1 v 2 decided, 3 v 4 to play, then the final.
const season = (): Season => {
  const s = structuredClone(fixture);
  s.players.find((p) => p.id === 'ana')!.wtaId = 1;
  return s;
};
const player = (wtaId: number) => ({ wtaId, name: `P${wtaId}`, country: null, seed: null, entry: null });
const r1: DrawMatch = { round: 1, a: 1, b: 2, winner: 1, score: '6-1 6-1', outcome: 'played' };
const draw: DrawFile = { drawSize: 4, players: [1, 2, 3, 4].map(player), matches: [r1, { round: 1, a: 3, b: 4, winner: null, score: '', outcome: 'scheduled' }] };
const live = () => season().tournaments.find((t) => t.id === 'live')!;

describe('bracket picks', () => {
  it('keys tracked players by id and everyone else by WTA id', () => {
    expect(drawPickKey(season(), 1, 'live')).toBe('ana|live');
    expect(drawPickKey(season(), 3, 'live')).toBe('w3|live');
  });

  it('reads picks as the bracket round each player finishes in', () => {
    // A 4-player draw uses the table's first rounds: round 1 = R32, round 2 = R16, champion = round 3 (QF code).
    expect([...pickedRounds(season(), live(), draw, { 'w3|live': 'R16', 'ana|live': 'R32' }).entries()]).toEqual([[1, 1], [3, 2]]);
  });

  it('plays picks out: a player picked past a match wins it, reaching a round leaves it open, results stay fixed', () => {
    const bracket = buildBracket(draw)!;
    const none = applyPicks(bracket, new Map());
    expect(none[0]!.map((m) => [m.winner, m.pickable])).toEqual([[1, false], [null, true]]);
    expect(none[1]![0]).toMatchObject({ top: 1, bottom: null, pickable: false });
    const picked = applyPicks(bracket, new Map([[4, 2]]));
    expect(picked[0]![1]).toMatchObject({ winner: 4, picked: true });
    expect(picked[1]![0]).toMatchObject({ top: 1, bottom: 4, pickable: true, winner: null, picked: false }); // round 2 = reached the final
    const lost = applyPicks(bracket, new Map([[3, 1]]));
    expect(lost[0]![1]).toMatchObject({ winner: null, pickable: true });
    expect(applyPicks(bracket, new Map([[1, 3]]))[1]![0]).toMatchObject({ winner: 1, picked: true });
    const both = applyPicks(bracket, new Map([[3, 2], [4, 3]]));
    expect(both[0]![1]).toMatchObject({ winner: null, conflict: true });
  });

  it('turns a click into picks, keeps deeper picks, and clears on a second click', () => {
    const s = season();
    const t = live();
    const match = applyPicks(buildBracket(draw)!, new Map())[0]![1]!;
    const once = pickWinner({}, s, t, match, 3);
    expect(once).toEqual({ 'w3|live': 'R16', 'w4|live': 'R32' });
    const clicked = applyPicks(buildBracket(draw)!, pickedRounds(s, t, draw, once))[0]![1]!;
    expect(pickWinner(once, s, t, clicked, 3)).toEqual({});
    const deeper = pickWinner({ 'w3|live': 'QF' }, s, t, match, 3);
    expect(deeper['w3|live']).toBe('QF');
    expect(clearTournamentPicks({ 'w3|live': 'QF', 'ana|next': 'W' }, 'live')).toEqual({ 'ana|next': 'W' });
  });
  it('un-picking a later match keeps how both players got there', () => {
    const s = season();
    const t = live();
    // 4 beat 3, then won the final over 1.
    const scenario = { 'w4|live': 'QF', 'w3|live': 'R32', 'ana|live': 'R16' };
    const final = applyPicks(buildBracket(draw)!, pickedRounds(s, t, draw, scenario))[1]![0]!;
    expect(final).toMatchObject({ winner: 4, picked: true });
    const after = pickWinner(scenario, s, t, final, 4);
    expect(after).toEqual({ 'w4|live': 'R16', 'w3|live': 'R32' }); // ana is in the final for real: no pick needed
    const replayed = applyPicks(buildBracket(draw)!, pickedRounds(s, t, draw, after));
    expect(replayed[0]![1]).toMatchObject({ winner: 4, picked: true });
    expect(replayed[1]![0]).toMatchObject({ winner: null, pickable: true });
  });
});
