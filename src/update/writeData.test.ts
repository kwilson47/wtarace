import { cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readData, writeData } from './writeData';

describe('writeData', () => {
  it('writes the real data files back byte for byte when nothing changed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wta-data-'));
    cpSync(join(process.cwd(), 'data'), dir, { recursive: true });
    writeData(dir, readData(dir));
    for (const f of ['players.json', 'tournaments.json', 'rules.json', 'meta.json']) {
      expect(readFileSync(join(dir, f), 'utf8')).toBe(readFileSync(join(process.cwd(), 'data', f), 'utf8'));
    }
  });
});
