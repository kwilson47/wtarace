import { useRef, useState, type ReactNode } from 'react';
import type { Season, Tournament } from '../data/schema';
import { buildBracket, finalists, type Slot } from '../draws/bracket';
import type { DrawFile } from '../draws/drawSchema';
import { applyPicks, clearTournamentPicks, pickedRounds, pickWinner, type PickedMatch } from '../draws/picks';
import { pointsTable } from '../engine/lookup';
import { encodeScenario } from '../scenario/url';
import { useScenario } from '../scenario/useScenario';
import { categoryLabel, flagEmoji, formatDates, formatPoints } from './format';
import { RaceImpact } from './RaceImpact';
import { SiteNav } from './SiteNav';
import { UpdatedTime } from './UpdatedTime';

const STATUS = { completed: 'Completed', 'in-progress': 'In progress', upcoming: 'Upcoming' } as const;

/** `plain` leaves a tracked player's name unlinked, for use inside a button. `round` labels open first-round lines. */
function Name({ wtaId, draw, season, plain = false, round }: { wtaId: Slot; draw: DrawFile; season: Season; plain?: boolean; round?: number }) {
  if (wtaId === 'bye') return <span className="bye">Bye</span>;
  // A published draw's open first-round line is a qualifier still to come.
  if (wtaId === null) return <span className="tbd">{round === 1 && draw.lines ? 'Qualifier' : '—'}</span>;
  const p = draw.players.find((x) => x.wtaId === wtaId);
  const tracked = season.players.find((x) => x.wtaId === wtaId);
  const label = p?.name ?? String(wtaId);
  const tag = p?.seed ? ` [${p.seed}]` : p?.entry ? ` (${p.entry})` : '';
  return (
    <>
      {p?.country && <span aria-hidden="true">{flagEmoji(p.country)} </span>}
      {tracked && !plain ? <a href={`/players/${tracked.id}/`}>{label}</a> : label}
      {tag}
    </>
  );
}

function MatchBox({ m, draw, season, onPick }: { m: PickedMatch; draw: DrawFile; season: Season; onPick?: (wtaId: number) => void }) {
  const line = (slot: Slot) => {
    const won = m.winner !== null && slot === m.winner;
    if (onPick && m.pickable && typeof slot === 'number') {
      return (
        <button type="button" className={`line${won ? ' winner' : ''}`} aria-pressed={won} onClick={() => onPick(slot)}>
          <Name wtaId={slot} draw={draw} season={season} plain />
        </button>
      );
    }
    return (
      <div className={`line${won ? ' winner' : ''}`}>
        <Name wtaId={slot} draw={draw} season={season} round={m.round} />
      </div>
    );
  };
  return (
    <div className={`match${m.conflict ? ' conflict' : ''}`}>
      {line(m.top)}
      {line(m.bottom)}
      {m.score && <div className="score">{`${m.score}${m.outcome === 'retired' ? ' ret.' : ''}`}</div>}
      {m.outcome === 'walkover' && <div className="score">w/o</div>}
      {m.picked && <div className="pick-note">your pick</div>}
      {m.conflict && <div className="pick-note">Your picks clash here</div>}
    </div>
  );
}

/** Tracked players at this event: result and points, current round, or entered. */
function TrackedPlayers({ season, t }: { season: Season; t: Tournament }) {
  const table = pointsTable(season.rules, t.drawType);
  const label = (round: string) => (round === 'W' ? 'Winner' : round === 'ZP' ? 'Zero-pointer' : round);
  const rows = season.players.flatMap((p) => {
    const result = p.results.find((r) => r.tournamentId === t.id);
    const live = p.live.find((l) => l.tournamentId === t.id);
    if (t.status === 'in-progress' && live) return [{ p, text: live.round === 'W' && live.state === 'alive' ? 'Winner' : live.state === 'alive' ? `Alive in ${live.round}` : live.round, depth: table.findIndex((r) => r.round === live.round) }];
    if (result) return [{ p, text: `${label(result.round)}${result.round === 'ZP' ? '' : ` · ${formatPoints(result.points)} pts`}`, depth: result.round === 'ZP' ? -1 : table.findIndex((r) => r.round === result.round) }];
    if (t.entries?.includes(p.id)) return [{ p, text: 'Entered', depth: -2 }];
    return [];
  });
  rows.sort((a, b) => b.depth - a.depth);
  return (
    <section aria-label="Tracked players">
      <h2>Tracked players</h2>
      {rows.length ? (
        <ul className="our-players">
          {rows.map(({ p, text }) => (
            <li key={p.id}>
              <span aria-hidden="true">{flagEmoji(p.country)} </span>
              <a href={`/players/${p.id}/`}>{p.name}</a>
              {` — ${text}`}
            </li>
          ))}
        </ul>
      ) : (
        <p>None of our tracked players {t.status === 'upcoming' ? 'have entered yet' : 'played here'}.</p>
      )}
    </section>
  );
}

interface Props {
  season: Season;
  tournamentId: string;
  /** Null until the draw is out. */
  draw: DrawFile | null;
}

/**
 * The bracket from the chosen round on, one column per round, with tabs for every round, like the WTA's draw
 * pages: tapping a tab makes that round the first column, so it stacks compactly and the later rounds line up
 * against it. Further columns scroll sideways if they don't fit.
 */
