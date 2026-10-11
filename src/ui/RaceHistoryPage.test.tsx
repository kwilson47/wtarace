import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RaceHistory } from '../history/historySchema';
import { season } from '../test/fixtures';
import { RaceHistoryPage } from './RaceHistoryPage';

const history: RaceHistory = {
  dates: ['2026-03-02', '2026-03-16'],
  eighth: [100, 200],
  players: { ana: [[1, 900], [1, 1160]], bea: [[2, 500], [2, 765]], cat: [null, [3, 140]] },
};

describe('RaceHistoryPage', () => {
  beforeEach(() => window.history.replaceState(null, '', '/race-history/'));

  it('starts with the top players in points view, and toggles to positions', () => {
    const { container } = render(<RaceHistoryPage season={season} history={history} />);
    expect(container.querySelectorAll('path.series')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Points' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Position' }));
    expect(container.querySelector('rect.qualifying-band')).not.toBeNull(); // positions 1–8 shaded (the axis always runs to at least 10)
    expect(window.location.search).toContain('view=rank');
  });

  it('adds and removes players, finds them by name, and keeps the choice in the URL', () => {
    const { container } = render(<RaceHistoryPage season={season} history={history} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Bea Beta/ }));
    expect(container.querySelectorAll('path.series')).toHaveLength(2);
    expect(window.location.search).toBe('?p=ana%2Ccat');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a player' }), { target: { value: 'bet' } });
    expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Bea Beta']);
  });

  it('restores a shared choice after loading, ignoring players it does not know', () => {
    window.history.replaceState(null, '', '/race-history/?p=bea,zed&view=rank');
    const { container } = render(<RaceHistoryPage season={season} history={history} />);
    expect(container.querySelectorAll('path.series')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Position' })).toBeChecked();
  });

  it('says so when there is no history', () => {
    render(<RaceHistoryPage season={season} history={null} />);
    expect(screen.getByText("Race history isn't available yet.")).toBeInTheDocument();
  });
});
