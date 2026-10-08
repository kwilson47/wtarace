import type { Player, Rules, Tournament } from '../data/schema';
import { applyScenario } from './applyScenario';
import { countRace } from './countRace';
import { findTournament } from './lookup';
import { eventsPlayed } from './qualification';
import { pickKey, type Scenario } from './types';

export interface BreakdownEntry {
  tournamentId: string;
  tournamentName: string;
  category: string;
  round: string;
  points: number;
  /** Whether it is one of the results that make up her total. */
  counted: boolean;
  /** 'pick': the visitor's pick. 'live': the round she has reached at an in-progress event. */
  source: 'result' | 'pick' | 'live';
}

export interface Breakdown {
  /** Grouped by category (combined and WTA-only 1000s together), then by date. */
  entries: BreakdownEntry[];
  total: number;
  countedResults: number;
  maxCountedResults: number;
  /** null when the rules have no event minimum. */
  minEvents: { played: number; required: number; waived: boolean } | null;
}

const CATEGORY_ORDER: Record<string, number> = { GS: 0, WTA1000C: 1, WTA1000: 1, WTA500: 2, WTA250: 3, WTA125: 4, ITF: 5 };

/** Where a player's projected total comes from, with the visitor's picks applied. */
export function playerBreakdown(player: Player, scenario: Scenario, tournaments: Tournament[], rules: Rules): Breakdown {
  const results = applyScenario(player, scenario, tournaments, rules);
  const race = countRace(results, tournaments, rules);
  const counted = new Set(race.counted);
  const source = (tournamentId: string): BreakdownEntry['source'] => {
    if (scenario[pickKey(player.id, tournamentId)] !== undefined) return 'pick';
    const t = findTournament(tournaments, tournamentId);
    return t.status === 'in-progress' && player.live.some((l) => l.tournamentId === tournamentId) ? 'live' : 'result';
  };
  const order = (r: { tournamentId: string }) => {
    const t = findTournament(tournaments, r.tournamentId);
    return { category: CATEGORY_ORDER[t.category] ?? 99, date: t.startDate };
  };
  const entries = results
    .map((r) => ({
      tournamentId: r.tournamentId,
      tournamentName: findTournament(tournaments, r.tournamentId).name,
      category: findTournament(tournaments, r.tournamentId).category,
      round: r.round,
      points: r.points,
      counted: counted.has(r),
      source: source(r.tournamentId),
    }))
    .sort((a, b) => order(a).category - order(b).category || order(a).date.localeCompare(order(b).date));
  const min = rules.qualification.minEvents;
  return {
    entries,
    total: race.total,
    countedResults: race.counted.length,
    maxCountedResults: rules.maxCountedResults,
    minEvents: min ? { played: eventsPlayed(results, tournaments, rules), required: min.count, waived: player.eventMinimumWaived } : null,
  };
}
