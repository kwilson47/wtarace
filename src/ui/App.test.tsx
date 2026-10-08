import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { season } from '../test/fixtures';

const projected = (id: string) => within(screen.getByTestId(`row-${id}`)).getByTestId('projected');
const delta = (id: string) => within(screen.getByTestId(`row-${id}`)).getByTestId('delta');

describe('App', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));

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
    expect(within(screen.getByTestId('row-cat')).queryByTitle('Qualified')).toBeNull();
  });

  it('marks players who can no longer qualify, whatever the visitor picks', async () => {
    render(<App season={season} />);
    expect(within(screen.getByTestId('row-cat')).getByText('Out')).toBeInTheDocument();
    expect(within(screen.getByTestId('row-bea')).queryByText('Out')).toBeNull();
    // A pick that projects cat higher doesn't change her actual status.
    await userEvent.click(screen.getByRole('tab', { name: 'By player' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Player' }), 'cat');
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Cat Gamma at Next Open' }), 'W');
    expect(within(screen.getByTestId('row-cat')).getByText('Out')).toBeInTheDocument();
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
