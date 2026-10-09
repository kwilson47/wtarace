import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { season } from '../test/fixtures';
import { PlayerOutlook } from './PlayerOutlook';
import { useOutlook } from './useOutlook';

const xen = { ...season.players[0]!, name: 'Xen Xi' };

describe('PlayerOutlook', () => {
  it('says it depends on others when she has no events left, even with no proven safe total', () => {
    render(
      <PlayerOutlook
        player={xen}
        outlook={{ status: 'open', safeAt: null, guaranteedRoute: null, eventsLeft: false, eligibleNow: true, missExample: null, qualifyExample: null }}
        players={season.players}
        season={season}
        onLoad={() => {}}
      />,
    );
    expect(screen.getByRole('region', { name: 'Chances' })).toHaveTextContent('She has no events left, so it depends on other players.');
  });

  it('offers links instead of load buttons when given scenarioHref', () => {
    render(
      <PlayerOutlook
        player={xen}
        outlook={{ status: 'open', safeAt: 900, guaranteedRoute: null, eventsLeft: true, eligibleNow: true, missExample: { 'bea|next': 'W' }, qualifyExample: {} }}
        players={season.players}
        season={season}
        heading="What she needs"
        scenarioHref={(s) => (Object.keys(s).length ? '/?s=x' : '/')}
      />,
    );
    expect(screen.getByRole('heading', { name: 'What she needs' })).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Try this scenario' }).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/', '/?s=x']);
    expect(screen.queryByRole('button', { name: 'Load this scenario' })).toBeNull();
  });

  it('says so when her chances could not be worked out, instead of waiting forever', () => {
    render(<PlayerOutlook player={xen} outlook="failed" players={season.players} season={season} onLoad={() => {}} />);
    expect(screen.getByRole('region', { name: 'Chances' })).toHaveTextContent("We couldn't work out her chances.");
  });
});

describe('useOutlook', () => {
  it('reports a failure rather than throwing when the calculation errors', () => {
    const { result } = renderHook(() => useOutlook(season, 'nobody'));
    expect(result.current).toBe('failed');
  });
});
