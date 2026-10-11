import { describe, expect, it } from 'vitest';
import type { RaceRow } from '../update/feedTypes';
import { appendWeek, emptyHistory, fillPlayer, listDate } from '../update/history';
import { validateHistory } from './validateHistory';

const row = (ranking: number, id: number, points: number, date = '2026-03-02'): RaceRow => ({
  ranking, points, tournamentsPlayed: 0, rankedAt: `${date}T00:00:00Z`, player: { id, fullName: `P${id}`, countryCode: 'USA' },
});
// Ten players on the list, ids 1..10, ranked in order; tracked players are ana (1), bea (2) and cat (99, not on the list).
const list = (date: string, bump = 0) => Array.from({ length: 10 }, (_, i) => row(i + 1, i + 1, 1000 - i * 50 + bump, date)).reverse();
const tracked = [{ id: 'ana', wtaId: 1 }, { id: 'bea', wtaId: 2 }, { id: 'cat', wtaId: 99 }];

describe('race history', () => {
  it('appends a newly published week, aligned for every tracked player, with the 8th-place points', () => {
    const h = appendWeek(emptyHistory(), list('2026-03-02'), tracked)!;
    expect(h.dates).toEqual(['2026-03-02']);
    expect(h.players).toEqual({ ana: [[1, 1000]], bea: [[2, 950]], cat: [null] });
    expect(h.eighth).toEqual([650]);
    const next = appendWeek(h, list('2026-03-16', 100), tracked)!;
    expect(next.dates).toEqual(['2026-03-02', '2026-03-16']);
    expect(next.players.ana).toEqual([[1, 1000], [1, 1100]]);
  });

  it("ignores a list that isn't newer than the last stored week", () => {
    const h = appendWeek(emptyHistory(), list('2026-03-16'), tracked)!;
    expect(appendWeek(h, list('2026-03-16'), tracked)).toBeNull();
    expect(appendWeek(h, list('2026-03-02'), tracked)).toBeNull();
    expect(listDate([])).toBeNull();
  });

  it("gives a player added later her past weeks, and a new week's entry for players who had none", () => {
    let h = appendWeek(emptyHistory(), list('2026-03-02'), tracked)!;
    h = appendWeek(h, list('2026-03-16'), [...tracked, { id: 'dee', wtaId: 4 }])!;
    expect(h.players.dee).toEqual([null, [4, 850]]);
    h = fillPlayer(h, 'dee', 4, { '2026-03-02': list('2026-03-02') });
    expect(h.players.dee).toEqual([[4, 850], [4, 850]]);
  });

  it('validates lengths, values and players', () => {
    const h = appendWeek(emptyHistory(), list('2026-03-02'), tracked)!;
    expect(validateHistory(h, ['ana', 'bea', 'cat'])).toEqual([]);
    expect(validateHistory({ ...h, eighth: [] }, ['ana', 'bea', 'cat'])[0]).toMatch(/eighth/);
    expect(validateHistory({ ...h, players: { ...h.players, zed: [[1, 5]] } }, ['ana', 'bea', 'cat'])[0]).toMatch(/zed/);
    expect(validateHistory({ ...h, dates: ['2026-03-02', '2026-03-02'], eighth: [1, 1], players: {} }, [])[0]).toMatch(/dates/);
  });
});
