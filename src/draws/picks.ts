import type { Season, Tournament } from '../data/schema';
import { pointsTable } from '../engine/lookup';
import { pickKey, splitPickKey, type Scenario } from '../engine/types';
import type { Bracket, BracketMatch, Slot } from './bracket';

/** The scenario key for a player in a draw: tracked players by id, everyone else as `w<wtaId>`. */
export function drawPickKey(season: Season, wtaId: number, tournamentId: string): string {
  const tracked = season.players.find((p) => p.wtaId === wtaId);
  return pickKey(tracked ? tracked.id : `w${wtaId}`, tournamentId);
}

/** The bracket round each draw player is picked to finish in: r = out in round r; one past the last round = champion. */
export function pickedRounds(season: Season, t: Tournament, draw: { players: { wtaId: number }[] }, scenario: Scenario): Map<number, number> {
  const table = pointsTable(season.rules, t.drawType);
  const picks = new Map<number, number>();
  for (const p of draw.players) {
    const code = scenario[drawPickKey(season, p.wtaId, t.id)];
    if (code === undefined) continue;
    const index = table.findIndex((r) => r.round === code);
    if (index >= 0) picks.set(p.wtaId, index + 1);
  }
  return picks;
}

export interface PickedMatch extends BracketMatch {
  /** The winner comes from a pick, not a result. */
  picked: boolean;
  /** Both players are picked past this match. */
  conflict: boolean;
  /** Undecided, with both players known: either can be picked. */
  pickable: boolean;
}

const decided = (m: BracketMatch) => m.outcome !== 'pending' && m.outcome !== 'scheduled';

/**
 * The bracket with picks played out. Results stay fixed. An undecided match goes to a player picked past it;
 * a pick for this round only says she got here (clicking a winner records her as reaching the next round), so
 * the match stays open.
 */
export function applyPicks(bracket: Bracket, picks: Map<number, number>): PickedMatch[][] {
  const rounds: PickedMatch[][] = [];
  bracket.rounds.forEach((round, index) => {
    const roundNo = index + 1;
    const previous = rounds[index - 1];
    rounds.push(
      round.map((m, i): PickedMatch => {
        const top: Slot = m.top ?? previous?.[2 * i]?.winner ?? null;
        const bottom: Slot = m.bottom ?? previous?.[2 * i + 1]?.winner ?? null;
        if (m.outcome === 'bye' || decided(m)) return { ...m, top, bottom, picked: false, conflict: false, pickable: false };
        const known = typeof top === 'number' && typeof bottom === 'number';
        const reach = (s: Slot) => (typeof s === 'number' ? picks.get(s) : undefined);
        const a = reach(top);
        const b = reach(bottom);
        const aOn = a !== undefined && a > roundNo;
        const bOn = b !== undefined && b > roundNo;
        let winner: number | null = null;
        if (!(aOn && bOn)) {
          if (aOn) winner = top as number;
          else if (bOn) winner = bottom as number;
        }
        return { ...m, top, bottom, winner, picked: winner !== null, conflict: aOn && bOn, pickable: known };
      }),
    );
  });
  return rounds;
}

/**
 * The scenario after clicking `winner` in `match`: she goes through (keeping any deeper pick she has) and
 * her opponent is out here. Clicking a picked winner again clears both picks.
 */
export function pickWinner(scenario: Scenario, season: Season, t: Tournament, match: PickedMatch, winner: number): Scenario {
  const loser = match.top === winner ? match.bottom : match.top;
  if (typeof loser !== 'number') return scenario;
  const table = pointsTable(season.rules, t.drawType);
  const next: Record<string, string> = { ...scenario };
  const winnerKey = drawPickKey(season, winner, t.id);
  const loserKey = drawPickKey(season, loser, t.id);
  if (match.picked && match.winner === winner) {
    delete next[winnerKey];
    delete next[loserKey];
    return next;
  }
  const already = table.findIndex((r) => r.round === next[winnerKey]) + 1;
  next[winnerKey] = table[Math.max(already, match.round + 1) - 1]!.round;
  next[loserKey] = table[match.round - 1]!.round;
  return next;
}

/** Every pick at one tournament removed. */
export function clearTournamentPicks(scenario: Scenario, tournamentId: string): Scenario {
  return Object.fromEntries(Object.entries(scenario).filter(([key]) => splitPickKey(key).tournamentId !== tournamentId));
}
