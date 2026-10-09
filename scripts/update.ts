// Refreshes data/ from the official WTA feeds.
// Usage: tsx scripts/update.ts [--dry-run] [--out result.json] [--message commit-message.txt]
import { writeFileSync } from 'node:fs';
import { fetchSnapshot } from '../src/update/feeds';
import { updateSeason } from '../src/update/updateSeason';
import { readData, writeData } from '../src/update/writeData';

const args = process.argv.slice(2);
const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dryRun = args.includes('--dry-run');
const dir = new URL('../data/', import.meta.url).pathname;

type Status = 'changed' | 'unchanged' | 'blocked' | 'feed-error';
interface Report { status: Status; at: string; changes: string[]; notes: string[]; problems: string[]; message?: string }

function finish(report: Report): void {
  const out = option('--out');
  if (out) writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`Update: ${report.status}${dryRun ? ' (dry run, nothing written)' : ''}`);
  for (const [label, lines] of [['Changes', report.changes], ['Notes', report.notes], ['Problems', report.problems]] as const) {
    if (lines.length) console.log(`${label}:\n${lines.map((l) => `  - ${l}`).join('\n')}`);
  }
  if (report.message) console.log(report.message);
}

const at = new Date().toISOString();
const raw = readData(dir);
// Only a failed fetch counts as a feed outage (quiet; the next hour retries). Anything after that is
// reported as blocked, so it reaches the data-update issue instead of stalling silently.
let snapshot;
try {
  snapshot = await fetchSnapshot(raw);
} catch (error) {
  finish({ status: 'feed-error', at, changes: [], notes: [], problems: [], message: String(error) });
  process.exit(0);
}
const result = updateSeason(raw, snapshot);
const base = { at, changes: result.changes, notes: result.notes, problems: result.problems };
if (result.problems.length) finish({ status: 'blocked', ...base });
else if (!result.changed) finish({ status: 'unchanged', ...base });
else {
  if (!dryRun) {
    result.raw.meta.lastUpdated = `${at.slice(0, 16)}:00Z`;
    writeData(dir, result.raw);
    const messageFile = option('--message');
    if (messageFile) writeFileSync(messageFile, `data: automatic update\n\n${result.changes.map((c) => `- ${c}`).join('\n')}\n`);
  }
  finish({ status: 'changed', ...base });
}
