import type { Ctx } from './shared';

/** Official race totals for every tracked player, from the race ranking feed. */
export function updateTotals(ctx: Ctx): void {
  for (const p of ctx.raw.players) {
    const row = ctx.snap.race.find((r) => r.player.id === p.wtaId);
    if (!row) {
      ctx.problems.push(`${p.name} is tracked but missing from the race ranking feed.`);
      continue;
    }
    if (row.points !== p.officialRaceTotal) {
      ctx.changes.push(`Race total: ${p.name} ${p.officialRaceTotal} → ${row.points}`);
      p.officialRaceTotal = row.points;
    }
  }
}
