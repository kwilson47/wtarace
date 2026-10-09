import { describe, expect, it } from 'vitest';
import { raceRows, snapshot, updaterSeason } from './testFeeds';
import { updateSeason } from './updateSeason';

describe('updateSeason: totals', () => {
  it('takes official totals from the race ranking feed', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.race = raceRows(raw, { cat: 141 });
    const result = updateSeason(raw, snap);
    expect(result.raw.players.find((p) => p.id === 'cat')!.officialRaceTotal).toBe(141);
    expect(result.changes).toContain('Race total: Cat Gamma 140 → 141');
  });

  it('reports a total that no longer reproduces, instead of publishing', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.race = raceRows(raw, { bea: 800 });
    expect(updateSeason(raw, snap).problems).toContain('Bea Beta (bea): engine total 765 ≠ official 800');
  });

  it('reports a tracked player missing from the race feed', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.race = snap.race.filter((r) => r.player.id !== 3);
    expect(updateSeason(raw, snap).problems).toContain('Cat Gamma is tracked but missing from the race ranking feed.');
  });

  it('never changes the input it was given', () => {
    const raw = updaterSeason();
    const copy = structuredClone(raw);
    updateSeason(raw, snapshot(raw));
    expect(raw).toEqual(copy);
  });
});
