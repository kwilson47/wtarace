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

  it('says she only needs to play out her current event when that alone guarantees a place', () => {
    // The fixture's first player is alive at the in-progress Live Masters.
    render(
      <PlayerOutlook
        player={xen}
        outlook={{ status: 'open', safeAt: 1200, guaranteedRoute: {}, eventsLeft: true, eligibleNow: true, missExample: null, qualifyExample: null }}
        players={season.players}
        season={season}
        onLoad={() => {}}
      />,
    );
    const region = screen.getByRole('region', { name: 'Chances' });
    expect(region).toHaveTextContent("She's certain to qualify as long as she plays out Live Masters, whatever anyone else does.");
    expect(region).not.toHaveTextContent('needs help from others');
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
