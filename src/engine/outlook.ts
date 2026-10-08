import type { Player, Rules, Tournament } from '../data/schema';
import { checkScenario } from './checkScenario';
import { raceSearch, type Outcome, type Placement } from './clinch';
import { eliminatedPlayers, type RaceInfo } from './elimination';
import { projectStandings } from './standings';
import { pickKey, type Scenario } from './types';

export type Outlook =
  | { status: 'qualified' }
  | { status: 'out' }
  | {
      status: 'open';
      /** Lowest total that guarantees a place whatever anyone else does (with the event minimum met); null if none could be proven. */
      safeAt: number | null;
      /** Her own results that reach `safeAt`; null when she can't reach it alone. */
      safeRoute: Scenario | null;
      /** Whether she has any remaining events she can still play. */
      eventsLeft: boolean;
      eligibleNow: boolean;
      /** Picks under which she misses out, checked against the projection; null if none could be shown. */
      missExample: Scenario | null;
      /** Picks under which she qualifies, checked against the projection; null if none was found. */
      qualifyExample: Scenario | null;
    };

type Search = ReturnType<typeof raceSearch>;

/** Picks for a placement. A finish in the round a player is already alive in is the same as no pick, so it is left out. */
function toScenario(placement: Placement, players: Player[]): Scenario {
  const picks: Record<string, string> = {};
  for (const [id, finishes] of placement) {
    const player = players.find((p) => p.id === id)!;
    for (const f of finishes) {
      const alive = player.live.find((l) => l.tournamentId === f.tournamentId && l.state === 'alive');
      if (alive?.round !== f.round) picks[pickKey(id, f.tournamentId)] = f.round;
    }
  }
  return picks;
}

/** Fewest events, then fewest points. */
const simplest = (outcomes: Outcome[]) =>
  [...outcomes].sort((a, b) => a.finishes.length - b.finishes.length || a.total - b.total)[0];

/** Lowest total at which no results can knock her out. Real qualification only gets easier with more points, so the search is monotonic. */
function lowestSafeTotal(search: Search, x: RaceInfo): number | null {
  let hi = Math.max(x.floor, ...search.info.filter((o) => o !== x).map((o) => o.ceiling)) + 1;
  if (search.missPath(x, hi) !== null) return null;
  let lo = x.floor;
  if (search.missPath(x, lo) === null) return lo;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (search.missPath(x, mid) === null) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function playerOutlook(playerId: string, players: Player[], tournaments: Tournament[], rules: Rules): Outlook {
  const search = raceSearch(players, tournaments, rules);
  const x = search.info.find((i) => i.id === playerId);
  if (!x) throw new Error(`Unknown player ${playerId}`);
  if (x.player.qualified || (x.eligibleNow && search.missPath(x, x.floor) === null)) return { status: 'qualified' };
  if (eliminatedPlayers(players, tournaments, rules).has(playerId)) return { status: 'out' };

  const shows = (scenario: Scenario, qualifies: boolean) =>
    checkScenario(scenario, players, tournaments, rules).length === 0 &&
    (projectStandings(players, scenario, tournaments, rules).find((r) => r.playerId === playerId)!.projectedQualifier !== null) === qualifies;

  // Missing out: simplest is as things stand. Otherwise prefer players finishing strictly above her,
  // so the projection's tiebreak can't save her.
  let missExample: Scenario | null = shows({}, false) ? {} : null;
  for (const target of missExample ? [] : [x.floor + 1, x.floor]) {
    const found = search.missPath(x, target, true);
    if (found === null || found === 'unknown') continue;
    const scenario = toScenario(found, players);
    if (shows(scenario, false)) {
      missExample = scenario;
      break;
    }
  }

  // Qualifying: everyone else earns nothing more; find the smallest of her own results that is enough.
  const own = search.outcomes(x).filter((o) => o.eligible);
  const byTotal = new Map<number, Outcome>();
  for (const o of own) {
    const best = byTotal.get(o.total);
    if (!best || o.finishes.length < best.finishes.length) byTotal.set(o.total, o);
  }
  const ladder = [...byTotal.entries()].sort((a, b) => a[0] - b[0]).map(([, o]) => toScenario(new Map([[x.id, o.finishes]]), players));
  let qualifyExample: Scenario | null = null;
  if (ladder.length > 0 && shows(ladder.at(-1)!, true)) {
    let lo = -1;
    let hi = ladder.length - 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (shows(ladder[mid]!, true)) hi = mid;
      else lo = mid;
    }
    qualifyExample = ladder[hi]!;
  }

  const safeAt = lowestSafeTotal(search, x);
  const route = safeAt === null ? undefined : simplest(own.filter((o) => o.total >= safeAt));
  return {
    status: 'open',
    safeAt,
    safeRoute: route ? toScenario(new Map([[x.id, route.finishes]]), players) : null,
    eventsLeft: search.outcomes(x).some((o) => o.finishes.length > 0),
    eligibleNow: x.eligibleNow,
    missExample,
    qualifyExample,
  };
}
