import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const week = z.tuple([z.number().int().positive(), z.number().int().nonnegative()]).nullable();

/** The race as the WTA published it each week: dates, each tracked player's [position, points], and the 8th-place points. */
export const raceHistorySchema = z.object({
  dates: z.array(isoDate),
  players: z.record(z.string(), z.array(week)),
  eighth: z.array(z.number().int().nonnegative().nullable()),
});

export type RaceHistory = z.infer<typeof raceHistorySchema>;
