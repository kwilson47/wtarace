// Read-only survey for the off-season "track everyone" plan: for every player on the WTA race list, builds her
// race-year results from her match feed (the same code the updater uses for new players) and checks them
// against the official total and event count. Writes a Markdown report; changes no data.
//
// Usage: npx tsx scripts/survey-race.ts <report.md> [--cache <dir>]
// --cache keeps the raw feeds in <dir>, so a rerun doesn't fetch them again.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseOrThrow } from '../src/data/schema';
import { officialRace } from '../src/engine/countRace';
import type { PlayerMatch, RaceRow } from '../src/update/feedTypes';
import { getJson } from '../src/update/feeds';
import { buildResults, candidates, insertTournaments } from '../src/update/newPlayers';
import type { Ctx } from '../src/update/shared';
import { readData } from '../src/update/writeData';

const API = 'https://api.wtatennis.com/tennis';
const [out, ...rest] = process.argv.slice(2);
if (!out) throw new Error('usage: npx tsx scripts/survey-race.ts <report.md> [--cache <dir>]');
const cacheDir = rest[0] === '--cache' ? rest[1] : undefined;
if (cacheDir) mkdirSync(cacheDir, { recursive: true });

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function cached<T>(name: string, load: () => Promise<T>): Promise<T> {
  const file = cacheDir ? join(cacheDir, `${name}.json`) : undefined;
  if (file && existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')) as T;
  const value = await load();
  if (file) writeFileSync(file, JSON.stringify(value));
  await pause(150); // be gentle with the WTA's API
  return value;
}
const rows = (body: unknown, key: string) => (Array.isArray(body) ? body : ((body as Record<string, unknown>)[key] as unknown[]));

const raw = readData('data');
const raceStart = raw.tournaments.filter((t) => t.wtaId !== undefined).map((t) => t.startDate).sort()[0]!;

// The whole race list, page by page.
const race: (RaceRow & { rankedAt?: string })[] = [];
for (let page = 0; ; page++) {
  const batch = (await cached(`race-${page}`, async () =>
    rows(await getJson(`${API}/players/ranked?page=${page}&pageSize=100&type=rankSingles&sort=asc&metric=CHAMPSINGLES&name=`), 'content'),
  )) as (RaceRow & { rankedAt?: string })[];
  race.push(...batch);
  if (batch.length < 100) break;
}
race.sort((a, b) => a.ranking - b.ranking);
// Events credited after the list's date aren't in its totals yet (e.g. Beijing), so they're left out.
const rankedAt = race.map((r) => r.rankedAt?.slice(0, 10) ?? '').sort().at(-1)!;

async function playerFeed(id: number): Promise<PlayerMatch[]> {
  return cached(`player-${id}`, async () => {
    const all: PlayerMatch[] = [];
    for (let page = 0; page < 5; page++) {
      const batch = rows(await getJson(`${API}/players/${id}/matches?page=${page}&pageSize=100&sort=desc&type=S`), 'matches') as PlayerMatch[];
      all.push(...batch);
      if (batch.length < 100 || batch.at(-1)!.StartDate.slice(0, 10) < raceStart) break;
      await pause(150);
    }
    return all;
  });
}

type Outcome = 'exact' | 'events short' | 'events over' | 'points differ' | 'cannot build' | 'feed failed';
interface Row { ranking: number; name: string; tracked: boolean; outcome: Outcome; detail: string; problems: string[] }
const report: Row[] = [];
const tracked = new Set(raw.players.map((p) => p.wtaId));

for (const [i, row] of race.entries()) {
  const name = row.player.fullName;
  process.stdout.write(`\r${i + 1}/${race.length} ${name.padEnd(30)}`);
  const base = { ranking: row.ranking, name, tracked: tracked.has(row.player.id) };
  let feed: PlayerMatch[];
  try {
    feed = await playerFeed(row.player.id);
  } catch (error) {
    report.push({ ...base, outcome: 'feed failed', detail: error instanceof Error ? error.message : String(error), problems: [] });
    continue;
  }
  // Only events credited by the list's date.
  const credited = feed.filter((m) => (m.tournament?.endDate ?? m.StartDate.slice(0, 10)) <= rankedAt);
  const ctx: Ctx = { raw: structuredClone(raw), snap: {} as Ctx['snap'], changes: [], notes: [], problems: [] };
  const built = buildResults(ctx, row.player.id, credited);
  // The updater's own season skips in-progress events; here every event credited by the list's date counts.
  const tournaments = insertTournaments(ctx.raw.tournaments, built.created).map((t) =>
    t.status !== 'completed' && t.endDate <= rankedAt ? { ...t, status: 'completed' as const } : t,
  );
  const season = parseOrThrow({ ...ctx.raw, tournaments });
  const total = officialRace(built.results, season.tournaments, season.rules).total;
  const events = built.results.length;
  const official = `${row.points} from ${row.tournamentsPlayed}`;
  const ours = `${total} from ${events}`;
  let outcome: Outcome;
  let detail: string;
  if (built.problems.length && (total !== row.points || events !== row.tournamentsPlayed)) {
    outcome = 'cannot build';
    detail = `ours ${ours}, official ${official}`;
  } else if (total === row.points && events === row.tournamentsPlayed) {
    outcome = 'exact';
    detail = official;
  } else if (total === row.points && events < row.tournamentsPlayed) {
    const missing = row.tournamentsPlayed - events;
    const fits = candidates({ ...ctx, raw: { ...ctx.raw, tournaments } }, built.results, row.points, missing);
    outcome = 'events short';
    detail = `${missing} zero-pointer${missing === 1 ? '' : 's'} to attribute${fits.length ? `; e.g. ${fits.slice(0, 2).join('; ')}` : ''}`;
  } else if (total === row.points) {
    outcome = 'events over';
    detail = `ours ${ours}, official ${official}`;
  } else {
    outcome = 'points differ';
    detail = `ours ${ours}, official ${official} (${total > row.points ? '+' : ''}${total - row.points})`;
  }
  report.push({ ...base, outcome, detail, problems: built.problems });
}
process.stdout.write('\n');

// The report.
const order: Outcome[] = ['exact', 'events short', 'events over', 'points differ', 'cannot build', 'feed failed'];
const count = (o: Outcome, rows = report) => rows.filter((r) => r.outcome === o).length;
const band = (from: number, to: number) => report.filter((r) => r.ranking >= from && r.ranking <= to);
const bands: [string, Row[]][] = [['1–40', band(1, 40)], ['41–100', band(41, 100)], ['101–200', band(101, 200)], ['201+', band(201, 99999)]];
const problemCounts = new Map<string, number>();
for (const r of report) for (const p of r.problems) problemCounts.set(p, (problemCounts.get(p) ?? 0) + 1);
const lines = [
  `# Race survey: every player on the WTA race list`,
  ``,
  `Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by \`scripts/survey-race.ts\` against the race list dated ${rankedAt}. ` +
    `Each player's race-year results are built from her match feed with the updater's own code (no zero-pointers, no manual attributions), ` +
    `using only events credited by that date, and compared with her official total and event count.`,
  ``,
  `## Summary (${report.length} players)`,
  ``,
  `| Outcome | All | ${bands.map(([l]) => l).join(' | ')} |`,
  `|---|---|${bands.map(() => '---').join('|')}|`,
  ...order.map((o) => `| ${o} | ${count(o)} | ${bands.map(([, rows]) => count(o, rows)).join(' | ')} |`),
  ``,
  `- **exact:** total and event count both reproduce.`,
  `- **events short:** the total reproduces but the WTA counts more events: zero-pointers to attribute.`,
  `- **events over / points differ:** the feed and the official figures disagree in a way zero-pointers can't explain.`,
  `- **cannot build:** she played events the updater can't add automatically (listed below).`,
  ``,
  `## Why results couldn't be built`,
  ``,
  ...[...problemCounts].sort((a, b) => b[1] - a[1]).map(([p, n]) => `- ${n} × ${p}`),
  ``,
  `## Players that don't reproduce exactly`,
  ``,
  `| Race # | Player | Tracked | Outcome | Detail |`,
  `|---|---|---|---|---|`,
  ...report.filter((r) => r.outcome !== 'exact').map((r) => `| ${r.ranking} | ${r.name} | ${r.tracked ? 'yes' : ''} | ${r.outcome} | ${r.detail}${r.problems.length ? ` — ${r.problems.join(' ')}` : ''} |`),
  ``,
];
writeFileSync(out, lines.join('\n'));
console.log(`Wrote ${out}: ${order.map((o) => `${o} ${count(o)}`).join(', ')}.`);
