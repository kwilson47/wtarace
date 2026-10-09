import { describe, expect, it } from 'vitest';
import { reconcileScenario } from './reconcile';
import { pickKey } from '../engine/types';
import { season } from '../test/fixtures';

describe('reconcileScenario', () => {
  it('keeps valid picks and lists every dropped pick with a reason', () => {
    const result = reconcileScenario(
      {
        [pickKey('ana', 'live')]: 'W',
        [pickKey('zed', 'live')]: 'W',
        [pickKey('ana', 'nope')]: 'W',
        [pickKey('ana', 'slam')]: 'W',
        [pickKey('bea', 'live')]: 'SF',
        [pickKey('ana', 'clash')]: 'XX',
      },
      season,
    );
    expect(result.scenario).toEqual({ [pickKey('ana', 'live')]: 'W' });
    expect(result.ignored).toEqual([
      { pick: 'zed at live: W', reason: 'unknown player' },
      { pick: 'ana at nope: W', reason: 'unknown tournament' },
      { pick: 'Ana Alpha at Slam Open: W', reason: 'tournament already completed' },
      { pick: 'Bea Beta at Live Masters: SF', reason: 'player is already out' },
      { pick: 'Ana Alpha at Clash Cup: XX', reason: 'not a valid round for this tournament' },
    ]);
  });

  it('returns an empty scenario unchanged', () => {
    expect(reconcileScenario({}, season)).toEqual({ scenario: {}, ignored: [] });
  });
  it('keeps picks for untracked players (w<WTA id>) at events still open, with a valid round', () => {
    const { scenario, ignored } = reconcileScenario(
      { [pickKey('w317964', 'live')]: 'SF', [pickKey('w1', 'slam')]: 'F', [pickKey('w2', 'live')]: 'ZZ', [pickKey('w3', 'nowhere')]: 'F' },
      season,
    );
    expect(scenario).toEqual({ [pickKey('w317964', 'live')]: 'SF' });
    expect(ignored.map((i) => i.reason)).toEqual(['not a pick for an open draw', 'not a pick for an open draw', 'not a pick for an open draw']);
  });
});
