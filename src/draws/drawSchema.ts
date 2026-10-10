import { z } from 'zod';

export const drawPlayerSchema = z.object({
  wtaId: z.number().int(),
  name: z.string(),
  /** ISO 3166-1 alpha-2, when known. */
  country: z.string().nullable(),
  seed: z.number().int().nullable(),
  /** Q, WC, LL, SE, Alt or PR. */
  entry: z.string().nullable(),
});

export const drawMatchSchema = z.object({
  /** 1, 2, … from the first round. */
  round: z.number().int().positive(),
  a: z.number().int().nullable(),
  b: z.number().int().nullable(),
  /** Null until played. */
  winner: z.number().int().nullable(),
  /** Winner first, as published; '' if unplayed or a walkover. */
  score: z.string(),
  outcome: z.enum(['played', 'retired', 'walkover', 'scheduled']),
});

/** An event's main singles draw: the draw order (byes not counted) and every match, as published. */
export const drawFileSchema = z.object({
  drawSize: z.number().int().nonnegative(),
  players: z.array(drawPlayerSchema),
  matches: z.array(drawMatchSchema),
  /**
   * The bracket's first-round lines in draw order, as published: a WTA id, a bye, or null for a line not
   * filled yet (a qualifier still to come). Missing for draws read before the WTA's draw lines were used.
   */
  lines: z.array(z.union([z.number().int(), z.literal('bye'), z.null()])).optional(),
});

export type DrawPlayer = z.infer<typeof drawPlayerSchema>;
export type DrawMatch = z.infer<typeof drawMatchSchema>;
export type DrawFile = z.infer<typeof drawFileSchema>;
