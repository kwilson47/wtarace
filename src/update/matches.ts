import { matchFileSchema, roundLabel, type MatchRecord } from '../season/matchSchema';
import type { FeedSnapshot, PlayerMatch } from './feedTypes';
import { IOC_TO_ISO, titleCase } from './newPlayers';
import type { RawSeason } from './shared';

const TEAM = /UNITED CUP|BILLIE JEAN KING|BJK CUP/i;
const ENTRY: Record<string, string> = { Q: 'Q', W: 'WC', L: 'LL', S: 'SE', A: 'Alt', P: 'PR', WC: 'WC', LL: 'LL', SE: 'SE', PR: 'PR', ALT: 'Alt' };
const CATEGORY_LEVEL: Record<string, string> = { GS: 'Grand Slam', WTA1000C: 'WTA 1000', WTA1000: 'WTA 1000', WTA500: 'WTA 500', WTA250: 'WTA 250', WTA125: 'WTA 125' };
const LETTER_ROUND: Record<string, string> = { Q: 'QF', S: 'SF', F: 'F' };
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
/** Rankings and seeds start at 1; the feeds publish 0 for none. */
const positive = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};

/** The race year: from the first tracked event's start to the last one's end. */
export function raceWindow(raw: RawSeason): { start: string; end: string } {
  const real = raw.tournaments.filter((t) => t.wtaId !== undefined);
  return { start: real.map((t) => t.startDate).sort()[0]!, end: real.map((t) => t.endDate).sort().at(-1)! };
}

/** Her race-year singles matches from her match feed, as published. Byes and the previous season's WTA Finals are left out. */
export function toMatchRecords(raw: RawSeason, wtaId: number, feed: PlayerMatch[]): MatchRecord[] {
  const { start, end } = raceWindow(raw);
  const records: MatchRecord[] = [];
  for (const m of feed) {
    const info = m.tournament;
    const startDate = info?.startDate ?? m.StartDate.slice(0, 10);
    const level = info?.level ?? info?.tournamentGroup.level ?? m.TournamentLevel ?? '';
    if (startDate < start || startDate > end || level === 'Finals' || m.reason_code === 'B') continue;
    const side = m.player_1.trim() === String(wtaId) ? 1 : 2;
    const theirs = <T>(one: T, two: T) => (side === 1 ? two : one);
    const mine = <T>(one: T, two: T) => (side === 1 ? one : two);
    const id = Number(m.tourn_nbr.trim());
    const year = Number(m.tourn_year);
    const ours = raw.tournaments.find((t) => t.wtaId === id && Number(t.startDate.slice(0, 4)) === year);
    const title = info?.title ?? m.TournamentName;
    const country = m.opponent?.countryCode ? IOC_TO_ISO[m.opponent.countryCode] ?? null : null;
    records.push({
      tournamentId: id,
      year,
      tournament: ours?.name ?? titleCase((info?.city || m.city || info?.tournamentGroup.name || m.TournamentName).trim()),
      level,
      team: TEAM.test(title) || TEAM.test(info?.tournamentGroup.name ?? '') || ours?.drawType === 'united-cup',
      surface: titleCase((info?.surface ?? m.Surface ?? '').trim()),
      indoor: info?.inOutdoor === 'I',
      startDate,
      endDate: info?.endDate ?? startDate,
      qualifying: m.qpm_flag === 'Q',
      round: num(m.tourn_round) ?? 0,
      roundName: m.round_name.trim(),
      opponent: {
        id: m.opponent?.id ?? null,
        name: m.opponent?.fullName ?? '',
        country,
        seed: positive(theirs(m.seed_1, m.seed_2)),
        entry: ENTRY[String(theirs(m.entry_type_1, m.entry_type_2) ?? '').trim()] ?? null,
        rank: positive(theirs(m.rank_1, m.rank_2)),
      },
      won: String(m.winner) === String(side),
      score: (m.scores ?? '').trim().replace(/\s+/g, ' '),
      outcome: m.reason_code === 'R' ? 'retired' : m.reason_code === 'D' ? 'walkover' : 'played',
      points: num(mine(m.points_1, m.points_2)),
    });
  }
  return records.sort(byDateThenRound);
}

const byDateThenRound = (a: MatchRecord, b: MatchRecord) =>
  a.startDate.localeCompare(b.startDate) || a.tournamentId - b.tournamentId || Number(b.qualifying) - Number(a.qualifying) || a.round - b.round;

/**
 * Her finished matches at events under way, from each event's own match feed. A player's match feed
 * only lists an event's matches some time after it ends, so these fill the gap until it does.
 */
