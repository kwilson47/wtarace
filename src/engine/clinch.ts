import type { Player, Rules, Tournament } from '../data/schema';
import { applyScenario } from './applyScenario';
import { countRace } from './countRace';
import { maxUntrackedPassers, raceInfo, remainingWeeks, roundCapacity, untrackedModel, type RaceInfo } from './elimination';
import { pointsTable } from './lookup';
import { pickOptions } from './picks';
import { eventsShort } from './qualification';
import { pickKey, type Scenario } from './types';

/** One finishing round at one remaining event. `fromTop`: 0 = winner, 1 = final, 2 = semifinal, … */
export interface Finish {
  tournamentId: string;
  round: string;
  fromTop: number;
  /** Position in the event's draw order, when known (in-progress events). */
  drawPosition?: number;
}

/** One way a player's remaining season could go: a finish per week she plays, and where that leaves her. */
export interface Outcome {
  finishes: Finish[];
  total: number;
  eligible: boolean;
}

/** Search size beyond which we stop and assume the adversary succeeds, so we never claim a false clinch. */
const SEARCH_BUDGET = 2_000_000;

class BudgetExceeded extends Error {}

/**
 * The round in which two players at these draw positions would meet, counted from the top (1 = final,
 * 2 = semifinal, …). Halves, quarters and eighths are equal blocks of the official draw order.
 */
function meetingFromTop(a: number, b: number, drawSize: number): number {
  for (let j = 1; ; j++) {
    const block = drawSize / 2 ** j;
    if (Math.floor((a - 1) / block) !== Math.floor((b - 1) / block)) return j;
    if (block <= 1) return j + 1;
  }
}

const finishKey = (f: Finish) => `${f.tournamentId}:${f.round}`;

/**
 * Drops any option whose results include all of another option's results: the smaller one reaches the
 * target too and uses strictly fewer places, so the larger one can never be needed.
 */
function minimalOptions(options: Outcome[]): Outcome[] {
  const kept: { option: Outcome; keys: Set<string> }[] = [];
  for (const option of [...options].sort((a, b) => a.finishes.length - b.finishes.length)) {
    const keys = new Set(option.finishes.map(finishKey));
    if (kept.some((k) => [...k.keys].every((key) => keys.has(key)))) continue;
    kept.push({ option, keys });
  }
  return kept.map((k) => k.option);
}

/** Every way the player's remaining events could go: one result per week (or none), all rounds. */
function outcomesFor(player: Player, tournaments: Tournament[], rules: Rules): Outcome[] {
  const weekOptions: (Finish | null)[][] = remainingWeeks(tournaments).map((week) => {
    const live = week.find((t) => player.live.some((l) => l.tournamentId === t.id && l.state === 'alive'));
    const events = live ? [live] : week;
    const finishes: Finish[] = events.flatMap((t) => {
      const options = pickOptions(player, t, rules);
      if (options.kind !== 'open') return [];
      const table = pointsTable(rules, t.drawType);
      const drawPosition = player.live.find((l) => l.tournamentId === t.id)?.drawPosition;
      return options.rounds.map((r) => ({
        tournamentId: t.id,
        round: r.round,
        fromTop: table.length - 1 - table.findIndex((x) => x.round === r.round),
        drawPosition,
      }));
    });
    // A player still alive at an in-progress event must finish there; otherwise she may skip the week.
    return live ? finishes : [null, ...finishes];
  });

  const outcomes: Outcome[] = [];
  const visit = (week: number, chosen: Finish[]) => {
    if (week === weekOptions.length) {
      const scenario: Scenario = Object.fromEntries(chosen.map((f) => [pickKey(player.id, f.tournamentId), f.round]));
      const results = applyScenario(player, scenario, tournaments, rules);
      outcomes.push({
        finishes: chosen,
        total: countRace(results, tournaments, rules).total,
        eligible: eventsShort(results, player.eventMinimumWaived, tournaments, rules) === 0,
      });
      return;
    }
    for (const f of weekOptions[week]!) visit(week + 1, f ? [...chosen, f] : chosen);
  };
  visit(0, []);
  return outcomes;
}

/** Each listed player's results that together achieve what was asked. */
export type Placement = ReadonlyMap<string, Finish[]>;
/** `null`: impossible. `'unknown'`: the search grew too large to tell. */
export type SearchResult = Placement | null | 'unknown';

/**
 * Searches over actual results for ways the remaining events could go. The search is generous to the
 * other players (they can enter every event; ties go against the player; players outside the tracked
 * list are bounded independently), so "impossible" is certain.
 */
