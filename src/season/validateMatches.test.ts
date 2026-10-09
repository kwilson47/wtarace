import { describe, expect, it } from 'vitest';
import { validateMatchFiles } from './validateMatches';

describe('validateMatchFiles', () => {
  it('accepts valid files for tracked players and reports the rest', () => {
    expect(validateMatchFiles({ ana: [] }, ['ana'])).toEqual([]);
    expect(validateMatchFiles({ zed: [] }, ['ana'])).toEqual(['data/matches/zed.json: not a tracked player']);
    expect(validateMatchFiles({ ana: [{ won: 'yes' }] }, ['ana'])[0]).toMatch(/^data\/matches\/ana\.json: /);
  });
});
