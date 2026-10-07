import { pickKey, splitPickKey, type Scenario } from '../engine/types';

// '.' and '_' are left unescaped by URLSearchParams, so links stay readable.
const ENTRY_SEPARATOR = '_';
const FIELD_SEPARATOR = '.';
const ENTRY = /^([a-z0-9-]+)\.([a-z0-9-]+)\.([A-Z0-9]+)$/;

export function encodeScenario(scenario: Scenario): string {
  return Object.entries(scenario)
    .map(([key, round]) => {
      const { playerId, tournamentId } = splitPickKey(key);
      return [playerId, tournamentId, round].join(FIELD_SEPARATOR);
    })
    .sort()
    .join(ENTRY_SEPARATOR);
}

export function decodeScenario(param: string | null): { scenario: Scenario; malformed: string[] } {
  const scenario: Record<string, string> = {};
  const malformed: string[] = [];
  for (const entry of (param ?? '').split(ENTRY_SEPARATOR)) {
    if (entry === '') continue;
    const match = ENTRY.exec(entry);
    if (!match) {
      malformed.push(entry);
      continue;
    }
    scenario[pickKey(match[1], match[2])] = match[3];
  }
  return { scenario, malformed };
}
