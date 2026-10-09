import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { season } from '../test/fixtures';
import { PlayerPage } from './PlayerPage';

const open = { status: 'open' as const, safeAt: 971, eventsLeft: true, eligibleNow: true };

describe('PlayerPage', () => {
  it('shows a qualified player: rank, total, status, schedule and links', () => {
    render(<PlayerPage season={season} playerId="ana" outlook={{ status: 'qualified' }} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ana Alpha');
    expect(screen.getByText(/#1 in the Race to the WTA Finals 2026 · 1,160 points/)).toBeInTheDocument();
    expect(screen.getByText('Qualified')).toBeInTheDocument();
    expect(screen.getByText('Ana Alpha has qualified for the WTA Finals.')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Schedule' })).getByText('Live Masters: alive in the Quarterfinal')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: "Ana Alpha's results" })).toHaveTextContent('Slam Open W 1,000');
    expect(screen.getByRole('link', { name: '← Full standings' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Explore scenarios for Ana Alpha' })).toHaveAttribute('href', '/?player=ana');
    expect(screen.queryByRole('link', { name: 'Try this scenario' })).toBeNull();
  });

  it('shows an Out player with no remaining events', () => {
    render(<PlayerPage season={season} playerId="cat" outlook={{ status: 'out' }} />);
    expect(screen.getByText('Out')).toBeInTheDocument();
    expect(screen.getByText('Cat Gamma can no longer qualify.')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Schedule' })).getByText('No remaining events entered.')).toBeInTheDocument();
  });

  it('shows an open player with her route and scenario links', () => {
    const outlook = { ...open, guaranteedRoute: { 'bea|next': 'W' }, missExample: { 'ana|next': 'W' }, qualifyExample: {} };
    render(<PlayerPage season={season} playerId="bea" outlook={outlook} />);
    expect(screen.getByText('Still in contention')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What she needs' })).toBeInTheDocument();
    expect(screen.getByText(/certain to qualify with these results of her own/)).toHaveTextContent('Next Open: Winner');
    const links = screen.getAllByRole('link', { name: 'Try this scenario' }).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/', '/?s=ana.next.W']);
  });

  it('lists an upcoming event she has entered', () => {
    const s = structuredClone(season);
    s.tournaments.find((t) => t.id === 'next')!.entries = ['cat'];
    render(<PlayerPage season={s} playerId="cat" outlook={{ status: 'out' }} />);
    expect(within(screen.getByRole('region', { name: 'Schedule' })).getByText('Next Open: entered')).toBeInTheDocument();
  });
});
