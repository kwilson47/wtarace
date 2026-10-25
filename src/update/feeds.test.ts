import { describe, expect, it } from 'vitest';
import { fetchPlayerMatches, fetchRaceList } from './feeds';

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

describe('fetchPlayerMatches', () => {
  const match = (tourn: string, start: string, round: string, points: number | null) => ({
    TournamentName: tourn, tourn_nbr: tourn === 'NINGBO' ? '2092' : '1020', tourn_year: '2026', StartDate: `${start}T00:00:00+00:00`,
    round_name: round, qpm_flag: 'M', player_1: '7', player_2: tourn + round, points_champ_1: points, points_champ_2: null,
  });
  it("adds the newest matches from a smaller page when the full page is a stale copy (the WTA's backend does this by page size)", async () => {
    const urls: string[] = [];
    const get = async (url: string) => {
      urls.push(url);
      if (url.includes('pageSize=100')) return { matches: [match('BEIJING', '2026-09-30', 'R32', null)] }; // stale: no Ningbo, points not yet posted
      return { matches: [match('NINGBO', '2026-10-19', 'W', 500), match('BEIJING', '2026-09-30', 'R32', 10)] };
    };
    const rows = await fetchPlayerMatches(7, '2025-10-27', get);
    expect(rows.map((m) => [m.TournamentName, m.points_champ_1])).toEqual([['NINGBO', 500], ['BEIJING', 10]]);
    expect(urls.some((u) => u.includes('pageSize=25'))).toBe(true);
  });

  it('keeps the full history when the small page is the stale one', async () => {
    const get = async (url: string) =>
      url.includes('pageSize=100')
        ? { matches: [match('NINGBO', '2026-10-19', 'W', 500), match('BEIJING', '2026-09-30', 'R32', 10)] }
        : { matches: [match('BEIJING', '2026-09-30', 'R32', 10)] };
    const rows = await fetchPlayerMatches(7, '2025-10-27', get);
    expect(rows.map((m) => m.TournamentName)).toEqual(['NINGBO', 'BEIJING']);
  });
});
