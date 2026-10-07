import { ZERO_POINTER_ROUND, type Player, type Rules, type Tournament } from '../data/schema';
import { applyScenario } from './applyScenario';
import { countRace, isMandatory, type CountedRace } from './countRace';
import { findTournament } from './lookup';
import type { Scenario } from './types';

export interface RankEntry {
  id: string;
  name: string;
  race: CountedRace;
}

export interface StandingRow {
  playerId: string;
  name: string;
  country: string;
  currentRank: number;
  currentTotal: number;
  projectedTotal: number;
  delta: number;
  projectedRank: number;
  /** Positive = moved up. */
  rankChange: number;
  qualified: boolean;
}

/** Negative when `a` ranks ahead of `b`. Player id is the final fallback so ranking is deterministic. */
export function compareEntries(a: RankEntry, b: RankEntry, tournaments: Tournament[], rules: Rules): number {
  if (a.race.total !== b.race.total) return b.race.total - a.race.total;
  const mandatoryPoints = (e: RankEntry) =>
    e.race.counted
      .filter((r) => isMandatory(findTournament(tournaments, r.tournamentId), rules))
      .reduce((sum, r) => sum + r.points, 0);
  const highest = (e: RankEntry) => Math.max(0, ...e.race.counted.map((r) => r.points));
  const played = (e: RankEntry) => [...e.race.counted, ...e.race.dropped].filter((r) => r.round !== ZERO_POINTER_ROUND).length;

  for (const tiebreaker of rules.tiebreakers) {
    let diff = 0;
    switch (tiebreaker) {
      case 'mostMandatoryPoints': diff = mandatoryPoints(b) - mandatoryPoints(a); break;
      case 'highestSingleResult': diff = highest(b) - highest(a); break;
      case 'fewestResults': diff = played(a) - played(b); break;
      case 'name': diff = a.name.localeCompare(b.name, 'en'); break;
    }
    if (diff !== 0) return diff;
  }
  return a.id.localeCompare(b.id, 'en');
}

function ranks(entries: RankEntry[], tournaments: Tournament[], rules: Rules): Map<string, number> {
  const sorted = [...entries].sort((a, b) => compareEntries(a, b, tournaments, rules));
  return new Map(sorted.map((e, i) => [e.id, i + 1]));
}

export function projectStandings(players: Player[], scenario: Scenario, tournaments: Tournament[], rules: Rules): StandingRow[] {
  const current = players.map((p) => ({ id: p.id, name: p.name, race: countRace(p.results, tournaments, rules) }));
  const projected = players.map((p) => ({
    id: p.id,
    name: p.name,
    race: countRace(applyScenario(p, scenario, tournaments, rules), tournaments, rules),
  }));
  const currentRanks = ranks(current, tournaments, rules);
  const projectedRanks = ranks(projected, tournaments, rules);

  return players
    .map((p, i): StandingRow => {
      const currentRank = currentRanks.get(p.id)!;
      const projectedRank = projectedRanks.get(p.id)!;
      const currentTotal = current[i]!.race.total;
      const projectedTotal = projected[i]!.race.total;
      return {
        playerId: p.id,
        name: p.name,
        country: p.country,
        currentRank,
        currentTotal,
        projectedTotal,
        delta: projectedTotal - currentTotal,
        projectedRank,
        rankChange: currentRank - projectedRank,
        qualified: p.qualified,
      };
    })
    .sort((a, b) => a.projectedRank - b.projectedRank);
}
