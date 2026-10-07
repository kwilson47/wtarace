import type { Player, Rules, Tournament } from '../data/schema';
import { applyScenario } from './applyScenario';
import { countRace, type CountedRace } from './countRace';
import { findTournament } from './lookup';
import { isChampion, isEligible, selectQualifiers, type QualifierKind } from './qualification';
import type { Scenario } from './types';

export interface RankEntry {
  id: string;
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
  eligible: boolean;
  projectedQualifier: QualifierKind | null;
}

/** Negative when `a` ranks ahead of `b`. Player id is the final fallback so ranking is deterministic. */
export function compareEntries(a: RankEntry, b: RankEntry, tournaments: Tournament[], rules: Rules): number {
  if (a.race.total !== b.race.total) return b.race.total - a.race.total;
  const pointsIn = (e: RankEntry, categories: string[]) =>
    e.race.counted
      .filter((r) => categories.includes(findTournament(tournaments, r.tournamentId).category))
      .map((r) => r.points);

  for (const tiebreaker of rules.tiebreakers) {
    const pa = pointsIn(a, tiebreaker.categories);
    const pb = pointsIn(b, tiebreaker.categories);
    const diff =
      tiebreaker.kind === 'pointsIn'
        ? pb.reduce((s, p) => s + p, 0) - pa.reduce((s, p) => s + p, 0)
        : Math.max(0, ...pb) - Math.max(0, ...pa);
    if (diff !== 0) return diff;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function ranks(entries: RankEntry[], tournaments: Tournament[], rules: Rules): Map<string, number> {
  const sorted = [...entries].sort((a, b) => compareEntries(a, b, tournaments, rules));
  return new Map(sorted.map((e, i) => [e.id, i + 1]));
}

export function projectStandings(players: Player[], scenario: Scenario, tournaments: Tournament[], rules: Rules): StandingRow[] {
  const current = players.map((p) => ({ id: p.id, race: countRace(p.results, tournaments, rules) }));
  const projectedResults = players.map((p) => applyScenario(p, scenario, tournaments, rules));
  const projected = players.map((p, i) => ({
    id: p.id,
    race: countRace(projectedResults[i]!, tournaments, rules),
  }));
  const currentRanks = ranks(current, tournaments, rules);
  const projectedRanks = ranks(projected, tournaments, rules);
  const eligible = players.map((p, i) => isEligible(projectedResults[i]!, p.eventMinimumWaived, tournaments, rules));
  const qualifiers = selectQualifiers(
    players.map((p, i) => ({
      playerId: p.id,
      rank: projectedRanks.get(p.id)!,
      eligible: eligible[i]!,
      champion: isChampion(projectedResults[i]!, tournaments, rules),
    })),
    rules,
  );

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
        eligible: eligible[i]!,
        projectedQualifier: qualifiers.get(p.id) ?? null,
      };
    })
    .sort((a, b) => a.projectedRank - b.projectedRank);
}
