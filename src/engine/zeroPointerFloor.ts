import { ZERO_POINTER_ROUND, type Player, type Result, type Rules, type Tournament } from '../data/schema';
import { applyScenario } from './applyScenario';
import { countRace, type CountedRace } from './countRace';
import { remainingWeeks } from './elimination';
import { pointsTable } from './lookup';
import { splitPickKey, type Scenario } from './types';

const COMMITMENT_CATEGORIES = ['GS', 'WTA1000C', 'WTA1000'];
/** The WTA 500 commitment for a player accepted into six or more (R §II.A.2): the most it can be. */
const WTA500_REQUIREMENT = 6;

const zp = (tournamentId: string): Result => ({ tournamentId, round: ZERO_POINTER_ROUND, points: 0 });

/**
 * The lowest total she could still finish with, allowing for zero-pointers she could still pick up: a total can go
 * down, because a zero-pointer must count and so can push a real result out of her best results. Cautious by design
 * (it's used for Q and Out, which must never show early): she may withdraw from any WTA 1000 or Grand Slam she
 * hasn't played a match at yet, and may miss each remaining WTA 500 she still needs for the most demanding commitment.
 */
export function zeroPointerFloor(player: Player, tournaments: Tournament[], rules: Rules): number {
  return zeroPointerWorstCase(player, tournaments, rules).race.total;
}

/** Her worst case itself: the counted results behind the floor, and the events they refer to (with any possible WTA 500 shortfalls). */
export function zeroPointerWorstCase(player: Player, tournaments: Tournament[], rules: Rules): { race: CountedRace; tournaments: Tournament[] } {
  const results = applyScenario(player, {}, tournaments, rules);
  const byEvent = new Map(results.map((r) => [r.tournamentId, r]));
  for (const t of tournaments) {
    if (t.status === 'completed' || !COMMITMENT_CATEGORIES.includes(t.category)) continue;
    // Known not to be committed (recorded at the entry deadline), or exempt from WTA 1000s by a Long-Term Injury.
    if (t.commitment && t.commitment.ranks[player.id] === undefined) continue;
    const injury = player.longTermInjury;
    if (t.category !== 'GS' && injury && injury.from <= t.startDate && (!injury.to || t.startDate <= injury.to)) continue;
    const live = player.live.find((l) => l.tournamentId === t.id);
    const firstRound = pointsTable(rules, t.drawType)[t.byes.includes(player.id) ? 1 : 0]!.round;
    const unplayed = !live || (live.state === 'alive' && live.round === firstRound);
    if (unplayed && byEvent.get(t.id)?.round !== ZERO_POINTER_ROUND) byEvent.set(t.id, zp(t.id));
  }
  return withShortfall(player, [...byEvent.values()], {}, tournaments, rules);
}

/**
 * Her results plus the WTA 500 shortfall zero-pointers she'd get by not playing the remaining 500 weeks that
 * `scenario` leaves without a 500, counted. The WTA applies a shortfall zero-pointer once it's certain (those are
 * stored), so new ones can only come from 500 weeks still to play: at most one per week.
 */
function withShortfall(player: Player, results: Result[], scenario: Scenario, tournaments: Tournament[], rules: Rules) {
  const year = String(rules.season);
  const category = (id: string) => tournaments.find((t) => t.id === id);
  const played500 = player.results.filter((r) => r.round !== ZERO_POINTER_ROUND && category(r.tournamentId)?.category === 'WTA500' && category(r.tournamentId)!.startDate.startsWith(year)).length;
  const stored500 = player.results.filter((r) => r.round === ZERO_POINTER_ROUND && r.tournamentId.startsWith('zp-wta500')).length;
  const picked = new Set(Object.keys(scenario).map((k) => splitPickKey(k).tournamentId));
  const weeks500 = remainingWeeks(tournaments).filter((w) => w.some((t) => t.category === 'WTA500'));
  const playing500 = weeks500.filter((w) => w.some((t) => t.category === 'WTA500' && picked.has(t.id))).length;
  const more = Math.min(weeks500.length - playing500, Math.max(0, WTA500_REQUIREMENT - played500 - stored500 - playing500));
  const template = tournaments.find((t) => t.category === 'WTA500') ?? tournaments[0]!;
  const extra: Tournament[] = Array.from({ length: more }, (_, i) => ({
    ...template,
    id: `zp-floor-wta500-${i + 1}`,
    name: 'Possible WTA 500 shortfall',
    category: 'WTA500',
    status: 'completed',
    byes: [],
  }));
  const all = [...tournaments, ...extra];
  return { race: countRace([...results, ...extra.map((t) => zp(t.id))], all, rules), tournaments: all };
}

/** Her total with `scenario` as her own results, at worst: counting the 500 shortfall zero-pointers for 500 weeks it skips. */
export function ownWorstTotal(player: Player, scenario: Scenario, tournaments: Tournament[], rules: Rules): number {
  return withShortfall(player, applyScenario(player, scenario, tournaments, rules), scenario, tournaments, rules).race.total;
}
