import type { Player, Rules, Tournament } from '../data/schema';
import { applyScenario } from './applyScenario';
import { countRace } from './countRace';
import { pointsTable } from './lookup';
import { pickOptions } from './picks';
import { eventsShort, isChampion } from './qualification';
import { pickKey, type Scenario } from './types';

/** One finishing position at a remaining event: its points and how many players can finish there. */
export interface Slot {
  points: number;
  capacity: number;
}

export interface RaceBounds {
  /** Total if she earns nothing more (keeps points already banked at in-progress events). */
  floor: number;
  /** Total if she wins every remaining event she can still play, one per week. */
  ceiling: number;
}

const overlaps = (a: Tournament, b: Tournament) => a.startDate < b.endDate && b.startDate < a.endDate;
const winnerRound = (t: Tournament, rules: Rules) => pointsTable(rules, t.drawType).at(-1)!.round;

/** Remaining events grouped into weeks: events whose dates overlap can't both be played. */
export function remainingWeeks(tournaments: Tournament[]): Tournament[][] {
  const remaining = tournaments.filter((t) => t.status !== 'completed').sort((a, b) => a.startDate.localeCompare(b.startDate));
  const weeks: Tournament[][] = [];
  for (const t of remaining) {
    const week = weeks.find((w) => w.some((o) => overlaps(o, t)));
    if (week) week.push(t);
    else weeks.push([t]);
  }
  return weeks;
}

/** Per week, the remaining events where the player can still have a result. */
export const playable = (player: Player, weeks: Tournament[][], rules: Rules) =>
  weeks.map((w) => w.filter((t) => pickOptions(player, t, rules).kind === 'open'));

export function raceBounds(player: Player, tournaments: Tournament[], rules: Rules): RaceBounds {
  const total = (scenario: Scenario) => countRace(applyScenario(player, scenario, tournaments, rules), tournaments, rules).total;
  const options = playable(player, remainingWeeks(tournaments), rules);
  let ceiling = -Infinity;
  const visit = (week: number, scenario: Scenario) => {
    if (week === options.length) {
      ceiling = Math.max(ceiling, total(scenario));
      return;
    }
    visit(week + 1, scenario);
    for (const t of options[week]!) visit(week + 1, { ...scenario, [pickKey(player.id, t.id)]: winnerRound(t, rules) });
  };
  visit(0, {});
  return { floor: total({}), ceiling };
}

/** How many players finish in a round, counted from the top: 1 W, 1 F, 2 SF, 4 QF, … */
export const roundCapacity = (fromTop: number) => (fromTop === 0 ? 1 : 2 ** (fromTop - 1));

/** Finishing positions at an event, from the first round to the winner. */
function eventSlots(t: Tournament, rules: Rules): Slot[] {
  const table = pointsTable(rules, t.drawType);
  return table.map((r, i) => ({ points: r.points, capacity: roundCapacity(table.length - 1 - i) }));
}

/** Each player's floor, ceiling, eligibility and champion status, from actual results. */
export function raceInfo(players: Player[], tournaments: Tournament[], rules: Rules) {
  const { championPlace, minEvents } = rules.qualification;
  const weeks = remainingWeeks(tournaments);
  return players.map((p) => {
    const now = applyScenario(p, {}, tournaments, rules);
    const short = eventsShort(now, p.eventMinimumWaived, tournaments, rules);
    const options = playable(p, weeks, rules);
    const newEventWeeks = options.filter((w) =>
      w.some((t) => minEvents?.categories.includes(t.category) && !p.results.some((r) => r.tournamentId === t.id)),
    ).length;
    const champion = isChampion(now, tournaments, rules);
    return {
      player: p,
      id: p.id,
      ...raceBounds(p, tournaments, rules),
      eligibleNow: short === 0,
      canBeEligible: short <= newEventWeeks,
      champion,
      canBeChampion: champion || options.some((w) => w.some((t) => championPlace?.categories.includes(t.category))),
    };
  });
}
export type RaceInfo = ReturnType<typeof raceInfo>[number];

/**
 * Players outside the tracked list: at most the lowest tracked official total each (the tracked
 * players are the race's top `trackedPlayerCount`), competing for the remaining events' places.
 */
