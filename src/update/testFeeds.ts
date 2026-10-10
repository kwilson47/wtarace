// SYNTHETIC TEST FEEDS that agree with src/test/fixtures.ts (with WTA ids added). Not real WTA data.
import type { SeasonInput } from '../data/schema';
import { rawSeason } from '../test/fixtures';
import type { CalendarEvent, DrawFeed, EventPlayer, FeedSnapshot, LiveMatch, PlayerMatch, RaceRow } from './feedTypes';

export const TOURNAMENT_IDS: Record<string, number> = { slam: 901, m1000: 902, c500: 903, c250: 904, live: 905, next: 906, clash: 907 };
export const PLAYER_IDS: Record<string, number> = { ana: 1, bea: 2, cat: 3 };

export function updaterSeason(): SeasonInput {
  const raw = rawSeason();
  for (const t of raw.tournaments) t.wtaId = TOURNAMENT_IDS[t.id];
  for (const p of raw.players) p.wtaId = PLAYER_IDS[p.id];
  return raw;
}

const filler = (position: number) => 100 + position;

/** A draw of `size` with tracked players at fixed positions; everyone else is a filler id. */
export function drawList(size: number, placed: Record<number, number>): EventPlayer[] {
  return Array.from({ length: size }, (_, i) => {
    const id = placed[i + 1] ?? filler(i + 1);
    return { players: [{ id, fullName: `Player ${id}` }], seed: '', entryType: '' };
  });
}

export function match(round: string | number, a: number, b: number, winner?: number): LiveMatch {
  return {
    DrawMatchType: 'S',
    DrawLevelType: 'M',
    RoundID: round,
    MatchState: winner === undefined ? 'U' : 'F',
    PlayerIDA: String(a),
    PlayerIDB: String(b),
    ...(winner === undefined ? {} : { Winner: winner === a ? '2' : '3' }),
  };
}

/** The live event as the fixture has it: ana (position 1) alive in the QF, bea (9) out in the R16. */
export function liveMatches(extra: LiveMatch[] = []): LiveMatch[] {
  const at = (position: number) => (position === 1 ? 1 : position === 9 ? 2 : filler(position));
  const r1 = Array.from({ length: 16 }, (_, i) => match(1, at(2 * i + 1), at(2 * i + 2), at(2 * i + 1)));
  const r2 = Array.from({ length: 8 }, (_, i) => {
    const a = at(4 * i + 1);
    const b = at(4 * i + 3);
    return match(2, a, b, i === 2 ? b : a);
  });
  const qf = extra.some((m) => String(m.RoundID) === 'Q' && (m.PlayerIDA === '1' || m.PlayerIDB === '1')) ? [] : [match('Q', 1, filler(5))];
  return [...r1, ...r2, ...qf, ...extra];
}

const calendarEntry = (raw: SeasonInput, id: string, status: string, singlesDrawSize = 32): CalendarEvent => {
  const t = raw.tournaments.find((x) => x.id === id)!;
  return {
    tournamentGroup: { id: TOURNAMENT_IDS[id]!, name: t.name.toUpperCase() },
    year: Number(t.startDate.slice(0, 4)),
    title: t.name,
    city: t.name.toUpperCase(),
    level: t.category,
    startDate: t.startDate,
    endDate: t.endDate,
    status,
    singlesDrawSize,
  };
};

export function raceRows(raw: SeasonInput, overrides: Record<string, number> = {}): RaceRow[] {
  return raw.players.map((p, i) => ({
    ranking: i + 1,
    points: overrides[p.id] ?? p.officialRaceTotal,
    tournamentsPlayed: p.results.length,
    player: { id: PLAYER_IDS[p.id]!, fullName: p.name, countryCode: 'USA' },
  }));
}

/** Feeds that agree with the fixture season: nothing new except what the feeds always add (draw size, positions, entries). */
export function snapshot(raw: SeasonInput = updaterSeason()): FeedSnapshot {
  const status: Record<string, string> = { live: 'live', next: 'future', clash: 'future' };
  return {
    race: raceRows(raw),
    calendar: raw.tournaments.map((t) => calendarEntry(raw, t.id, status[t.id] ?? 'past')),
    eventPlayers: {
      [TOURNAMENT_IDS.live!]: { events: [{ eventTypeCode: 'LS', eventPlayers: drawList(32, { 1: 1, 9: 2 }) }] },
      [TOURNAMENT_IDS.next!]: { events: [{ eventTypeCode: 'LS', eventPlayers: drawList(2, { 1: 1, 2: 3 }) }] },
      [TOURNAMENT_IDS.clash!]: { events: [] },
    },
    eventMatches: { [TOURNAMENT_IDS.live!]: liveMatches(), [TOURNAMENT_IDS.next!]: [], [TOURNAMENT_IDS.clash!]: [] },
    playerMatches: {},
  };
}

export function playerMatch(over: Partial<PlayerMatch> & Pick<PlayerMatch, 'tourn_nbr' | 'player_1'>): PlayerMatch {
  return {
    tourn_year: '2026',
    tourn_round: '1',
    round_name: 'R32',
    qpm_flag: 'M',
    player_2: '999',
    winner: 2,
    points_champ_1: null,
    points_champ_2: null,
    StartDate: '2026-01-01T00:00:00+00:00',
    TournamentName: 'X',
    ...over,
  };
}

/** A /draw response: the main singles draw lines, as the WTA nests them (JSON inside a string). */
export function drawFeed(lines: [number, string, string, string][]): DrawFeed {
  const line = ([id, name, seed, entry]: [number, string, string, string], i: number) => ({
    DisplayLine: name, EntryType: entry, Pos: i + 1, Seed: seed, Rank: '',
    Players: { Player: { id, FirstName: name.split(' ')[0], SurName: name.split(' ')[1] ?? '', Country: id ? 'USA' : '' } },
  });
  const info = { Draws: { Events: { Event: [{ EventTypeCode: 'RS', Draw: { DrawLine: [] } }, { EventTypeCode: 'LS', Draw: { DrawLine: lines.map(line) } }] } } };
  return { drawInfo: [JSON.stringify(info)] };
}
