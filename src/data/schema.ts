import { z } from 'zod';

export const ZERO_POINTER_ROUND = 'ZP';
const QUALIFYING_ROUND = /^Q\d*$/;

const id = z.string().regex(/^[a-z0-9-]+$/, 'must be lowercase letters, digits and hyphens');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const roundCode = z.string().regex(/^[A-Z0-9]+$/, 'must be uppercase letters and digits');

const roundPointsSchema = z.object({
  round: roundCode,
  label: z.string().min(1),
  points: z.number().int().nonnegative(),
});

const categoryList = z.array(z.string().min(1)).min(1);

const tiebreakerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pointsIn'), categories: categoryList }),
  z.object({ kind: z.literal('highestIn'), categories: categoryList }),
]);

export const rulesSchema = z.object({
  season: z.number().int(),
  maxCountedResults: z.number().int().positive(),
  /** In order, each group's best `count` results always count (even past the cap). */
  requiredGroups: z.array(z.object({ categories: categoryList, count: z.number().int().positive() })),
  /** Results from these categories never count. */
  excludedCategories: z.array(z.string().min(1)),
  /** Each table is ordered from the first round to the winner. */
  pointsTables: z.record(z.string(), z.array(roundPointsSchema).min(2)),
  byeRule: z.enum(['points-of-round-lost', 'points-of-previous-round']),
  /** Applied in order over counted results; player id is the final fallback. */
  tiebreakers: z.array(tiebreakerSchema).min(1),
  qualification: z.object({
    places: z.number().int().positive(),
    /** The last place goes to the best-ranked eligible winner of an event in `categories` within the rank window, if any. */
    championPlace: z.object({ categories: categoryList, fromRank: z.number().int().positive(), toRank: z.number().int().positive() }).nullable(),
    /** Qualifiers must have played `count` events in `categories` (zero-pointers excluded) unless waived. */
    minEvents: z.object({ count: z.number().int().positive(), categories: categoryList }).nullable(),
  }),
  trackedPlayerCount: z.number().int().positive(),
});

export const tournamentSchema = z.object({
  id,
  name: z.string().min(1),
  category: z.string().min(1),
  drawType: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate,
  status: z.enum(['completed', 'in-progress', 'upcoming']),
  /** Players known to have a first-round bye (fill in once the draw is out). */
  byes: z.array(id).default([]),
  /** Number of positions in the official draw order, for in-progress events whose draw is known. */
  drawSize: z.number().int().positive().optional(),
  /** Tracked players on an upcoming event's entry list (main draw or qualifying), once published. Display only. */
  entries: z.array(id).optional(),
  /** The WTA's own id (calendar `tournamentGroup.id` for tournaments), used by the automatic updater. */
  wtaId: z.number().int().positive().optional(),
});

const resultSchema = z.object({ tournamentId: id, round: roundCode, points: z.number().int().nonnegative() });
const liveSchema = z.object({
  tournamentId: id,
  state: z.enum(['alive', 'eliminated']),
  round: roundCode,
  /** 1-based position in the official draw order; halves, quarters and eighths are equal blocks of it. */
  drawPosition: z.number().int().positive().optional(),
});

export const playerSchema = z.object({
  id,
  /** The WTA's own id (calendar `tournamentGroup.id` for tournaments), used by the automatic updater. */
  wtaId: z.number().int().positive().optional(),
  name: z.string().min(1),
  country: z.string().regex(/^[A-Z]{2}$/, 'must be an ISO 3166-1 alpha-2 code'),
  officialRaceTotal: z.number().int().nonnegative(),
  results: z.array(resultSchema),
  live: z.array(liveSchema).default([]),
  qualified: z.boolean().default(false),
  eventMinimumWaived: z.boolean().default(false),
});

export const metaSchema = z.object({ lastUpdated: z.iso.datetime({ offset: true }) });