export function untrackedModel(players: Player[], tournaments: Tournament[], rules: Rules) {
  return {
    base: Math.min(...players.map((p) => countRace(p.results, tournaments, rules).total)),
    slots: remainingWeeks(tournaments).map((w) => w.flatMap((t) => eventSlots(t, rules))),
  };
}

/**
 * Upper bound on how many players outside the tracked list could each gain at least `need` points,
 * taking one result per week and sharing each event's finishing positions. Returns at most `limit`;
 * if the search grows too large it returns `limit`, so callers stay on the safe side.
 */
export function maxUntrackedPassers(weeks: Slot[][], need: number, limit: number): number {
  if (need <= 0) return limit;
  const caps = weeks.map((w) => w.map((s) => s.capacity));
  let budget = 200_000;
  const bestLeft = (from: number) =>
    weeks.slice(from).reduce((sum, w, j) => sum + Math.max(0, ...w.filter((_, i) => caps[from + j]![i]! > 0).map((s) => s.points)), 0);
  const notBefore = (combo: number[], previous: number[] | null) => {
    if (!previous) return true;
    for (let i = 0; i < combo.length; i++) if (combo[i] !== previous[i]) return combo[i]! > previous[i]!;
    return true;
  };

  // Players are interchangeable, so each one's choice (a slot index per week, -1 = none) is kept in
  // non-decreasing order to avoid exploring the same assignment in every permutation.
  const search = (count: number, previous: number[] | null): number => {
    if (count >= limit) return limit;
    let best = count;
    const combo: number[] = [];
    const pick = (week: number, sum: number): boolean => {
      if (--budget < 0) {
        best = limit;
        return true;
      }
      if (week === weeks.length) {
        if (sum < need || !notBefore(combo, previous)) return false;
        combo.forEach((i, w) => { if (i >= 0) caps[w]![i]!--; });
        best = Math.max(best, search(count + 1, [...combo]));
        combo.forEach((i, w) => { if (i >= 0) caps[w]![i]!++; });
        return best >= limit;
      }
      if (sum + bestLeft(week) < need) return false;
      for (let i = -1; i < weeks[week]!.length; i++) {
        if (i >= 0 && caps[week]![i] === 0) continue;
        combo[week] = i;
        if (pick(week + 1, sum + (i >= 0 ? weeks[week]![i]!.points : 0))) return true;
      }
      return false;
    };
    pick(0, 0);
    return best;
  };
  return Math.min(limit, search(0, null));
}

/**
 * Players who can no longer reach a qualifying place under any remaining results, judged from actual
 * results only (no picks). The test is conservative: a player is marked out only when that is certain
 * without draw data, so it can lag reality but never runs ahead of it. Assumes the tracked players are
 * the race's top `trackedPlayerCount`, so anyone outside it has at most the lowest tracked official total.
 */
export function eliminatedPlayers(players: Player[], tournaments: Tournament[], rules: Rules): Set<string> {
  const { places, championPlace } = rules.qualification;
  const info = raceInfo(players, tournaments, rules);
  const untracked = untrackedModel(players, tournaments, rules);
  /** True when no combination of results can push champion `c` below `rank`. */
  const certainWithin = (c: RaceInfo, rank: number) => {
    const threats = info.filter((o) => o !== c && o.ceiling >= c.floor).length;
    const room = rank - 1 - threats;
    return room >= 0 && maxUntrackedPassers(untracked.slots, c.floor - untracked.base, room + 1) <= room;
  };

  const out = new Set<string>();
  for (const x of info) {
    // Eligible players whose current total already beats her best case finish above her whatever happens.
    const above = info.filter((o) => o !== x && o.eligibleNow && o.floor > x.ceiling);
    let eliminated: boolean;
    if (!x.canBeEligible) eliminated = true;
    else if (!championPlace) eliminated = above.length >= places;
    // A (possible) champion can still take the champion place from anywhere inside its rank window.
    else if (x.canBeChampion) eliminated = above.length >= championPlace.toRank;
    else if (above.length >= places) eliminated = true;
    // At best she is first after the direct places: that place goes to a champion certain to be in the window.
    else if (above.length === places - 1) {
      eliminated = info.some((c) => c !== x && c.champion && c.eligibleNow && !above.includes(c) && certainWithin(c, championPlace.toRank));
    } else eliminated = false;
    if (eliminated) out.add(x.id);
  }
  return out;
}
