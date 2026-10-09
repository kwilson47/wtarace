import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { season } from './data/season';
import { App } from './ui/App';
import './ui/styles.css';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App season={season} />
  </StrictMode>
);
// Built pages arrive prerendered (data-ssr); the dev server serves the bare template.
if (root.hasAttribute('data-ssr')) hydrateRoot(root, app);
else createRoot(root).render(app);
