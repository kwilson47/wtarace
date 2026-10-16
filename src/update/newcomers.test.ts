import { describe, expect, it } from 'vitest';
import { newcomers } from './newcomers';
import { snapshot, updaterSeason } from './testFeeds';

// The fixture's live event has player 105 through to the quarterfinals (QF = 10 points), not yet in the race feed's total.
const withPlayer105 = (points: number, ranking = 5) => {
  const raw = updaterSeason();
  const snap = snapshot(raw);
  snap.race.push({ ranking, points, tournamentsPlayed: 3, player: { id: 105, fullName: 'Eve Echo', countryCode: 'FRA' } });
  return { raw, snap };
};

describe('newcomers', () => {
  it("adds a player outside the race feed's top N when her points from an event under way lift her into it", () => {
    // Top 3 live: ana, bea, then Eve on 135 + 10 = 145 ahead of cat on 140.
    const { raw, snap } = withPlayer105(135);
    expect(newcomers(raw, snap, 3).map((r) => [r.player.id, r.live])).toEqual([[105, 145]]);
  });

  it('leaves her out when even her live total stays below the top N', () => {
    const { raw, snap } = withPlayer105(120);
    expect(newcomers(raw, snap, 3)).toEqual([]);
  });

  it("still adds anyone inside the race feed's own top N", () => {
    const { raw, snap } = withPlayer105(1, 3);
    expect(newcomers(raw, snap, 4).map((r) => r.player.id)).toEqual([105]);
  });

  it('adds a player outside the top N who passes the lowest tracked player on live points', () => {
    // Top 2 live are ana and bea; cat (140, tracked) is the lowest we track. Eve's 135 + 10 = 145 passes her.
    const { raw, snap } = withPlayer105(135);
    expect(newcomers(raw, snap, 2).map((r) => [r.player.id, r.live])).toEqual([[105, 145]]);
  });

  it('adds a player level with the lowest tracked player, but not one below her', () => {
    expect(newcomers(withPlayer105(130).raw, withPlayer105(130).snap, 2).map((r) => r.player.id)).toEqual([105]); // 140, level with cat
    const { raw, snap } = withPlayer105(129); // 139
    expect(newcomers(raw, snap, 2)).toEqual([]);
  });

  it("counts an event's played matches even before our data marks it under way, so both callers agree", () => {
    const { raw, snap } = withPlayer105(135);
    raw.tournaments.find((t) => t.id === 'live')!.status = 'upcoming';
    expect(newcomers(raw, snap, 3).map((r) => r.player.id)).toEqual([105]);
  });
});
