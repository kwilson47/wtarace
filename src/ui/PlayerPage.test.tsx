import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MatchRecord } from '../season/matchSchema';
import { season } from '../test/fixtures';
import { PlayerPage } from './PlayerPage';

const m = (over: Omit<Partial<MatchRecord>, 'opponent'> & { opponent?: Partial<MatchRecord['opponent']> }): MatchRecord => ({
  tournamentId: 903, year: 2026, tournament: 'City 500', level: 'WTA 500', team: false, surface: 'Hard', indoor: false,
  startDate: '2026-04-06', endDate: '2026-04-12', qualifying: false, round: 1, roundName: 'R32',
  won: true, score: '6-1 6-1', outcome: 'played', points: 100,
  ...over,
  opponent: { id: 99, name: 'Opp', country: 'BE', seed: null, entry: null, rank: 40, ...over.opponent },
});

const matches = [
  m({ round: 1, roundName: 'R32', opponent: { name: 'Bea Beta', id: 2, seed: 3 } }),
  m({ round: 2, roundName: 'F', score: '6-3 1-6 6-3', opponent: { name: 'Qualy Kid', entry: 'Q', rank: 9, country: null } }),
  m({ tournamentId: 904, tournament: 'Town 250', level: 'WTA 250', surface: 'Clay', startDate: '2026-05-04', endDate: '2026-05-10', won: false, outcome: 'retired', score: '4-6 2-0', points: 1 }),
];

describe('PlayerPage', () => {
  it('shows her season record, titles and race position', () => {
    const s = structuredClone(season);
    s.players.find((p) => p.id === 'bea')!.wtaId = 2;
    render(<PlayerPage season={s} playerId="ana" matches={matches} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ana Alpha');
    expect(screen.getByText(/2026 season · 2–1 · 1 title \(City 500\) · 1 final/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Race #1' })).toHaveAttribute('href', '/');
  });

  it('summarises by surface and level, with top-10 wins', () => {
    render(<PlayerPage season={season} playerId="ana" matches={matches} />);
    const summary = screen.getByRole('region', { name: 'Season summary' });
    expect(summary).toHaveTextContent('Hard 2–0');
    expect(summary).toHaveTextContent('Clay 0–1');
    expect(summary).toHaveTextContent('WTA 500 2–0');
    expect(summary).toHaveTextContent('Top-10 wins1');
  });

  it('lists each tournament with its matches, linking tracked opponents', () => {
    const s = structuredClone(season);
    s.players.find((p) => p.id === 'bea')!.wtaId = 2;
    render(<PlayerPage season={s} playerId="ana" matches={matches} />);
    const city = screen.getByRole('region', { name: 'City 500' });
    expect(city).toHaveTextContent('WTA 500 · Hard · Apr 6 – Apr 12');
    expect(city).toHaveTextContent('Winner · 100 pts');
    const rows = within(city).getAllByRole('row').map((r) => r.textContent);
    expect(rows[0]).toBe('FWQualy Kid (Q)6-3 1-6 6-3');
    expect(within(city).getByRole('link', { name: 'Bea Beta' })).toHaveAttribute('href', '/players/bea/');
    expect(screen.getByRole('region', { name: 'Town 250' })).toHaveTextContent('4-6 2-0 ret.');
  });

  it('says so when her matches are not available yet', () => {
    render(<PlayerPage season={season} playerId="ana" matches={null} />);
    expect(screen.getByText("Match results aren't available yet.")).toBeInTheDocument();
  });
});
