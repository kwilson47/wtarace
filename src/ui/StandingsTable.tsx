import { Fragment, useState } from 'react';
import type { Breakdown } from '../engine/breakdown';
import type { StandingRow } from '../engine/standings';
import { flagEmoji, formatChance, formatDelta, formatPoints } from './format';
import { ResultsBreakdown } from './ResultsBreakdown';
import { usePersistentFlag } from './usePersistentFlag';

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

export function RankChange({ change }: { change: number }) {
  if (change > 0) return <span className="up" aria-label={`Up ${change}`}>▲{change}</span>;
  if (change < 0) return <span className="down" aria-label={`Down ${-change}`}>▼{-change}</span>;
  return <span className="same" aria-label="No change">–</span>;
}

const NONE: ReadonlySet<string> = new Set();
const NO_MAX: ReadonlyMap<string, number> = new Map();

const MAX_TITLE = 'Most points she can still finish with, from actual results';
const CHANCE_TITLE = "Chance to qualify, from 10,000 simulated finishes to the season using real results only. Your picks don't change it.";

interface Props {
  rows: StandingRow[];
  /** Players who can no longer qualify, from actual results (independent of the visitor's picks). */
  eliminated?: ReadonlySet<string>;
  /** Players certain to qualify, from actual results; shown with the same Q as WTA announcements. */
  clinched?: ReadonlySet<string>;
  /** Each player's highest reachable total, from actual results (independent of the visitor's picks). */
  maxPoints?: ReadonlyMap<string, number>;
  /** Where a player's projected points come from; when given, player names expand to show it. */
  breakdownOf?: (playerId: string) => Breakdown;
  /** Each player's simulated chance of qualifying, from actual results (independent of the visitor's picks). */
  chances?: Readonly<Record<string, number>>;
}

export function StandingsTable({ rows, eliminated = NONE, clinched = NONE, maxPoints = NO_MAX, breakdownOf, chances }: Props) {
  const classes = rowClasses(rows, eliminated);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(NONE);
  const [hideOut, setHideOut] = usePersistentFlag('hideEliminated', true);
  const hidden = hideOut ? rows.filter((r) => eliminated.has(r.playerId)).length : 0;
  const shown = hidden > 0 ? rows.filter((r) => !eliminated.has(r.playerId)) : rows;
  const chanceOf = (r: StandingRow) =>
    r.qualified || clinched.has(r.playerId) ? 'Q' : eliminated.has(r.playerId) ? '—' : formatChance(chances?.[r.playerId] ?? 0);
  const chanceLine = (r: StandingRow) => {
    const c = chanceOf(r);
    return `Chance to qualify: ${c === 'Q' ? 'qualified' : c === '—' ? 'none' : c}`;
  };
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  return (
    <>
    {eliminated.size > 0 && (
      <p className="table-controls">
        <label>
          <input type="checkbox" checked={hideOut} onChange={(e) => setHideOut(e.target.checked)} /> Hide eliminated players
        </label>
        {hidden > 0 && <span className="note-inline">{`${hidden} eliminated player${hidden === 1 ? '' : 's'} hidden`}</span>}
      </p>
    )}
    <table className="standings">
      <caption>
        Projected race — highlighted players are projected to qualify for the WTA Finals
        {breakdownOf && '. Select a name to see where her points come from.'}
      </caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Player</th>
          <th scope="col" className="wide num">Current</th>
          <th scope="col" className="wide num">Projected</th>
          <th scope="col" className="narrow num">Points</th>
          <th scope="col" className="num">+/−</th>
          <th scope="col"><span className="visually-hidden">Rank change</span></th>
          <th scope="col" className="wide num max" title={MAX_TITLE}>Max</th>
          {chances && <th scope="col" className="wide num chance" title={CHANCE_TITLE}>Chance</th>}
        </tr>
      </thead>
      <tbody>
        {shown.map((r) => (
          <Fragment key={r.playerId}>
          <tr data-testid={`row-${r.playerId}`} className={classes.get(r.playerId)}>
            <td>{r.projectedRank}</td>
            <td className="player">
              <span aria-hidden="true">{flagEmoji(r.country)}</span>{' '}
              {breakdownOf ? (
                <button type="button" className="name" aria-expanded={expanded.has(r.playerId)} onClick={() => toggle(r.playerId)}>
                  {r.name}
                </button>
              ) : (
                r.name
              )}
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
            <td className="wide num max" data-testid="max">
              {maxPoints.has(r.playerId) ? formatPoints(maxPoints.get(r.playerId)!) : ''}
            </td>
            {chances && <td className="wide num chance" data-testid="chance">{chanceOf(r)}</td>}
          </tr>
          {breakdownOf && expanded.has(r.playerId) && (
            <tr className="breakdown-row">
              <td colSpan={chances ? 9 : 8}>
                {chances && <p className="chance-line">{chanceLine(r)}</p>}
                <ResultsBreakdown name={r.name} breakdown={breakdownOf(r.playerId)} profileHref={`/players/${r.playerId}/`} />
              </td>
            </tr>
          )}
          </Fragment>
        ))}
      </tbody>
    </table>
    <p className="legend">
      Q = qualified: announced by the WTA, or certain whatever happens next · GS = Grand Slam champion place ·
      Out = can't reach a qualifying place whatever happens next · Max = the most points she can still finish
      with. Q, Out and Max are worked out from actual results, not your picks; Q and Out can show up later than
      in reality, never earlier.
    </p>
    {chances && (
      <p className="legend">
        Chance = chance to qualify. Chances come from simulating the remaining events with ratings built from this
        season's results.
      </p>
    )}
    </>
  );
}
