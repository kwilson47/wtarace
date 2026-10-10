import { useState } from 'react';
import type { Season } from '../data/schema';
import { projectStandings } from '../engine/standings';
import { flagEmoji, formatPoints } from './format';
import { SiteNav } from './SiteNav';
import { UpdatedTime } from './UpdatedTime';

// "Swiatek" finds "Świątek": compare names without accents.
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Every tracked player in current race order, each linking to her season page, with a name filter. */
export function PlayersIndex({ season }: { season: Season }) {
  const [query, setQuery] = useState('');
  const rows = projectStandings(season.players, {}, season.tournaments, season.rules).sort((a, b) => a.currentRank - b.currentRank);
  const shown = query.trim() ? rows.filter((r) => plain(r.name).includes(plain(query.trim()))) : rows;
  return (
    <div className="app list-page">
      <SiteNav current="players" />
      <header className="header">
        <h1>{`Players: ${season.rules.season} race`}</h1>
        <p className="intro">Every player we track, in race order. Select a name for her season, match by match.</p>
        <UpdatedTime iso={season.meta.lastUpdated} />
      </header>
      <main>
        <p className="table-controls">
          <input type="search" aria-label="Find a player" placeholder="Find a player" value={query} onChange={(e) => setQuery(e.target.value)} />
        </p>
        <table className="player-list">
          <thead>
            <tr>
              <th scope="col" className="num">#</th>
              <th scope="col">Player</th>
              <th scope="col" className="num">Race points</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.playerId}>
                <td className="num">{r.currentRank}</td>
                <td>
                  <span aria-hidden="true">{flagEmoji(r.country)} </span>
                  <a href={`/players/${r.playerId}/`}>{r.name}</a>
                </td>
                <td className="num">{formatPoints(r.currentTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p>No tracked player matches that name.</p>}
      </main>
    </div>
  );
}
