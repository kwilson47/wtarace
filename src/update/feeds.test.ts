import { describe, expect, it } from 'vitest';
import { fetchRaceList } from './feeds';

describe('fetchRaceList', () => {
  it('reads every page and sorts by ranking, with the date when asked', async () => {
    const urls: string[] = [];
    const row = (ranking: number) => ({ ranking, points: 1, tournamentsPlayed: 0, player: { id: ranking, fullName: '', countryCode: '' } });
    const get = async (url: string) => {
      urls.push(url);
      return { content: url.includes('page=0') ? Array.from({ length: 100 }, (_, i) => row(200 - i)) : [row(3), row(1), row(2)] };
    };
    const rows = await fetchRaceList('2026-03-02', get);
    expect(rows.map((r) => r.ranking).slice(0, 3)).toEqual([1, 2, 3]);
    expect(rows).toHaveLength(103);
    expect(urls.every((u) => u.endsWith('&at=2026-03-02') && u.includes('metric=CHAMPSINGLES'))).toBe(true);
    await fetchRaceList('2026-03-02', get, 'SINGLES');
    expect(urls.at(-1)).toContain('metric=SINGLES');
  });
});
