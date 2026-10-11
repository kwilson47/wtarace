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

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * The hourly stage: appends the race list if it's newer than the last stored week, then fills the past weeks of any
 * tracked player who had none. Who needs filling is decided before the append, because a player added on a new list
 * gets that week from the append. Each past list is fetched once, however many players need it. Never throws.
 */
export async function updateHistory(
  h: RaceHistory,
  current: RaceRow[],
  tracked: { id: string; wtaId?: number; name?: string }[],
  fetchList: (at?: string) => Promise<RaceRow[]>,
): Promise<{ history: RaceHistory; changes: string[]; notes: string[] }> {
  const changes: string[] = [];
  const notes: string[] = [];
  // Players new to the file (a player whose fill failed was left out, so she's retried as new).
  const needFill = tracked.filter((p) => p.wtaId !== undefined && !(p.id in h.players));
  let history = h;
  const date = listDate(current);
  if (date && date > (history.dates.at(-1) ?? '')) {
    try {
      const appended = appendWeek(history, await fetchList(), tracked);
      if (appended) {
        history = appended;
        changes.push(`Race history: week of ${date} added`);
      }
    } catch (error) {
      notes.push(`Race history: the new race list didn't load (${reason(error)}), so the history was kept.`);
      return { history: h, changes: [], notes };
    }
  }
  if (needFill.length) {
    const lists: Record<string, RaceRow[]> = {};
    try {
      for (const d of history.dates) {
        if (needFill.some((p) => !history.players[p.id]?.[history.dates.indexOf(d)])) lists[d] = await fetchList(d);
      }
      for (const p of needFill) {
        history = fillPlayer(history, p.id, p.wtaId!, lists);
        if (history.players[p.id]!.some((w) => w !== null)) changes.push(`Race history: ${p.name ?? p.id}'s past weeks filled`);
      }
    } catch (error) {
      const players = { ...history.players };
      for (const p of needFill) delete players[p.id];
      history = { ...history, players };
      notes.push(`Race history: past weeks for ${needFill.map((p) => p.name ?? p.id).join(', ')} couldn't be filled (${reason(error)}); the next run will try again.`);
    }
  }
  return { history, changes, notes };
}
