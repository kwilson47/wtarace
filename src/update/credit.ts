import type { Player, Tournament } from '../data/schema';
import { validateSeason } from '../data/validateSeason';
import { expectedZeroPointers } from '../engine/expected';
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

/** Her stored events as the WTA counts them: results at completed events, plus zero-pointers. */
const storedEvents = (raw: RawSeason, p: RawPlayer) =>
  p.results.filter((r) => r.round === 'ZP' || raw.tournaments.find((x) => x.id === r.tournamentId)?.status === 'completed').length;

/**
 * Marks `t` completed in `raw` with every player's posted points, and adds the zero-pointers the WTA confirmed
 * (committed, not in the draw, and one more event in the official count). Returns the change lines, or null if
 * any player's points aren't posted.
 */
function credit(ctx: Ctx, raw: RawSeason, t: RawTournament): string[] | null {
  const lines: string[] = [];
  for (const p of raw.players) {
    const expected = expectedZeroPointers({ ...p, live: p.live ?? [] } as Player, [{ ...t, byes: t.byes ?? [] } as Tournament]);
    if (!expected.length) continue;
    const row = ctx.snap.race.find((r) => r.player.id === p.wtaId);
    if (!row || row.tournamentsPlayed !== storedEvents(raw, p) + 1) continue;
    p.results.push(...expected);
    lines.push(`${t.name}: zero-pointer for ${p.name} (committed, #${t.commitment!.ranks[p.id]} at the ${t.commitment!.deadline} deadline; not in the draw)`);
  }
  for (const p of raw.players) {
    const result = p.results.find((r) => r.tournamentId === t.id);
    if (!result) continue;
    const withdrew = p.live?.find((l) => l.tournamentId === t.id)?.withdrew;
    p.live = (p.live ?? []).filter((l) => l.tournamentId !== t.id);
    // Withdrew before her first match at a commitment event: a zero-pointer (R §VIII.C.3.b.ii).
    if (withdrew && ['GS', 'WTA1000C', 'WTA1000'].includes(t.category)) {
      result.round = 'ZP';
      result.points = 0;
    }
    if (result.round === 'ZP') continue; // a zero-pointer: no match played, so no posted points; it's 0 already
    const points = postedPoints(ctx, p, t);
    if (points === undefined) return null;
    result.points = points;
  }
  raw.tournaments.find((x) => x.id === t.id)!.status = 'completed';
  return lines;
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
    const lines: string[] = [];
    if (!chosen.every((t) => { const l = credit(ctx, raw, t); if (l) lines.push(...l); return l !== null; })) continue;
    if (validateSeason(raw).length > 0) continue;
    ctx.raw = raw;
    for (const t of chosen) ctx.changes.push(`${t.name}: points credited, event completed`);
    ctx.changes.push(...lines);
    for (const t of events.filter((e) => !chosen.includes(e))) ctx.notes.push(`${t.name}: finished; waiting for the WTA to credit its points.`);
    return;
  }
}
