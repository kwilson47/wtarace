import { roundLabel, type MatchRecord } from './matchSchema';

export interface Split { label: string; wins: number; losses: number }

export interface TournamentBlock {
  key: string;
  name: string;
  level: string;
  team: boolean;
  surface: string;
  indoor: boolean;
  startDate: string;
  endDate: string;
  /** "Winner", "Final", "QF", "R32", "Lost in qualifying R2", "In progress", "Withdrew", "Team event". */
  result: string;
  /** Ranking points for the event; null while it is in progress or when unpublished. */
  points: number | null;
  inProgress: boolean;
  /** Latest first. */
  matches: MatchRecord[];
}

export interface SeasonSummary {
  wins: number;
  losses: number;
  titles: string[];
  finals: number;
  surfaces: Split[];
  indoor: Split | null;
  levels: Split[];
  top10Wins: number;
  /** Newest first. */
  tournaments: TournamentBlock[];
}

const LEVELS = ['Grand Slam', 'WTA 1000', 'WTA 500', 'WTA 250', 'WTA 125', 'ITF'];
const SURFACES = ['Hard', 'Clay', 'Grass'];

export const levelLabel = (r: Pick<MatchRecord, 'level' | 'team'>) => (r.team ? 'Team events' : LEVELS.includes(r.level) ? r.level : 'Other');

const split = (label: string, matches: MatchRecord[]): Split => ({
  label,
  wins: matches.filter((m) => m.won).length,
  losses: matches.filter((m) => !m.won).length,
});
const nonEmpty = (s: Split) => s.wins + s.losses > 0;

function block(matches: MatchRecord[], asOf: string): TournamentBlock {
  const first = matches[0]!;
  const main = matches.filter((m) => !m.qualifying);
  const last = (main.length ? main : matches).at(-1)!;
  const isFinal = !last.qualifying && !last.team && last.roundName === 'F';
  const title = isFinal && last.won;
  const inProgress = asOf <= first.endDate && last.won && !title;
  let result: string;
  if (first.team) result = 'Team event';
  else if (title) result = 'Winner';
  else if (inProgress) result = 'In progress';
  else if (last.qualifying) result = last.won ? 'Qualified' : `Lost in qualifying R${last.round}`;
  else if (last.won) result = 'Withdrew';
  else result = `${isFinal ? 'Final' : roundLabel(last)}${last.outcome === 'walkover' ? ' (w/o)' : ''}`;
  const points = inProgress ? null : Math.max(-1, ...matches.map((m) => m.points ?? -1));
  return {
    key: `${first.tournamentId}-${first.year}`,
    name: first.tournament,
    level: first.level,
    team: first.team,
    surface: first.surface,
    indoor: first.indoor,
    startDate: first.startDate,
    endDate: first.endDate,
    result,
    points: points === null || points < 0 ? null : points,
    inProgress,
    matches: [...matches].reverse(),
  };
}

/** The season at a glance, from her match records. `asOf` (YYYY-MM-DD) decides which events are still going. */
export function seasonSummary(matches: MatchRecord[], asOf: string): SeasonSummary {
  const counted = matches.filter((m) => m.outcome !== 'walkover');
  const groups = new Map<string, MatchRecord[]>();
  for (const m of matches) {
    const key = `${m.tournamentId}-${m.year}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const tournaments = [...groups.values()]
    .map((ms) => block(ms, asOf))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const indoor = counted.filter((m) => m.indoor);
  return {
    wins: counted.filter((m) => m.won).length,
    losses: counted.filter((m) => !m.won).length,
    titles: tournaments.filter((t) => t.result === 'Winner').map((t) => t.name),
    finals: tournaments.filter((t) => t.result === 'Winner' || t.result.startsWith('Final')).length,
    surfaces: [...SURFACES, 'Other'].map((s) => split(s, counted.filter((m) => (SURFACES.includes(m.surface) ? m.surface : 'Other') === s))).filter(nonEmpty),
    indoor: indoor.length ? split('Indoor', indoor) : null,
    levels: [...LEVELS, 'Team events', 'Other'].map((l) => split(l, counted.filter((m) => levelLabel(m) === l))).filter(nonEmpty),
    top10Wins: counted.filter((m) => m.won && m.opponent.rank !== null && m.opponent.rank <= 10).length,
    tournaments,
  };
}
