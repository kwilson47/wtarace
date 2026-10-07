import type { Result, Rules, Tournament } from '../data/schema';
import { findTournament } from './lookup';

export interface CountedRace {
  total: number;
  counted: Result[];
  dropped: Result[];
}

export function isMandatory(tournament: Tournament, rules: Rules): boolean {
  return rules.mandatoryCategories.includes(tournament.category) || rules.mandatoryEventIds.includes(tournament.id);
}

/** Mandatory results always count; remaining slots up to the cap take the best optional results. */
export function countRace(results: Result[], tournaments: Tournament[], rules: Rules): CountedRace {
  const mandatory: Result[] = [];
  const optional: Result[] = [];
  for (const result of results) {
    (isMandatory(findTournament(tournaments, result.tournamentId), rules) ? mandatory : optional).push(result);
  }
  const slots = Math.max(0, rules.maxCountedResults - mandatory.length);
  const best = [...optional].sort((a, b) => b.points - a.points);
  const counted = [...mandatory, ...best.slice(0, slots)];
  return {
    total: counted.reduce((sum, r) => sum + r.points, 0),
    counted,
    dropped: best.slice(slots),
  };
}
