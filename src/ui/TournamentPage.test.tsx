import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DrawFile, DrawMatch } from '../draws/drawSchema';
import type { Season } from '../data/schema';
import { season } from '../test/fixtures';
import { TournamentPage } from './TournamentPage';

const p = (wtaId: number, name: string, seed: number | null = null) => ({ wtaId, name, country: null, seed, entry: null });
const played = (round: number, a: number, b: number, winner: number, score = '6-1 6-1'): DrawMatch => ({ round, a, b, winner, score, outcome: 'played' });
// The fixture's d32 table has 5 rounds before W, so use a 32-line draw: 4 named players (ana=1, bea=2) and fillers.
const players = [p(1, 'Ana Alpha', 1), p(2, 'Bea Beta', 2), ...Array.from({ length: 30 }, (_, i) => p(100 + i, `Filler ${i}`))];
const withIds = (): Season => {
  const s = structuredClone(season);
  s.players.find((x) => x.id === 'ana')!.wtaId = 1;
  s.players.find((x) => x.id === 'bea')!.wtaId = 2;
  return s;
};

/** Every match in a 32 draw, with ana winning the title and bea the runner-up. */
function completedDraw(): DrawFile {
  // ana tops the draw; bea tops the bottom half, so the final is ana v bea.
  const order = [players[0]!, ...players.slice(2, 17), players[1]!, ...players.slice(17)];
  const matches: DrawMatch[] = [];
  let alive = order.map((x) => x.wtaId);
  for (let round = 1; alive.length > 1; round++) {
    const next: number[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const [a, b] = [alive[i]!, alive[i + 1]!];
      const winner = a === 1 || a === 2 ? a : b === 1 || b === 2 ? b : a;
      matches.push(played(round, a, b, winner, round === 5 ? '6-3 6-4' : '6-1 6-1'));
      next.push(winner);
    }
    alive = next;
  }
  return { drawSize: 32, players: order, matches };
}

describe('TournamentPage', () => {
  it('shows a completed event: header, champion, our players and the full bracket', () => {
    const s = withIds();
    const draw = completedDraw();
    render(<TournamentPage season={s} tournamentId="c500" draw={draw} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('City 500 2026');
    expect(screen.getByText(/WTA 500 · Completed/)).toBeInTheDocument();
    expect(screen.getByText('Champion: Ana Alpha · Runner-up: Bea Beta · 6-3 6-4')).toBeInTheDocument();
    const ours = screen.getByRole('region', { name: 'Tracked players' });
    expect(within(ours).getByRole('link', { name: 'Ana Alpha' })).toHaveAttribute('href', '/players/ana/');
    expect(ours).toHaveTextContent('Ana Alpha — Winner · 100 pts');
    const bracket = screen.getByRole('region', { name: 'Draw' });
    expect(within(bracket).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['R32', 'R16', 'QF', 'SF', 'F']);
  });

  it('shows an event under way with a bracket from the quarterfinals and the earlier rounds as lists', () => {
    const s = withIds();
    const full = completedDraw();
    const draw = { ...full, matches: full.matches.filter((m) => m.round <= 2) };
    render(<TournamentPage season={s} tournamentId="live" draw={draw} />);
    expect(screen.getByText(/In progress/)).toBeInTheDocument();
    const region = screen.getByRole('region', { name: 'Draw' });
    expect(within(region).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['QF', 'SF', 'F']);
    expect(within(region).getByText('R16 (8 matches)')).toBeInTheDocument();
    expect(within(region).getByText('R32 (16 matches)')).toBeInTheDocument();
  });

  it("says when the draw hasn't been made, listing our entrants", () => {
    const s = withIds();
    s.tournaments.find((t) => t.id === 'next')!.entries = ['cat'];
    render(<TournamentPage season={s} tournamentId="next" draw={null} />);
    expect(screen.getByText("The draw hasn't been made yet.")).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Tracked players' })).toHaveTextContent('Cat Gamma — Entered');
  });

  it('explains that a team event has no singles draw', () => {
    const s = withIds();
    s.tournaments.find((t) => t.id === 'c500')!.drawType = 'd32';
    const team = structuredClone(s);
    team.rules.pointsTables['united-cup'] = team.rules.pointsTables.d32!;
    team.tournaments.find((t) => t.id === 'c250')!.drawType = 'united-cup';
    render(<TournamentPage season={team} tournamentId="c250" draw={null} />);
    expect(screen.getByText("A team event: there's no singles draw.")).toBeInTheDocument();
  });
});

describe('TournamentPage: picking', () => {
  beforeEach(() => window.history.replaceState(null, '', '/tournaments/live/'));
  const liveDraw = (): DrawFile => {
    const full = completedDraw();
    return { ...full, matches: full.matches.filter((m) => m.round <= 2) };
  };

  it('picks a winner in an undecided match, shows the race impact, and clears it on a second click', async () => {
    render(<TournamentPage season={withIds()} tournamentId="live" draw={liveDraw()} />);
    expect(screen.getByRole('region', { name: 'Race impact' })).toBeInTheDocument();
    const ana = screen.getAllByRole('button', { name: /Ana Alpha/ })[0]!;
    await userEvent.click(ana);
    expect(ana).toHaveAttribute('aria-pressed', 'true');
    expect(window.location.search).toMatch(/ana\.live\.SF/);
    expect(window.location.search).toMatch(/w\d+\.live\.QF/);
    expect(screen.getByRole('link', { name: 'Full standings with these picks →' }).getAttribute('href')).toMatch(/^\/\?s=.*ana\.live\.SF/);
    await userEvent.click(screen.getAllByRole('button', { name: /Ana Alpha/ })[0]!);
    expect(window.location.search).toBe('');
  });

  it('clears every pick at the event', async () => {
    window.history.replaceState(null, '', '/tournaments/live/?s=ana.live.SF_w105.live.QF_ana.next.W');
    render(<TournamentPage season={withIds()} tournamentId="live" draw={liveDraw()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Clear picks for this event' }));
    expect(window.location.search).toBe('?s=ana.next.W');
  });

  it('keeps a completed event read-only, without the panel', () => {
    render(<TournamentPage season={withIds()} tournamentId="c500" draw={completedDraw()} />);
    expect(screen.queryByRole('region', { name: 'Race impact' })).toBeNull();
    expect(screen.queryAllByRole('button', { name: /Ana Alpha/ })).toEqual([]);
  });
});

describe('TournamentPage: a draw made before qualifying ends', () => {
  it('shows open lines as Qualifier', () => {
    const lines = [1, 'bye', 105, null, ...players.slice(3, 31).map((x) => x.wtaId)] as DrawFile['lines'];
    const draw: DrawFile = { drawSize: 31, players: players.filter((x) => lines!.includes(x.wtaId)), matches: [], lines };
    render(<TournamentPage season={withIds()} tournamentId="next" draw={draw} />);
    expect(screen.getAllByText('Qualifier').length).toBeGreaterThan(0);
  });
});

