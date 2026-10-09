import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { season } from './data/season';
import { playerOutlook, type Outlook } from './engine/outlook';
import { PlayerPage } from './ui/PlayerPage';
import './ui/styles.css';

const root = document.getElementById('root')!;
const embedded = document.getElementById('page-data');
// Built pages embed the player and her outlook; in development, /player.html?id=<player> works it out here.
const { playerId, outlook }: { playerId: string; outlook: Outlook } = embedded
  ? JSON.parse(embedded.textContent ?? '{}')
  : (() => {
      const id = new URLSearchParams(window.location.search).get('id') ?? season.players[0]!.id;
      return { playerId: id, outlook: playerOutlook(id, season.players, season.tournaments, season.rules) };
    })();
const page = (
  <StrictMode>
    <PlayerPage season={season} playerId={playerId} outlook={outlook} />
  </StrictMode>
);
if (root.hasAttribute('data-ssr')) hydrateRoot(root, page);
else createRoot(root).render(page);
