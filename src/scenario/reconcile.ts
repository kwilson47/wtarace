import type { Season } from '../data/schema';
import { describePickProblem, pickProblem } from '../engine/picks';
import { splitPickKey, type Scenario } from '../engine/types';

export interface IgnoredPick {
  pick: string;
  reason: string;
}

/** Drops picks that reference unknown ids or are impossible under current data. */
export function reconcileScenario(scenario: Scenario, season: Season): { scenario: Scenario; ignored: IgnoredPick[] } {
  const kept: Record<string, string> = {};
  const ignored: IgnoredPick[] = [];
  for (const [key, round] of Object.entries(scenario)) {
    const { playerId, tournamentId } = splitPickKey(key);
    const player = season.players.find((p) => p.id === playerId);
    if (!player) {
      ignored.push({ pick: `${playerId} at ${tournamentId}: ${round}`, reason: 'unknown player' });
      continue;
    }
    const tournament = season.tournaments.find((t) => t.id === tournamentId);
    if (!tournament) {
      ignored.push({ pick: `${playerId} at ${tournamentId}: ${round}`, reason: 'unknown tournament' });
      continue;
    }
    const problem = pickProblem(player, tournament, round, season.rules);
    if (problem) {
      ignored.push({ pick: `${player.name} at ${tournament.name}: ${round}`, reason: describePickProblem(problem) });
      continue;
    }
    kept[key] = round;
  }
  return { scenario: kept, ignored };
}
