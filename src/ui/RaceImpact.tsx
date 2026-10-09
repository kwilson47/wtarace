import type { Season } from '../data/schema';
import { projectStandings } from '../engine/standings';
import type { Scenario } from '../engine/types';
import { flagEmoji, formatDelta, formatPoints } from './format';
import { RankChange } from './StandingsTable';

const SHOWN = 10;

/** The race top 10 under the visitor's picks, plus any qualifier ranked lower (the Grand Slam champion place). */
export function RaceImpact({ season, scenario }: { season: Season; scenario: Scenario }) {
  const rows = projectStandings(season.players, scenario, season.tournaments, season.rules);
  const shown = rows.filter((r, i) => i < SHOWN || r.projectedQualifier !== null);
  const lastQualifier = [...shown].reverse().find((r) => r.projectedQualifier !== null);
  return (
    <section className="race-impact" aria-label="Race impact">
      <h2>Race impact</h2>
      <table className="impact">
        <tbody>
          {shown.map((r) => (
            <tr key={r.playerId} className={[r.projectedQualifier ? 'qualifier' : '', r === lastQualifier ? 'cutoff' : ''].join(' ').trim() || undefined}>
              <td className="num">{r.projectedRank}</td>
              <td>
                <span aria-hidden="true">{flagEmoji(r.country)} </span>
                <a href={`/players/${r.playerId}/`}>{r.name}</a>
                {r.projectedQualifier === 'champion' && <span className="badge champion" title="Grand Slam champion place">GS</span>}
              </td>
              <td className="num">{formatPoints(r.projectedTotal)}</td>
              <td className="num">{formatDelta(r.delta)}</td>
              <td><RankChange change={r.rankChange} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
