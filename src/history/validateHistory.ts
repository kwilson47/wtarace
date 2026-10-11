import { raceHistorySchema } from './historySchema';

/** Problems with data/race-history.json: shape, aligned lengths, ordered dates, and only tracked players. */
export function validateHistory(raw: unknown, trackedIds: string[]): string[] {
  const parsed = raceHistorySchema.safeParse(raw);
  if (!parsed.success) return [`data/race-history.json: ${parsed.error.issues[0]?.message ?? 'invalid'}`];
  const h = parsed.data;
  const errors: string[] = [];
  if (h.dates.some((d, i) => i > 0 && d <= h.dates[i - 1]!)) errors.push('data/race-history.json: dates must be in order, without repeats');
  if (h.eighth.length !== h.dates.length) errors.push('data/race-history.json: eighth must have one entry per date');
  for (const [id, weeks] of Object.entries(h.players)) {
    if (!trackedIds.includes(id)) errors.push(`data/race-history.json: ${id} is not a tracked player`);
    else if (weeks.length !== h.dates.length) errors.push(`data/race-history.json: ${id} must have one entry per date`);
  }
  return errors;
}
