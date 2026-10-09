import { readFileSync } from 'node:fs';
import { validateSeason } from '../src/data/validateSeason';
import { validateMatchFiles } from '../src/season/validateMatches';
import { readMatchFiles } from '../src/update/writeData';

const read = (file: string): unknown => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'));

const errors = validateSeason({
  rules: read('rules.json'),
  tournaments: read('tournaments.json'),
  players: read('players.json'),
  meta: read('meta.json'),
});

const players = read('players.json') as { id: string }[];
errors.push(...validateMatchFiles(readMatchFiles(new URL('../data/', import.meta.url).pathname), players.map((p) => p.id)));

if (errors.length > 0) {
  console.error(`Data validation failed (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log('Data OK: schema valid, every official race total reproduced, match files valid.');
