import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { season } from './data/season';
import type { DrawFile } from './draws/drawSchema';
import type { MatchRecord } from './season/matchSchema';
import { DEV_RUNS, SEED, simulateChances } from './sim/chances';
import { App } from './ui/App';
import './ui/styles.css';

// Development only: the dev server has no prerendered data, so it simulates (fewer runs) from the data files.
const devMatches: Record<string, { default: MatchRecord[] }> = import.meta.env.DEV
  ? import.meta.glob<{ default: MatchRecord[] }>('../data/matches/*.json', { eager: true })
  : {};
const devDraws: Record<string, { default: DrawFile }> = import.meta.env.DEV
  ? import.meta.glob<{ default: DrawFile }>('../data/draws/*.json', { eager: true })
  : {};
const byName = <T,>(files: Record<string, { default: T }>): Record<string, T> =>
  Object.fromEntries(Object.entries(files).map(([path, mod]) => [path.replace(/^.*\/([^/]+)\.json$/, '$1'), mod.default]));

function pageChances(): Record<string, number> | null {
  const embedded = document.getElementById('page-data');
  if (embedded) return (JSON.parse(embedded.textContent ?? '{}') as { chances?: Record<string, number> | null }).chances ?? null;
  if (!import.meta.env.DEV) return null;
  return simulateChances(season, byName(devMatches), byName(devDraws), { runs: DEV_RUNS, seed: SEED });
}

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App season={season} chances={pageChances()} />
  </StrictMode>
);
// Built pages arrive prerendered (data-ssr); the dev server serves the bare template.
if (root.hasAttribute('data-ssr')) hydrateRoot(root, app);
else createRoot(root).render(app);
