import { useEffect, useState } from 'react';
import type { Season } from '../data/schema';
import { projectStandings } from '../engine/standings';
import type { RaceHistory } from '../history/historySchema';
import { PALETTE, RaceChart } from './RaceChart';
import { SiteNav } from './SiteNav';
import { UpdatedTime } from './UpdatedTime';

const MAX = 10;
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Compare how chosen players' race points (or positions) moved week by week, from the WTA's published lists. */
export function RaceHistoryPage({ season, history }: { season: Season; history: RaceHistory | null }) {
  const order = projectStandings(season.players, {}, season.tournaments, season.rules).sort((a, b) => a.currentRank - b.currentRank);
  const known = order.filter((r) => history?.players[r.playerId]?.some((w) => w !== null));
  const defaults = known.slice(0, MAX).map((r) => r.playerId);
  const [chosen, setChosen] = useState<string[]>(defaults);
  const [view, setView] = useState<'points' | 'rank'>('points');
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);

  // A shared choice is read after the first render, so it matches the prerendered page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ids = (params.get('p') ?? '').split(',').filter((id) => known.some((r) => r.playerId === id)).slice(0, MAX);
    if (ids.length) setChosen(ids);
    if (params.get('view') === 'rank') setView('rank');
    setLoaded(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loaded) return;
    const url = new URL(window.location.href);
    const isDefault = chosen.length === defaults.length && chosen.every((id, i) => id === defaults[i]);
    if (isDefault) url.searchParams.delete('p');
    else url.searchParams.set('p', chosen.join(','));
    if (view === 'rank') url.searchParams.set('view', 'rank');
    else url.searchParams.delete('view');
    window.history.replaceState(null, '', url);
  }, [chosen, view, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = !history || history.dates.length === 0 ? (
    <p>Race history isn't available yet.</p>
  ) : (
    <>
      <fieldset className="view-toggle">
        <legend className="visually-hidden">Show</legend>
        <label><input type="radio" name="view" checked={view === 'points'} onChange={() => setView('points')} /> Points</label>
        <label><input type="radio" name="view" checked={view === 'rank'} onChange={() => setView('rank')} /> Position</label>
      </fieldset>
      <RaceChart
        dates={history.dates}
        view={view}
        reference={{ label: '8th place', values: history.eighth }}
        series={chosen.map((id) => {
          const r = known.find((x) => x.playerId === id)!;
          const weeks = history.players[id]!;
          return { id, name: r.name, color: PALETTE[chosen.indexOf(id) % PALETTE.length]!, values: weeks.map((w) => (w ? (view === 'points' ? w[1] : w[0]) : null)) };
        })}
      />
      <section aria-label="Players" className="history-players">
        <p className="table-controls">
          <input type="search" aria-label="Find a player" placeholder="Find a player" value={query} onChange={(e) => setQuery(e.target.value)} />
          {chosen.length >= MAX && <span className="note-inline">{`Up to ${MAX} players at once.`}</span>}
        </p>
        <ul className="player-picks">
          {known
            .filter((r) => !query.trim() || plain(r.name).includes(plain(query.trim())))
            .map((r) => {
              const on = chosen.includes(r.playerId);
              return (
                <li key={r.playerId}>
                  <label>
                    <input
                      type="checkbox"
                      aria-label={r.name}
                      checked={on}
                      disabled={!on && chosen.length >= MAX}
                      onChange={() => setChosen(on ? chosen.filter((id) => id !== r.playerId) : [...chosen, r.playerId])}
                    />
                    <span className="swatch" style={{ background: on ? PALETTE[chosen.indexOf(r.playerId) % PALETTE.length] : 'transparent' }} aria-hidden="true" />
                    {`${r.currentRank}. ${r.name}`}
                  </label>
                </li>
              );
            })}
        </ul>
      </section>
    </>
  );
  return (
    <div className="app list-page">
      <SiteNav current="standings" />
      <header className="header">
        <h1>Race over time</h1>
        <p className="intro">{`The ${season.rules.season} race as the WTA published it each week. Choose up to ${MAX} players to compare.`}</p>
        <UpdatedTime iso={season.meta.lastUpdated} />
      </header>
      <main>{body}</main>
    </div>
  );
}
