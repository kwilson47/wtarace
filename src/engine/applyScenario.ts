import type { Player, Result, Rules, Tournament } from '../data/schema';
import { pointsTable, roundIndex } from './lookup';
import { pickKey, type Scenario } from './types';

export function projectedPoints(playerId: string, tournament: Tournament, round: string, rules: Rules): number {
  const table = pointsTable(rules, tournament.drawType);
  const index = roundIndex(table, round);
  if (index < 0) throw new Error(`Round "${round}" is not valid for ${tournament.id}`);
  const losesFirstMatchAfterBye = index === 1 && tournament.byes.includes(playerId);
  if (losesFirstMatchAfterBye && rules.byeRule === 'points-of-previous-round') return table[0].points;
  return table[index].points;
}

/**
 * Returns the player's results with picks applied. A pick at an event replaces any
 * result already recorded there (in-progress points are replaced, not added to).
 * Never adds zero-pointers. Callers must pass a reconciled scenario.
 */
export function applyScenario(player: Player, scenario: Scenario, tournaments: Tournament[], rules: Rules): Result[] {
  const picked = new Map<string, Result>();
  for (const t of tournaments) {
    if (t.status === 'completed') continue;
    const round = scenario[pickKey(player.id, t.id)];
    if (round === undefined) continue;
    picked.set(t.id, { tournamentId: t.id, round, points: projectedPoints(player.id, t, round, rules) });
  }
  return [...player.results.filter((r) => !picked.has(r.tournamentId)), ...picked.values()];
}
