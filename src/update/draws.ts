import { drawFileSchema, type DrawFile, type DrawMatch, type DrawPlayer } from '../draws/drawSchema';
import type { DrawFeed, EventPlayersFeed, LiveMatch } from './feedTypes';
import { ENTRY, num, positive } from './matches';
import { IOC_TO_ISO } from './newPlayers';
import type { RawSeason } from './shared';

const LETTER_ROUND: Record<string, string> = { Q: 'QF', S: 'SF', F: 'F' };
const mainSingles = (matches: LiveMatch[]) => matches.filter((m) => m.DrawMatchType === 'S' && m.DrawLevelType === 'M');

/** The draw is out once the event's main-draw singles matches are listed (before that, LS is only the entry list). */
export const isDrawOut = (matches: LiveMatch[]) => mainSingles(matches).length > 0;

interface FeedDrawLine {
  DisplayLine?: string;
  EntryType?: string;
  Seed?: string | number;
  Players?: { Player?: { id?: number | string; FirstName?: string; SurName?: string; Country?: string } | unknown[] };
}

/**
 * The main singles draw lines from a /draw feed, in draw order: a player, a bye, or an open line (a
 * qualifier still to come). Null when the feed has no readable main singles draw.
 */
export function linesFromDrawFeed(feed: DrawFeed): { line: number | 'bye' | null; player?: DrawPlayer }[] | null {
  try {
    const info = JSON.parse(feed.drawInfo[0] ?? '') as { Draws?: { Events?: { Event?: unknown } } };
    const raw = info.Draws?.Events?.Event;
    const events = (Array.isArray(raw) ? raw : [raw]) as { EventTypeCode?: string; Draw?: { DrawLine?: FeedDrawLine[] } }[];
    const lines = events.find((e) => e?.EventTypeCode === 'LS')?.Draw?.DrawLine;
    if (!Array.isArray(lines) || lines.length === 0) return null;
    return lines.map((l) => {
      const p = Array.isArray(l.Players?.Player) ? undefined : l.Players?.Player;
      const id = positive(p?.id);
      if (l.DisplayLine === 'Bye') return { line: 'bye' as const };
      if (id === null) return { line: null };
      return {
        line: id,
        player: {
          wtaId: id,
          name: l.DisplayLine || `${p?.FirstName ?? ''} ${p?.SurName ?? ''}`.trim(),
          country: p?.Country ? IOC_TO_ISO[p.Country] ?? null : null,
          seed: positive(l.Seed),
          entry: ENTRY[String(l.EntryType ?? '').trim()] ?? null,
        },
      };
    });
  } catch {
    return null;
  }
}

/** An event's main singles draw from its draw lines and matches feed. */
export function drawFileFromLines(table: { round: string }[], lines: NonNullable<ReturnType<typeof linesFromDrawFeed>>, matches: LiveMatch[]): DrawFile {
  return {
    drawSize: lines.filter((l) => l.line !== 'bye').length,
    players: lines.flatMap((l) => (l.player ? [l.player] : [])),
    matches: drawMatches(table, matches),
    lines: lines.map((l) => l.line),
  };
}

/** An event's main singles draw from its players and matches feeds. `table` is its points table (first round first). */
export function toDrawFile(table: { round: string }[], playersFeed: EventPlayersFeed, matches: LiveMatch[]): DrawFile {
  const list = playersFeed.events.find((e) => e.eventTypeCode === 'LS')?.eventPlayers ?? [];
  const players = list
    .filter((ep) => ep.players[0])
    .map((ep) => {
      const p = ep.players[0]!;
      return {
        wtaId: p.id,
        name: p.fullName,
        country: p.countryCode ? IOC_TO_ISO[p.countryCode] ?? null : null,
        seed: positive(ep.seed),
        entry: ENTRY[String(ep.entryType ?? '').trim()] ?? null,
      };
    });
  return { drawSize: players.length, players, matches: drawMatches(table, matches) };
}

