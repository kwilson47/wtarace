import { z } from 'zod';

/**
 * Clinching and elimination scenarios for the round in play, worked out by hand and kept in
 * data/scenarios.json. The updater never touches the file; an empty `items` list hides the box.
 */
const scenarioNotesSchema = z.object({
  title: z.string().min(1),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD'),
  items: z.array(z.string().min(1)),
});

export type ScenarioNotesData = z.infer<typeof scenarioNotesSchema>;

export function parseScenarioNotes(raw: unknown): ScenarioNotesData {
  return scenarioNotesSchema.parse(raw);
}
