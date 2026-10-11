# Race History Charts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chart how the race unfolded week by week, from the WTA's published race lists. There's a comparison page at `/race-history/` and a per-player chart on player pages.

**Architecture:**
- **Data:** `data/race-history.json` holds the published dates, each tracked player's `[rank, points]` per date, and the 8th-place points per date.
  - Pure functions in `src/update/history.ts` build and extend it.
  - A backfill script fills it once, and a new updater stage appends each newly published week.
- **UI:** a dependency-free SVG `RaceChart` serves both the comparison page (`RaceHistoryPage`, on the list template) and a section on `PlayerPage`.

**Tech Stack:** TypeScript, React 19 (SSR plus hydration), Zod 4, Vitest, Playwright, tsx.

**Spec:** `docs/superpowers/specs/2026-10-11-race-history-design.md`

## Global Constraints

- Run Node via `export PATH=/opt/homebrew/bin:$PATH`. After `npx tsc -b`, delete `tsconfig.tsbuildinfo`.
- The race feed is `https://api.wtatennis.com/tennis/players/ranked?page=<n>&pageSize=100&type=rankSingles&sort=asc&metric=CHAMPSINGLES&name=` plus `&at=<YYYY-MM-DD>` for a past date.
  - Pages aren't in rank order: collect every page until a short one, then sort by `ranking`.
  - `rankedAt` is the published date (`YYYY-MM-DDT00:00:00Z`).
- The 2026 race list starts on **2025-11-17**. Earlier dates return the frozen 2025 race.
- History is published fact: it never blocks an update. A failed fetch keeps the file and adds a note.
- Limits and defaults:
  - at most **10** players on the comparison chart;
  - the default is the current **top 10** by official total;
  - the default view is **points**.
- Copy:
  - "Race over time", "Race over time →" and "Compare with others →";
  - the reference line label is "8th place";
  - "Race history isn't available yet."
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Weeks the WTA doesn't publish** (two-week events): there must be no duplicate dates, and the chart must space dates by time, not by index.
- **Off-season weeks** (Nov 17 to early Jan) that repeat the same list: kept as published, so the chart shows a flat stretch.
- **A newly tracked player:** her past weeks are filled from the stored dates. That's one full list per date, about 40 lists of up to 4 pages each. It must be rare and must never block.
- **Phone width (360px):** end labels must not overlap illegibly, and the tooltip must not overflow.
- **Hydration:** URL state (`?p=`, `?view=`) is read after mount, and the hover state starts empty.

---

### Task 1: History data, schema and pure updates

**Files:**
- Create: `src/history/historySchema.ts`, `src/history/validateHistory.ts`, `src/history/history.test.ts`, `src/update/history.ts`
- Modify: `src/update/feedTypes.ts` (`RaceRow.rankedAt?: string`), `src/update/writeData.ts` (`readHistory`, `writeHistory`), `scripts/validate.ts`

**Interfaces:** Produces:
- `RaceHistory { dates: string[]; players: Record<string, (readonly [number, number] | null)[]>; eighth: (number | null)[] }` and `raceHistorySchema`;
- `validateHistory(h: unknown, trackedIds: string[]): string[]`;
- `emptyHistory()`;
- `listDate(rows: RaceRow[]): string | null`;
- `appendWeek(h, rows, tracked: { id: string; wtaId?: number }[]): RaceHistory | null`, which returns null when the list's date isn't newer than the last stored date;
- `fillPlayer(h, playerId, wtaId, listsByDate: Record<string, RaceRow[]>): RaceHistory`;
- `readHistory(dir): RaceHistory | null` and `writeHistory(dir, h)`.

- [ ] **Step 1: Failing tests,** `src/history/history.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { RaceRow } from '../update/feedTypes';
import { appendWeek, emptyHistory, fillPlayer, listDate } from '../update/history';
import { validateHistory } from './validateHistory';

const row = (ranking: number, id: number, points: number, date = '2026-03-02'): RaceRow => ({
  ranking, points, tournamentsPlayed: 0, rankedAt: `${date}T00:00:00Z`, player: { id, fullName: `P${id}`, countryCode: 'USA' },
});
// Ten players on the list, ids 1..10, ranked in order; tracked players are ana (1), bea (2) and cat (99, not on the list).
const list = (date: string, bump = 0) => Array.from({ length: 10 }, (_, i) => row(i + 1, i + 1, 1000 - i * 50 + bump, date)).reverse();
const tracked = [{ id: 'ana', wtaId: 1 }, { id: 'bea', wtaId: 2 }, { id: 'cat', wtaId: 99 }];

describe('race history', () => {
  it('appends a newly published week, aligned for every tracked player, with the 8th-place points', () => {
    const h = appendWeek(emptyHistory(), list('2026-03-02'), tracked)!;
    expect(h.dates).toEqual(['2026-03-02']);
    expect(h.players).toEqual({ ana: [[1, 1000]], bea: [[2, 950]], cat: [null] });
    expect(h.eighth).toEqual([650]);
    const next = appendWeek(h, list('2026-03-16', 100), tracked)!;
    expect(next.dates).toEqual(['2026-03-02', '2026-03-16']);
    expect(next.players.ana).toEqual([[1, 1000], [1, 1100]]);
  });

  it("ignores a list that isn't newer than the last stored week", () => {
    const h = appendWeek(emptyHistory(), list('2026-03-16'), tracked)!;
    expect(appendWeek(h, list('2026-03-16'), tracked)).toBeNull();
    expect(appendWeek(h, list('2026-03-02'), tracked)).toBeNull();
    expect(listDate([])).toBeNull();
  });

  it("gives a player added later her past weeks, and a new week's entry for players who had none", () => {
    let h = appendWeek(emptyHistory(), list('2026-03-02'), tracked)!;
    h = appendWeek(h, list('2026-03-16'), [...tracked, { id: 'dee', wtaId: 4 }])!;
    expect(h.players.dee).toEqual([null, [4, 850]]);
    h = fillPlayer(h, 'dee', 4, { '2026-03-02': list('2026-03-02') });
    expect(h.players.dee).toEqual([[4, 850], [4, 850]]);
  });

  it('validates lengths, values and players', () => {
    const h = appendWeek(emptyHistory(), list('2026-03-02'), tracked)!;
    expect(validateHistory(h, ['ana', 'bea', 'cat'])).toEqual([]);
    expect(validateHistory({ ...h, eighth: [] }, ['ana', 'bea', 'cat'])[0]).toMatch(/eighth/);
    expect(validateHistory({ ...h, players: { ...h.players, zed: [[1, 5]] } }, ['ana', 'bea', 'cat'])[0]).toMatch(/zed/);
    expect(validateHistory({ ...h, dates: ['2026-03-02', '2026-03-02'], eighth: [1, 1], players: {} }, [])[0]).toMatch(/dates/);
  });
});
```

