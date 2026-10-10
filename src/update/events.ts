import { linesFromDrawFeed } from './draws';
import type { LiveMatch } from './feedTypes';
import { calendarEvent, mainSinglesMatches, sameMembers, singlesList, tableOf, type Ctx, type RawPlayer, type RawTournament } from './shared';

const LETTER_ROUNDS: Record<string, string> = { Q: 'QF', S: 'SF', F: 'F' };

/** Index into the event's points table of a feed round id: numbers count from the first round. */
export function roundIndex(roundId: string | number, table: { round: string }[]): number {
  const id = String(roundId).trim();
  const letter = LETTER_ROUNDS[id];
  const index = letter ? table.findIndex((r) => r.round === letter) : /^\d+$/.test(id) ? Number(id) - 1 : -1;
  if (index < 0 || index >= table.length) throw new Error(`unknown round id "${id}" in a match feed`);
  return index;
}

const involves = (m: LiveMatch, wtaId: number) => String(m.PlayerIDA) === String(wtaId) || String(m.PlayerIDB) === String(wtaId);
/** Even winner codes are player A (2, or 4 on retirement); odd are player B. */
const wonBy = (m: LiveMatch, wtaId: number) =>
  m.Winner !== undefined && m.Winner !== null && (Number(m.Winner) % 2 === 0) === (String(m.PlayerIDA) === String(wtaId));

export type LiveState = { state: 'alive' | 'eliminated'; round: string };

/** Where a player in the draw stands: her current round if she's alive, or the round she lost in. */
export function liveState(matches: LiveMatch[], wtaId: number, table: { round: string }[], bye: boolean): LiveState {
  const mine = matches.filter((m) => involves(m, wtaId));
  if (mine.length === 0) return { state: 'alive', round: table[bye ? 1 : 0]!.round };
  const last = mine.reduce((a, b) => (roundIndex(b.RoundID, table) > roundIndex(a.RoundID, table) ? b : a));
  const index = roundIndex(last.RoundID, table);
  if (last.MatchState !== 'F') return { state: 'alive', round: table[index]!.round };
  return wonBy(last, wtaId) ? { state: 'alive', round: table[index + 1]!.round } : { state: 'eliminated', round: table[index]!.round };
}

/**
 * Tracked players in the draw with no first-round match. Only trusted when the feed's first round is
 * complete and fits the bracket exactly: (size − byes) / 2 matches, and exactly `bracket − size` players
 * in the draw without one. Otherwise (a withdrawal replaced by a lucky loser, a partial feed) nothing is
 * inferred.
 */
function setByes(ctx: Ctx, t: RawTournament, matches: LiveMatch[], drawIds: string[]): void {
  const firstRound = matches.filter((m) => String(m.RoundID).trim() === '1');
  const bracket = 2 ** Math.ceil(Math.log2(drawIds.length));
  const expectedByes = bracket - drawIds.length;
  if (firstRound.length !== (drawIds.length - expectedByes) / 2) return;
  const playing = new Set(firstRound.flatMap((m) => [String(m.PlayerIDA), String(m.PlayerIDB)]));
  if (drawIds.filter((id) => !playing.has(id)).length !== expectedByes) {
    ctx.notes.push(`${t.name}: the first round doesn't match the draw list, so byes weren't updated.`);
    return;
  }
  const byes = ctx.raw.players
    .filter((p) => p.wtaId !== undefined && drawIds.includes(String(p.wtaId)) && !playing.has(String(p.wtaId)))
    .map((p) => p.id);
  saveByes(ctx, t, byes);
}

/** The event's draw-sheet lines, when published and the right size for its draw type. */
function sheetLines(ctx: Ctx, t: RawTournament) {
  const feed = t.wtaId === undefined ? undefined : ctx.snap.eventDraws?.[String(t.wtaId)];
  const lines = feed ? linesFromDrawFeed(feed) : null;
  return lines && lines.length === 2 ** (tableOf(ctx, t).length - 1) ? lines : null;
}

/** Byes from the draw sheet: the tracked players whose line is paired with a bye. Known as soon as the draw is made. */
function setByesFromLines(ctx: Ctx, t: RawTournament, lines: NonNullable<ReturnType<typeof sheetLines>>): void {
  const byes = ctx.raw.players
    .filter((p) => p.wtaId !== undefined && lines.some((l, i) => l.line === p.wtaId && lines[i ^ 1]?.line === 'bye'))
    .map((p) => p.id);
  saveByes(ctx, t, byes);
}

