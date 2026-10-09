import { matchFileSchema } from './matchSchema';

/** Each match file must belong to a tracked player and match the schema. */
export function validateMatchFiles(files: Record<string, unknown>, playerIds: string[]): string[] {
  const errors: string[] = [];
  for (const [id, body] of Object.entries(files)) {
    const where = `data/matches/${id}.json`;
    if (!playerIds.includes(id)) {
      errors.push(`${where}: not a tracked player`);
      continue;
    }
    const parsed = matchFileSchema.safeParse(body);
    if (!parsed.success) errors.push(`${where}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  }
  return errors;
}
