import { describe, expect, it } from 'vitest';
import { categoryLabel, flagEmoji, formatDelta, formatPoints, formatUpdated } from './format';

describe('format', () => {
  it('builds a flag emoji from an ISO code', () => expect(flagEmoji('PL')).toBe('🇵🇱'));
  it('groups thousands', () => expect(formatPoints(4210)).toBe('4,210'));
  it('signs deltas', () => {
    expect(formatDelta(650)).toBe('+650');
    expect(formatDelta(-1200)).toBe('−1,200');
    expect(formatDelta(0)).toBe('0');
  });
  it('formats the update time in UTC', () => expect(formatUpdated('2026-10-07T14:05:00+02:00')).toBe('2026-10-07 12:05 UTC'));
  it('labels event categories for fans', () => {
    expect(categoryLabel('GS')).toBe('Grand Slam');
    expect(categoryLabel('WTA1000C')).toBe('WTA 1000');
    expect(categoryLabel('WTA1000')).toBe('WTA 1000');
    expect(categoryLabel('WTA500')).toBe('WTA 500');
    expect(categoryLabel('WTA250')).toBe('WTA 250');
    expect(categoryLabel('Other')).toBe('Other');
  });
});
