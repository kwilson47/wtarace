import type { Season, Tournament } from '../data/schema';
import { buildBracket, finalists, type BracketMatch, type Slot } from '../draws/bracket';
import type { DrawFile, DrawMatch } from '../draws/drawSchema';
import { pointsTable } from '../engine/lookup';
import { categoryLabel, flagEmoji, formatPoints } from './format';
import { UpdatedTime } from './UpdatedTime';

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dates = (t: Tournament) => `${day.format(new Date(`${t.startDate}T00:00:00Z`))} – ${day.format(new Date(`${t.endDate}T00:00:00Z`))}`;
const STATUS = { completed: 'Completed', 'in-progress': 'In progress', upcoming: 'Upcoming' } as const;

function Name({ wtaId, draw, season }: { wtaId: Slot; draw: DrawFile; season: Season }) {
  if (wtaId === 'bye') return <span className="bye">Bye</span>;
  if (wtaId === null) return <span className="tbd">—</span>;
  const p = draw.players.find((x) => x.wtaId === wtaId);
  const tracked = season.players.find((x) => x.wtaId === wtaId);
  const label = p?.name ?? String(wtaId);
  const tag = p?.seed ? ` [${p.seed}]` : p?.entry ? ` (${p.entry})` : '';
  return (
    <>
      {p?.country && <span aria-hidden="true">{flagEmoji(p.country)} </span>}
      {tracked ? <a href={`/players/${tracked.id}/`}>{label}</a> : label}
      {tag}
    </>
  );
}

function MatchBox({ m, draw, season }: { m: BracketMatch; draw: DrawFile; season: Season }) {
  const line = (slot: Slot) => (
    <div className={`line${m.winner !== null && slot === m.winner ? ' winner' : ''}`}>
      <Name wtaId={slot} draw={draw} season={season} />
    </div>
  );
  return (
    <div className="match">
      {line(m.top)}
      {line(m.bottom)}
      {m.score && <div className="score">{`${m.score}${m.outcome === 'retired' ? ' ret.' : ''}`}</div>}
      {m.outcome === 'walkover' && <div className="score">w/o</div>}
    </div>
  );
}

function RoundList({ label, matches, draw, season, open }: { label: string; matches: DrawMatch[]; draw: DrawFile; season: Season; open: boolean }) {
  return (
    <details open={open}>
      <summary>{`${label} (${matches.length} matches)`}</summary>
      <ul className="round-list">
        {matches.map((m, i) => {
          const loser = m.winner === m.a ? m.b : m.a;
          return (
            <li key={i}>
              {m.winner === null ? (
                <><Name wtaId={m.a} draw={draw} season={season} /> vs <Name wtaId={m.b} draw={draw} season={season} /></>
              ) : (
                <><Name wtaId={m.winner} draw={draw} season={season} /> d. <Name wtaId={loser} draw={draw} season={season} />{` ${m.outcome === 'walkover' ? 'w/o' : `${m.score}${m.outcome === 'retired' ? ' ret.' : ''}`}`}</>
              )}
            </li>
          );
        })}
      </ul>
    </details>
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

/** An event: header, its draw (full bracket once completed; from the quarterfinals while live), then our tracked players. */
export function TournamentPage({ season, tournamentId, draw }: Props) {
  const t = season.tournaments.find((x) => x.id === tournamentId)!;
  const year = t.startDate.slice(0, 4);
  const table = pointsTable(season.rules, t.drawType);
  const bracket = draw ? buildBracket(draw) : null;
  const final = bracket ? finalists(bracket) : null;
  const nameOf = (id: number | null) => (id === null ? '' : draw?.players.find((p) => p.wtaId === id)?.name ?? String(id));
  const roundLabel = (round: number) => table[round - 1]?.round ?? `R${round}`;
  const qf = table.findIndex((r) => r.round === 'QF') + 1;
  const firstShown = t.status === 'completed' ? 1 : Math.max(1, qf);
  const current = draw?.matches.find((m) => m.winner === null)?.round ?? 0;
  return (
    <div className="app tournament-page">
      <nav className="crumbs"><a href="/">← Full standings</a></nav>
      <header className="header">
        <h1>{`${t.name} ${year}`}</h1>
        <p className="player-status">
          {`${categoryLabel(t.category)} · ${STATUS[t.status]} · ${dates(t)}${draw ? ` · ${draw.drawSize}-player draw` : ''}`}
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
          ) : !bracket ? (
            <p>The draw is out, but its first round isn't complete in the WTA's data yet.</p>
          ) : (
            <>
              <div className="bracket">
                {bracket.rounds.slice(firstShown - 1).map((round, i) => (
                  <div className="bracket-round" key={firstShown + i}>
                    <h3>{roundLabel(firstShown + i)}</h3>
                    <div className="bracket-matches">
                      {round.map((m, j) => <MatchBox key={j} m={m} draw={draw} season={season} />)}
                    </div>
                  </div>
                ))}
              </div>
              {firstShown > 1 &&
                Array.from({ length: firstShown - 1 }, (_, i) => firstShown - 1 - i).map((round) => (
                  <RoundList
                    key={round}
                    label={roundLabel(round)}
                    matches={draw.matches.filter((m) => m.round === round)}
                    draw={draw}
                    season={season}
                    open={round === current}
                  />
                ))}
            </>
          )}
        </section>
        <TrackedPlayers season={season} t={t} />
      </main>
    </div>
  );
}