export function liveMatchRecords(raw: RawSeason, wtaId: number, snap: Pick<FeedSnapshot, 'eventMatches' | 'calendar'>): MatchRecord[] {
  const records: MatchRecord[] = [];
  for (const t of raw.tournaments) {
    if (t.status !== 'in-progress' || t.wtaId === undefined) continue;
    const year = Number(t.startDate.slice(0, 4));
    const cal = snap.calendar.find((c) => c.tournamentGroup.id === t.wtaId && c.year === year);
    const table = raw.rules.pointsTables[t.drawType]!;
    for (const m of snap.eventMatches[String(t.wtaId)] ?? []) {
      if (m.DrawMatchType !== 'S' || m.MatchState !== 'F') continue;
      const isA = String(m.PlayerIDA) === String(wtaId);
      if (!isA && String(m.PlayerIDB) !== String(wtaId)) continue;
      const theirs = <T>(a: T, b: T) => (isA ? b : a);
      const id = String(m.RoundID).trim();
      const numeric = /^\d+$/.test(id);
      const qualifying = m.DrawLevelType === 'Q';
      const score = (m.ScoreString ?? '').replace(/\s*Ret'?d\.?\s*$/i, '').split(',').map((s) => s.trim()).filter(Boolean).join(' ');
      const winner = Number(m.Winner);
      const country = theirs(m.PlayerCountryA, m.PlayerCountryB);
      records.push({
        tournamentId: t.wtaId,
        year,
        tournament: t.name,
        level: CATEGORY_LEVEL[t.category] ?? t.category,
        team: t.drawType === 'united-cup',
        surface: titleCase((cal?.surface ?? '').trim()),
        indoor: cal?.inOutdoor === 'I',
        startDate: t.startDate,
        endDate: t.endDate,
        qualifying,
        round: numeric ? Number(id) : table.findIndex((r) => r.round === LETTER_ROUND[id]) + 1,
        roundName: qualifying ? '' : numeric ? table[Number(id) - 1]?.round ?? '' : id,
        opponent: {
          id: num(theirs(m.PlayerIDA, m.PlayerIDB)),
          name: [theirs(m.PlayerNameFirstA, m.PlayerNameFirstB), theirs(m.PlayerNameLastA, m.PlayerNameLastB)].filter(Boolean).join(' '),
          country: country ? IOC_TO_ISO[country] ?? null : null,
          seed: positive(theirs(m.SeedA, m.SeedB)),
          entry: ENTRY[String(theirs(m.EntryTypeA, m.EntryTypeB) ?? '').trim()] ?? null,
          rank: null,
        },
        won: (winner % 2 === 0) === isA,
        score,
        outcome: winner === 4 || winner === 5 ? 'retired' : score === '' ? 'walkover' : 'played',
        points: null,
      });
    }
  }
  return records;
}

const matchKey = (r: MatchRecord) => `${r.tournamentId}-${r.year}-${r.qualifying}-${r.round}`;

/**
 * New match files for players whose race-year matches changed, plus commit-message lines. A player
 * whose feed failed keeps her previous file. Match data is published fact: it never blocks an update.
 */
export function updateMatchFiles(
  raw: RawSeason,
  playerMatches: Record<string, PlayerMatch[]>,
  failed: number[],
  existing: Record<string, MatchRecord[] | undefined>,
  live?: Pick<FeedSnapshot, 'eventMatches' | 'calendar'>,
): { files: Record<string, MatchRecord[]>; changes: string[]; notes: string[] } {
  const files: Record<string, MatchRecord[]> = {};
  const changes: string[] = [];
  const notes: string[] = [];
  for (const p of raw.players) {
    if (p.wtaId === undefined) continue;
    const feed = playerMatches[String(p.wtaId)];
    if (!feed) {
      if (failed.includes(p.wtaId)) notes.push(`${p.name}: her match feed didn't load, so her previous matches were kept.`);
      continue;
    }
    const published = toMatchRecords(raw, p.wtaId, feed);
    const inFeed = new Set(published.map((r) => `${r.tournamentId}-${r.year}`));
    const underWay = live ? liveMatchRecords(raw, p.wtaId, live).filter((r) => !inFeed.has(`${r.tournamentId}-${r.year}`)) : [];
    // An event in neither source keeps what she had: e.g. one just credited (its live feed is no longer read)
    // that her match feed doesn't list yet.
    const known = new Set([...published, ...underWay].map((r) => `${r.tournamentId}-${r.year}`));
    const carried = (existing[p.id] ?? []).filter((r) => !known.has(`${r.tournamentId}-${r.year}`));
    const next = [...published, ...underWay, ...carried].sort(byDateThenRound);
    const previous = existing[p.id];
    if (previous && JSON.stringify(previous) === JSON.stringify(next)) continue;
    const invalid = matchFileSchema.safeParse(next);
    if (!invalid.success) {
      notes.push(`${p.name}: her match feed had something unexpected (${invalid.error.issues[0]?.path.join('.')}: ${invalid.error.issues[0]?.message}), so her previous matches were kept.`);
      continue;
    }
    files[p.id] = next;
    const added = next.filter((r) => !previous?.some((o) => matchKey(o) === matchKey(r)));
    if (!previous) changes.push(`Matches: ${p.name} +${added.length} (first fill)`);
    else if (added.length === 0) changes.push(`Matches: ${p.name} updated`);
    else if (added.length > 3) changes.push(`Matches: ${p.name} +${added.length}`);
    else {
      for (const r of added) {
        const players = r.won ? `${p.name} d. ${r.opponent.name}` : `${r.opponent.name} d. ${p.name}`;
        changes.push(`Matches: ${players} (${r.tournament} ${roundLabel(r)})`);
      }
    }
  }
  return { files, changes, notes };
}