function saveByes(ctx: Ctx, t: RawTournament, byes: string[]): void {
  if (sameMembers(t.byes ?? [], byes)) return;
  t.byes = byes;
  ctx.changes.push(`${t.name}: byes ${byes.length ? byes.map((id) => ctx.raw.players.find((p) => p.id === id)!.name).join(', ') : 'none'}`);
}

function updatePlayerAt(ctx: Ctx, p: RawPlayer, t: RawTournament, s: LiveState, position: number): void {
  p.live ??= [];
  const existing = p.live.find((l) => l.tournamentId === t.id);
  const before = existing ? `${existing.state}:${existing.round}` : '';
  const entry = { tournamentId: t.id, state: s.state, round: s.round, ...(s.state === 'alive' ? { drawPosition: position } : {}) };
  if (existing) {
    delete existing.drawPosition;
    Object.assign(existing, entry);
  } else {
    p.live.push(entry);
  }
  const result = p.results.find((r) => r.tournamentId === t.id);
  if (result) result.round = s.round;
  else p.results.push({ tournamentId: t.id, round: s.round, points: 0 });
  if (before !== `${s.state}:${s.round}`) {
    ctx.changes.push(`${t.name}: ${p.name} ${s.state === 'alive' ? `alive in ${s.round}` : `out in ${s.round}`}`);
  }
}

/** A tracked player who lost in qualifying at an event under way: her result is `Q<round>`, 0 points until credited. */
function recordQualifyingLoss(ctx: Ctx, p: RawPlayer, t: RawTournament): void {
  const mine = (ctx.snap.eventMatches[String(t.wtaId)] ?? []).filter(
    (m) => m.DrawMatchType === 'S' && m.DrawLevelType === 'Q' && involves(m, p.wtaId!),
  );
  if (mine.length === 0) return;
  const last = mine.reduce((a, b) => (Number(b.RoundID) > Number(a.RoundID) ? b : a));
  if (last.MatchState !== 'F' || wonBy(last, p.wtaId!)) return; // still in qualifying, or through to the main draw
  const round = `Q${Number(last.RoundID)}`;
  const result = p.results.find((r) => r.tournamentId === t.id);
  if (result?.round === round) return;
  if (result) result.round = round;
  else p.results.push({ tournamentId: t.id, round, points: 0 });
  ctx.changes.push(`${t.name}: ${p.name} lost in qualifying (${round})`);
}

/** Event status, draw size, byes, and every tracked player's live round at events under way. */
export function updateEvents(ctx: Ctx): void {
  for (const t of ctx.raw.tournaments) {
    if (t.status === 'completed' || t.wtaId === undefined) continue;
    const cal = calendarEvent(ctx, t);
    if (!cal) {
      ctx.problems.push(`${t.name}: not found in the WTA calendar.`);
      continue;
    }
    const matches = mainSinglesMatches(ctx, t);
    const drawIds = singlesList(ctx, t).map((ep) => String(ep.players[0]?.id));
    if (t.status === 'upcoming' && cal.status !== 'future') {
      t.status = 'in-progress';
      delete t.entries;
      ctx.changes.push(`${t.name}: under way`);
    }
    const sheet = sheetLines(ctx, t);
    if (sheet) setByesFromLines(ctx, t, sheet);
    else if (matches.length > 0) setByes(ctx, t, matches, drawIds);
    if (t.status !== 'in-progress') continue;
    if (matches.length === 0 || drawIds.length === 0) {
      ctx.problems.push(`${t.name} is in progress but its draw isn't in the feeds.`);
      continue;
    }
    if (t.drawSize !== drawIds.length) {
      t.drawSize = drawIds.length;
      ctx.changes.push(`${t.name}: draw of ${drawIds.length}`);
    }
    const table = tableOf(ctx, t);
    for (const p of ctx.raw.players) {
      if (p.wtaId === undefined) continue;
      if (!drawIds.includes(String(p.wtaId))) {
        if (p.live?.some((l) => l.tournamentId === t.id)) {
          ctx.problems.push(`${t.name}: ${p.name} has a result there but isn't in the draw any more.`);
        } else {
          recordQualifyingLoss(ctx, p, t);
        }
        continue;
      }
      const bye = (t.byes ?? []).includes(p.id);
      updatePlayerAt(ctx, p, t, liveState(matches, p.wtaId, table, bye), drawIds.indexOf(String(p.wtaId)) + 1);
    }
  }
}
