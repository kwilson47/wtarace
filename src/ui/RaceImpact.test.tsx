import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { season } from '../test/fixtures';
import { RaceImpact } from './RaceImpact';

describe('RaceImpact', () => {
  it('shows the race as the picks leave it, with each player linked', () => {
    render(<RaceImpact season={season} scenario={{ 'ana|live': 'W' }} />);
    const panel = screen.getByRole('region', { name: 'Race impact' });
    const ana = within(panel).getByRole('row', { name: /Ana Alpha/ });
    expect(ana).toHaveTextContent('1,220');
    expect(ana).toHaveTextContent('+60');
    expect(within(ana).getByRole('link', { name: 'Ana Alpha' })).toHaveAttribute('href', '/players/ana/');
    expect(ana).toHaveClass('qualifier');
  });
});
