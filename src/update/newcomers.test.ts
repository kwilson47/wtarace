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
});
