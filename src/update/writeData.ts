import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SeasonInput } from '../data/schema';

const NAMES = { rules: 'rules.json', tournaments: 'tournaments.json', players: 'players.json', meta: 'meta.json' } as const;

export function readData(dir: string): SeasonInput {
  const read = (name: string) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  return { rules: read(NAMES.rules), tournaments: read(NAMES.tournaments), players: read(NAMES.players), meta: read(NAMES.meta) };
}

/** Writes the season in the files' existing style: 2-space JSON, meta on one line, trailing newlines kept. */
export function writeData(dir: string, raw: SeasonInput): void {
  const write = (name: string, text: string) => {
    const path = join(dir, name);
    const newline = readFileSync(path, 'utf8').endsWith('\n') ? '\n' : '';
    writeFileSync(path, text + newline);
  };
  write(NAMES.players, JSON.stringify(raw.players, null, 2));
  write(NAMES.tournaments, JSON.stringify(raw.tournaments, null, 2));
  write(NAMES.rules, JSON.stringify(raw.rules, null, 2));
  write(NAMES.meta, `{ "lastUpdated": "${raw.meta.lastUpdated}" }`);
}
