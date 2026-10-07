import type { RoundPoints, Rules, Tournament } from '../data/schema';

export function pointsTable(rules: Rules, drawType: string): RoundPoints[] {
  const table = rules.pointsTables[drawType];
  if (!table) throw new Error(`No points table for draw type "${drawType}"`);
  return table;
}

export function roundIndex(table: RoundPoints[], round: string): number {
  return table.findIndex((r) => r.round === round);
}

export function findTournament(tournaments: Tournament[], id: string): Tournament {
  const tournament = tournaments.find((t) => t.id === id);
  if (!tournament) throw new Error(`Unknown tournament "${id}"`);
  return tournament;
}
