import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { bracketSeason, season } from '../test/fixtures';

const projected = (id: string) => within(screen.getByTestId(`row-${id}`)).getByTestId('projected');
const delta = (id: string) => within(screen.getByTestId(`row-${id}`)).getByTestId('delta');
const showEliminated = () => userEvent.click(screen.getByRole('checkbox', { name: 'Hide eliminated players' }));

describe('App', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
  });

  it('hides eliminated players by default, and remembers when they are shown', async () => {
    const { unmount } = render(<App season={season} />);
    expect(screen.queryByTestId('row-cat')).toBeNull();
    expect(screen.getByText('1 eliminated player hidden')).toBeInTheDocument();
    await showEliminated();
    expect(screen.getByTestId('row-cat')).toBeInTheDocument();
    expect(screen.queryByText(/eliminated player hidden/)).toBeNull();
    unmount();
    render(<App season={season} />);
    expect(screen.getByTestId('row-cat')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Hide eliminated players' })).not.toBeChecked();
  });

  it('shows the current race when there are no picks', () => {
    render(<App season={season} />);
    expect(screen.getByText('Data updated 2026-10-07 12:00 UTC')).toBeInTheDocument();
    expect(projected('ana')).toHaveTextContent('1,160');
    expect(delta('ana')).toHaveTextContent('0');
  });

  it('shows Q for players certain to qualify, once the background check finishes', async () => {
    render(<App season={season} />);
    // bea has no official flag, but nobody can push her out of the two places.
    expect(await within(screen.getByTestId('row-bea')).findByTitle('Qualified')).toBeInTheDocument();
    await showEliminated();
    expect(within(screen.getByTestId('row-cat')).queryByTitle('Qualified')).toBeNull();
  });

  it("shows each player's maximum possible total from actual results, whatever the visitor picks", async () => {
    render(<App season={season} />);
    await showEliminated();
    const max = (id: string) => within(screen.getByTestId(`row-${id}`)).getByTestId('max');
    expect(max('ana')).toHaveTextContent('1,220');
    expect(max('cat')).toHaveTextContent('240');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ana Alpha at Live Masters' }), 'W');
    expect(max('ana')).toHaveTextContent('1,220');
  });

  it('marks players who can no longer qualify, whatever the visitor picks', async () => {
    render(<App season={season} />);
    await showEliminated();
    expect(within(screen.getByTestId('row-cat')).getByText('Out')).toBeInTheDocument();
    expect(within(screen.getByTestId('row-bea')).queryByText('Out')).toBeNull();
    // A pick that projects cat higher doesn't change her actual status.
    await userEvent.click(screen.getByRole('tab', { name: 'By player' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Player' }), 'cat');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Cat Gamma at Next Open' }), 'W');
    expect(within(screen.getByTestId('row-cat')).getByText('Out')).toBeInTheDocument();
  });

  it("shows the selected player's outlook in the By player tab", async () => {
    render(<App season={season} />);
    await userEvent.click(screen.getByRole('tab', { name: 'By player' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Player' }), 'bea');
    expect(await screen.findByText('Bea Beta has qualified for the WTA Finals.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Player' }), 'cat');
    expect(await screen.findByText('Cat Gamma can no longer qualify.')).toBeInTheDocument();
  });

  it('loads an outlook example into the picks', async () => {
    const s = bracketSeason(1, 17);
    render(<App season={s} />);
    await userEvent.click(screen.getByRole('tab', { name: 'By player' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Player' }), 'bea');
    const chances = await screen.findByRole('region', { name: 'Chances' });
    await within(chances).findByText(/Safe at/);
    expect(chances).toHaveTextContent('Safe at 971 points');
    expect(chances).toHaveTextContent('Live Masters: Lost in Final');
    const qualify = within(chances).getByRole('region', { name: 'How she could qualify' });
    expect(qualify).toHaveTextContent('Bea Beta — Live Masters: Lost in Semifinal');
    await userEvent.click(within(qualify).getByRole('button', { name: 'Load this scenario' }));
    expect(projected('bea')).toHaveTextContent('960');
    expect(window.location.search).toBe('?s=bea.live.SF');
  });

  it('expands a player to show where her points come from, following picks', async () => {
    render(<App season={season} />);
    const results = () => screen.getByRole('region', { name: "Ana Alpha's results" });
    await userEvent.click(screen.getByRole('button', { name: 'Ana Alpha' }));
    expect(screen.getByRole('button', { name: 'Ana Alpha' })).toHaveAttribute('aria-expanded', 'true');
    expect(results()).toHaveTextContent('Grand Slam');
    expect(results()).toHaveTextContent('Slam Open W 1,000');
    expect(results()).toHaveTextContent('Live Masters QF 10 (in progress, not counted)');
    expect(results()).toHaveTextContent('Counting 4 of 4 results');
    expect(results()).toHaveTextContent('Events toward the 2-event minimum: 3');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ana Alpha at Live Masters' }), 'W');
    expect(results()).toHaveTextContent('Live Masters W 100 (your pick)');
    expect(results()).toHaveTextContent('Town 250 F 40 (not counted)');
    await userEvent.click(screen.getByRole('button', { name: 'Ana Alpha' }));
    expect(screen.queryByRole('region', { name: "Ana Alpha's results" })).toBeNull();
  });

  it('labels zero-pointers in the breakdown', async () => {
    render(<App season={season} />);
    await showEliminated();
    await userEvent.click(screen.getByRole('button', { name: 'Cat Gamma' }));
    expect(screen.getByRole('region', { name: "Cat Gamma's results" })).toHaveTextContent('Slam Open zero-pointer 0');
  });

  it('updates the projection and the URL when a pick is made', async () => {
    render(<App season={season} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ana Alpha at Live Masters' }), 'W');
    expect(projected('ana')).toHaveTextContent('1,220');
    expect(delta('ana')).toHaveTextContent('+60');
    expect(window.location.search).toBe('?s=ana.live.W');
  });

  it('restores a scenario from the URL and lists what was ignored', async () => {
    window.history.replaceState(null, '', '/?s=ana.live.W_zed.live.W_bad');
    render(<App season={season} />);
    expect(projected('ana')).toHaveTextContent('1,220');
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('1 unreadable entry — unreadable');
    expect(notice).toHaveTextContent('zed at live: W — unknown player');
    expect(window.location.search).toBe('?s=ana.live.W');
    await userEvent.click(within(notice).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Reset clears every pick', async () => {
    window.history.replaceState(null, '', '/?s=ana.live.W');
    render(<App season={season} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(projected('ana')).toHaveTextContent('1,160');
    expect(window.location.search).toBe('');
  });
});
