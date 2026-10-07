import { describe, expect, it } from 'vitest';
import { decodeScenario, encodeScenario } from './url';
import { pickKey } from '../engine/types';

describe('scenario URL codec', () => {
  it('round-trips a scenario', () => {
    const scenario = { [pickKey('bea', 'next')]: 'F', [pickKey('ana', 'live')]: 'W' };
    const encoded = encodeScenario(scenario);
    expect(encoded).toBe('ana.live.W_bea.next.F');
    expect(decodeScenario(encoded)).toEqual({ scenario, malformed: [] });
  });

  it('survives URLSearchParams unchanged', () => {
    const encoded = encodeScenario({ [pickKey('ana-b', 'wuhan-open')]: 'QF' });
    const params = new URLSearchParams({ s: encoded });
    expect(params.toString()).toBe(`s=${encoded}`);
  });

  it('encodes an empty scenario as an empty string', () => {
    expect(encodeScenario({})).toBe('');
    expect(decodeScenario(null)).toEqual({ scenario: {}, malformed: [] });
    expect(decodeScenario('')).toEqual({ scenario: {}, malformed: [] });
  });

  it('keeps good entries and reports malformed ones', () => {
    const result = decodeScenario('ana.live.W_ana.next_ANA.next.W_ana.next.W.extra_<script>__bea.next.F');
    expect(result.scenario).toEqual({ [pickKey('ana', 'live')]: 'W', [pickKey('bea', 'next')]: 'F' });
    expect(result.malformed).toEqual(['ana.next', 'ANA.next.W', 'ana.next.W.extra', '<script>']);
  });
});