Run `npx vitest run src/history`. Expected: FAIL (modules missing).

- [ ] **Step 2: Implement.**

`src/history/historySchema.ts`:

```ts
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const week = z.tuple([z.number().int().positive(), z.number().int().nonnegative()]).nullable();

/** The race as the WTA published it each week: dates, each tracked player's [position, points], and the 8th-place points. */
export const raceHistorySchema = z.object({
  dates: z.array(isoDate),
  players: z.record(z.string(), z.array(week)),
  eighth: z.array(z.number().int().nonnegative().nullable()),
});

export type RaceHistory = z.infer<typeof raceHistorySchema>;
```

`src/history/validateHistory.ts`:

```ts
import { raceHistorySchema } from './historySchema';

/** Problems with data/race-history.json: shape, aligned lengths, ordered dates, and only tracked players. */
export function validateHistory(raw: unknown, trackedIds: string[]): string[] {
  const parsed = raceHistorySchema.safeParse(raw);
  if (!parsed.success) return [`data/race-history.json: ${parsed.error.issues[0]?.message ?? 'invalid'}`];
  const h = parsed.data;
  const errors: string[] = [];
  if (h.dates.some((d, i) => i > 0 && d <= h.dates[i - 1]!)) errors.push('data/race-history.json: dates must be in order, without repeats');
  if (h.eighth.length !== h.dates.length) errors.push('data/race-history.json: eighth must have one entry per date');
  for (const [id, weeks] of Object.entries(h.players)) {
    if (!trackedIds.includes(id)) errors.push(`data/race-history.json: ${id} is not a tracked player`);
    else if (weeks.length !== h.dates.length) errors.push(`data/race-history.json: ${id} must have one entry per date`);
  }
  return errors;
}
```

`src/update/history.ts`:

```ts
import type { RaceHistory } from '../history/historySchema';
import type { RaceRow } from './feedTypes';

export const emptyHistory = (): RaceHistory => ({ dates: [], players: {}, eighth: [] });

/** A race list's published date. */
export function listDate(rows: RaceRow[]): string | null {
  const dates = rows.map((r) => r.rankedAt?.slice(0, 10)).filter((d): d is string => !!d).sort();
  return dates.at(-1) ?? null;
}

const entryFor = (rows: RaceRow[], wtaId: number | undefined): readonly [number, number] | null => {
  const row = wtaId === undefined ? undefined : rows.find((r) => r.player.id === wtaId);
  return row ? [row.ranking, row.points] : null;
};

/**
 * The history with one more published week, or null if this list isn't newer than the last stored week.
 * Every tracked player gets an entry for the week (null when she isn't on the list).
 */
export function appendWeek(h: RaceHistory, rows: RaceRow[], tracked: { id: string; wtaId?: number }[]): RaceHistory | null {
  const date = listDate(rows);
  if (!date || (h.dates.length > 0 && date <= h.dates.at(-1)!)) return null;
  const byPoints = [...rows].sort((a, b) => a.ranking - b.ranking);
  const players: RaceHistory['players'] = {};
  for (const [id, weeks] of Object.entries(h.players)) players[id] = [...weeks];
  for (const p of tracked) players[p.id] ??= h.dates.map(() => null);
  for (const p of tracked) players[p.id]!.push(entryFor(rows, p.wtaId));
  return { dates: [...h.dates, date], players, eighth: [...h.eighth, byPoints[7]?.points ?? null] };
}

/** Fills a player's past weeks from the lists published on the stored dates (dates without a list stay as they are). */
export function fillPlayer(h: RaceHistory, playerId: string, wtaId: number, listsByDate: Record<string, RaceRow[]>): RaceHistory {
  const current = h.players[playerId] ?? h.dates.map(() => null);
  const weeks = h.dates.map((d, i) => (listsByDate[d] ? entryFor(listsByDate[d]!, wtaId) : (current[i] ?? null)));
  return { ...h, players: { ...h.players, [playerId]: weeks } };
}
```

