import { describe, expect, it } from 'vitest';
import { buildBracket } from '../draws/bracket';
import type { DrawFile } from '../draws/drawSchema';
import { bracketFromLines, fillOpenLines, randomDraw, seedPositions, simulateBracket } from './drawSim';
import { mulberry32 } from './random';

describe('simulated draws', () => {
  it('puts seeds at the ends of the draw, then the free ends of halves, quarters and eighths', () => {
    const p = seedPositions(64, 16, mulberry32(7));
    expect(p.slice(0, 2)).toEqual([0, 63]);
    expect(new Set(p.slice(2, 4))).toEqual(new Set([31, 32]));
    expect(new Set(p.slice(4, 8))).toEqual(new Set([15, 16, 47, 48]));
    expect(new Set(p.slice(8, 16))).toEqual(new Set([7, 8, 23, 24, 39, 40, 55, 56]));
  });

  it('builds a 56 draw: 64 lines, byes for the top 8 seeds, every entrant once, and the same draw for the same seed', () => {
    const entrants = [101, 102, 103, 104, 105];
    const d = randomDraw(64, 56, entrants, () => 1500, mulberry32(3));
    const lines = d.bracket.rounds[0]!.flatMap((m) => [m.top, m.bottom]);
    expect(lines).toHaveLength(64);
    expect(lines.filter((s) => s === 'bye')).toHaveLength(8);
    expect(lines[0]).toBe(101);
    expect(lines[1]).toBe('bye');
    expect(lines[63]).toBe(102);
    for (const id of entrants) expect(lines.filter((s) => s === id)).toHaveLength(1);
    expect(lines.filter((s) => typeof s === 'number' && s < 0)).toHaveLength(51);
    expect(d.field.size).toBe(51);
    expect(new Set(d.byes)).toEqual(new Set(entrants));
    expect(randomDraw(64, 56, entrants, () => 1500, mulberry32(3))).toEqual(d);
  });

  it('gives a 28 draw 4 byes and a 32 draw none', () => {
    const count = (size: number) => randomDraw(32, size, [1, 2], () => 1500, mulberry32(1)).bracket.rounds[0]!.filter((m) => m.outcome === 'bye').length;
    expect(count(28)).toBe(4);
    expect(count(32)).toBe(0);
  });

  it('plays out only undecided matches; results stand and the champion gets the round after the final', () => {
    const player = (wtaId: number) => ({ wtaId, name: `P${wtaId}`, country: null, seed: null, entry: null });
    const draw: DrawFile = {
      drawSize: 4,
      players: [1, 2, 3, 4].map(player),
      matches: [
        { round: 1, a: 1, b: 2, winner: 2, score: '6-1 6-1', outcome: 'played' },
        { round: 1, a: 3, b: 4, winner: null, score: '', outcome: 'scheduled' },
      ],
    };
    const strong = (id: number) => (id === 1 || id === 3 ? 3000 : 1000);
    for (let seed = 0; seed < 20; seed++) {
      const finish = simulateBracket(buildBracket(draw)!, strong, mulberry32(seed));
      expect(finish.has(1)).toBe(false); // lost for real: not re-decided
      expect(finish.get(4)).toBe(1);
      expect([finish.get(2), finish.get(3)].sort()).toEqual([2, 3]);
    }
  });

  it('a much stronger player nearly always wins', () => {
    const b = bracketFromLines([1, 2]);
    let wins = 0;
    const rng = mulberry32(9);
    for (let i = 0; i < 1000; i++) if (simulateBracket(b, (id) => (id === 1 ? 2400 : 1600), rng).get(1) === 2) wins++;
    expect(wins).toBeGreaterThan(980);
  });

  it('fills open qualifier slots in a real draw with field players, so nobody walks through them', () => {
    const bracket = buildBracket({ drawSize: 6, players: [1, 2].map((wtaId) => ({ wtaId, name: '', country: null, seed: null, entry: null })), matches: [], lines: [1, 'bye', 2, null, null, null, 'bye', null] })!;
    let next = -1;
    const filled = fillOpenLines(bracket, () => next--);
    expect(filled.rounds[0]!.map((m) => [m.top, m.bottom])).toEqual([[1, 'bye'], [2, -1], [-2, -3], ['bye', -4]]);
    expect(filled.rounds[0]![3]!.winner).toBe(-4);
    expect(bracket.rounds[0]![1]!.bottom).toBeNull(); // the original is untouched
    const finish = simulateBracket(filled, () => 1500, mulberry32(1));
    expect(finish.has(2)).toBe(true);
  });
});
