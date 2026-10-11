import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { season } from './data/season';
import type { MatchRecord } from './season/matchSchema';
import type { RaceHistory } from './history/historySchema';
import { PlayerPage, type PlayerHistory } from './ui/PlayerPage';
import './ui/styles.css';

const root = document.getElementById('root')!;
// Development only: /players/<id>/ (or /player.html?id=<id>) loads her match file directly.
const devFiles: Record<string, () => Promise<{ default: MatchRecord[] }>> = import.meta.env.DEV
  ? import.meta.glob<{ default: MatchRecord[] }>('../data/matches/*.json')
  : {};
const devHistory: Record<string, { default: RaceHistory }> = import.meta.env.DEV
  ? import.meta.glob<{ default: RaceHistory }>('../data/race-history.json', { eager: true })
  : {};

async function start() {
  const embedded = document.getElementById('page-data');
  const data: { playerId: string; matches: MatchRecord[] | null; history?: PlayerHistory | null } = embedded
    ? JSON.parse(embedded.textContent ?? '{}')
    : await (async () => {
        const requested = /^\/players\/([a-z0-9-]+)/.exec(window.location.pathname)?.[1] ?? new URLSearchParams(window.location.search).get('id') ?? '';
        const playerId = season.players.some((p) => p.id === requested) ? requested : season.players[0]!.id;
        const load = devFiles[`../data/matches/${playerId}.json`];
        const h = Object.values(devHistory)[0]?.default;
        const weeks = h?.players[playerId];
        return { playerId, matches: load ? (await load()).default : null, history: h && weeks ? { dates: h.dates, weeks, eighth: h.eighth } : null };
      })();
  const page = (
    <StrictMode>
      <PlayerPage season={season} playerId={data.playerId} matches={data.matches} history={data.history ?? null} />
    </StrictMode>
  );
  if (root.hasAttribute('data-ssr')) hydrateRoot(root, page);
  else createRoot(root).render(page);
}
void start();