In `feedTypes.ts`, add to `RaceRow`: `/** The list's published date (ISO); historical rows report tournamentsPlayed 0. */ rankedAt?: string;`

In `writeData.ts`:

```ts
const HISTORY = 'race-history.json';

export function readHistory(dir: string): RaceHistory | null {
  const path = join(dir, HISTORY);
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as RaceHistory) : null;
}

/** One week per line keeps diffs readable. */
export function writeHistory(dir: string, h: RaceHistory): void {
  const players = Object.entries(h.players)
    .map(([id, weeks]) => `    ${JSON.stringify(id)}: ${JSON.stringify(weeks)}`)
    .join(',\n');
  const text = `{\n  "dates": ${JSON.stringify(h.dates)},\n  "eighth": ${JSON.stringify(h.eighth)},\n  "players": {\n${players}\n  }\n}\n`;
  writeFileSync(join(dir, HISTORY), text);
}
```

Import the `RaceHistory` type from `../history/historySchema`.

In `scripts/validate.ts`, after the draw files:

```ts
const history = readHistory(new URL('../data/', import.meta.url).pathname);
if (history) errors.push(...validateHistory(history, players.map((p) => p.id)));
```

Also change the success message to end "…match, draw and history files valid."

- [ ] **Step 3:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 4:** Commit: `feat(history): race history data, schema and weekly updates`.

---

### Task 2: Backfill and the updater stage

**Files:**
- Create: `scripts/backfill-race-history.ts`, `data/race-history.json` (generated)
- Modify: `src/update/feeds.ts` (`fetchRaceList`), `scripts/update.ts`, `data/SOURCES.md`

**Interfaces:**
- Consumes: Task 1.
- Produces: `fetchRaceList(at?: string, get = getJson): Promise<RaceRow[]>`, which returns every page sorted by ranking.

- [ ] **Step 1: `fetchRaceList`** in `feeds.ts`:

```ts
/** A whole race list (every page, in ranking order): the current one, or the one published on or before `at`. */
export async function fetchRaceList(at?: string, get: GetJson = getJson): Promise<RaceRow[]> {
  const rows: RaceRow[] = [];
  for (let page = 0; page < 20; page++) {
    const url = `${API}/players/ranked?page=${page}&pageSize=100&type=rankSingles&sort=asc&metric=CHAMPSINGLES&name=${at ? `&at=${at}` : ''}`;
    const batch = arrayOf<RaceRow>(await get(url), 'content', url);
    rows.push(...batch);
    if (batch.length < 100) break;
  }
  return rows.sort((a, b) => a.ranking - b.ranking);
}
```

Add a test to `src/update/feeds.test.ts` if that file exists. Otherwise create it. The test checks that two pages (100 rows plus 3 rows) are fetched and sorted by ranking, using a fake `get`:

```ts
import { describe, expect, it } from 'vitest';
import { fetchRaceList } from './feeds';

describe('fetchRaceList', () => {
  it('reads every page and sorts by ranking, with the date when asked', async () => {
    const urls: string[] = [];
    const row = (ranking: number) => ({ ranking, points: 1, tournamentsPlayed: 0, player: { id: ranking, fullName: '', countryCode: '' } });
    const get = async (url: string) => {
      urls.push(url);
      return { content: url.includes('page=0') ? Array.from({ length: 100 }, (_, i) => row(200 - i)) : [row(3), row(1), row(2)] };
    };
    const rows = await fetchRaceList('2026-03-02', get);
    expect(rows.map((r) => r.ranking).slice(0, 3)).toEqual([1, 2, 3]);
    expect(rows).toHaveLength(103);
    expect(urls.every((u) => u.endsWith('&at=2026-03-02'))).toBe(true);
  });
});
```

Run it and see it fail, then implement, then see it pass.

- [ ] **Step 2: `scripts/backfill-race-history.ts`:**

```ts
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
```

Run it. Expected:
- about 40 weeks and 41 players;
- the first date is 2025-11-17;
- the last date matches the current list's `rankedAt` (2026-09-28 until Beijing is credited).

Then:
- run `npm run validate` (expected: OK);
- spot-check that Rybakina's last week is `[1, 7492]`;
- run `jq '.players["qinwen-zheng"] | map(select(. != null)) | length' data/race-history.json` (expected: greater than 0).

- [ ] **Step 3: The updater stage,** in `scripts/update.ts` after the draw update. Add the imports: `fetchRaceList` from feeds; `appendWeek`, `fillPlayer` and `listDate` from `../src/update/history`; `readHistory` and `writeHistory` from writeData.

