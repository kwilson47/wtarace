import type { MatchRecord } from '../season/matchSchema';
import type { PlayerMatch } from './feedTypes';
import { IOC_TO_ISO, titleCase } from './newPlayers';
import type { RawSeason } from './shared';

const TEAM = /UNITED CUP|BILLIE JEAN KING|BJK CUP/i;
const ENTRY: Record<string, string> = { Q: 'Q', W: 'WC', L: 'LL', S: 'SE', A: 'Alt', P: 'PR' };
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

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
      tournament: ours?.name ?? titleCase((info?.city ?? m.city ?? m.TournamentName).trim()),
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
        seed: num(theirs(m.seed_1, m.seed_2)),
        entry: ENTRY[String(theirs(m.entry_type_1, m.entry_type_2) ?? '').trim()] ?? null,
        rank: num(theirs(m.rank_1, m.rank_2)),
      },
      won: String(m.winner) === String(side),
      score: (m.scores ?? '').trim().replace(/\s+/g, ' '),
      outcome: m.reason_code === 'R' ? 'retired' : m.reason_code === 'D' ? 'walkover' : 'played',
      points: num(mine(m.points_1, m.points_2)),
    });
  }
  return records.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) || a.tournamentId - b.tournamentId || Number(b.qualifying) - Number(a.qualifying) || a.round - b.round,
  );
}
