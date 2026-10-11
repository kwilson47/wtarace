import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SeasonInput } from '../data/schema';
import type { DrawFile } from '../draws/drawSchema';
import type { RaceHistory } from '../history/historySchema';
import type { MatchRecord } from '../season/matchSchema';

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

/** data/matches/<player id>.json for every file present. */
export function readMatchFiles(dir: string): Record<string, MatchRecord[]> {
  const folder = join(dir, 'matches');
  if (!existsSync(folder)) return {};
  return Object.fromEntries(
    readdirSync(folder)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(folder, f), 'utf8')) as MatchRecord[]]),
  );
}

export function writeMatchFiles(dir: string, files: Record<string, MatchRecord[]>): void {
  const folder = join(dir, 'matches');
  mkdirSync(folder, { recursive: true });
  for (const [id, records] of Object.entries(files)) writeFileSync(join(folder, `${id}.json`), `${JSON.stringify(records, null, 2)}\n`);
}

/** data/draws/<tournament id>.json for every file present. */
export function readDrawFiles(dir: string): Record<string, DrawFile> {
  const folder = join(dir, 'draws');
  if (!existsSync(folder)) return {};
  return Object.fromEntries(
    readdirSync(folder)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [f.slice(0, -5), JSON.parse(readFileSync(join(folder, f), 'utf8')) as DrawFile]),
  );
}

export function writeDrawFiles(dir: string, files: Record<string, DrawFile>): void {
  const folder = join(dir, 'draws');
  mkdirSync(folder, { recursive: true });
  for (const [id, draw] of Object.entries(files)) writeFileSync(join(folder, `${id}.json`), `${JSON.stringify(draw, null, 2)}\n`);
}

const HISTORY = 'race-history.json';

export function readHistory(dir: string): RaceHistory | null {
  const path = join(dir, HISTORY);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as RaceHistory) : null;
}

/** One player per line keeps diffs readable. */
export function writeHistory(dir: string, h: RaceHistory): void {
  const players = Object.entries(h.players)
    .map(([id, weeks]) => `    ${JSON.stringify(id)}: ${JSON.stringify(weeks)}`)
    .join(',\n');
  const text = `{\n  "dates": ${JSON.stringify(h.dates)},\n  "eighth": ${JSON.stringify(h.eighth)},\n  "players": {\n${players}\n  }\n}\n`;
  writeFileSync(join(dir, HISTORY), text);
}
