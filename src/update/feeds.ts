import type { SeasonInput } from '../data/schema';
import type { CalendarEvent, EventPlayersFeed, FeedSnapshot, LiveMatch, PlayerMatch, RaceRow } from './feedTypes';
import { playerFeedsNeeded } from './updateSeason';

const API = 'https://api.wtatennis.com/tennis';

export type GetJson = (url: string) => Promise<unknown>;

export const getJson: GetJson = async (url) => {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
};

/** The array in a feed body: the body itself, or its `key` property. Anything else is a feed glitch. */
function arrayOf<T>(body: unknown, key: string, url: string): T[] {
  if (Array.isArray(body)) return body as T[];
  const value = (body as Record<string, unknown> | null)?.[key];
  if (Array.isArray(value)) return value as T[];
  throw new Error(`Unexpected response from ${url}`);
}

/** Everything one update reads. Throws on any failed or malformed response, so the run changes nothing. */
export async function fetchSnapshot(raw: SeasonInput, get: GetJson = getJson): Promise<FeedSnapshot> {
  const fetchArray = async <T>(url: string, key: string) => arrayOf<T>(await get(url), key, url);
  const race = await fetchArray<RaceRow>(`${API}/players/ranked?page=0&pageSize=100&type=rankSingles&sort=asc&metric=CHAMPSINGLES&name=`, 'content');
  const real = raw.tournaments.filter((t) => t.wtaId !== undefined);
  const from = real.map((t) => t.startDate).sort()[0];
  const to = real.map((t) => t.endDate).sort().at(-1);
  const calendar: CalendarEvent[] = [];
  for (let page = 0; ; page++) {
    const batch = await fetchArray<CalendarEvent>(`${API}/tournaments/?page=${page}&pageSize=100&excludeLevels=ITF&from=${from}&to=${to}`, 'content');
    calendar.push(...batch);
    if (batch.length < 100) break;
  }
  const eventPlayers: Record<string, EventPlayersFeed> = {};
  const eventMatches: Record<string, LiveMatch[]> = {};
  for (const t of real.filter((x) => x.status !== 'completed')) {
    const base = `${API}/tournaments/${t.wtaId}/${t.startDate.slice(0, 4)}`;
    const players = await get(`${base}/players`);
    if (!Array.isArray((players as EventPlayersFeed | null)?.events)) throw new Error(`Unexpected response from ${base}/players`);
    eventPlayers[String(t.wtaId)] = players as EventPlayersFeed;
    eventMatches[String(t.wtaId)] = await fetchArray<LiveMatch>(`${base}/matches`, 'matches');
  }
  const partial: FeedSnapshot = { race, calendar, eventPlayers, eventMatches, playerMatches: {}, playerFeedErrors: [] };
  const raceStart = from!;
  const playerFeed = async (id: number) => {
    const all: PlayerMatch[] = [];
    for (let page = 0; page < 5; page++) {
      const batch = await fetchArray<PlayerMatch>(`${API}/players/${id}/matches?page=${page}&pageSize=100&sort=desc&type=S`, 'matches');
      all.push(...batch);
      if (batch.length < 100 || batch.at(-1)!.StartDate.slice(0, 10) < raceStart) break;
    }
    return all;
  };
  // Feeds the season update depends on (new players, crediting) must load, or the run is a feed error.
  const needed = playerFeedsNeeded(raw, partial);
  for (const id of needed) partial.playerMatches[String(id)] = await playerFeed(id);
  // Everyone else's feed is only for their match files: a failure keeps their previous file.
  for (const p of raw.players) {
    if (p.wtaId === undefined || needed.includes(p.wtaId)) continue;
    try {
      partial.playerMatches[String(p.wtaId)] = await playerFeed(p.wtaId);
    } catch {
      partial.playerFeedErrors!.push(p.wtaId);
    }
  }
  return partial;
}

/** One event's players and matches feeds. */
export async function fetchEventFeeds(t: { wtaId?: number; startDate: string }, get: GetJson = getJson): Promise<{ players: EventPlayersFeed; matches: LiveMatch[] }> {
  const base = `${API}/tournaments/${t.wtaId}/${t.startDate.slice(0, 4)}`;
  const players = await get(`${base}/players`);
  if (!Array.isArray((players as EventPlayersFeed | null)?.events)) throw new Error(`Unexpected response from ${base}/players`);
  return { players: players as EventPlayersFeed, matches: arrayOf<LiveMatch>(await get(`${base}/matches`), 'matches', `${base}/matches`) };
}
