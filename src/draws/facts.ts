import type { Season } from '../data/schema';
import { pointsTable } from '../engine/lookup';
import { buildBracket, finalists } from './bracket';
import type { DrawFile } from './drawSchema';

export interface TournamentFact {
  /** The champion's name, once the final is played (or a tracked player's title when there's no draw file). */
  champion: string | null;
  /** The round being played at a live event, by name ("Semifinal"). */
  round: string | null;
  drawOut: boolean;
}

/** What the tournaments index shows for each event, from its draw file (built at deploy time). */
export function tournamentFacts(season: Season, draws: Record<string, DrawFile | undefined>): Record<string, TournamentFact> {
  return Object.fromEntries(
    season.tournaments.map((t) => {
      const draw = draws[t.id];
      const bracket = draw ? buildBracket(draw) : null;
      const final = bracket ? finalists(bracket) : null;
      const fromDraw = final?.champion != null ? (draw!.players.find((p) => p.wtaId === final.champion)?.name ?? null) : null;
      const tracked = season.players.find((p) => p.results.some((r) => r.tournamentId === t.id && r.round === 'W'))?.name ?? null;
      const open = t.status === 'in-progress' ? draw?.matches.find((m) => m.winner === null) : undefined;
      return [
        t.id,
        {
          champion: t.status === 'completed' ? (fromDraw ?? tracked) : null,
          round: open ? (pointsTable(season.rules, t.drawType)[open.round - 1]?.label ?? null) : null,
          drawOut: draw !== undefined,
        },
      ];
    }),
  );
}
