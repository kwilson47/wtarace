import { ZERO_POINTER_ROUND, type Result, type Rules, type Tournament } from '../data/schema';
import { findTournament, pointsTable } from './lookup';

export type QualifierKind = 'direct' | 'champion';

export interface QualifierCandidate {
  playerId: string;
  rank: number;
  eligible: boolean;
  champion: boolean;
}

export function isEligible(results: Result[], waived: boolean, tournaments: Tournament[], rules: Rules): boolean {
  const min = rules.qualification.minEvents;
  if (!min || waived) return true;
  const played = results.filter(
    (r) => r.round !== ZERO_POINTER_ROUND && min.categories.includes(findTournament(tournaments, r.tournamentId).category),
  ).length;
  return played >= min.count;
}

/** True when the player won (reached the last round of the points table) an event in the champion categories. */
export function isChampion(results: Result[], tournaments: Tournament[], rules: Rules): boolean {
  const place = rules.qualification.championPlace;
  if (!place) return false;
  return results.some((r) => {
    const t = findTournament(tournaments, r.tournamentId);
    if (!place.categories.includes(t.category)) return false;
    const table = pointsTable(rules, t.drawType);
    return table[table.length - 1].round === r.round;
  });
}

export function selectQualifiers(candidates: QualifierCandidate[], rules: Rules): Map<string, QualifierKind> {
  const { places, championPlace } = rules.qualification;
  const eligible = [...candidates].sort((a, b) => a.rank - b.rank).filter((c) => c.eligible);
  const directPlaces = championPlace ? places - 1 : places;
  const result = new Map<string, QualifierKind>();
  for (const c of eligible.slice(0, directPlaces)) result.set(c.playerId, 'direct');
  if (championPlace) {
    const rest = eligible.slice(directPlaces);
    const champion = rest.find((c) => c.champion && c.rank >= championPlace.fromRank && c.rank <= championPlace.toRank);
    if (champion) result.set(champion.playerId, 'champion');
    else if (rest[0]) result.set(rest[0].playerId, 'direct');
  }
  return result;
}