/** Every main-draw singles match in a matches feed, first round first. */
function drawMatches(table: { round: string }[], matches: LiveMatch[]): DrawMatch[] {
  const draw = mainSingles(matches).map((m) => {
    // Match ids count down from the final (LS001), so they give the round even for matches not yet played,
    // which the feed can publish with a different RoundID.
    const number = /^LS(\d+)$/.exec(m.MatchID ?? '')?.[1];
    const id = String(m.RoundID).trim();
    const round = number
      ? table.length - 1 - Math.floor(Math.log2(Number(number)))
      : /^\d+$/.test(id) ? Number(id) : table.findIndex((r) => r.round === LETTER_ROUND[id]) + 1;
    if (round < 1) throw new Error(`unknown round id "${id}" in a match feed`);
    const a = positive(m.PlayerIDA);
    const b = positive(m.PlayerIDB);
    const finished = m.MatchState === 'F' && m.Winner !== undefined && m.Winner !== null && m.Winner !== '';
    const code = num(m.Winner);
    const score = finished ? (m.ScoreString ?? '').replace(/\s*Ret'?d\.?\s*$/i, '').split(',').map((s) => s.trim()).filter(Boolean).join(' ') : '';
    return {
      round,
      a,
      b,
      winner: finished && code !== null ? (code % 2 === 0 ? a : b) : null,
      score,
      outcome: !finished ? ('scheduled' as const) : code === 4 || code === 5 ? ('retired' as const) : score === '' ? ('walkover' as const) : ('played' as const),
    };
  });
  return draw.sort((x, y) => x.round - y.round);
}

/** Draw feeds are keyed by WTA id and year: ids repeat every year (Hong Kong 2025 and 2026). */
export const drawFeedKey = (t: { wtaId?: number; startDate: string }) => `${t.wtaId}-${t.startDate.slice(0, 4)}`;

/**
 * New draw files for tracked events whose draws changed, plus commit-message lines. `feeds` are keyed by
 * `drawFeedKey`. An event in `failed` (tournament ids), or whose feed can't be read or comes back short,
 * keeps its previous file. Draws are published fact: they never block an update.
 */
export function updateDrawFiles(
  raw: RawSeason,
  feeds: { players: Record<string, EventPlayersFeed>; matches: Record<string, LiveMatch[]>; draws?: Record<string, DrawFeed> },
  existing: Record<string, DrawFile | undefined>,
  failed: string[],
): { files: Record<string, DrawFile>; changes: string[]; notes: string[] } {
  const files: Record<string, DrawFile> = {};
  const changes: string[] = [];
  const notes: string[] = [];
  for (const t of raw.tournaments) {
    if (t.wtaId === undefined) continue;
    if (failed.includes(t.id)) {
      notes.push(`${t.name}: its draw feeds didn't load, so the previous draw was kept.`);
      continue;
    }
    const playersFeed = feeds.players[drawFeedKey(t)];
    const matches = feeds.matches[drawFeedKey(t)] ?? [];
    const drawFeed = feeds.draws?.[drawFeedKey(t)];
    // The draw lines are published as soon as the draw is made; the matches feed lists main-draw matches later.
    const lines = drawFeed ? linesFromDrawFeed(drawFeed) : null;
    const table = raw.rules.pointsTables[t.drawType]!;
    const fromLines = lines !== null && lines.length === 2 ** (table.length - 1);
    if (!fromLines && (!playersFeed || !isDrawOut(matches))) continue;
    let next: DrawFile;
    try {
      next = fromLines ? drawFileFromLines(table, lines, matches) : toDrawFile(table, playersFeed!, matches);
    } catch {
      notes.push(`${t.name}: its draw feed had something unexpected, so the previous draw was kept.`);
      continue;
    }
    // The players feed sometimes drops the main-draw list (it did for Wuhan's qualifying week).
    const inFirstRound = new Set(next.matches.filter((x) => x.round === 1).flatMap((x) => [x.a, x.b]).filter((x) => x !== null));
    if (next.players.length === 0 || (!fromLines && next.players.length < inFirstRound.size)) {
      notes.push(`${t.name}: its draw list came back empty or short, so the previous draw was kept.`);
      continue;
    }
    const previous = existing[t.id];
    if (previous && JSON.stringify(previous) === JSON.stringify(next)) continue;
    const valid = drawFileSchema.safeParse(next);
    if (!valid.success) {
      notes.push(`${t.name}: its draw feed had something unexpected, so the previous draw was kept.`);
      continue;
    }
    files[t.id] = next;
    changes.push(`Draw: ${t.name} ${previous ? 'updated' : 'added'}`);
  }
  return { files, changes, notes };
}
