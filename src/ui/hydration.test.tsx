import { act, type ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { season } from '../test/fixtures';
import { App } from './App';
import { PlayerPage } from './PlayerPage';

/** Renders `element` as the build would (a clean URL, no stored preferences), then hydrates it in a browser-like state. */
export async function hydrationErrors(element: ReactElement, browser: () => void = () => {}): Promise<unknown[]> {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  const container = document.createElement('div');
  container.innerHTML = renderToString(element);
  document.body.appendChild(container);
  browser();
  const errors: unknown[] = [];
  await act(async () => {
    hydrateRoot(container, element, { onRecoverableError: (error) => errors.push(error) });
  });
  container.remove();
  return errors;
}

describe('hydration', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
  });

  it('the homepage hydrates cleanly with shared picks in the URL and a stored preference', async () => {
    const errors = await hydrationErrors(<App season={season} />, () => {
      window.history.replaceState(null, '', '/?s=ana.live.W');
      window.localStorage.setItem('hideEliminated', 'false');
    });
    expect(errors).toEqual([]);
  });

  it('a player page hydrates cleanly', async () => {
    expect(await hydrationErrors(<PlayerPage season={season} playerId="ana" outlook={{ status: 'qualified' }} />)).toEqual([]);
  });

  it('hydrates cleanly when the visitor opens it in a later year than the build', async () => {
    // Built in 2026 from 2026 data, opened in 2027: the first render must not depend on today's date.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));
    try {
      const errors = await hydrationErrors(<PlayerPage season={season} playerId="ana" outlook={{ status: 'qualified' }} />, () => {
        vi.setSystemTime(new Date('2027-01-05T12:00:00Z'));
      });
      expect(errors).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
