import type { SeasonInput } from '../data/schema';
import type { CalendarEvent, EventPlayer, FeedSnapshot, LiveMatch } from './feedTypes';

export type RawSeason = SeasonInput;
export type RawTournament = RawSeason['tournaments'][number];
export type RawPlayer = RawSeason['players'][number];

/** Everything a stage reads and writes. Stages mutate `raw`, which is the updater's own copy. */
export interface Ctx {
  raw: RawSeason;
  snap: FeedSnapshot;
  changes: string[];
  notes: string[];
  problems: string[];
}

/** The race's top players must always be tracked, so the Q/Out bound on untracked players holds. */
export const TOP = 40;

export const yearOf = (t: { startDate: string }) => Number(t.startDate.slice(0, 4));

export const tableOf = (ctx: Ctx, t: RawTournament) => ctx.raw.rules.pointsTables[t.drawType]!;

export const calendarEvent = (ctx: Ctx, t: RawTournament): CalendarEvent | undefined =>
  ctx.snap.calendar.find((c) => c.tournamentGroup.id === t.wtaId && c.year === yearOf(t));

/** Main-draw singles matches of an event. */
export const mainSinglesMatches = (ctx: Ctx, t: RawTournament): LiveMatch[] =>
  (ctx.snap.eventMatches[String(t.wtaId)] ?? []).filter((m) => m.DrawMatchType === 'S' && m.DrawLevelType === 'M');

/** Everyone listed for singles, main draw and qualifying: who has entered. */
export const singlesEntrants = (ctx: Ctx, t: RawTournament): EventPlayer[] =>
  (ctx.snap.eventPlayers[String(t.wtaId)]?.events ?? []).filter((e) => e.eventTypeCode === 'LS' || e.eventTypeCode === 'RS').flatMap((e) => e.eventPlayers);

/** The singles main-draw list: the entry list before the draw, the draw order after. */
export const singlesList = (ctx: Ctx, t: RawTournament): EventPlayer[] =>
  ctx.snap.eventPlayers[String(t.wtaId)]?.events.find((e) => e.eventTypeCode === 'LS')?.eventPlayers ?? [];

export const nameOf = (ctx: Ctx, playerId: string) => ctx.raw.players.find((p) => p.id === playerId)?.name ?? playerId;

export const sameMembers = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