```ts
// Race history: published fact, never blocks. Appends each newly published race list; fills new players' past weeks.
let history = readHistory(dir);
const historyChanges: string[] = [];
const historyNotes: string[] = [];
if (history && !result.problems.length) {
  try {
    const date = listDate(snapshot.race);
    if (date && date > (history.dates.at(-1) ?? '')) {
      const appended = appendWeek(history, await fetchRaceList(), result.raw.players);
      if (appended) {
        history = appended;
        historyChanges.push(`Race history: week of ${date} added`);
      }
    }
    for (const p of result.raw.players) {
      const weeks = history.players[p.id];
      if (p.wtaId === undefined || (weeks && weeks.some((w) => w !== null))) continue;
      const lists: Record<string, RaceRow[]> = {};
      for (const d of history.dates) lists[d] = await fetchRaceList(d);
      history = fillPlayer(history, p.id, p.wtaId, lists);
      historyChanges.push(`Race history: ${p.name}'s past weeks filled`);
    }
  } catch {
    historyNotes.push("Race history: the race list didn't load, so the history was kept.");
  }
}
```

Then:
- add `historyChanges.length > 0` to `changed`;
- add `historyChanges` and `historyNotes` to `base.changes` and `base.notes`;
- inside the write block, add `if (history && historyChanges.length) writeHistory(dir, history);`;
- import the `RaceRow` type.

The fill loop only fetches for players whose every week is `null`, meaning newly added players, so it doesn't run every hour.

- [ ] **Step 4:** In `data/SOURCES.md`, add a section `## Race history (data/race-history.json)` covering:
  - the feed with `&at=`;
  - publication dates, and that the list starts on 2025-11-17;
  - that there are no lists in the second week of two-week events;
  - that `eighth` is the list's 8th row, with no adjustment for the Grand Slam champion place or the event minimum;
  - that it's published fact and never blocks.
- [ ] **Step 5:** Run `npx tsc -b && npx vitest run && npm run update -- --dry-run`. Expected: tests pass, and the dry run reports no history change (the list date isn't newer).
- [ ] **Step 6:** Commit: `feat(history): backfill and hourly race history updates`. Include `data/race-history.json`.

---

### Task 3: The chart

**Files:**
- Create: `src/ui/RaceChart.tsx`, `src/ui/RaceChart.test.tsx`
- Modify: `src/ui/styles.css`

**Interfaces:** Produces:
- `RaceChart({ dates, series, view, reference? })`;
- `Series { id: string; name: string; color: string; values: (number | null)[] }`;
- `PALETTE: string[]`, 10 colours.

The values are points or positions, depending on `view: 'points' | 'rank'`. `reference` is `{ label: string; values: (number | null)[] }` and is drawn in points view only.

- [ ] **Step 1: Failing tests,** `src/ui/RaceChart.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RaceChart } from './RaceChart';

const dates = ['2026-01-05', '2026-01-19', '2026-03-02', '2026-03-16'];
const series = [
  { id: 'ana', name: 'Ana Alpha', color: '#111', values: [100, 300, 900, 1200] },
  { id: 'bea', name: 'Bea Beta', color: '#222', values: [null, 200, 1000, null] },
];

describe('RaceChart', () => {
  it('draws a line per player (broken across missing weeks), labels each line end, and the reference line', () => {
    const { container } = render(<RaceChart dates={dates} series={series} view="points" reference={{ label: '8th place', values: [50, 150, 600, 800] }} />);
    expect(container.querySelectorAll('path.series')).toHaveLength(2);
    expect(container.querySelector('path.series[data-id="bea"]')!.getAttribute('d')!.match(/M/g)).toHaveLength(1);
    expect(screen.getByText('Ana Alpha')).toBeInTheDocument();
    expect(screen.getByText('8th place')).toBeInTheDocument();
    expect(container.querySelector('path.reference')).not.toBeNull();
  });

  it('puts position 1 at the top in position view, with the qualifying band and no reference line', () => {
    const { container } = render(<RaceChart dates={dates} series={[{ ...series[0]!, values: [9, 4, 1, 2] }]} view="rank" reference={{ label: '8th place', values: [1, 1, 1, 1] }} />);
    const y = (i: number) => Number(container.querySelectorAll('circle.point')[i]!.getAttribute('cy'));
    expect(y(2)).toBeLessThan(y(0)); // 1st is above 9th
    expect(container.querySelector('rect.qualifying-band')).not.toBeNull();
    expect(container.querySelector('path.reference')).toBeNull();
  });

  it('spaces weeks by date, not evenly', () => {
    const { container } = render(<RaceChart dates={dates} series={[series[0]!]} view="points" />);
    const x = (i: number) => Number(container.querySelectorAll('circle.point')[i]!.getAttribute('cx'));
    expect(x(2) - x(1)).toBeGreaterThan(2 * (x(1) - x(0))); // 6 weeks vs 2 weeks
  });

  it("shows a week's figures when it is selected", () => {
    render(<RaceChart dates={dates} series={series} view="points" />);
    fireEvent.click(screen.getByRole('button', { name: 'Week of Mar 2, 2026' }));
    const panel = screen.getByRole('status');
    expect(panel).toHaveTextContent('Mar 2, 2026');
    expect(panel).toHaveTextContent('Ana Alpha');
    expect(panel).toHaveTextContent('900');
    expect(panel).toHaveTextContent('1,000');
  });
});
```

The rank-view tooltip shows "#n". The points view shows the points and, in brackets, the position, when the series has positions. To keep the component simple, the tooltip shows only the plotted value: "900" in points view, "#4" in position view.

Run it. Expected: FAIL.

- [ ] **Step 2: `src/ui/RaceChart.tsx`:**

```tsx
import { useState } from 'react';
import { formatPoints } from './format';

export const PALETTE = ['#7b3fa0', '#1f77b4', '#d62728', '#2ca02c', '#ff7f0e', '#17becf', '#e377c2', '#8c564b', '#bcbd22', '#6b7280'];

export interface Series {
  id: string;
  name: string;
  color: string;
  values: (number | null)[];
}

interface Props {
  dates: string[];
  series: Series[];
  view: 'points' | 'rank';
  reference?: { label: string; values: (number | null)[] };
}

const W = 720;
const H = 340;
const PAD = { left: 52, right: 130, top: 16, bottom: 28 };
const day = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
const long = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const monthName = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });

/** A path through the points, broken where a value is missing. */
function linePath(xs: number[], ys: (number | null)[]): string {
  let d = '';
  let pen = false;
  ys.forEach((y, i) => {
    if (y === null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${xs[i]!.toFixed(1)},${y.toFixed(1)}`;
    pen = true;
  });
  return d;
}

