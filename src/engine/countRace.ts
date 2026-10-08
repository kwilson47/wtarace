import { ZERO_POINTER_ROUND, type Result, type Rules, type Tournament } from '../data/schema';
import { findTournament } from './lookup';

export interface CountedRace {
  total: number;
  counted: Result[];
  dropped: Result[];
}

/**
 * Lost in qualifying (Q1, Q2, …). Such a result is never a must-count Grand Slam or WTA 1000 result,
 * which needs acceptance into the main draw (R §VIII.A.4.a.i(a), p.144), so it can't fill a required
 * group; it still competes as an optional result. `Q` alone (qualified) is a main-draw acceptance.
 */
const QUALIFYING_LOSS = /^Q\d+$/;

/** Zero-pointers always count (rulebook VIII.A.4.a.i), so they sort ahead of positive results; then points, highest first. */
const byCountingPriority = (a: Result, b: Result) =>
  Number(b.round === ZERO_POINTER_ROUND) - Number(a.round === ZERO_POINTER_ROUND) || b.points - a.points;

/**
 * Results in excluded categories never count. Each required group, in order, takes its best
 * `count` results; those always count, even past the cap. Remaining slots up to the cap take
 * the best of everything else, including any group's surplus results. Zero-pointers take slots
 * before positive results.
 */
export function countRace(results: Result[], tournaments: Tournament[], rules: Rules): CountedRace {
  const category = (r: Result) => findTournament(tournaments, r.tournamentId).category;
  const excluded = results.filter((r) => rules.excludedCategories.includes(category(r)));
  let open = results.filter((r) => !rules.excludedCategories.includes(category(r))).sort(byCountingPriority);
  const required: Result[] = [];
  for (const group of rules.requiredGroups) {
    const best = open.filter((r) => group.categories.includes(category(r)) && !QUALIFYING_LOSS.test(r.round)).slice(0, group.count);
    required.push(...best);
    open = open.filter((r) => !best.includes(r));
  }
  const slots = Math.max(0, rules.maxCountedResults - required.length);
  const counted = [...required, ...open.slice(0, slots)];
  return {
    total: counted.reduce((sum, r) => sum + r.points, 0),
    counted,
    dropped: [...open.slice(slots), ...excluded],
  };
}

/**
 * The race as the WTA currently publishes it: results at an in-progress event that have not been
 * credited yet (stored with 0 points) are left out, so they can't take a counting place.
 */
export function officialRace(results: Result[], tournaments: Tournament[], rules: Rules): CountedRace {
  const credited = results.filter(
    (r) => r.points > 0 || r.round === ZERO_POINTER_ROUND || findTournament(tournaments, r.tournamentId).status !== 'in-progress',
  );
  return countRace(credited, tournaments, rules);
}
