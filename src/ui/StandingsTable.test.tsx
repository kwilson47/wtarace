import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StandingsTable } from './StandingsTable';
import type { StandingRow } from '../engine/standings';

const row = (rank: number, overrides: Partial<StandingRow> = {}): StandingRow => ({
  playerId: `p${rank}`, name: `Player ${rank}`, country: 'US',
  currentRank: rank, projectedRank: rank, rankChange: 0,
  currentTotal: 5000 - rank * 100, projectedTotal: 5000 - rank * 100, delta: 0, qualified: false,
  eligible: true, projectedQualifier: rank <= 8 ? 'direct' : null,
  ...overrides,
});
const range = (n: number, overrides: Record<number, Partial<StandingRow>> = {}) =>
  Array.from({ length: n }, (_, i) => row(i + 1, overrides[i + 1]));
const cls = (id: string) => screen.getByTestId(`row-${id}`).className.split(/\s+/).filter(Boolean).sort();

describe('StandingsTable', () => {
  it('highlights qualifiers, draws the cutoff under the last one and shades two alternates', () => {
    render(<StandingsTable rows={range(11)} />);
    expect(cls('p1')).toEqual(['qualifier']);
    expect(cls('p8')).toEqual(['cutoff', 'qualifier']);
    expect(cls('p9')).toEqual(['alternate']);
    expect(cls('p10')).toEqual(['alternate']);
    expect(cls('p11')).toEqual([]);
  });

  it('moves the cutoff to a lower-ranked Grand Slam champion and badges her', () => {
    render(<StandingsTable rows={range(12, { 8: { projectedQualifier: null }, 12: { projectedQualifier: 'champion' } })} />);
    expect(cls('p7')).toEqual(['qualifier']);
    expect(cls('p8')).toEqual(['alternate']);
    expect(cls('p9')).toEqual(['alternate']);
    expect(cls('p10')).toEqual([]);
    expect(cls('p12')).toEqual(['cutoff', 'qualifier']);
    expect(within(screen.getByTestId('row-p12')).getByTitle('Grand Slam champion place')).toBeInTheDocument();
    expect(within(screen.getByTestId('row-p7')).queryByTitle('Grand Slam champion place')).toBeNull();
  });

  it('marks ineligible players and never makes them alternates', () => {
    render(<StandingsTable rows={range(11, { 3: { eligible: false, projectedQualifier: null }, 9: { projectedQualifier: 'direct' } })} />);
    expect(within(screen.getByTestId('row-p3')).getByText('Not eligible (event minimum)')).toBeInTheDocument();
    expect(cls('p3')).toEqual([]);
    expect(cls('p9')).toEqual(['cutoff', 'qualifier']);
    expect(cls('p10')).toEqual(['alternate']);
    expect(cls('p11')).toEqual(['alternate']);
  });

  it('shows points, delta, rank movement and the official qualified badge', () => {
    render(<StandingsTable rows={[row(1, { qualified: true, currentRank: 3, rankChange: 2, currentTotal: 4210, projectedTotal: 4860, delta: 650 }), row(2)]} />);
    const first = within(screen.getByTestId('row-p1'));
    expect(first.getByTestId('current')).toHaveTextContent('4,210');
    expect(first.getByTestId('projected')).toHaveTextContent('4,860');
    expect(first.getByText('4,210 → 4,860')).toBeInTheDocument();
    expect(first.getByTestId('delta')).toHaveTextContent('+650');
    expect(first.getByLabelText('Up 2')).toBeInTheDocument();
    expect(first.getByTitle('Officially qualified')).toBeInTheDocument();
    expect(within(screen.getByTestId('row-p2')).queryByTitle('Officially qualified')).toBeNull();
  });
});
