import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { season } from '../test/fixtures';
import { PlayersIndex } from './PlayersIndex';
import { SiteNav } from './SiteNav';
import { TournamentsIndex } from './TournamentsIndex';

describe('SiteNav', () => {
  it('links the three sections and marks the current one', () => {
    render(<SiteNav current="players" />);
    const nav = screen.getByRole('navigation', { name: 'Site' });
    expect(within(nav).getByRole('link', { name: 'Standings' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Tournaments' })).toHaveAttribute('href', '/tournaments/');
    expect(within(nav).getByRole('link', { name: 'Players' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('TournamentsIndex', () => {
  it('groups events: live now, upcoming in date order, completed newest first with champions; no placeholders', () => {
    render(<TournamentsIndex season={season} facts={{ live: { champion: null, round: 'QF', drawOut: true }, next: { champion: null, round: null, drawOut: true }, c500: { champion: 'Ana Alpha', round: null, drawOut: true } }} />);
    const live = screen.getByRole('region', { name: 'Live now' });
    expect(within(live).getByRole('link', { name: 'Live Masters' })).toHaveAttribute('href', '/tournaments/live/');
    expect(live).toHaveTextContent('QF');
    const upcoming = screen.getByRole('region', { name: 'Upcoming' });
    expect(within(upcoming).getAllByRole('link').map((a) => a.textContent)).toEqual(['Next Open', 'Clash Cup']);
    expect(upcoming).toHaveTextContent('Draw out');
    const done = screen.getByRole('region', { name: 'Completed' });
    expect(within(done).getAllByRole('link').map((a) => a.textContent)).toEqual(['Town 250', 'City 500', 'Mandatory 1000', 'Slam Open']);
    expect(done).toHaveTextContent('Champion: Ana Alpha');
    expect(screen.getByRole('heading', { name: 'April 2026' })).toBeInTheDocument();
  });
});

describe('PlayersIndex', () => {
  it('lists players in race order with their points, and filters by name', () => {
    render(<PlayersIndex season={season} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getByRole('link').textContent)).toEqual(['Ana Alpha', 'Bea Beta', 'Cat Gamma']);
    expect(rows[0]).toHaveTextContent('1,160');
    expect(within(rows[0]!).getByRole('link')).toHaveAttribute('href', '/players/ana/');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a player' }), { target: { value: 'gam' } });
    expect(screen.getAllByRole('row').slice(1).map((r) => within(r).getByRole('link').textContent)).toEqual(['Cat Gamma']);
  });
});
