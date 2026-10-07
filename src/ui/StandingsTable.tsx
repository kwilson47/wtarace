import type { StandingRow } from '../engine/standings';
import { flagEmoji, formatDelta, formatPoints } from './format';

const ALTERNATES = 2;

/** Class names per player id: qualifiers, the cutoff under the last qualifier, and the next eligible alternates. */
function rowClasses(rows: StandingRow[]): Map<string, string> {
  const byRank = [...rows].sort((a, b) => a.projectedRank - b.projectedRank);
  const qualifiers = byRank.filter((r) => r.projectedQualifier !== null);
  const last = qualifiers[qualifiers.length - 1];
  const alternates = byRank.filter((r) => r.eligible && r.projectedQualifier === null).slice(0, ALTERNATES);
  const classes = new Map<string, string>();
  for (const r of qualifiers) classes.set(r.playerId, r === last ? 'qualifier cutoff' : 'qualifier');
  for (const r of alternates) classes.set(r.playerId, 'alternate');
  return classes;
}

function RankChange({ change }: { change: number }) {
  if (change > 0) return <span className="up" aria-label={`Up ${change}`}>▲{change}</span>;
  if (change < 0) return <span className="down" aria-label={`Down ${-change}`}>▼{-change}</span>;
  return <span className="same" aria-label="No change">–</span>;
}

export function StandingsTable({ rows }: { rows: StandingRow[] }) {
  const classes = rowClasses(rows);
  return (
    <table className="standings">
      <caption>Projected race — highlighted players are projected to qualify for the WTA Finals</caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Player</th>
          <th scope="col" className="wide">Current</th>
          <th scope="col" className="wide">Projected</th>
          <th scope="col" className="narrow">Points</th>
          <th scope="col">+/−</th>
          <th scope="col"><span className="visually-hidden">Rank change</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.playerId} data-testid={`row-${r.playerId}`} className={classes.get(r.playerId)}>
            <td>{r.projectedRank}</td>
            <td className="player">
              <span aria-hidden="true">{flagEmoji(r.country)}</span> {r.name}
              {r.qualified && <span className="badge" title="Officially qualified">Q</span>}
              {r.projectedQualifier === 'champion' && <span className="badge champion" title="Grand Slam champion place">GS</span>}
              {!r.eligible && <span className="note">Not eligible (event minimum)</span>}
            </td>
            <td className="wide num" data-testid="current">{formatPoints(r.currentTotal)}</td>
            <td className="wide num" data-testid="projected">{formatPoints(r.projectedTotal)}</td>
            <td className="narrow num">{`${formatPoints(r.currentTotal)} → ${formatPoints(r.projectedTotal)}`}</td>
            <td className="num" data-testid="delta">{formatDelta(r.delta)}</td>
            <td><RankChange change={r.rankChange} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
