import type { Season } from '../data/schema';
import { projectStandings } from '../engine/standings';
import { roundLabel, type MatchRecord } from '../season/matchSchema';
import { levelLabel, seasonSummary, type Split, type TournamentBlock } from '../season/seasonSummary';
import { flagEmoji, formatPoints } from './format';
import { UpdatedTime } from './UpdatedTime';

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dates = (start: string, end: string) => `${day.format(new Date(`${start}T00:00:00Z`))} – ${day.format(new Date(`${end}T00:00:00Z`))}`;
const record = (s: Pick<Split, 'wins' | 'losses'>) => `${s.wins}–${s.losses}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Opponent({ m, season }: { m: MatchRecord; season: Season }) {
  const tracked = m.opponent.id === null ? undefined : season.players.find((p) => p.wtaId === m.opponent.id);
  const tag = m.opponent.seed !== null ? ` [${m.opponent.seed}]` : m.opponent.entry ? ` (${m.opponent.entry})` : '';
  return (
    <>
      {m.opponent.country && <span aria-hidden="true">{flagEmoji(m.opponent.country)} </span>}
      {tracked ? <a href={`/players/${tracked.id}/`}>{m.opponent.name}</a> : m.opponent.name}
      {tag}
    </>
  );
}

function Tournament({ t, season }: { t: TournamentBlock; season: Season }) {
  const surface = `${t.surface}${t.indoor ? ' (indoor)' : ''}`;
  return (
    <section className="tournament" aria-label={t.name}>
      <h3>{t.name}</h3>
      <p className="meta">{`${t.team ? 'Team event' : levelLabel(t)} · ${surface} · ${dates(t.startDate, t.endDate)}`}</p>
      <p className="result">{`${t.result}${t.points !== null ? ` · ${formatPoints(t.points)} ${t.points === 1 ? 'pt' : 'pts'}` : ''}`}</p>
      <table className="matches">
        <tbody>
          {t.matches.map((m) => (
            <tr key={`${m.qualifying}-${m.round}`} className={m.won ? 'won' : 'lost'}>
              <td className="round">{roundLabel(m)}</td>
              <td className="wl">{m.won ? 'W' : 'L'}</td>
              <td className="opponent"><Opponent m={m} season={season} /></td>
              <td className="score">
                {m.outcome === 'walkover' ? 'w/o' : `${m.score}${m.outcome === 'retired' ? ' ret.' : ''}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

interface Props {
  season: Season;
  playerId: string;
  /** Her race-year matches; null if not fetched yet. */
  matches: MatchRecord[] | null;
}

/** A player's season: her record, splits and every tournament, round by round. */
export function PlayerPage({ season, playerId, matches }: Props) {
  const { players, tournaments, rules } = season;
  const player = players.find((p) => p.id === playerId)!;
  const rank = projectStandings(players, {}, tournaments, rules).find((r) => r.playerId === playerId)!.currentRank;
  const summary = matches ? seasonSummary(matches, season.meta.lastUpdated.slice(0, 10)) : null;
  const line = summary
    ? [
        `${rules.season} season`,
        record(summary),
        ...(summary.titles.length ? [`${plural(summary.titles.length, 'title')} (${summary.titles.join(', ')})`] : []),
        ...(summary.finals ? [plural(summary.finals, 'final')] : []),
      ].join(' · ')
    : `${rules.season} season`;
  return (
    <div className="app player-page">
      <nav className="crumbs"><a href="/">← Full standings</a></nav>
      <header className="header">
        <h1>
          <span aria-hidden="true">{flagEmoji(player.country)}</span> {player.name}
        </h1>
        <p className="player-status">
          {`${line} · `}
          <a href="/">{`Race #${rank}`}</a>
        </p>
        <UpdatedTime iso={season.meta.lastUpdated} />
      </header>
      <main>
        {summary ? (
          <>
            <section className="season-summary" aria-label="Season summary">
              <h2>Season summary</h2>
              <dl>
                <div><dt>Surface</dt><dd>{[...summary.surfaces, ...(summary.indoor ? [summary.indoor] : [])].map((s) => `${s.label} ${record(s)}`).join(' · ')}</dd></div>
                <div><dt>Level</dt><dd>{summary.levels.map((s) => `${s.label} ${record(s)}`).join(' · ')}</dd></div>
                <div><dt>Top-10 wins</dt><dd>{summary.top10Wins}</dd></div>
              </dl>
            </section>
            <section aria-label="Tournaments">
              <h2>Tournaments</h2>
              {summary.tournaments.map((t) => <Tournament key={t.key} t={t} season={season} />)}
            </section>
          </>
        ) : (
          <p>Match results aren't available yet.</p>
        )}
        <p className="note">The season follows the Race to the WTA Finals year, so it starts with events in late October 2025.</p>
        <p className="explore">
          <a href={`/?player=${player.id}`}>{`Explore scenarios for ${player.name}`}</a>
        </p>
      </main>
    </div>
  );
}
