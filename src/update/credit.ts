import { validateSeason } from '../data/validateSeason';
import { mainSinglesMatches, yearOf, type Ctx, type RawPlayer, type RawSeason, type RawTournament } from './shared';

/** Events we still store as in progress whose final has been played. */
export function finishedEvents(ctx: Ctx): RawTournament[] {
  return ctx.raw.tournaments.filter(
    (t) => t.status === 'in-progress' && mainSinglesMatches(ctx, t).some((m) => String(m.RoundID).trim() === 'F' && m.MatchState === 'F'),
  );
}

/** A player's published race points at an event, from her match feed (undefined until posted). */
function postedPoints(ctx: Ctx, p: RawPlayer, t: RawTournament): number | undefined {
  const points = (ctx.snap.playerMatches[String(p.wtaId)] ?? [])
    .filter((m) => m.tourn_nbr.trim() === String(t.wtaId) && Number(m.tourn_year) === yearOf(t))
    .map((m) => (m.player_1.trim() === String(p.wtaId) ? m.points_champ_1 : m.points_champ_2))
    .filter((x): x is number => typeof x === 'number');
  return points.length ? Math.max(...points) : undefined;
}

/** Marks `t` completed in `raw` with every player's posted points; false if any player's points aren't posted. */
function credit(ctx: Ctx, raw: RawSeason, t: RawTournament): boolean {
  for (const p of raw.players) {
    const result = p.results.find((r) => r.tournamentId === t.id);
    if (!result) continue;
    const points = postedPoints(ctx, p, t);
    if (points === undefined) return false;
    result.points = points;
    p.live = (p.live ?? []).filter((l) => l.tournamentId !== t.id);
  }
  raw.tournaments.find((x) => x.id === t.id)!.status = 'completed';
  return true;
}

const subsets = <T>(items: T[]): T[][] =>
  items.reduce<T[][]>((acc, item) => [...acc, ...acc.map((s) => [...s, item])], [[]]).sort((a, b) => b.length - a.length);

/**
 * Finished events become completed once the official totals include them. Every combination is tried,
 * most credited first; the first that reproduces every official total wins. If none does, the final
 * validation reports it.
 */
export function creditFinished(ctx: Ctx): void {
  const events = finishedEvents(ctx);
  if (events.length === 0) return;
  for (const chosen of subsets(events)) {
    const raw = structuredClone(ctx.raw);
    if (!chosen.every((t) => credit(ctx, raw, t))) continue;
    if (validateSeason(raw).length > 0) continue;
    ctx.raw = raw;
    for (const t of chosen) ctx.changes.push(`${t.name}: points credited, event completed`);
    for (const t of events.filter((e) => !chosen.includes(e))) ctx.notes.push(`${t.name}: finished; waiting for the WTA to credit its points.`);
    return;
  }
}
