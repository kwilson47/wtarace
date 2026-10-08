import type { StandingRow } from '../engine/standings';
import { flagEmoji, formatDelta, formatPoints } from './format';

const ALTERNATES = 2;

const OUT_TITLE = "Can't reach a qualifying place, whatever happens next (based on actual results)";

/** Class names per player id: qualifiers, the cutoff under the last qualifier, the next eligible alternates, and eliminated players. */
function rowClasses(rows: StandingRow[], eliminated: ReadonlySet<string>): Map<string, string> {
  const byRank = [...rows].sort((a, b) => a.projectedRank - b.projectedRank);
  const qualifiers = byRank.filter((r) => r.projectedQualifier !== null);
  const last = qualifiers[qualifiers.length - 1];
  const alternates = byRank.filter((r) => r.eligible && r.projectedQualifier === null).slice(0, ALTERNATES);
  const classes = new Map<string, string[]>();
  const add = (id: string, name: string) => classes.set(id, [...(classes.get(id) ?? []), name]);
  for (const r of qualifiers) {
    add(r.playerId, 'qualifier');
    if (r === last) add(r.playerId, 'cutoff');
  }
  for (const r of alternates) add(r.playerId, 'alternate');
  for (const id of eliminated) add(id, 'out');
  return new Map([...classes].map(([id, names]) => [id, names.join(' ')]));
}

function RankChange({ change }: { change: number }) {
  if (change > 0) return <span className="up" aria-label={`Up ${change}`}>▲{change}</span>;
  if (change < 0) return <span className="down" aria-label={`Down ${-change}`}>▼{-change}</span>;
  return <span className="same" aria-label="No change">–</span>;
}

const NONE: ReadonlySet<string> = new Set();

interface Props {
  rows: StandingRow[];
  /** Players who can no longer qualify, from actual results (independent of the visitor's picks). */
  eliminated?: ReadonlySet<string>;
  /** Players certain to qualify, from actual results; shown with the same Q as WTA announcements. */
  clinched?: ReadonlySet<string>;
}

export function StandingsTable({ rows, eliminated = NONE, clinched = NONE }: Props) {
  const classes = rowClasses(rows, eliminated);
  return (
    <>
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
              {(r.qualified || clinched.has(r.playerId)) && <span className="badge" title="Qualified">Q</span>}
              {r.projectedQualifier === 'champion' && <span className="badge champion" title="Grand Slam champion place">GS</span>}
              {eliminated.has(r.playerId) && <span className="badge out" title={OUT_TITLE}>Out</span>}
              {!r.eligible && !eliminated.has(r.playerId) && (
                <span className="note">{`Needs ${r.eventsShort} more event${r.eventsShort === 1 ? '' : 's'} to be eligible`}</span>
              )}
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
    <p className="legend">
      Q = qualified: announced by the WTA, or certain whatever happens next · GS = Grand Slam champion place ·
      Out = can't reach a qualifying place whatever happens next. Both are worked out from actual results and
      can show up later than in reality, never earlier.
    </p>
    </>
  );
}
