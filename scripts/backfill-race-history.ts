// One-off: fills data/race-history.json from the WTA's published race lists, week by week, from the start of the
// 2026 race list (2025-11-17) to today. Safe to rerun: it rebuilds the file from the feeds.
// Usage: npx tsx scripts/backfill-race-history.ts
import { readData, writeHistory } from '../src/update/writeData';
import { fetchRaceList } from '../src/update/feeds';
import { appendWeek, emptyHistory } from '../src/update/history';

const START = '2025-11-17';
const raw = readData('data');
let history = emptyHistory();
const today = new Date().toISOString().slice(0, 10);
for (let d = new Date(`${START}T00:00:00Z`); d.toISOString().slice(0, 10) <= today; d.setUTCDate(d.getUTCDate() + 7)) {
  const at = d.toISOString().slice(0, 10);
  const rows = await fetchRaceList(at);
  history = appendWeek(history, rows, raw.players) ?? history; // two-week events repeat the previous list
  process.stdout.write(`\r${at}: ${history.dates.length} weeks`);
  await new Promise((r) => setTimeout(r, 150));
}
writeHistory('data', history);
console.log(`\nWrote data/race-history.json: ${history.dates.length} weeks, ${Object.keys(history.players).length} players.`);
