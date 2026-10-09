import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatChance } from './format';
import { StandingsTable } from './StandingsTable';
import type { StandingRow } from '../engine/standings';

const row = (rank: number, overrides: Partial<StandingRow> = {}): StandingRow => ({
  playerId: `p${rank}`, name: `Player ${rank}`, country: 'US',
  currentRank: rank, projectedRank: rank, rankChange: 0,
  currentTotal: 5000 - rank * 100, projectedTotal: 5000 - rank * 100, delta: 0, qualified: false,
  eligible: true, eventsShort: 0, projectedQualifier: rank <= 8 ? 'direct' : null,
  ...overrides,
});
const range = (n: number, overrides: Record<number, Partial<StandingRow>> = {}) =>
  Array.from({ length: n }, (_, i) => row(i + 1, overrides[i + 1]));
const cls = (id: string) => screen.getByTestId(`row-${id}`).className.split(/\s+/).filter(Boolean).sort();

describe('StandingsTable', () => {
  beforeEach(() => window.localStorage.clear());

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
    render(<StandingsTable rows={range(11, { 3: { eligible: false, eventsShort: 1, projectedQualifier: null }, 9: { projectedQualifier: 'direct' } })} />);
    expect(within(screen.getByTestId('row-p3')).getByText('Needs 1 more event to be eligible')).toBeInTheDocument();
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
    expect(first.getByTitle('Qualified')).toBeInTheDocument();
    expect(within(screen.getByTestId('row-p2')).queryByTitle('Qualified')).toBeNull();
  });

  it('marks eliminated players as out and mutes their row', () => {
    render(<StandingsTable rows={range(11, { 11: { eligible: false, eventsShort: 1 } })} eliminated={new Set(['p10', 'p11'])} />);
    expect(screen.getByText('2 eliminated players hidden')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hide eliminated players' }));
    const outBadge = within(screen.getByTestId('row-p10')).getByText('Out');
    expect(outBadge).toHaveAttribute('title', expect.stringMatching(/can't reach a qualifying place/i));
    expect(cls('p10')).toEqual(['alternate', 'out']);
    // An eliminated player's event shortfall no longer matters, so the note is dropped.
    expect(within(screen.getByTestId('row-p11')).queryByText(/more event/)).toBeNull();
    expect(within(screen.getByTestId('row-p9')).queryByText('Out')).toBeNull();
  });

  it('shows the Q badge for players certain to qualify, as well as announced ones', () => {
    render(<StandingsTable rows={range(3, { 1: { qualified: true } })} clinched={new Set(['p2'])} />);
    expect(within(screen.getByTestId('row-p1')).getByTitle('Qualified')).toBeInTheDocument();
    expect(within(screen.getByTestId('row-p2')).getByTitle('Qualified')).toBeInTheDocument();
    expect(within(screen.getByTestId('row-p3')).queryByTitle('Qualified')).toBeNull();
  });

  it('explains the badges in a legend', () => {
    render(<StandingsTable rows={range(3)} />);
    expect(screen.getByText(/Q = qualified/)).toBeInTheDocument();
    expect(screen.getByText(/Out = can't reach a qualifying place/)).toBeInTheDocument();
  });
});

describe('chances', () => {
  beforeEach(() => window.localStorage.clear());
  const breakdownOf = () => ({ entries: [], total: 0, countedResults: 0, maxCountedResults: 18, minEvents: null });

  it('formats a chance: whole percent, >99%, <1%', () => {
    expect(formatChance(0.874)).toBe('87%');
    expect(formatChance(0.995)).toBe('>99%');
    expect(formatChance(1)).toBe('>99%');
    expect(formatChance(0.004)).toBe('<1%');
    expect(formatChance(0)).toBe('<1%');
  });

  it('shows Q for qualified or clinched, — for eliminated, the percent otherwise, and a line in the expanded row', () => {
    render(
      <StandingsTable
        rows={range(4, { 1: { qualified: true } })}
        clinched={new Set(['p2'])}
        eliminated={new Set(['p4'])}
        chances={{ p1: 1, p2: 0.97, p3: 0.42, p4: 0 }}
        breakdownOf={breakdownOf}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Chance' })).toHaveAttribute('title', "Chance to qualify, from 10,000 simulated finishes to the season using real results only. Your picks don't change it.");
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hide eliminated players' })); // show p4
    const cell = (id: string) => within(screen.getByTestId(`row-${id}`)).getByTestId('chance');
    expect(cell('p1')).toHaveTextContent('Q');
    expect(cell('p2')).toHaveTextContent('Q');
    expect(cell('p3')).toHaveTextContent('42%');
    expect(cell('p4')).toHaveTextContent('—');
    fireEvent.click(screen.getByRole('button', { name: 'Player 3' }));
    expect(screen.getByText('Chance to qualify: 42%')).toBeInTheDocument();
    expect(screen.getByText(/Chances come from simulating the remaining events with ratings built from this season's results\./)).toBeInTheDocument();
  });

  it('leaves the column, line and note out without chances', () => {
    render(<StandingsTable rows={range(3)} breakdownOf={breakdownOf} />);
    expect(screen.queryByRole('columnheader', { name: 'Chance' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Player 1' }));
    expect(screen.queryByText(/Chance to qualify/)).toBeNull();
    expect(screen.queryByText(/Chances come from/)).toBeNull();
  });
});
