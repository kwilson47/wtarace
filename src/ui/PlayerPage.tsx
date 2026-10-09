import type { Player, Season } from '../data/schema';
import { playerBreakdown } from '../engine/breakdown';
import { pointsTable } from '../engine/lookup';
import type { Outlook } from '../engine/outlook';
import { projectStandings } from '../engine/standings';
import { flagEmoji, formatPoints } from './format';
import { PlayerOutlook } from './PlayerOutlook';
import { scenarioLink } from './playerSummary';
import { ResultsBreakdown } from './ResultsBreakdown';
import { UpdatedTime } from './UpdatedTime';

/** Her current round at events under way, and the upcoming events she has entered. */
function Schedule({ season, player }: { season: Season; player: Player }) {
  const lines = season.tournaments
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .flatMap((t) => {
      const live = player.live.find((l) => l.tournamentId === t.id);
      if (t.status === 'in-progress' && live) {
        if (live.state === 'alive' && live.round === 'W') return [`${t.name}: won the title`];
        const label = pointsTable(season.rules, t.drawType).find((r) => r.round === live.round)?.label ?? live.round;
        return [`${t.name}: ${live.state === 'alive' ? 'alive' : 'out'} in the ${label}`];
      }
      if (t.status === 'upcoming' && t.entries?.includes(player.id)) return [`${t.name}: entered`];
      return [];
    });
  return (
    <section className="schedule" aria-label="Schedule">
      <h2>Schedule</h2>
      {lines.length ? <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul> : <p>No remaining events entered.</p>}
    </section>
  );
}

interface Props {
  season: Season;
  playerId: string;
  /** Worked out at build time and embedded in the page. */
  outlook: Outlook;
}

/** A read-only page for one player: where she stands, what she needs, her results and her schedule. */
export function PlayerPage({ season, playerId, outlook }: Props) {
  const { players, tournaments, rules } = season;
  const player = players.find((p) => p.id === playerId)!;
  const rows = projectStandings(players, {}, tournaments, rules);
  const row = rows.find((r) => r.playerId === playerId)!;
  const byRank = [...players].sort(
    (a, b) => rows.find((r) => r.playerId === a.id)!.currentRank - rows.find((r) => r.playerId === b.id)!.currentRank,
  );
  const qualified = player.qualified || outlook.status === 'qualified';
  const status = qualified ? 'Qualified' : outlook.status === 'out' ? 'Out' : 'Still in contention';
  return (
    <div className="app player-page">
      <nav className="crumbs"><a href="/">← Full standings</a></nav>
      <header className="header">
        <h1>
          <span aria-hidden="true">{flagEmoji(player.country)}</span> {player.name}
        </h1>
        <p className="player-status">
          {`#${row.currentRank} in the Race to the WTA Finals ${rules.season} · ${formatPoints(row.currentTotal)} points · `}
          <span className={`status status-${status === 'Qualified' ? 'in' : status === 'Out' ? 'out' : 'open'}`}>{status}</span>
          {qualified && <span className="badge" title="Qualified">Q</span>}
        </p>
        <UpdatedTime iso={season.meta.lastUpdated} />
      </header>
      <main>
        <PlayerOutlook player={player} outlook={outlook} players={byRank} season={season} heading="What she needs" scenarioHref={scenarioLink} />
        <section aria-label="Results">
          <h2>Results</h2>
          <ResultsBreakdown name={player.name} breakdown={playerBreakdown(player, {}, tournaments, rules)} />
        </section>
        <Schedule season={season} player={player} />
        <p className="explore">
          <a href={`/?player=${player.id}`}>{`Explore scenarios for ${player.name}`}</a>
        </p>
      </main>
    </div>
  );
}
