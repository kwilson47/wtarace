import { validateSeason } from '../data/validateSeason';
import type { FeedSnapshot } from './feedTypes';
import { TOP, type Ctx, type RawSeason } from './shared';
import { creditFinished, finishedEvents } from './credit';
import { updateEntries } from './entries';
import { updateEvents } from './events';
import { addNewPlayers } from './newPlayers';
import { updateTotals } from './totals';

export interface UpdateResult {
  raw: RawSeason;
  /** Whether any data differs from the input. */
  changed: boolean;
  /** One line per change, for the commit message. */
  changes: string[];
  /** Things worth knowing that didn't stop the update (e.g. an entry list kept because the feed emptied). */
  notes: string[];
  /** Anything that needs a human. When non-empty, nothing may be published. */
  problems: string[];
}

/** Refreshes a copy of the raw season from a snapshot of the WTA feeds. Pure: no I/O. */
export function updateSeason(raw: RawSeason, snap: FeedSnapshot): UpdateResult {
  const ctx: Ctx = { raw: structuredClone(raw), snap, changes: [], notes: [], problems: [] };
  try {
    updateTotals(ctx);
    updateEvents(ctx);
    updateEntries(ctx);
    // Credit before adding new players: a player often enters the top 40 when an event is credited.
    creditFinished(ctx);
    addNewPlayers(ctx);
    updateEvents(ctx); // live rounds for anyone just added
  } catch (error) {
    ctx.problems.push(`The updater hit an error: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (ctx.problems.length === 0) ctx.problems.push(...validateSeason(ctx.raw));
  const unique = (lines: string[]) => [...new Set(lines)];
  const changed = JSON.stringify(ctx.raw) !== JSON.stringify(raw);
  if (changed && ctx.changes.length === 0) ctx.changes.push('Data refresh');
  return { raw: ctx.raw, changed, changes: unique(ctx.changes), notes: unique(ctx.notes), problems: unique(ctx.problems) };
}

/** WTA player ids whose match feeds the update needs: new top-40 players, and players at finished events. */
export function playerFeedsNeeded(raw: RawSeason, snap: FeedSnapshot): number[] {
  const tracked = new Set(raw.players.map((p) => p.wtaId));
  const ids = snap.race.filter((r) => r.ranking <= TOP && !tracked.has(r.player.id)).map((r) => r.player.id);
  const ctx: Ctx = { raw, snap, changes: [], notes: [], problems: [] };
  for (const t of finishedEvents(ctx)) {
    for (const p of raw.players) if (p.wtaId !== undefined && p.results.some((r) => r.tournamentId === t.id)) ids.push(p.wtaId);
  }
  return [...new Set(ids)];
}
