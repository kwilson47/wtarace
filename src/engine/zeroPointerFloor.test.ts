import { describe, expect, it } from 'vitest';
import { parseOrThrow, type SeasonInput } from '../data/schema';
import { rawSeason } from '../test/fixtures';
import { countRace } from './countRace';
import { raceBounds } from './elimination';
import { ownWorstTotal, zeroPointerFloor } from './zeroPointerFloor';

// The fixture's `live` event is a WTA 1000 in progress (d32: R32 1 point … W 100); c500 is a WTA 500 played in 2026.
const season = (edit: (raw: SeasonInput) => void) => {
  const raw = rawSeason();
  edit(raw);
  return parseOrThrow(raw);
};

describe('zeroPointerFloor', () => {
  it('counts a zero-pointer for a WTA 1000 she is in but has not played yet (she could withdraw)', () => {
    // Cat is in the live draw, first round, not yet played: the floor takes a zero-pointer there, not R32 points.
    const s = season((raw) => {
      const cat = raw.players.find((p) => p.id === 'cat')!;
      cat.live = [{ tournamentId: 'live', state: 'alive', round: 'R32' }];
      cat.results.push({ tournamentId: 'live', round: 'R32', points: 0 });
    });
    const cat = s.players.find((p) => p.id === 'cat')!;
    const results = [...cat.results.filter((r) => r.tournamentId !== 'live'), { tournamentId: 'live', round: 'ZP', points: 0 }];
    // She could also miss the one remaining WTA 500 week (Next Open), so the floor is at most this.
    expect(zeroPointerFloor(cat, s.tournaments, s.rules)).toBeLessThanOrEqual(countRace(results, s.tournaments, s.rules).total);
    expect(zeroPointerFloor(cat, s.tournaments, s.rules)).toBeLessThan(raceBounds({ ...cat, live: [] }, s.tournaments, s.rules).ceiling);
  });

  it('keeps the points she has banked once she has won a match', () => {
    // Ana is alive in the QF: she has won matches, so withdrawing still leaves her QF points.
    const s = season(() => {});
    const ana = s.players.find((p) => p.id === 'ana')!;
    expect(zeroPointerFloor(ana, s.tournaments, s.rules)).toBe(raceBounds(ana, s.tournaments, s.rules).floor);
  });

  it('can push a real result out once she is at the cap: shortfall zero-pointers must count (Muchova, Wuhan 2026)', () => {
    // Cap of 3: Bea counts slam 640, m1000 100, c500 20 = 760. She has played one 500 (c500), and one 500 week
    // remains (Next Open): missing it gives a shortfall zero-pointer, which must count, pushing out her 20.
    const s = season((raw) => {
      raw.rules.maxCountedResults = 3;
      raw.players.find((p) => p.id === 'bea')!.officialRaceTotal = 760;
    });
    const bea = s.players.find((p) => p.id === 'bea')!;
    expect(raceBounds(bea, s.tournaments, s.rules).floor).toBe(740);
  });

  it("uses the event's commitment record when there is one, and a Long-Term Injury exempts WTA 1000s", () => {
    const floorOf = (edit: (raw: SeasonInput) => void) => {
      const s = season(edit);
      const cat = s.players.find((p) => p.id === 'cat')!;
      return zeroPointerFloor(cat, s.tournaments, s.rules);
    };
    const unknown = floorOf(() => {}); // no record: she might be committed to the live WTA 1000
    const notCommitted = floorOf((raw) => {
      raw.tournaments.find((t) => t.id === 'live')!.commitment = { deadline: '2026-09-07', ranks: { bea: 20 } };
    });
    const injured = floorOf((raw) => {
      raw.players.find((p) => p.id === 'cat')!.longTermInjury = { from: '2026-06-01' };
    });
    expect(notCommitted).toBeGreaterThan(unknown);
    expect(injured).toBe(notCommitted);
  });

  it('totals a route of her own with a shortfall zero-pointer for each WTA 500 week it skips', () => {
    // Cap of 3, as above: skipping Next Open (the last 500 week) costs her the 20; playing it doesn't.
    const s = season((raw) => {
      raw.rules.maxCountedResults = 3;
      raw.players.find((p) => p.id === 'bea')!.officialRaceTotal = 760;
    });
    const bea = s.players.find((p) => p.id === 'bea')!;
    expect(ownWorstTotal(bea, {}, s.tournaments, s.rules)).toBe(740);
    expect(ownWorstTotal(bea, { 'bea|next': 'R16' }, s.tournaments, s.rules)).toBe(760);
  });
});
