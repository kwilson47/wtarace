import { describe, expect, it } from 'vitest';
import { buildField, levelOf, sampleField } from './field';
import { mulberry32 } from './random';
import { rec, withIds } from './testHelpers';

const files = {
  ana: [
    rec({ level: 'WTA 1000', opponent: { id: 10 } }),
    rec({ level: 'WTA 1000', opponent: { id: 11 } }),
    rec({ level: 'WTA 1000', opponent: { id: 12 }, qualifying: true }),
    rec({ level: 'WTA 500', opponent: { id: 2 } }), // tracked: not field
    rec({ level: 'WTA 500', opponent: { id: 14 } }),
    rec({ level: 'WTA 250', opponent: { id: 13 } }),
  ],
};
const rating = new Map([[10, 1500], [11, 1700], [12, 1300], [13, 1400], [14, 1600], [2, 2000]]);

describe('field players', () => {
  it('pools untracked main-draw opponents per level, with the median as the level value', () => {
    const f = buildField(withIds(), files, rating, 1);
    expect(f.pools['WTA 1000'].sort()).toEqual([1500, 1700]);
    expect(f.pools['WTA 500']).toEqual([1600]);
    expect(f.pools['WTA 250']).toEqual([1400]);
    expect(f.value['WTA 1000']).toBe(1600);
  });

  it('combines the levels when a pool is too small', () => {
    const f = buildField(withIds(), files, rating);
    expect(f.pools['WTA 500'].sort()).toEqual([1400, 1500, 1600, 1700]);
    expect(f.value['WTA 250']).toBe(1550);
  });

  it('maps categories to levels and samples from the pool', () => {
    expect(levelOf('WTA1000C')).toBe('WTA 1000');
    expect(levelOf('WTA500')).toBe('WTA 500');
    expect(levelOf('GS')).toBe('WTA 500');
    const f = buildField(withIds(), files, rating, 1);
    const rng = mulberry32(1);
    for (let i = 0; i < 20; i++) expect([1500, 1700]).toContain(sampleField(f, 'WTA 1000', rng));
  });
});
