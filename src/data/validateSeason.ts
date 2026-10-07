import { countRace } from '../engine/countRace';
import { parseSeason } from './schema';

/** Schema + referential checks, then confirms the engine reproduces every official race total. */
export function validateSeason(raw: unknown): string[] {
  const parsed = parseSeason(raw);
  if (!parsed.ok) return parsed.errors;
  const { players, tournaments, rules } = parsed.season;
  return players.flatMap((p) => {
    const { total } = countRace(p.results, tournaments, rules);
    return total === p.officialRaceTotal ? [] : [`${p.name} (${p.id}): engine total ${total} ≠ official ${p.officialRaceTotal}`];
  });
}
