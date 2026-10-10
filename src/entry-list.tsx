import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { season } from './data/season';
import type { DrawFile } from './draws/drawSchema';
import { tournamentFacts, type TournamentFact } from './draws/facts';
import { PlayersIndex } from './ui/PlayersIndex';
import { TournamentsIndex } from './ui/TournamentsIndex';
import './ui/styles.css';

// Development only: the dev server serves /tournaments/ and /players/ from this template, so the draws are read directly.
const devDraws: Record<string, { default: DrawFile }> = import.meta.env.DEV
  ? import.meta.glob<{ default: DrawFile }>('../data/draws/*.json', { eager: true })
  : {};

type Data = { page: 'tournaments'; facts: Record<string, TournamentFact> } | { page: 'players' };

function pageData(): Data {
  const embedded = document.getElementById('page-data');
  if (embedded) return JSON.parse(embedded.textContent ?? '{}') as Data;
  const page = window.location.pathname.startsWith('/players') || new URLSearchParams(window.location.search).get('page') === 'players' ? 'players' : 'tournaments';
  if (page === 'players') return { page };
  const draws = Object.fromEntries(Object.entries(devDraws).map(([path, mod]) => [path.replace(/^.*\/([^/]+)\.json$/, '$1'), mod.default]));
  return { page, facts: tournamentFacts(season, draws) };
}

const data = pageData();
const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    {data.page === 'players' ? <PlayersIndex season={season} /> : <TournamentsIndex season={season} facts={data.facts} />}
  </StrictMode>
);
// Built pages arrive prerendered (data-ssr); the dev server serves the bare template.
if (root.hasAttribute('data-ssr')) hydrateRoot(root, app);
else createRoot(root).render(app);
