import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PickSelect } from './PickSelect';
import { rawSeason, season } from '../test/fixtures';
import { parseOrThrow, type Season } from '../data/schema';

function setup(playerId: string, tournamentId: string, s: Season = season, value?: string) {
  const onChange = vi.fn();
  const player = s.players.find((p) => p.id === playerId)!;
  const tournament = s.tournaments.find((t) => t.id === tournamentId)!;
  render(<PickSelect player={player} tournament={tournament} rules={s.rules} value={value} onChange={onChange} messages={['Watch out']} />);
  return { onChange };
}
const optionTexts = () => screen.getAllByRole('option').map((o) => o.textContent);

describe('PickSelect', () => {
  it('offers Not playing plus rounds trimmed to a 32 draw', () => {
    setup('bea', 'clash');
    expect(optionTexts()).toEqual(['Not playing', 'Lost in Round of 32', 'Lost in Round of 16', 'Lost in Quarterfinal', 'Lost in Semifinal', 'Lost in Final', 'Winner']);
  });

  it('offers every round of a 128 draw', () => {
    const raw = rawSeason();
    raw.tournaments = raw.tournaments.map((t) => (t.id === 'clash' ? { ...t, drawType: 'gs128' } : t));
    setup('bea', 'clash', parseOrThrow(raw));
    expect(optionTexts()).toHaveLength(9);
    expect(optionTexts()[1]).toBe('Lost in Round of 128');
  });

  it('starts a bye player at the second round', () => {
    setup('ana', 'next');
    expect(optionTexts()[1]).toBe('Lost in Round of 16');
  });

  it('starts an alive player at her current round', () => {
    setup('ana', 'live');
    expect(optionTexts()).toEqual(['Alive in Quarterfinal — no pick', 'Lost in Quarterfinal', 'Lost in Semifinal', 'Lost in Final', 'Winner']);
  });

  it('locks an eliminated player', () => {
    setup('bea', 'live');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Out in Round of 16')).toBeInTheDocument();
  });

  it('locks a player not in the draw', () => {
    setup('cat', 'live');
    expect(screen.getByText('Not in draw')).toBeInTheDocument();
  });

  it('reports picks and clears', async () => {
    const { onChange } = setup('bea', 'clash', season, 'W');
    const select = screen.getByRole('combobox', { name: 'Bea Beta at Clash Cup' });
    expect(select).toHaveValue('W');
    await userEvent.selectOptions(select, 'SF');
    expect(onChange).toHaveBeenLastCalledWith('SF');
    await userEvent.selectOptions(select, '');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('shows warning messages next to the dropdown', () => {
    setup('bea', 'clash');
    expect(screen.getByText('Watch out')).toBeInTheDocument();
  });
});
