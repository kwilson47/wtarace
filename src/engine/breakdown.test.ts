import { describe, expect, it } from 'vitest';
import { season } from '../test/fixtures';
import { playerBreakdown } from './breakdown';
import type { Scenario } from './types';

const breakdown = (id: string, scenario: Scenario = {}) =>
  playerBreakdown(season.players.find((p) => p.id === id)!, scenario, season.tournaments, season.rules);
const summary = (id: string, scenario: Scenario = {}) =>
  breakdown(id, scenario).entries.map((e) => `${e.tournamentId} ${e.round} ${e.points}${e.counted ? '' : ' dropped'} ${e.source}`);

describe('playerBreakdown', () => {
  it('lists results by category, then date, marking what counts and where each came from', () => {
    // 4 results count: the slam and the m1000 are required, then the best 2 of (100, 40, 10).
    expect(summary('ana')).toEqual([
      'slam W 1000 result',
      'm1000 SF 20 result',
      'live QF 10 dropped live',
      'c500 W 100 result',
      'c250 F 40 result',
    ]);
    const b = breakdown('ana');
    expect(b.total).toBe(1160);
    expect(b.countedResults).toBe(4);
    expect(b.maxCountedResults).toBe(4);
    // m1000, live and c500 are in the event-minimum categories.
    expect(b.minEvents).toEqual({ played: 3, required: 2, waived: false });
  });

  it('shows picks, and the result a pick pushes out of the count', () => {
    // A live title (100) counts instead of the c250 final (40).
    expect(summary('ana', { 'ana|live': 'W', 'ana|next': 'R16' })).toEqual([
      'slam W 1000 result',
      'm1000 SF 20 result',
      'live W 100 pick',
      'c500 W 100 result',
      'next R16 1 dropped pick',
      'c250 F 40 dropped result',
    ]);
  });

  it('keeps zero-pointers, which always count but are not events played', () => {
    expect(summary('cat')).toEqual(['slam ZP 0 result', 'm1000 F 40 result', 'c250 W 100 result']);
    expect(breakdown('cat').minEvents).toEqual({ played: 1, required: 2, waived: false });
  });
});
