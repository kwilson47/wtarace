import type { Player, Result, Rules, Tournament } from '../data/schema';
import { ZERO_POINTER_ROUND } from '../data/schema';
import { pointsTable, roundIndex } from './lookup';

const COMMITMENT_CATEGORIES = ['GS', 'WTA1000C', 'WTA1000'];
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
 * An in-progress event with no pick banks the player's live-round points. Never adds zero-pointers. Callers must pass a reconciled scenario.
 */
export function applyScenario(player: Player, scenario: Scenario, tournaments: Tournament[], rules: Rules): Result[] {
  const picked = new Map<string, Result>();
  for (const t of tournaments) {
    if (t.status === 'completed') continue;
    const round = scenario[pickKey(player.id, t.id)];
    if (round === undefined) continue;
    picked.set(t.id, { tournamentId: t.id, round, points: projectedPoints(player.id, t, round, rules) });
  }
  // In-progress, no pick: bank the live round's points. The official race credits nothing until the
  // event ends, so stored points are often 0; Math.max keeps any points the WTA has already posted.
  for (const t of tournaments) {
    if (t.status !== 'in-progress' || picked.has(t.id)) continue;
    const live = player.live.find((l) => l.tournamentId === t.id);
    if (!live) continue;
    const stored = player.results.find((r) => r.tournamentId === t.id)?.points ?? 0;
    // Withdrawing before a first match: a zero-pointer at a commitment event (R §VIII.C.3.b.ii).
    if (live.state === 'eliminated' && live.withdrew) {
      picked.set(t.id, COMMITMENT_CATEGORIES.includes(t.category) ? { tournamentId: t.id, round: ZERO_POINTER_ROUND, points: 0 } : { tournamentId: t.id, round: live.round, points: 0 });
      continue;
    }
    // No match won on court yet: the previous round's points (R §VIII.C.3.c.ii).
    const table = pointsTable(rules, t.drawType);
    const index = roundIndex(table, live.round);
    const banked = live.walkoversOnly ? (index > 0 ? table[index - 1]!.points : 0) : projectedPoints(player.id, t, live.round, rules);
    picked.set(t.id, { tournamentId: t.id, round: live.round, points: Math.max(stored, banked) });
  }
  return [...player.results.filter((r) => !picked.has(r.tournamentId)), ...picked.values()];
}
