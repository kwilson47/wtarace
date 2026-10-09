import { describe, expect, it } from 'vitest';
import { season as realSeason } from '../data/season';
import { readMatchFiles } from '../update/writeData';
import { buildRatings, collectMatches, kFactor, priorFromRank, winChance } from './ratings';
import { rec, withIds } from './testHelpers';

describe('ratings', () => {
  it('starts from the WTA ranking: about 1,900 at No. 1, 1,500 at No. 200, clamped to 1–500', () => {
    expect(priorFromRank(1)).toBe(1900);
    expect(priorFromRank(200)).toBeCloseTo(1500, 6);
    expect(priorFromRank(0)).toBe(priorFromRank(1));
    expect(priorFromRank(900)).toBe(priorFromRank(500));
  });

  it('turns a rating gap into a win chance, and shrinks K as matches add up', () => {
    expect(winChance(1600, 1600)).toBe(0.5);
    expect(winChance(2000, 1600)).toBeCloseTo(0.909, 3);
    expect(kFactor(0)).toBeCloseTo(131.3, 1);
    expect(kFactor(30)).toBeLessThan(kFactor(0));
  });

  it('replays matches in date order, counts a match between two tracked players once, and skips walkovers', () => {
    const files = {
      ana: [
        rec({ startDate: '2026-04-06', round: 2, opponent: { id: 2, rank: 3 }, won: true }),
        rec({ startDate: '2026-03-02', round: 1, opponent: { id: 10, rank: 50 }, won: true }),
        rec({ startDate: '2026-05-04', opponent: { id: 11 }, outcome: 'walkover', score: '' }),
      ],
      bea: [rec({ startDate: '2026-04-06', round: 2, opponent: { id: 1, rank: 7 }, won: false })],
    };
    const played = collectMatches(withIds(), files);
    expect(played.map((m) => [m.date, m.winner, m.loser])).toEqual([['2026-03-02', 1, 10], ['2026-04-06', 1, 2]]);
    const r = buildRatings(withIds(), files);
    expect(r.matches).toBe(2);
    expect(r.rating.get(1)!).toBeGreaterThan(priorFromRank(7)); // ana won both
    expect(r.rating.get(2)!).toBeLessThan(priorFromRank(3)); // bea lost
    expect(r.latestRank.get(1)).toBe(7);
    expect(r.latestRank.get(10)).toBe(50);
  });

  it("predicts this season's matches better than a coin flip", () => {
    const r = buildRatings(realSeason, readMatchFiles('data'));
    console.log(`Ratings: ${r.matches} matches, Brier ${r.brier.toFixed(4)} (coin flip 0.25)`);
    expect(r.matches).toBeGreaterThan(1000);
    expect(r.brier).toBeLessThan(0.24);
  });
});
