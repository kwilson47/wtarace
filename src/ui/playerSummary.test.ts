import { describe, expect, it } from 'vitest';
import { season } from '../test/fixtures';
import { playerSummary, routePhrase, scenarioLink } from './playerSummary';

describe('player summary', () => {
  it('links an example scenario, and "as things stand" to the plain homepage', () => {
    expect(scenarioLink({})).toBe('/');
    expect(scenarioLink({ 'ana|next': 'W', 'bea|next': 'F' })).toBe('/?s=ana.next.W_bea.next.F');
  });

  it('phrases a route in plain words, merging titles', () => {
    expect(routePhrase({ 'bea|next': 'W', 'bea|clash': 'W' }, season)).toBe('wins Next Open and Clash Cup');
    expect(routePhrase({ 'bea|next': 'W', 'bea|clash': 'F' }, season)).toBe('wins Next Open and reaches the Clash Cup final');
    expect(routePhrase({ 'bea|next': 'SF' }, season)).toBe('reaches the Next Open semifinals');
    expect(routePhrase({ 'bea|next': 'R16' }, season)).toBe('reaches the Round of 16 at Next Open');
  });

  it('summarises her standing for search results', () => {
    expect(playerSummary(season, 'ana', 1, { status: 'qualified' })).toBe(
      'Ana Alpha is #1 in the 2026 Race to the WTA Finals with 1,160 points. She has qualified for the WTA Finals.',
    );
    expect(playerSummary(season, 'cat', 3, { status: 'out' })).toBe(
      'Cat Gamma is #3 in the 2026 Race to the WTA Finals with 140 points. She can no longer qualify.',
    );
    const open = { status: 'open' as const, safeAt: 900, eventsLeft: true, eligibleNow: true, missExample: null, qualifyExample: null };
    expect(playerSummary(season, 'bea', 2, { ...open, guaranteedRoute: { 'bea|next': 'W' } })).toBe(
      "Bea Beta is #2 in the 2026 Race to the WTA Finals with 765 points. She's certain to qualify if she wins Next Open.",
    );
    expect(playerSummary(season, 'bea', 2, { ...open, guaranteedRoute: null })).toBe(
      'Bea Beta is #2 in the 2026 Race to the WTA Finals with 765 points. She needs other results to go her way to qualify.',
    );
  });
});
