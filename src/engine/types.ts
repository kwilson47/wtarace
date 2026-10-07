/** Picks keyed by pickKey(playerId, tournamentId). The value is a round code. No entry = no pick. */
export type Scenario = Readonly<Record<string, string>>;

export function pickKey(playerId: string, tournamentId: string): string {
  return `${playerId}|${tournamentId}`;
}

export function splitPickKey(key: string): { playerId: string; tournamentId: string } {
  const [playerId = '', tournamentId = ''] = key.split('|');
  return { playerId, tournamentId };
}
