import { drawMatches } from './draws';
import type { FeedSnapshot, RaceRow } from './feedTypes';
import { TOP, type RawSeason } from './shared';

/**
 * Points each player has already earned at events under way, by WTA id: the round she has reached, from the
 * event's matches feed. The race feed only adds them once the event is credited, a week or more later.
 */
export function livePoints(raw: RawSeason, snap: FeedSnapshot): Map<number, number> {
  const points = new Map<number, number>();
  for (const t of raw.tournaments) {
    const table = raw.rules.pointsTables[t.drawType];
    const matches = t.wtaId === undefined ? undefined : snap.eventMatches[String(t.wtaId)];
    if (t.status !== 'in-progress' || !table || !matches) continue;
    let draw;
    try {
      draw = drawMatches(table, matches);
    } catch {
      continue; // an unreadable feed: nobody gets live points from it
    }
    const reached = new Map<number, number>();
    for (const m of draw) {
      for (const id of [m.a, m.b]) {
        if (id !== null) reached.set(id, Math.max(reached.get(id) ?? 0, m.winner === id ? m.round + 1 : m.round));
      }
    }
    for (const [id, round] of reached) points.set(id, (points.get(id) ?? 0) + (table[Math.min(round, table.length) - 1]?.points ?? 0));
  }
  return points;
}

/**
 * Untracked players to add: anyone in the race feed's top `top`, and anyone whose live total (race points plus
 * points from events under way) puts her in the live top `top`. Ordered by race ranking.
 */
export function newcomers(raw: RawSeason, snap: FeedSnapshot, top = TOP): (RaceRow & { live: number })[] {
  const tracked = new Set(raw.players.map((p) => p.wtaId));
  const live = livePoints(raw, snap);
  const rows = snap.race.map((r) => ({ ...r, live: r.points + (live.get(r.player.id) ?? 0) }));
  const liveTop = new Set([...rows].sort((a, b) => b.live - a.live).slice(0, top).map((r) => r.player.id));
  return rows
    .filter((r) => !tracked.has(r.player.id) && (r.ranking <= top || liveTop.has(r.player.id)))
    .sort((a, b) => a.ranking - b.ranking);
}
