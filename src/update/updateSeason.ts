import { validateSeason } from '../data/validateSeason';
import type { FeedSnapshot } from './feedTypes';
import type { Ctx, RawSeason } from './shared';
import { creditFinished } from './credit';
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
  updateTotals(ctx);
  addNewPlayers(ctx);
  updateEvents(ctx);
  updateEntries(ctx);
  creditFinished(ctx);
  if (ctx.problems.length === 0) ctx.problems.push(...validateSeason(ctx.raw));
  const changed = JSON.stringify(ctx.raw) !== JSON.stringify(raw);
  if (changed && ctx.changes.length === 0) ctx.changes.push('Data refresh');
  return { raw: ctx.raw, changed, changes: ctx.changes, notes: ctx.notes, problems: ctx.problems };
}
