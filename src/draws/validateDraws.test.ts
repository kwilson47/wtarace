import { describe, expect, it } from 'vitest';
import { validateDrawFiles } from './validateDraws';

describe('validateDrawFiles', () => {
  it('accepts valid draws for tracked events and reports the rest', () => {
    expect(validateDrawFiles({ live: { drawSize: 0, players: [], matches: [] } }, ['live'])).toEqual([]);
    expect(validateDrawFiles({ nope: { drawSize: 0, players: [], matches: [] } }, ['live'])).toEqual(['data/draws/nope.json: not a tracked tournament']);
    expect(validateDrawFiles({ live: { drawSize: 'x' } }, ['live'])[0]).toMatch(/^data\/draws\/live\.json: /);
  });
});
