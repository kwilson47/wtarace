import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RaceChart } from './RaceChart';

const dates = ['2026-01-05', '2026-01-19', '2026-03-02', '2026-03-16'];
const series = [
  { id: 'ana', name: 'Ana Alpha', color: '#111', values: [100, 300, 900, 1200] },
  { id: 'bea', name: 'Bea Beta', color: '#222', values: [null, 200, 1000, null] },
];

describe('RaceChart', () => {
  it('draws a line per player (broken across missing weeks), labels each line end, and the reference line', () => {
    const { container } = render(<RaceChart dates={dates} series={series} view="points" reference={{ label: '8th place', values: [50, 150, 600, 800] }} />);
    expect(container.querySelectorAll('path.series')).toHaveLength(2);
    expect(container.querySelector('path.series[data-id="bea"]')!.getAttribute('d')!.match(/M/g)).toHaveLength(1);
    expect(screen.getByText('Ana Alpha')).toBeInTheDocument();
    expect(screen.getByText('8th place')).toBeInTheDocument();
    expect(container.querySelector('path.reference')).not.toBeNull();
  });

  it('puts position 1 at the top in position view, with the qualifying band and no reference line', () => {
    const { container } = render(<RaceChart dates={dates} series={[{ ...series[0]!, values: [9, 4, 1, 2] }]} view="rank" reference={{ label: '8th place', values: [1, 1, 1, 1] }} />);
    const y = (i: number) => Number(container.querySelectorAll('circle.point')[i]!.getAttribute('cy'));
    expect(y(2)).toBeLessThan(y(0)); // 1st is above 9th
    expect(container.querySelector('rect.qualifying-band')).not.toBeNull();
    expect(container.querySelector('path.reference')).toBeNull();
  });

  it('spaces weeks by date, not evenly', () => {
    const { container } = render(<RaceChart dates={dates} series={[series[0]!]} view="points" />);
    const x = (i: number) => Number(container.querySelectorAll('circle.point')[i]!.getAttribute('cx'));
    expect(x(2) - x(1)).toBeGreaterThan(2 * (x(1) - x(0))); // 6 weeks vs 2 weeks
  });

  it("shows a week's figures when it is selected", () => {
    render(<RaceChart dates={dates} series={series} view="points" />);
    fireEvent.click(screen.getByRole('button', { name: 'Week of Mar 2, 2026' }));
    const panel = screen.getByRole('status');
    expect(panel).toHaveTextContent('Mar 2, 2026');
    expect(panel).toHaveTextContent('Ana Alpha');
    expect(panel).toHaveTextContent('900');
    expect(panel).toHaveTextContent('1,000');
  });
});