export function raceSearch(players: Player[], tournaments: Tournament[], rules: Rules) {
  const { places, championPlace } = rules.qualification;
  const directPlaces = championPlace ? places - 1 : places;
  const info = raceInfo(players, tournaments, rules);
  const untracked = untrackedModel(players, tournaments, rules);
  const outcomeCache = new Map<string, Outcome[]>();
  const outcomes = (i: RaceInfo) => {
    if (!outcomeCache.has(i.id)) outcomeCache.set(i.id, outcomesFor(i.player, tournaments, rules));
    return outcomeCache.get(i.id)!;
  };
  const drawSize = new Map(tournaments.map((t) => [t.id, t.drawSize]));

  /**
   * Results under which `count` players (excluding `exclude`, including `must` if given) all finish on or
   * above `target`, each eligible, at the same time. Places at each event are limited, and so is who can
   * meet whom. With `trackedOnly`, players outside the tracked list take no places.
   */
  const memo = new Map<string, SearchResult>();
  const finishAbove = (target: number, count: number, exclude: Set<string>, must: string | undefined, trackedOnly: boolean): SearchResult => {
    const key = `${target}|${count}|${[...exclude].sort().join(',')}|${must ?? ''}|${trackedOnly}`;
    if (!memo.has(key)) memo.set(key, searchFinishAbove(target, count, exclude, must, trackedOnly));
    return memo.get(key)!;
  };
  const searchFinishAbove = (target: number, count: number, exclude: Set<string>, must: string | undefined, trackedOnly: boolean): SearchResult => {
    // Players outside the tracked list can fill some of the places; `must` still has to be one of them.
    const outside = trackedOnly ? 0 : maxUntrackedPassers(untracked.slots, target - untracked.base, count);
    const need = Math.max(must ? 1 : 0, count - outside);
    if (need === 0) return new Map();
    const candidates = info
      .filter((i) => !exclude.has(i.id) && (i.eligibleNow || i.canBeEligible) && i.ceiling >= target)
      .map((i) => ({ id: i.id, options: minimalOptions(outcomes(i).filter((o) => o.total >= target && o.eligible)) }))
      .filter((c) => c.options.length > 0)
      .sort((a, b) => (a.id === must ? -1 : b.id === must ? 1 : a.options.length - b.options.length));
    if (must && candidates[0]?.id !== must) return null;
    if (candidates.length < need) return null;

    const used = new Map<string, number>();
    const placed: Finish[] = [];
    const chosen: { id: string; finishes: Finish[] }[] = [];
    let budget = SEARCH_BUDGET;
    const fits = (o: Outcome) =>
      o.finishes.every((f) => {
        if ((used.get(`${f.tournamentId}:${f.round}`) ?? 0) >= roundCapacity(f.fromTop)) return false;
        const size = drawSize.get(f.tournamentId);
        if (size === undefined || f.drawPosition === undefined) return true;
        return placed.every((g) => {
          if (g.tournamentId !== f.tournamentId || g.drawPosition === undefined) return true;
          const meet = meetingFromTop(f.drawPosition!, g.drawPosition, size);
          // Both reached the round where they meet: exactly one loses there, the other goes further.
          if (f.fromTop > meet || g.fromTop > meet) return true;
          return (f.fromTop === meet && g.fromTop < meet) || (g.fromTop === meet && f.fromTop < meet);
        });
      });
    const search = (index: number): boolean => {
      if (chosen.length === need) return true;
      if (candidates.length - index < need - chosen.length) return false;
      if (--budget < 0) throw new BudgetExceeded();
      const c = candidates[index]!;
      for (const o of c.options) {
        if (!fits(o)) continue;
        for (const f of o.finishes) used.set(`${f.tournamentId}:${f.round}`, (used.get(`${f.tournamentId}:${f.round}`) ?? 0) + 1);
        placed.push(...o.finishes);
        chosen.push({ id: c.id, finishes: o.finishes });
        if (search(index + 1)) return true;
        chosen.pop();
        placed.splice(placed.length - o.finishes.length);
        for (const f of o.finishes) used.set(`${f.tournamentId}:${f.round}`, used.get(`${f.tournamentId}:${f.round}`)! - 1);
      }
      return c.id !== must && search(index + 1);
    };
    try {
      return search(0) ? new Map(chosen.map((c) => [c.id, c.finishes])) : null;
    } catch (e) {
      if (e instanceof BudgetExceeded) return 'unknown';
      throw e;
    }
  };

  /**
   * Results that leave `x` out of the qualifying places while she finishes on `target` points (her
   * actual worst case is her floor). `null` means no such results exist.
   */
  const missPath = (x: RaceInfo, target: number, trackedOnly = false): SearchResult => {
    const others = (...ids: string[]) => new Set([x.id, ...ids]);
    const above = (t: number, count: number, exclude: Set<string>, must?: string) => finishAbove(t, count, exclude, must, trackedOnly);
    if (!championPlace) return above(target, places, others());
    let unknown = false;
    const found = (r: SearchResult): Placement | null => {
      if (r === 'unknown') unknown = true;
      return r === 'unknown' ? null : r;
    };
    if (!x.champion) {
      // Every place taken by players above her…
      const all = found(above(target, places, others()));
      if (all) return all;
      // …or the direct places taken, and the champion place going to a champion who finishes below her.
      for (const c of info) {
        if (c === x || !c.canBeChampion || !(c.eligibleNow || c.canBeEligible) || c.floor > target) continue;
        const direct = found(above(target, directPlaces, others(c.id)));
        if (direct) return direct;
      }
      return unknown ? 'unknown' : null;
    }
    // A champion misses only by dropping out of the champion window…
    const window = found(above(target, championPlace.toRank, others()));
    if (window) return window;
    // …or when another champion finishes above her but outside the direct places, taking the champion place.
    for (const c of info) {
      if (c === x || !c.canBeChampion || !(c.eligibleNow || c.canBeEligible)) continue;
      const taken = found(above(Math.max(c.floor, target), directPlaces + 1, others(), c.id));
      if (taken) return taken;
    }
    return unknown ? 'unknown' : null;
  };

  return { info, outcomes, missPath };
}

/**
 * Players certain to qualify whatever happens in the remaining events, judged from actual results.
 * A player is only marked when no combination of results can knock her out; if a search grows too
 * large, she is not marked.
 */
export function clinchedPlayers(players: Player[], tournaments: Tournament[], rules: Rules): Set<string> {
  const search = raceSearch(players, tournaments, rules);
  return new Set(search.info.filter((x) => x.eligibleNow && search.missPath(x, x.floor) === null).map((x) => x.id));
}
