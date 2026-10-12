import type { DrawFile } from '../draws/drawSchema';
import type { RaceRow } from './feedTypes';

/** The main-draw entry deadline: 4 weeks before the Monday of the event's start week, 6 for a Grand Slam (R §III). */
export function entryDeadline(t: { startDate: string; category: string }): string {
  const d = new Date(`${t.startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - (t.category === 'GS' ? 42 : 28));
  return d.toISOString().slice(0, 10);
}

/** Main-draw places filled by ranking: the draw size less qualifiers, wild cards, lucky losers, special exempts, protected rankings and open lines. */
export function directPlaces(draw: DrawFile): number {
  return draw.drawSize - draw.players.filter((p) => p.entry !== null).length - (draw.lines?.filter((l) => l === null).length ?? 0);
}

/** Tracked players committed to the event (ranked within its direct-entry places at the deadline), with that ranking. */
export function commitmentFor(
  t: { startDate: string; category: string },
  draw: DrawFile,
  rankings: RaceRow[],
  players: { id: string; wtaId?: number }[],
): { deadline: string; ranks: Record<string, number> } {
  const places = directPlaces(draw);
  const ranks: Record<string, number> = {};
  for (const p of players) {
    const rank = rankings.find((r) => r.player.id === p.wtaId)?.ranking;
    if (rank !== undefined && rank > 0 && rank <= places) ranks[p.id] = rank;
  }
  return { deadline: entryDeadline(t), ranks };
}