export const seasonSchema = z
  .object({ rules: rulesSchema, tournaments: z.array(tournamentSchema), players: z.array(playerSchema), meta: metaSchema })
  .superRefine((s, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    const duplicates = (ids: string[], kind: string) => {
      const seen = new Set<string>();
      for (const value of ids) {
        if (seen.has(value)) issue(`Duplicate ${kind} id "${value}"`);
        seen.add(value);
      }
    };

    duplicates(s.tournaments.map((t) => t.id), 'tournament');
    duplicates(s.players.map((p) => p.id), 'player');
    // Tournament WTA ids repeat across years (Hong Kong 2025 and 2026), so only player ids must be unique.
    const wtaIds = new Set<number>();
    for (const p of s.players) {
      if (p.wtaId === undefined) continue;
      if (wtaIds.has(p.wtaId)) issue(`Duplicate player wtaId ${p.wtaId}`);
      wtaIds.add(p.wtaId);
    }
    if (s.players.length !== s.rules.trackedPlayerCount) {
      issue(`players.json has ${s.players.length} players but rules.trackedPlayerCount is ${s.rules.trackedPlayerCount}`);
    }

    const tournaments = new Map(s.tournaments.map((t) => [t.id, t]));
    const positions = new Set<string>(); // "tournamentId#drawPosition" across all players
    for (const t of s.tournaments) {
      if (!s.rules.pointsTables[t.drawType]) issue(`Tournament ${t.id}: drawType "${t.drawType}" has no points table`);
      if (t.startDate > t.endDate) issue(`Tournament ${t.id}: startDate is after endDate`);
      if (t.entries && t.status !== 'upcoming') issue(`Tournament ${t.id}: entries are only for upcoming events`);
      for (const e of t.entries ?? []) {
        if (!s.players.some((p) => p.id === e)) issue(`Tournament ${t.id}: entries lists unknown player "${e}"`);
      }
    }
    const roundExists = (drawType: string, round: string) =>
      s.rules.pointsTables[drawType]?.some((r) => r.round === round) ?? true; // missing table reported above

    for (const p of s.players) {
      const seen = new Set<string>();
      for (const r of p.results) {
        const t = tournaments.get(r.tournamentId);
        if (!t) {
          issue(`${p.id}: result references unknown tournament "${r.tournamentId}"`);
          continue;
        }
        if (seen.has(t.id)) issue(`${p.id}: more than one result for ${t.id}`);
        seen.add(t.id);
        if (r.round === ZERO_POINTER_ROUND) {
          if (r.points !== 0) issue(`${p.id} at ${t.id}: zero-pointer must have 0 points`);
        } else if (!QUALIFYING_ROUND.test(r.round) && !roundExists(t.drawType, r.round)) {
          issue(`${p.id} at ${t.id}: round "${r.round}" is not valid for draw type ${t.drawType}`);
        }
      }

      const liveSeen = new Set<string>();
      for (const l of p.live) {
        const t = tournaments.get(l.tournamentId);
        if (!t) {
          issue(`${p.id}: live status references unknown tournament "${l.tournamentId}"`);
          continue;
        }
        if (liveSeen.has(t.id)) issue(`${p.id}: more than one live status for ${t.id}`);
        liveSeen.add(t.id);
        if (t.status !== 'in-progress') issue(`${p.id}: live status for ${t.id}, which is not in progress`);
        if (!roundExists(t.drawType, l.round)) {
          issue(`${p.id} at ${t.id}: live round "${l.round}" is not valid for draw type ${t.drawType}`);
        }
        if (!p.results.some((r) => r.tournamentId === t.id)) {
          issue(`${p.id}: live status at ${t.id} but no result recording points earned there`);
        }
        if (l.drawPosition !== undefined) {
          if (t.drawSize === undefined) issue(`${p.id} at ${t.id}: drawPosition needs the tournament's drawSize`);
          else if (l.drawPosition > t.drawSize) issue(`${p.id} at ${t.id}: drawPosition ${l.drawPosition} is outside the ${t.drawSize}-player draw`);
          const key = `${t.id}#${l.drawPosition}`;
          if (positions.has(key)) issue(`${t.id}: draw position ${l.drawPosition} is used by more than one player`);
          positions.add(key);
        }
      }
    }
  });

export type Rules = z.infer<typeof rulesSchema>;
export type Tiebreaker = z.infer<typeof tiebreakerSchema>;
export type RoundPoints = z.infer<typeof roundPointsSchema>;
export type Tournament = z.infer<typeof tournamentSchema>;
export type Player = z.infer<typeof playerSchema>;
export type Result = z.infer<typeof resultSchema>;
export type LiveStatus = z.infer<typeof liveSchema>;
export type Season = z.infer<typeof seasonSchema>;
export type SeasonInput = z.input<typeof seasonSchema>;

export type ParseOutcome = { ok: true; season: Season } | { ok: false; errors: string[] };

export function parseSeason(raw: unknown): ParseOutcome {
  const result = seasonSchema.safeParse(raw);
  if (result.success) return { ok: true, season: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => (i.path.length ? `${i.path.map(String).join('.')}: ${i.message}` : i.message)),
  };
}

export function parseOrThrow(raw: unknown): Season {
  const result = parseSeason(raw);
  if (!result.ok) throw new Error(`Invalid season data:\n${result.errors.join('\n')}`);
  return result.season;
}