interface BracketViewProps {
  rounds: PickedMatch[][];
  labels: string[];
  start: number;
  renderMatch: (m: PickedMatch, j: number) => ReactNode;
  /** The champion's box after the final: the winner, a picked winner, or a dash. */
  champion: ReactNode;
}

function BracketView({ rounds, labels, start, renderMatch, champion }: BracketViewProps) {
  const [active, setActive] = useState(start);
  const box = useRef<HTMLDivElement>(null);
  return (
    <>
      <nav className="round-tabs" aria-label="Rounds">
        {labels.map((label, i) => (
          <button
            key={label}
            type="button"
            aria-current={active === i ? true : undefined}
            onClick={() => {
              setActive(i);
              box.current?.scrollTo?.({ left: 0 });
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="bracket" ref={box}>
        {rounds.slice(active).map((round, k) => (
          <div className="bracket-round" key={labels[active + k]}>
            <h3>{labels[active + k]}</h3>
            <div className="bracket-matches">{round.map((m, j) => renderMatch(m, j))}</div>
          </div>
        ))}
        <div className="bracket-round champion-round">
          <h3>Champion</h3>
          <div className="bracket-matches">
            <div className="match champion-box" role="group" aria-label="Champion">{champion}</div>
          </div>
        </div>
      </div>
    </>
  );
}

/** An event: header, its draw (opening on the round under way, every round a tab away), then our tracked players. */
export function TournamentPage({ season, tournamentId, draw }: Props) {
  const t = season.tournaments.find((x) => x.id === tournamentId)!;
  const year = t.startDate.slice(0, 4);
  const table = pointsTable(season.rules, t.drawType);
  const bracket = draw ? buildBracket(draw) : null;
  const final = bracket ? finalists(bracket) : null;
  const nameOf = (id: number | null) => (id === null ? '' : draw?.players.find((p) => p.wtaId === id)?.name ?? String(id));
  const roundLabel = (round: number) => table[round - 1]?.round ?? `R${round}`;
  // Where the bracket opens: a live event on the round under way, anything else at the start.
  const start = t.status === 'in-progress' && bracket ? Math.max(0, bracket.rounds.findIndex((r) => r.some((m) => m.outcome !== 'bye' && m.winner === null))) : 0;
  const { scenario, load } = useScenario(season);
  const interactive = t.status !== 'completed' && t.drawType !== 'united-cup';
  const applied = bracket ? applyPicks(bracket, interactive && draw ? pickedRounds(season, t, draw, scenario) : new Map()) : null;
  const onPick = interactive ? (m: PickedMatch, wtaId: number) => load(pickWinner(scenario, season, t, m, wtaId)) : undefined;
  const encoded = encodeScenario(scenario);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      window.prompt('Copy this link to share your picks:', window.location.href);
    }
  };
  return (
    <div className="app tournament-page">
      <SiteNav current="tournaments" />
      <header className="header">
        <h1>{`${t.name} ${year}`}</h1>
        <p className="player-status">
          {`${categoryLabel(t.category)} · ${STATUS[t.status]} · ${formatDates(t)}${draw ? ` · ${draw.drawSize}-player draw` : ''}`}
        </p>
        {final?.champion != null && (
          <p className="champion">{`Champion: ${nameOf(final.champion)} · Runner-up: ${nameOf(final.runnerUp)}${final.score ? ` · ${final.score}` : ''}`}</p>
        )}
        <UpdatedTime iso={season.meta.lastUpdated} />
      </header>
      <main>
        <section aria-label="Draw">
          <h2>Draw</h2>
          {t.drawType === 'united-cup' ? (
            <p>A team event: there's no singles draw.</p>
          ) : !draw ? (
            <p>The draw hasn't been made yet.</p>
          ) : !bracket || !applied ? (
            <p>The draw is out, but its first round isn't complete in the WTA's data yet.</p>
          ) : (
            <div className="draw-layout">
              <div className="draw-main">
                <BracketView
                  rounds={applied}
                  labels={applied.map((_, i) => roundLabel(i + 1))}
                  start={start}
                  renderMatch={(m, j) => <MatchBox key={j} m={m} draw={draw} season={season} onPick={onPick && ((wtaId) => onPick(m, wtaId))} />}
                  champion={(() => {
                    const final = applied.at(-1)![0]!;
                    if (final.winner === null) return <span className="tbd">—</span>;
                    return (
                      <>
                        <div className="line winner"><Name wtaId={final.winner} draw={draw} season={season} /></div>
                        {final.picked && <div className="pick-note">your pick</div>}
                      </>
                    );
                  })()}
                />
              </div>
              {interactive && (
                <div className="impact-side">
                  <RaceImpact season={season} scenario={scenario} />
                  <div className="impact-actions">
                    <a href={encoded ? `/?s=${encoded}` : '/'}>Full standings with these picks →</a>
                    <button type="button" onClick={share}>Share these picks</button>
                    <button type="button" onClick={() => load(clearTournamentPicks(scenario, t.id))}>Clear picks for this event</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
        <TrackedPlayers season={season} t={t} />
      </main>
    </div>
  );
}
