import type { Player, RoundPoints, Rules, Tournament } from '../data/schema';
import { pointsTable, roundIndex } from './lookup';

export type PickOptions =
  | { kind: 'locked'; label: string }
  /** `rounds` always ends with the winner entry. */
  | { kind: 'open'; allowNone: boolean; currentRound: RoundPoints | null; rounds: RoundPoints[] };

export type PickProblem = 'completed' | 'not-in-draw' | 'eliminated' | 'below-current-round' | 'invalid-round';

export function pickOptions(player: Player, tournament: Tournament, rules: Rules): PickOptions {
  if (tournament.status === 'completed') return { kind: 'locked', label: 'Completed' };
  const table = pointsTable(rules, tournament.drawType);
  if (tournament.status === 'upcoming') {
    const first = tournament.byes.includes(player.id) ? 1 : 0;
    return { kind: 'open', allowNone: true, currentRound: null, rounds: table.slice(first) };
  }
  const live = player.live.find((l) => l.tournamentId === tournament.id);
  if (!live) return { kind: 'locked', label: 'Not in draw' };
  const index = roundIndex(table, live.round);
  const current = table[index];
  if (live.state === 'eliminated') return { kind: 'locked', label: `Out in ${current.label}` };
  // She has already won it (the event stays in progress until the WTA credits its points): nothing left to pick.
  if (index === table.length - 1) return { kind: 'locked', label: current.label };
  return { kind: 'open', allowNone: false, currentRound: current, rounds: table.slice(index) };
}

export function pickProblem(player: Player, tournament: Tournament, round: string, rules: Rules): PickProblem | null {
  if (tournament.status === 'completed') return 'completed';
  const options = pickOptions(player, tournament, rules);
  if (options.kind === 'locked') {
    const live = player.live.find((l) => l.tournamentId === tournament.id);
    if (!live) return 'not-in-draw';
    if (live.state === 'alive') return live.round === round ? null : 'below-current-round'; // the champion: only her title stands
    return 'eliminated';
  }
  if (options.rounds.some((r) => r.round === round)) return null;
  const inTable = roundIndex(pointsTable(rules, tournament.drawType), round) >= 0;
  return tournament.status === 'in-progress' && inTable ? 'below-current-round' : 'invalid-round';
}

const PROBLEM_TEXT: Record<PickProblem, string> = {
  completed: 'tournament already completed',
  'not-in-draw': 'player is not in the draw',
  eliminated: 'player is already out',
  'below-current-round': 'player has already gone further',
  'invalid-round': 'not a valid round for this tournament',
};

export function describePickProblem(problem: PickProblem): string {
  return PROBLEM_TEXT[problem];
}
