import type { Season } from '../data/schema';
import type { MatchRecord } from '../season/matchSchema';

export type Level = 'WTA 1000' | 'WTA 500' | 'WTA 250';
export const LEVELS: readonly Level[] = ['WTA 1000', 'WTA 500', 'WTA 250'];
export const asLevel = (level: string | undefined): Level => (LEVELS as readonly string[]).includes(level ?? '') ? (level as Level) : 'WTA 500';

/** The starting rating for a WTA ranking: about 1,900 at No. 1 and 1,500 at No. 200 (rank clamped to 1–500). */
export function priorFromRank(rank: number): number {
  const r = Math.min(500, Math.max(1, rank));
  return 1500 + 400 * (1 - Math.log2(r) / Math.log2(200));
}

/** The chance that a player rated `a` beats one rated `b`. */
export function winChance(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/** Elo K for a player with `n` matches so far (FiveThirtyEight's tennis K). */
export const kFactor = (n: number) => 250 / (n + 5) ** 0.4;

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return 1500;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export interface Played {
  date: string;
  qualifying: boolean;
  round: number;
  winner: number;
  loser: number;
  level: string;
}

const trackedFiles = (season: Season, files: Record<string, MatchRecord[]>) =>
  season.players.flatMap((p) => (p.wtaId === undefined ? [] : [{ self: p.wtaId, records: files[p.id] ?? [] }]));

/** Every match in the tracked players' files once (walkovers left out), in date order, qualifying before main draw, then by round. */
export function collectMatches(season: Season, files: Record<string, MatchRecord[]>): Played[] {
  const seen = new Set<string>();
  const out: Played[] = [];
  for (const { self, records } of trackedFiles(season, files)) {
    for (const m of records) {
      const opp = m.opponent.id;
      if (opp === null || m.outcome === 'walkover') continue;
      const key = `${m.tournamentId}-${m.year}-${m.qualifying ? 'q' : 'm'}-${m.round}-${Math.min(self, opp)}-${Math.max(self, opp)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ date: m.startDate, qualifying: m.qualifying, round: m.round, winner: m.won ? self : opp, loser: m.won ? opp : self, level: m.level });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || Number(b.qualifying) - Number(a.qualifying) || a.round - b.round);
}

export interface Ratings {
  /** Rating after the whole season, by WTA id. */
  rating: Map<number, number>;
  /** Latest published WTA ranking, by WTA id. Records only carry the opponent's ranking. */
  latestRank: Map<number, number>;
  /** Mean squared error of the pre-match win chances over the replayed matches (a coin flip scores 0.25). */
  brier: number;
  matches: number;
}

/** Elo ratings from the race-year matches: priors from the first known ranking, then one update per match. */
export function buildRatings(season: Season, files: Record<string, MatchRecord[]>): Ratings {
  const ranks = trackedFiles(season, files)
    .flatMap(({ records }) => records.flatMap((m) => (m.opponent.id !== null && m.opponent.rank !== null && m.opponent.rank > 0 ? [{ date: m.startDate, id: m.opponent.id, rank: m.opponent.rank, level: m.level, main: !m.qualifying && !m.team }] : [])))
    .sort((a, b) => a.date.localeCompare(b.date));
  const firstRank = new Map<number, number>();
  const latestRank = new Map<number, number>();
  for (const r of ranks) {
    if (!firstRank.has(r.id)) firstRank.set(r.id, r.rank);
    latestRank.set(r.id, r.rank);
  }
  // Players with no known ranking start at the typical opponent of the level they first played at.
  const levelPrior = Object.fromEntries(LEVELS.map((l) => [l, median(ranks.filter((r) => r.main && r.level === l).map((r) => priorFromRank(r.rank)))])) as Record<Level, number>;

  const played = collectMatches(season, files);
  const firstLevel = new Map<number, string>();
  for (const m of played) for (const id of [m.winner, m.loser]) if (!firstLevel.has(id)) firstLevel.set(id, m.level);
  const rating = new Map<number, number>();
  const count = new Map<number, number>();
  const get = (id: number) => {
    if (!rating.has(id)) rating.set(id, firstRank.has(id) ? priorFromRank(firstRank.get(id)!) : levelPrior[asLevel(firstLevel.get(id))]);
    return rating.get(id)!;
  };
  let squared = 0;
  for (const m of played) {
    const w = get(m.winner);
    const l = get(m.loser);
    const expected = winChance(w, l);
    squared += (1 - expected) ** 2;
    const nw = count.get(m.winner) ?? 0;
    const nl = count.get(m.loser) ?? 0;
    rating.set(m.winner, w + kFactor(nw) * (1 - expected));
    rating.set(m.loser, l - kFactor(nl) * (1 - expected));
    count.set(m.winner, nw + 1);
    count.set(m.loser, nl + 1);
  }
  return { rating, latestRank, brier: played.length ? squared / played.length : 0.25, matches: played.length };
}
