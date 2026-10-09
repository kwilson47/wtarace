import type { DrawFile } from '../draws/drawSchema';
import type { EventPlayersFeed, LiveMatch } from './feedTypes';
import { ENTRY, num, positive } from './matches';
import { IOC_TO_ISO } from './newPlayers';

const LETTER_ROUND: Record<string, string> = { Q: 'QF', S: 'SF', F: 'F' };
const mainSingles = (matches: LiveMatch[]) => matches.filter((m) => m.DrawMatchType === 'S' && m.DrawLevelType === 'M');

/** The draw is out once the event's main-draw singles matches are listed (before that, LS is only the entry list). */
export const isDrawOut = (matches: LiveMatch[]) => mainSingles(matches).length > 0;

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
  const draw = mainSingles(matches).map((m) => {
    const id = String(m.RoundID).trim();
    const round = /^\d+$/.test(id) ? Number(id) : table.findIndex((r) => r.round === LETTER_ROUND[id]) + 1;
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
  return { drawSize: players.length, players, matches: draw.sort((x, y) => x.round - y.round) };
}