const niceStep = (max: number) => [250, 500, 1000, 2000, 5000].find((s) => max / s <= 6) ?? 10000;

/** Race points or positions over the published weeks, one line per player. Dates are spaced by time. */
export function RaceChart({ dates, series, view, reference }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  if (dates.length === 0) return null;
  const first = day(dates[0]!);
  const span = Math.max(1, day(dates.at(-1)!) - first);
  const xs = dates.map((d) => PAD.left + ((day(d) - first) / span) * (W - PAD.left - PAD.right));
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const ref = view === 'points' ? reference : undefined;
  const refValues = ref?.values.filter((v): v is number => v !== null) ?? [];
  const top = view === 'points' ? 0 : 1;
  const bottom = view === 'points' ? Math.max(1, ...all, ...refValues) : Math.max(10, ...all);
  // Points rise upward; position 1 is at the top.
  const y = (v: number) =>
    view === 'points'
      ? PAD.top + (1 - v / bottom) * (H - PAD.top - PAD.bottom)
      : PAD.top + ((v - top) / Math.max(1, bottom - top)) * (H - PAD.top - PAD.bottom);
  const ticks = view === 'points'
    ? Array.from({ length: Math.floor(bottom / niceStep(bottom)) + 1 }, (_, i) => i * niceStep(bottom))
    : [1, ...Array.from({ length: Math.floor(bottom / 5) }, (_, i) => (i + 1) * 5)].filter((t) => t <= bottom);
  const months = dates
    .map((d, i) => ({ d, i }))
    .filter(({ d }, k, arr) => k === 0 || d.slice(0, 7) !== arr[k - 1]!.d.slice(0, 7));
  // End labels, nudged apart so they don't overlap.
  const labels = series
    .map((s) => {
      const last = s.values.reduce<number>((at, v, i) => (v !== null ? i : at), -1);
      return last < 0 ? null : { s, x: xs[last]!, y: y(s.values[last]!) };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i]!.y = Math.max(labels[i]!.y, labels[i - 1]!.y + 13);
  const show = (v: number | null) => (v === null ? '—' : view === 'points' ? formatPoints(v) : `#${v}`);
  return (
    <figure className="race-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Race ${view === 'points' ? 'points' : 'positions'} by week`}>
        {view === 'rank' && bottom >= 8 && (
          <rect className="qualifying-band" x={PAD.left} y={y(1) - 4} width={W - PAD.left - PAD.right} height={y(8) - y(1) + 8} />
        )}
        {ticks.map((t) => (
          <g key={t} className="tick">
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end">{view === 'points' ? formatPoints(t) : t}</text>
          </g>
        ))}
        {months.map(({ d, i }) => (
          <text key={d} className="month" x={xs[i]} y={H - 8} textAnchor="middle">{monthName.format(new Date(`${d}T00:00:00Z`))}</text>
        ))}
        {ref && (
          <>
            <path className="reference" d={linePath(xs, ref.values.map((v) => (v === null ? null : y(v))))} />
            <text className="reference-label" x={W - PAD.right + 4} y={y(refValues.at(-1) ?? 0) + 4}>{ref.label}</text>
          </>
        )}
        {series.map((s) => (
          <g key={s.id}>
            <path className="series" data-id={s.id} d={linePath(xs, s.values.map((v) => (v === null ? null : y(v))))} stroke={s.color} />
            {s.values.map((v, i) => (v === null ? null : <circle key={i} className="point" cx={xs[i]} cy={y(v)} r={selected === i ? 4 : 2} fill={s.color} />))}
          </g>
        ))}
        {labels.map((l) => (
          <text key={l.s.id} className="end-label" x={W - PAD.right + 4} y={l.y + 4} fill={l.s.color}>{l.s.name}</text>
        ))}
        {selected !== null && <line className="cursor" x1={xs[selected]} x2={xs[selected]} y1={PAD.top} y2={H - PAD.bottom} />}
      </svg>
      <div className="weeks">
        {dates.map((d, i) => (
          <button
            key={d}
            type="button"
            className="week"
            style={{ left: `${(xs[i]! / W) * 100}%` }}
            aria-label={`Week of ${long.format(new Date(`${d}T00:00:00Z`))}`}
            aria-pressed={selected === i}
            onClick={() => setSelected(selected === i ? null : i)}
            onMouseEnter={() => setSelected(i)}
          />
        ))}
      </div>
      {selected !== null && (
        <div className="chart-tip" role="status">
          <strong>{long.format(new Date(`${dates[selected]}T00:00:00Z`))}</strong>
          <ul>
            {series.map((s) => (
              <li key={s.id}>
                <span className="swatch" style={{ background: s.color }} aria-hidden="true" />
                {`${s.name}: ${show(s.values[selected] ?? null)}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
```

- [ ] **Step 3: Styles,** appended to `styles.css`:

```css
/* Race history chart */
.race-chart { position: relative; margin: 8px 0 16px; }
.race-chart svg { width: 100%; height: auto; display: block; }
.race-chart .tick line { stroke: var(--line); }
.race-chart .tick text, .race-chart .month { fill: var(--muted); font-size: 11px; }
.race-chart path.series { fill: none; stroke-width: 2; }
.race-chart path.reference { fill: none; stroke: var(--muted); stroke-width: 1.5; stroke-dasharray: 5 4; }
.race-chart .reference-label { fill: var(--muted); font-size: 11px; }
.race-chart .end-label { font-size: 11px; font-weight: 600; }
.race-chart .qualifying-band { fill: var(--qualifier-bg); }
.race-chart .cursor { stroke: var(--muted); stroke-width: 1; }
.race-chart .weeks { position: absolute; left: 0; right: 0; top: 0; bottom: 8%; }
.race-chart .week { position: absolute; top: 0; bottom: 0; width: 14px; margin-left: -7px; border: 0; background: transparent; cursor: pointer; padding: 0; }
.race-chart .week:focus-visible { outline: 2px solid var(--accent); }
.chart-tip { font-size: 0.85rem; border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px; background: var(--bg); margin-top: 6px; }
.chart-tip ul { list-style: none; margin: 4px 0 0; padding: 0; columns: 2; }
.chart-tip .swatch { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
```

The `.weeks` buttons are invisible hit strips over the chart. Their `left` percentages come from the same x scale as the points, so their container spans the full width.

- [ ] **Step 4:** Run `npx tsc -b && npx vitest run src/ui/RaceChart.test.tsx`. Expected: PASS. Then run the whole suite.
- [ ] **Step 5:** Commit: `feat(ui): race chart`.

---

### Task 4: The comparison page, the player section and wiring

**Files:**
- Create: `src/ui/RaceHistoryPage.tsx`, `src/ui/RaceHistoryPage.test.tsx`, `e2e/history.spec.ts`
- Modify:
  - `src/ui/PlayerPage.tsx`, `src/ui/PlayerPage.test.tsx`;
  - `src/ui/App.tsx` (the link);
  - `src/entry-list.tsx`, `src/entry-player.tsx`;
  - `src/prerender/pages.tsx`, `src/prerender/pages.test.tsx`;
  - `scripts/prerender.ts`, `vite.config.ts`;
  - `src/ui/hydration.test.tsx`, `README.md`

**Interfaces:**
- Consumes: `RaceChart`, `PALETTE`, `RaceHistory`.
- Produces:
  - `RaceHistoryPage({ season, history })` (`history` may be null);
  - `PlayerPage` gains the prop `history?: { dates: string[]; weeks: ([number, number] | null)[]; eighth: (number | null)[] } | null`;
  - `raceHistoryHtml(template, season, history)`.

- [ ] **Step 1: Failing tests.** `src/ui/RaceHistoryPage.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RaceHistory } from '../history/historySchema';
import { season } from '../test/fixtures';
import { RaceHistoryPage } from './RaceHistoryPage';

const history: RaceHistory = {
  dates: ['2026-03-02', '2026-03-16'],
  eighth: [100, 200],
  players: { ana: [[1, 900], [1, 1160]], bea: [[2, 500], [2, 765]], cat: [null, [3, 140]] },
};

describe('RaceHistoryPage', () => {
  beforeEach(() => window.history.replaceState(null, '', '/race-history/'));

  it('starts with the top players in points view, and toggles to positions', () => {
    const { container } = render(<RaceHistoryPage season={season} history={history} />);
    expect(container.querySelectorAll('path.series')).toHaveLength(3);
    expect(screen.getByRole('radio', { name: 'Points' })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Position' }));
    expect(container.querySelector('rect.qualifying-band')).not.toBeNull(); // positions 1–8 shaded (the axis always runs to at least 10)
    expect(window.location.search).toContain('view=rank');
  });

  it('adds and removes players, finds them by name, and keeps the choice in the URL', () => {
    const { container } = render(<RaceHistoryPage season={season} history={history} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Bea Beta/ }));
    expect(container.querySelectorAll('path.series')).toHaveLength(2);
    expect(window.location.search).toBe('?p=ana%2Ccat');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Find a player' }), { target: { value: 'bet' } });
    expect(screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'))).toEqual(['Bea Beta']);
  });

  it('restores a shared choice after loading, ignoring players it does not know', () => {
    window.history.replaceState(null, '', '/race-history/?p=bea,zed&view=rank');
    const { container } = render(<RaceHistoryPage season={season} history={history} />);
    expect(container.querySelectorAll('path.series')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Position' })).toBeChecked();
  });

  it('says so when there is no history', () => {
    render(<RaceHistoryPage season={season} history={null} />);
    expect(screen.getByText("Race history isn't available yet.")).toBeInTheDocument();
  });
});
```

Add a test to `PlayerPage.test.tsx` (the cap is covered by a unit check in the page component, `MAX = 10`, and isn't tested with 11 fixture players):

```tsx
  it('charts her race over time against 8th place, with a link to compare', () => {
    render(<PlayerPage season={season} playerId="ana" matches={[]} history={{ dates: ['2026-03-02', '2026-03-16'], weeks: [[1, 900], [1, 1160]], eighth: [100, 200] }} />);
    const section = screen.getByRole('region', { name: 'Race over time' });
    expect(section.querySelector('path.series')).not.toBeNull();
    expect(section.querySelector('path.reference')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Compare with others →' })).toHaveAttribute('href', '/race-history/?p=ana');
  });

  it('leaves the chart out without history', () => {
    render(<PlayerPage season={season} playerId="ana" matches={[]} />);
    expect(screen.queryByRole('region', { name: 'Race over time' })).toBeNull();
  });
```

Check `PlayerPage.test.tsx`'s imports and adapt the render call to match how its other tests render (for example, the season helper they use).

In `pages.test.tsx`:

```tsx
  it('writes the race history page and lists it in the sitemap', () => {
    const html = raceHistoryHtml(PLAYER, season, { dates: ['2026-03-02'], eighth: [1], players: { ana: [[1, 9]] } });
    expect(html).toContain('<title>Race over time: 2026 Race to the WTA Finals</title>');
    expect(html).toContain('<link rel="canonical" href="https://finalsrace.win/race-history/" />');
    expect(html).toContain('"page":"history"');
    expect(sitemapXml(season)).toContain('<loc>https://finalsrace.win/race-history/</loc>');
  });
```

In `hydration.test.tsx`: `RaceHistoryPage` with the history above hydrates cleanly, including with `?p=bea&view=rank` set in the browser callback.

Run them. Expected: FAIL.

- [ ] **Step 2: `src/ui/RaceHistoryPage.tsx`:**

```tsx
import { useEffect, useState } from 'react';
import type { Season } from '../data/schema';
import { projectStandings } from '../engine/standings';
import type { RaceHistory } from '../history/historySchema';
import { PALETTE, RaceChart } from './RaceChart';
import { SiteNav } from './SiteNav';
import { UpdatedTime } from './UpdatedTime';

const MAX = 10;
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Compare how chosen players' race points (or positions) moved week by week, from the WTA's published lists. */
export function RaceHistoryPage({ season, history }: { season: Season; history: RaceHistory | null }) {
  const order = projectStandings(season.players, {}, season.tournaments, season.rules).sort((a, b) => a.currentRank - b.currentRank);
  const known = order.filter((r) => history?.players[r.playerId]?.some((w) => w !== null));
  const defaults = known.slice(0, MAX).map((r) => r.playerId);
  const [chosen, setChosen] = useState<string[]>(defaults);
  const [view, setView] = useState<'points' | 'rank'>('points');
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);

  // A shared choice is read after the first render, so it matches the prerendered page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ids = (params.get('p') ?? '').split(',').filter((id) => known.some((r) => r.playerId === id)).slice(0, MAX);
    if (ids.length) setChosen(ids);
    if (params.get('view') === 'rank') setView('rank');
    setLoaded(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loaded) return;
    const url = new URL(window.location.href);
    const isDefault = chosen.length === defaults.length && chosen.every((id, i) => id === defaults[i]);
    if (isDefault) url.searchParams.delete('p');
    else url.searchParams.set('p', chosen.join(','));
    if (view === 'rank') url.searchParams.set('view', 'rank');
    else url.searchParams.delete('view');
    window.history.replaceState(null, '', url);
  }, [chosen, view, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = !history || history.dates.length === 0 ? (
    <p>Race history isn't available yet.</p>
  ) : (
    <>
      <fieldset className="view-toggle">
        <legend className="visually-hidden">Show</legend>
        <label><input type="radio" name="view" checked={view === 'points'} onChange={() => setView('points')} /> Points</label>
        <label><input type="radio" name="view" checked={view === 'rank'} onChange={() => setView('rank')} /> Position</label>
      </fieldset>
      <RaceChart
        dates={history.dates}
        view={view}
        reference={{ label: '8th place', values: history.eighth }}
        series={chosen.map((id) => {
          const r = known.find((x) => x.playerId === id)!;
          const weeks = history.players[id]!;
          return { id, name: r.name, color: PALETTE[chosen.indexOf(id) % PALETTE.length]!, values: weeks.map((w) => (w ? (view === 'points' ? w[1] : w[0]) : null)) };
        })}
      />
      <section aria-label="Players" className="history-players">
        <p className="table-controls">
          <input type="search" aria-label="Find a player" placeholder="Find a player" value={query} onChange={(e) => setQuery(e.target.value)} />
          {chosen.length >= MAX && <span className="note-inline">{`Up to ${MAX} players at once.`}</span>}
        </p>
        <ul className="player-picks">
          {known
            .filter((r) => !query.trim() || plain(r.name).includes(plain(query.trim())))
            .map((r) => {
              const on = chosen.includes(r.playerId);
              return (
                <li key={r.playerId}>
                  <label>
                    <input
                      type="checkbox"
                      aria-label={r.name}
                      checked={on}
                      disabled={!on && chosen.length >= MAX}
                      onChange={() => setChosen(on ? chosen.filter((id) => id !== r.playerId) : [...chosen, r.playerId])}
                    />
                    <span className="swatch" style={{ background: on ? PALETTE[chosen.indexOf(r.playerId) % PALETTE.length] : 'transparent' }} aria-hidden="true" />
                    {`${r.currentRank}. ${r.name}`}
                  </label>
                </li>
              );
            })}
        </ul>
      </section>
    </>
  );
  return (
    <div className="app list-page">
      <SiteNav current="standings" />
      <header className="header">
        <h1>Race over time</h1>
        <p className="intro">{`The ${season.rules.season} race as the WTA published it each week. Choose up to ${MAX} players to compare.`}</p>
        <UpdatedTime iso={season.meta.lastUpdated} />
      </header>
      <main>{body}</main>
    </div>
  );
}
```

Colours: each chosen player's colour is her place in `chosen`, so up to 10 lines never share one. A checked box shows her line's colour; unchecked boxes show none.

- [ ] **Step 3: The player page section.** In `PlayerPage.tsx`:
  - add the `history` prop (type above);
  - after the "Season summary" section, render the following when `history` exists and has a non-null week:

```tsx
            <section aria-label="Race over time">
              <h2>Race over time</h2>
              <RaceChart
                dates={history.dates}
                view="points"
                series={[{ id: player.id, name: player.name, color: PALETTE[0]!, values: history.weeks.map((w) => (w ? w[1] : null)) }]}
                reference={{ label: '8th place', values: history.eighth }}
              />
              <p className="explore"><a href={`/race-history/?p=${player.id}`}>Compare with others →</a></p>
            </section>
```

Use the component's existing name for the player variable. If the season summary renders only when there are matches, place the section so it renders regardless.

- [ ] **Step 4: Wiring.**
  - **`pages.tsx`:**
    - `playerHtml` gains `history` (sliced for the player: `{ dates, weeks: h.players[id] ?? [], eighth }`, or null). It passes it to `PlayerPage` and into the embedded data as `history`.
    - Add `raceHistoryHtml(template, season, history)`. Its title is "Race over time: 2026 Race to the WTA Finals", with the description "How the 2026 Race to the WTA Finals unfolded week by week: race points and positions from the WTA's published lists." Its canonical URL is `${SITE}/race-history/` and its data is `{ page: 'history', history }`.
    - Add `/race-history/` to the sitemap after `/players/`.
  - **`scripts/prerender.ts`:**
    - read `readHistory(dataDir)`;
    - pass each player's slice to `playerHtml`;
    - write `dist/race-history/index.html` from `list.html` with `raceHistoryHtml`, before `rmSync(list.html)`.
  - **`entry-player.tsx`:**
    - the embedded data now includes `history`;
    - in dev, load `../data/race-history.json` with an eager `import.meta.glob`, gated on DEV like the match files, and slice it for the player.
  - **`entry-list.tsx`:**
    - add the page `'history'`;
    - in dev, read the history from the same eager glob;
    - path `/race-history` selects it;
    - render `<RaceHistoryPage season={season} history={...} />`.
  - **`vite.config.ts`:** the dev route `/race-history/` → `/list.html?page=history`.
  - **`App.tsx`:** above `<StandingsTable …/>`, add `<p className="history-link"><a href="/race-history/">Race over time →</a></p>`.
  - **CSS:**

```css
.history-link { margin: 4px 0 8px; font-size: 0.9rem; }
.history-link a { color: var(--accent-text); }
.view-toggle { border: 0; padding: 0; margin: 0 0 4px; display: flex; gap: 14px; font-size: 0.9rem; }
.player-picks { list-style: none; padding: 0; columns: 2; font-size: 0.9rem; }
.player-picks .swatch { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin: 0 6px 0 4px; }
```

- [ ] **Step 5: End-to-end,** `e2e/history.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('race over time: from the standings, add a player, switch to positions, and share', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Race over time →' }).click();
  await expect(page).toHaveURL(/\/race-history\/$/);
  await expect(page.locator('path.series')).toHaveCount(10);
  await page.getByRole('checkbox', { name: 'Elena Rybakina' }).uncheck();
  await expect(page.locator('path.series')).toHaveCount(9);
  await page.getByRole('radio', { name: 'Position' }).check();
  await expect(page).toHaveURL(/view=rank/);
  await page.reload();
  await expect(page.locator('path.series')).toHaveCount(9);
  await expect(page.getByRole('radio', { name: 'Position' })).toBeChecked();
});
```

- [ ] **Step 6:** Run `npx tsc -b && npx vitest run && npm run build && npx playwright test`. Expected: all pass. Then a browser check on `npm run preview` (with the dev server too):
  - the comparison page at desktop width and at a 360px phone width in dark mode;
  - a player page;
  - labels readable, no horizontal scroll;
  - tapping a week shows the panel;
  - no console errors.
- [ ] **Step 7:** README: under Develop, mention `/race-history/`, the player-page chart and `data/race-history.json` (backfill script, hourly appends).
- [ ] **Step 8:** Commit: `feat(ui): race over time page and player chart`.
