import { drawFileSchema } from './drawSchema';

/** Each draw file must belong to a tracked tournament and match the schema. */
export function validateDrawFiles(files: Record<string, unknown>, tournamentIds: string[]): string[] {
  const errors: string[] = [];
  for (const [id, body] of Object.entries(files)) {
    const where = `data/draws/${id}.json`;
    if (!tournamentIds.includes(id)) {
      errors.push(`${where}: not a tracked tournament`);
      continue;
    }
    const parsed = drawFileSchema.safeParse(body);
    if (!parsed.success) errors.push(`${where}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  }
  return errors;
}
