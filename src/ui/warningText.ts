import type { Season } from '../data/schema';
import type { Warning } from '../engine/checkScenario';
import { pointsTable } from '../engine/lookup';
import { describePickProblem } from '../engine/picks';
import { pickKey } from '../engine/types';

/** Turns warnings into messages keyed by pickKey, so each dropdown can show its own. */
export function warningsByPick(warnings: Warning[], season: Season): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (playerId: string, tournamentId: string, message: string) => {
    const key = pickKey(playerId, tournamentId);
    out.set(key, [...(out.get(key) ?? []), message]);
  };
  const tournament = (id: string) => season.tournaments.find((t) => t.id === id);
  const roundLabel = (tournamentId: string, round: string) => {
    const t = tournament(tournamentId);
    return (t && pointsTable(season.rules, t.drawType).find((r) => r.round === round)?.label) ?? round;
  };

  for (const w of warnings) {
    switch (w.kind) {
      case 'round-capacity': {
        const label = roundLabel(w.tournamentId, w.round);
        const message =
          w.mode === 'exact'
            ? `Too many picks at ${label}: ${w.count} picked, at most ${w.limit} possible.`
            : `${w.count} players are picked or still alive to reach the ${label} or beyond; only ${w.limit} can.`;
        for (const id of w.playerIds) add(id, w.tournamentId, message);
        break;
      }
      case 'same-week': {
        const [a, b] = w.tournamentIds;
        add(w.playerId, a, `Overlaps with ${tournament(b)?.name ?? b}.`);
        add(w.playerId, b, `Overlaps with ${tournament(a)?.name ?? a}.`);
        break;
      }
      case 'pick-conflict':
        add(w.playerId, w.tournamentId, `This pick can't apply: ${describePickProblem(w.problem)}.`);
        break;
    }
  }
  return out;
}
