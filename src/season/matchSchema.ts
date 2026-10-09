import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One singles match as the WTA publishes it, trimmed to what the season page needs. */
export const matchRecordSchema = z.object({
  /** WTA tournament id and year. */
  tournamentId: z.number().int(),
  year: z.number().int(),
  /** Short name: ours for events we track, otherwise the city. */
  tournament: z.string().min(1),
  /** As published: 'Grand Slam', 'WTA 1000', 'WTA 500', 'WTA 250', 'WTA 125', 'ITF', … */
  level: z.string(),
  /** United Cup or Billie Jean King Cup. */
  team: z.boolean(),
  surface: z.string(),
  indoor: z.boolean(),
  startDate: isoDate,
  endDate: isoDate,
  qualifying: z.boolean(),
  /** 1, 2, … within the draw (main or qualifying). */
  round: z.number().int().nonnegative(),
  /** As published: R128 … R16, Q (quarterfinal), S, F; empty for some ITF and team events. */
  roundName: z.string(),
  opponent: z.object({
    id: z.number().int().nullable(),
    name: z.string(),
    /** ISO 3166-1 alpha-2, when known. */
    country: z.string().nullable(),
    seed: z.number().int().nullable(),
    /** Q, WC, LL, SE, Alt or PR. */
    entry: z.string().nullable(),
    /** Her ranking at the time of the match. */
    rank: z.number().int().nullable(),
  }),
  won: z.boolean(),
  /** As published, single-spaced; empty for a walkover. */
  score: z.string(),
  outcome: z.enum(['played', 'retired', 'walkover']),
  /** The player's ranking points for the event (as of this match), as published. */
  points: z.number().int().nullable(),
});

export type MatchRecord = z.infer<typeof matchRecordSchema>;
export const matchFileSchema = z.array(matchRecordSchema);

const MAIN_ROUND: Record<string, string> = { Q: 'QF', S: 'SF', F: 'F' };

/** "QF", "R32", "Qualifying R2", "Team". */
export function roundLabel(r: Pick<MatchRecord, 'team' | 'qualifying' | 'round' | 'roundName'>): string {
  if (r.team) return 'Team';
  if (r.qualifying) return `Qualifying R${r.round}`;
  return MAIN_ROUND[r.roundName] ?? (/^R\d+$/.test(r.roundName) ? r.roundName : `R${r.round}`);
}
