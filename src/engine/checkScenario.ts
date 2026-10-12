import type { Player, Rules, Tournament } from '../data/schema';
import { pointsTable, roundIndex } from './lookup';
import { pickProblem, type PickProblem } from './picks';
import { meetingFromTop } from './drawMeeting';
import { pickKey, splitPickKey, type Scenario } from './types';

export type Warning =
  | { kind: 'round-capacity'; mode: 'exact' | 'at-least'; tournamentId: string; round: string; count: number; limit: number; playerIds: string[] }
  | { kind: 'same-week'; playerId: string; tournamentIds: [string, string] }
  | { kind: 'pick-conflict'; playerId: string; tournamentId: string; problem: PickProblem }
  /** Two players picked past the round where their places in a live draw would meet. */
  | { kind: 'draw-conflict'; tournamentId: string; playerIds: [string, string]; round: string; section: 'half' | 'quarter' | 'eighth' | 'section' };

export function checkScenario(scenario: Scenario, players: Player[], tournaments: Tournament[], rules: Rules): Warning[] {
  const warnings: Warning[] = [];
  for (const [key, round] of Object.entries(scenario)) {
    const { playerId, tournamentId } = splitPickKey(key);
    const player = players.find((p) => p.id === playerId);
    const tournament = tournaments.find((t) => t.id === tournamentId);
    if (!player || !tournament) continue; // reconcileScenario drops these
    const problem = pickProblem(player, tournament, round, rules);
    if (problem) warnings.push({ kind: 'pick-conflict', playerId, tournamentId, problem });
  }
  const remaining = tournaments.filter((t) => t.status !== 'completed');
  for (const t of remaining) warnings.push(...capacityWarnings(t, scenario, players, rules));
  for (const p of players) warnings.push(...sameWeekWarnings(p, scenario, remaining, rules));
  for (const t of remaining) warnings.push(...drawConflicts(t, scenario, players, rules));
  return warnings;
}

function validPick(scenario: Scenario, player: Player, t: Tournament, rules: Rules): string | undefined {
  const round = scenario[pickKey(player.id, t.id)];
  return round !== undefined && pickProblem(player, t, round, rules) === null ? round : undefined;
}

function aliveRound(player: Player, t: Tournament): string | undefined {
  return player.live.find((l) => l.tournamentId === t.id && l.state === 'alive')?.round;
}

function capacityWarnings(t: Tournament, scenario: Scenario, players: Player[], rules: Rules): Warning[] {
  const table = pointsTable(rules, t.drawType);
  const last = table.length - 1;
  const exact = new Map<number, string[]>();
  const reaching: { playerId: string; index: number }[] = [];

  for (const p of players) {
    const picked = validPick(scenario, p, t, rules);
    if (picked !== undefined) {
      const index = roundIndex(table, picked);
      exact.set(index, [...(exact.get(index) ?? []), p.id]);
      reaching.push({ playerId: p.id, index });
    } else if (scenario[pickKey(p.id, t.id)] === undefined) {
      const alive = aliveRound(p, t);
      if (alive !== undefined) reaching.push({ playerId: p.id, index: roundIndex(table, alive) });
    }
  }

  const warnings: Warning[] = [];
  for (let index = last; index >= 0; index--) {
    const ids = exact.get(index) ?? [];
    const fromTop = last - index;
    const limit = fromTop === 0 ? 1 : 2 ** (fromTop - 1); // 1 W, 1 F, 2 SF, 4 QF, …
    if (ids.length > limit) {
      warnings.push({ kind: 'round-capacity', mode: 'exact', tournamentId: t.id, round: table[index].round, count: ids.length, limit, playerIds: ids });
    }
  }
  if (warnings.length > 0) return warnings;

  for (let index = last; index >= 0; index--) {
    const ids = reaching.filter((r) => r.index >= index).map((r) => r.playerId);
    const limit = 2 ** (last - index); // ≤1 reach W, ≤2 reach F, ≤4 reach SF, …
    if (ids.length > limit) {
      return [{ kind: 'round-capacity', mode: 'at-least', tournamentId: t.id, round: table[index].round, count: ids.length, limit, playerIds: ids }];
    }
  }
  return [];
}

function sameWeekWarnings(player: Player, scenario: Scenario, remaining: Tournament[], rules: Rules): Warning[] {
  const playing = remaining.filter((t) =>
    scenario[pickKey(player.id, t.id)] !== undefined
      ? validPick(scenario, player, t, rules) !== undefined
      : aliveRound(player, t) !== undefined,
  );
  const warnings: Warning[] = [];
  for (let i = 0; i < playing.length; i++) {
    for (let j = i + 1; j < playing.length; j++) {
      const a = playing[i]!;
      const b = playing[j]!;
      if (a.startDate < b.endDate && b.startDate < a.endDate) {
        warnings.push({ kind: 'same-week', playerId: player.id, tournamentIds: [a.id, b.id] });
      }
    }
  }
  return warnings;
}

const SECTIONS = ['half', 'quarter', 'eighth'] as const;

/**
 * Pairs of players picked past the round where they'd meet, at an event whose draw positions are known (one under
 * way). Each can go beyond that round only if the other went out by then.
 */
function drawConflicts(t: Tournament, scenario: Scenario, players: Player[], rules: Rules): Warning[] {
  const table = pointsTable(rules, t.drawType);
  if (t.status !== 'in-progress' || t.drawSize === undefined) return [];
  const picked = players.flatMap((p) => {
    const round = validPick(scenario, p, t, rules);
    const position = p.live.find((l) => l.tournamentId === t.id && l.state === 'alive')?.drawPosition;
    return round === undefined || position === undefined ? [] : [{ id: p.id, position, fromTop: table.length - 1 - roundIndex(table, round) }];
  });
  const warnings: Warning[] = [];
  for (let i = 0; i < picked.length; i++) {
    for (let j = i + 1; j < picked.length; j++) {
      const a = picked[i]!;
      const b = picked[j]!;
      const meet = meetingFromTop(a.position, b.position, t.drawSize);
      // Meeting in the final is covered by the round-capacity check (two winners).
      if (meet > 1 && a.fromTop < meet && b.fromTop < meet) {
        const ids = [a.id, b.id].sort() as [string, string];
        warnings.push({ kind: 'draw-conflict', tournamentId: t.id, playerIds: ids, round: table[table.length - 1 - meet]!.round, section: SECTIONS[meet - 2] ?? 'section' });
      }
    }
  }
  return warnings;
}
