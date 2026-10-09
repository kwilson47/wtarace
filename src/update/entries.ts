import { nameOf, sameMembers, singlesList, type Ctx } from './shared';

/** Entry lists for upcoming events. A list that vanishes or more than halves is treated as taken down. */
export function updateEntries(ctx: Ctx): void {
  for (const t of ctx.raw.tournaments) {
    if (t.status !== 'upcoming' || t.wtaId === undefined) continue;
    const list = singlesList(ctx, t);
    const listed = new Set(list.map((ep) => ep.players[0]?.id));
    const entries = ctx.raw.players.filter((p) => p.wtaId !== undefined && listed.has(p.wtaId)).map((p) => p.id);
    const before = t.entries;
    if (before && before.length > 0 && entries.length * 2 < before.length) {
      ctx.notes.push(`${t.name}: the entry list came back with ${entries.length} of our ${before.length} entrants, so the previous list was kept.`);
      continue;
    }
    if (!before && list.length === 0) continue; // not published yet
    if (before && sameMembers(before, entries)) continue;
    const added = entries.filter((id) => !before?.includes(id)).map((id) => `+${nameOf(ctx, id)}`);
    const removed = (before ?? []).filter((id) => !entries.includes(id)).map((id) => `−${nameOf(ctx, id)}`);
    t.entries = entries;
    ctx.changes.push(`${t.name} entries: ${[...added, ...removed].join(', ') || 'published, none of ours'}`);
  }
}
