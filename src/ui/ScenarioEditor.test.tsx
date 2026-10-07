import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScenarioEditor } from './ScenarioEditor';
import { checkScenario } from '../engine/checkScenario';
import { pickKey, type Scenario } from '../engine/types';
import { season } from '../test/fixtures';

function setup(scenario: Scenario = {}) {
  const onPick = vi.fn();
  const warnings = checkScenario(scenario, season.players, season.tournaments, season.rules);
  render(<ScenarioEditor season={season} players={season.players} scenario={scenario} warnings={warnings} onPick={onPick} />);
  return { onPick };
}

describe('ScenarioEditor', () => {
  it('lists remaining events by date and marks live ones', () => {
    setup();
    const options = screen.getAllByRole('option').filter((o) => o.closest('select')?.getAttribute('id') === 'tournament-select');
    expect(options.map((o) => o.textContent)).toEqual(['Live Masters — LIVE', 'Next Open', 'Clash Cup']);
  });

  it('by tournament: one dropdown or locked cell per player, and picks reach onPick', async () => {
    const { onPick } = setup();
    expect(screen.getByRole('combobox', { name: 'Ana Alpha at Live Masters' })).toBeInTheDocument();
    expect(screen.getByText('Out in Round of 16')).toBeInTheDocument();
    expect(screen.getByText('Not in draw')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ana Alpha at Live Masters' }), 'W');
    expect(onPick).toHaveBeenCalledWith('ana', 'live', 'W');
  });

  it('by player: one dropdown per remaining event', async () => {
    setup();
    await userEvent.click(screen.getByRole('tab', { name: 'By player' }));
    await userEvent.selectOptions(screen.getByLabelText('Player'), 'bea');
    expect(screen.getByText('Out in Round of 16')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Bea Beta at Next Open' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Bea Beta at Clash Cup' })).toBeInTheDocument();
  });

  it('shows warnings next to the affected dropdowns', async () => {
    setup({ [pickKey('ana', 'next')]: 'W', [pickKey('bea', 'next')]: 'W' });
    await userEvent.selectOptions(screen.getByLabelText('Tournament'), 'next');
    expect(screen.getAllByText('Too many picks at Winner: 2 picked, at most 1 possible.')).toHaveLength(2);
  });

  it('shows the zero-pointer and draw-conflict footnotes', () => {
    setup();
    expect(screen.getByText(/never add zero-pointers/i)).toBeInTheDocument();
    expect(screen.getByText(/keep each player's current commitment zero-pointers/i)).toBeInTheDocument();
    expect(screen.getByText(/draw/i, { selector: '.footnotes p' })).toBeInTheDocument();
  });
});
