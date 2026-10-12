import { describe, expect, it } from 'vitest';
import type { DrawFile } from '../draws/drawSchema';
import { commitmentFor, directPlaces, entryDeadline } from './commitment';

const p = (wtaId: number, entry: string | null = null) => ({ wtaId, name: `P${wtaId}`, country: null, seed: null, entry });

describe('commitment', () => {
  it('puts the entry deadline 4 weeks before the start week (6 for a Grand Slam)', () => {
    expect(entryDeadline({ startDate: '2026-09-30', category: 'WTA1000C' })).toBe('2026-08-31'); // Beijing starts on a Wednesday
    expect(entryDeadline({ startDate: '2026-10-12', category: 'WTA1000' })).toBe('2026-09-14');
    // A Sunday start belongs to the following week (the US Open's main draw starts Sunday 2026-08-30, the week of Aug 31).
    expect(entryDeadline({ startDate: '2026-08-30', category: 'GS' })).toBe('2026-07-20');
  });

  it('counts direct-entry places: the draw size less qualifiers, wild cards, special exempts, protected rankings and open lines', () => {
    // A lucky loser or alternate fills a place freed by a withdrawal: at the deadline it was a direct acceptance.
    const draw: DrawFile = {
      drawSize: 10,
      players: [p(1), p(2), p(3, 'Q'), p(4, 'WC'), p(5), p(6, 'LL'), p(7, 'Alt'), p(8, 'SE'), p(9, 'PR')],
      matches: [],
      lines: [1, 2, 3, 4, 5, 6, 7, 8, 9, null],
    };
    expect(directPlaces(draw)).toBe(5);
  });

  it('records the tracked players ranked within the places at the deadline', () => {
    const draw: DrawFile = { drawSize: 4, players: [p(1), p(2), p(3), p(4, 'Q')], matches: [], lines: [1, 2, 3, 4] };
    const row = (ranking: number, id: number) => ({ ranking, points: 0, tournamentsPlayed: 0, player: { id, fullName: '', countryCode: '' } });
    const players = [{ id: 'ana', wtaId: 10 }, { id: 'bea', wtaId: 20 }, { id: 'cat', wtaId: 30 }];
    expect(commitmentFor({ startDate: '2026-10-12', category: 'WTA1000' }, draw, [row(2, 10), row(3, 20), row(4, 30)], players)).toEqual({
      deadline: '2026-09-14',
      ranks: { ana: 2, bea: 3 },
    });
  });
});
