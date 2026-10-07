import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { season } from './data/season';
import { App } from './ui/App';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App season={season} />
  </StrictMode>,
);
