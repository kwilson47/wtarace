import { describe, expect, it } from 'vitest';
import type { RaceRow } from '../update/feedTypes';
import { appendWeek, emptyHistory, fillPlayer, listDate, updateHistory } from '../update/history';
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

describe('updateHistory (the hourly stage)', () => {
  it('fills the past weeks of a player added in the same run as a new list, sharing the fetched lists', async () => {
    const h = appendWeek(appendWeek(emptyHistory(), list('2026-03-02'), tracked)!, list('2026-03-16'), tracked)!;
    const fetched: (string | undefined)[] = [];
    const fetchList = async (at?: string) => {
      fetched.push(at);
      return at ? list(at) : list('2026-03-30');
    };
    const withNew = [...tracked, { id: 'dee', wtaId: 4, name: 'Dee' }, { id: 'eve', wtaId: 5, name: 'Eve' }];
    const out = await updateHistory(h, list('2026-03-30'), withNew, fetchList);
    expect(out.history.dates).toEqual(['2026-03-02', '2026-03-16', '2026-03-30']);
    expect(out.history.players.dee).toEqual([[4, 850], [4, 850], [4, 850]]);
    expect(out.history.players.eve).toEqual([[5, 800], [5, 800], [5, 800]]);
    expect(fetched).toEqual([undefined, '2026-03-02', '2026-03-16']); // each past list fetched once, for both players
    expect(out.changes).toEqual(['Race history: week of 2026-03-30 added', "Race history: Dee's past weeks filled", "Race history: Eve's past weeks filled"]);
  });

  it("keeps the history and says what failed when a list doesn't load", async () => {
    const h = appendWeek(emptyHistory(), list('2026-03-02'), tracked)!;
    const out = await updateHistory(h, list('2026-03-16'), tracked, async () => {
      throw new Error('HTTP 503');
    });
    expect(out.history).toBe(h);
    expect(out.changes).toEqual([]);
    expect(out.notes).toEqual(["Race history: the new race list didn't load (HTTP 503), so the history was kept."]);
  });

  it("leaves a player whose past weeks didn't load out of the file, so the next run tries again", async () => {
    const h = appendWeek(emptyHistory(), list('2026-03-02'), tracked)!;
    const fetchList = async (at?: string) => {
      if (at) throw new Error('HTTP 503');
      return list('2026-03-16');
    };
    const out = await updateHistory(h, list('2026-03-16'), [...tracked, { id: 'dee', wtaId: 4, name: 'Dee' }], fetchList);
    expect(out.history.dates).toEqual(['2026-03-02', '2026-03-16']);
    expect(out.history.players.dee).toBeUndefined();
    expect(out.notes).toEqual(["Race history: past weeks for Dee couldn't be filled (HTTP 503); the next run will try again."]);
  });

  it('does nothing when no new list is out and nobody needs filling', async () => {
    const h = appendWeek(emptyHistory(), list('2026-03-02'), tracked)!;
    const out = await updateHistory(h, list('2026-03-02'), tracked, async () => {
      throw new Error('should not fetch');
    });
    expect(out).toEqual({ history: h, changes: [], notes: [] });
  });
});

