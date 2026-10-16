import { readFileSync } from 'node:fs';
import { validateSeason } from '../src/data/validateSeason';
import { validateDrawFiles } from '../src/draws/validateDraws';
import { validateMatchFiles } from '../src/season/validateMatches';
import { validateHistory } from '../src/history/validateHistory';
import { parseScenarioNotes } from '../src/data/scenarioNotes';
import { readDrawFiles, readHistory, readMatchFiles } from '../src/update/writeData';

const read = (file: string): unknown => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'));

const errors = validateSeason({
  rules: read('rules.json'),
  tournaments: read('tournaments.json'),
  players: read('players.json'),
  meta: read('meta.json'),
});

const players = read('players.json') as { id: string }[];
errors.push(...validateMatchFiles(readMatchFiles(new URL('../data/', import.meta.url).pathname), players.map((p) => p.id)));
const tournaments = read('tournaments.json') as { id: string }[];
errors.push(...validateDrawFiles(readDrawFiles(new URL('../data/', import.meta.url).pathname), tournaments.map((t) => t.id)));
const history = readHistory(new URL('../data/', import.meta.url).pathname);
if (history) errors.push(...validateHistory(history, players.map((p) => p.id)));
try {
  parseScenarioNotes(read('scenarios.json'));
} catch (e) {
  errors.push(`scenarios.json: ${e instanceof Error ? e.message : String(e)}`);
}

if (errors.length > 0) {
  console.error(`Data validation failed (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log('Data OK: schema valid, every official race total reproduced, match, draw and history files valid.');
