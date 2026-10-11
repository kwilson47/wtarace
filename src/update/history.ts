import type { RaceHistory } from '../history/historySchema';
import type { RaceRow } from './feedTypes';

export const emptyHistory = (): RaceHistory => ({ dates: [], players: {}, eighth: [] });

/** A race list's published date. */
export function listDate(rows: RaceRow[]): string | null {
  const dates = rows.map((r) => r.rankedAt?.slice(0, 10)).filter((d): d is string => !!d).sort();
  return dates.at(-1) ?? null;
}

const entryFor = (rows: RaceRow[], wtaId: number | undefined): [number, number] | null => {
  const row = wtaId === undefined ? undefined : rows.find((r) => r.player.id === wtaId);
  return row ? [row.ranking, row.points] : null;
};

/**
 * The history with one more published week, or null if this list isn't newer than the last stored week.
 * Every tracked player gets an entry for the week (null when she isn't on the list).
 */
export function appendWeek(h: RaceHistory, rows: RaceRow[], tracked: { id: string; wtaId?: number }[]): RaceHistory | null {
  const date = listDate(rows);
  if (!date || (h.dates.length > 0 && date <= h.dates.at(-1)!)) return null;
  const byPoints = [...rows].sort((a, b) => a.ranking - b.ranking);
  const players: RaceHistory['players'] = {};
  for (const [id, weeks] of Object.entries(h.players)) players[id] = [...weeks];
  for (const p of tracked) players[p.id] ??= h.dates.map(() => null);
  for (const p of tracked) players[p.id]!.push(entryFor(rows, p.wtaId));
  return { dates: [...h.dates, date], players, eighth: [...h.eighth, byPoints[7]?.points ?? null] };
}

/** Fills a player's past weeks from the lists published on the stored dates (dates without a list stay as they are). */
export function fillPlayer(h: RaceHistory, playerId: string, wtaId: number, listsByDate: Record<string, RaceRow[]>): RaceHistory {
  const current = h.players[playerId] ?? h.dates.map(() => null);
  const weeks = h.dates.map((d, i) => (listsByDate[d] ? entryFor(listsByDate[d]!, wtaId) : (current[i] ?? null)));
  return { ...h, players: { ...h.players, [playerId]: weeks } };
}
