import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { season } from './data/season';
import type { DrawFile } from './draws/drawSchema';
import { TournamentPage } from './ui/TournamentPage';
import './ui/styles.css';

const root = document.getElementById('root')!;
// Development only: /tournaments/<id>/ (or /tournament.html?id=<id>) loads its draw file directly.
const devFiles: Record<string, () => Promise<{ default: DrawFile }>> = import.meta.env.DEV
  ? import.meta.glob<{ default: DrawFile }>('../data/draws/*.json')
  : {};

async function start() {
  const embedded = document.getElementById('page-data');
  const data: { tournamentId: string; draw: DrawFile | null } = embedded
    ? JSON.parse(embedded.textContent ?? '{}')
    : await (async () => {
        const requested = /^\/tournaments\/([a-z0-9-]+)/.exec(window.location.pathname)?.[1] ?? new URLSearchParams(window.location.search).get('id') ?? '';
        const tournamentId = season.tournaments.some((t) => t.id === requested) ? requested : season.tournaments.find((t) => t.wtaId !== undefined)!.id;
        const load = devFiles[`../data/draws/${tournamentId}.json`];
        return { tournamentId, draw: load ? (await load()).default : null };
      })();
  const page = (
    <StrictMode>
      <TournamentPage season={season} tournamentId={data.tournamentId} draw={data.draw} />
    </StrictMode>
  );
  if (root.hasAttribute('data-ssr')) hydrateRoot(root, page);
  else createRoot(root).render(page);
}
void start();
