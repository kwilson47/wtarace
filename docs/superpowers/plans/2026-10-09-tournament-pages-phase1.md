# Tournament Pages (Phase 1: Draws, Read-Only) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a page per tracked event at `/tournaments/<id>/` with:
- the event header;
- our tracked players' results;
- the draw: the full bracket for completed events, and a quarterfinal-onward bracket plus round lists for live and upcoming events.

Pages are kept current by the hourly updater and linked from player pages and the homepage editor.

**Architecture:**
- Draw files `data/draws/<tournament id>.json`, built from each event's players and matches feeds (`src/update/draws.ts`).
- A pure `buildBracket(draw)` reconstructs the bracket, including byes (`src/draws/bracket.ts`).
- `TournamentPage` renders it.
- Pages are prerendered from a `tournament.html` template and hydrated, using the same groundwork as player pages.

**Tech Stack:** TypeScript, Zod, React 19 (SSR + hydrate), Vite, Vitest, Playwright, GitHub Actions updater.

**Spec:** `docs/superpowers/specs/2026-10-09-tournament-pages-design.md` (phase 1 only; the bracket picker is a later plan).

## Global Constraints

- Run Node via `export PATH=/opt/homebrew/bin:$PATH`. After `npx tsc -b`, delete `tsconfig.tsbuildinfo`.
- Draw data is published fact. It's never validated against totals and never blocks an update. A failed fetch keeps the previous file, with a note.
- A draw file is written only once the draw is out, meaning the main-draw singles matches exist. Before that, the `LS` list is just the entry list.
- Rendering is deterministic: no `window`, `localStorage` or the clock during render, and dates in UTC `en-US`.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Feed facts (verified 2026-10-09 on Toronto 2026 and Beijing 2026)

- **Draw order:** `tournaments/<id>/<year>/players`, event `LS`, gives `eventPlayers[] = { players: [{ id, fullName, countryCode }], seed: '1' | '', entryType: '' | 'Q' | 'WC' | … }`. It's in draw order and doesn't count byes: Toronto has 96 entries.
- **Matches:** `tournaments/<id>/<year>/matches` has main singles with `DrawMatchType 'S'` and `DrawLevelType 'M'`.
  - Toronto has 95 matches: rounds 1 (32), 2 (32), 3 (16), 4 (8), `Q` (4), `S` (2), `F` (1).
  - First-round pairs by draw position are (2,3), (4,5), (8,9), …; seeds at 1 and 6 have byes.
- **Per match:**
  - `Winner`: even means player A won (2, or 4 on retirement); odd means player B (3 or 5).
  - `MatchState`: `'F'` when finished.
  - `ScoreString`: winner-first, e.g. `"7-6(0),6-3"`, or `"6-1,3-0 Ret'd"`.

---

### Task 1: Draw files from the feeds

**Files:**
- Create: `src/draws/drawSchema.ts`, `src/update/draws.ts`, `src/update/draws.test.ts`
- Modify: `src/update/feedTypes.ts` (`EventPlayer.players[]` gets `countryCode?: string | null`), `src/update/matches.ts` (export `ENTRY`, `num`, `positive`)

**Interfaces:** Produces `DrawFile`, `DrawPlayer`, `DrawMatch`, `drawFileSchema`, `toDrawFile(table, playersFeed, matches)` and `isDrawOut(matches)`.

- [ ] **Step 1: `src/draws/drawSchema.ts`:**

```ts
import { z } from 'zod';

export const drawPlayerSchema = z.object({
  wtaId: z.number().int(),
  name: z.string(),
  /** ISO 3166-1 alpha-2, when known. */
  country: z.string().nullable(),
  seed: z.number().int().nullable(),
  /** Q, WC, LL, SE, Alt or PR. */
  entry: z.string().nullable(),
});

export const drawMatchSchema = z.object({
  /** 1, 2, … from the first round. */
  round: z.number().int().positive(),
  a: z.number().int().nullable(),
  b: z.number().int().nullable(),
  /** Null until played. */
  winner: z.number().int().nullable(),
  /** Winner first, as published; '' if unplayed or a walkover. */
  score: z.string(),
  outcome: z.enum(['played', 'retired', 'walkover', 'scheduled']),
});

/** An event's main singles draw: the draw order (byes not counted) and every match, as published. */
export const drawFileSchema = z.object({
  drawSize: z.number().int().nonnegative(),
  players: z.array(drawPlayerSchema),
  matches: z.array(drawMatchSchema),
});

export type DrawPlayer = z.infer<typeof drawPlayerSchema>;
export type DrawMatch = z.infer<typeof drawMatchSchema>;
export type DrawFile = z.infer<typeof drawFileSchema>;
```

- [ ] **Step 2: Failing tests,** `src/update/draws.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { EventPlayersFeed, LiveMatch } from './feedTypes';
import { isDrawOut, toDrawFile } from './draws';

const table = [{ round: 'R32' }, { round: 'R16' }, { round: 'QF' }, { round: 'SF' }, { round: 'F' }, { round: 'W' }];
const players: EventPlayersFeed = {
  events: [
    { eventTypeCode: 'RS', eventPlayers: [] },
    {
      eventTypeCode: 'LS',
      eventPlayers: [
        { players: [{ id: 1, fullName: 'Ana Alpha', countryCode: 'ESP' }], seed: '1', entryType: '' },
        { players: [{ id: 2, fullName: 'Bea Beta', countryCode: 'USA' }], seed: '', entryType: 'Q' },
        { players: [{ id: 3, fullName: 'Cat Gamma', countryCode: null }], seed: '', entryType: 'WC' },
      ],
    },
  ],
};
const m = (over: Partial<LiveMatch>): LiveMatch => ({ DrawMatchType: 'S', DrawLevelType: 'M', RoundID: 1, MatchState: 'F', PlayerIDA: '2', PlayerIDB: '3', ...over });

describe('toDrawFile', () => {
  it('keeps the draw order and every main-draw singles match, as published', () => {
    const draw = toDrawFile(table, players, [
      m({ Winner: '3', ScoreString: '6-4,6-4' }),
      m({ RoundID: 'Q', PlayerIDA: '1', PlayerIDB: '3', Winner: '4', ScoreString: "6-1,3-0 Ret'd" }),
      m({ RoundID: 'S', PlayerIDA: '1', PlayerIDB: '9', MatchState: 'U' }),
      m({ DrawLevelType: 'Q', PlayerIDA: '5', PlayerIDB: '6' }),
      m({ DrawMatchType: 'D' }),
    ]);
    expect(draw.drawSize).toBe(3);
    expect(draw.players).toEqual([
      { wtaId: 1, name: 'Ana Alpha', country: 'ES', seed: 1, entry: null },
      { wtaId: 2, name: 'Bea Beta', country: 'US', seed: null, entry: 'Q' },
      { wtaId: 3, name: 'Cat Gamma', country: null, seed: null, entry: 'WC' },
    ]);
    expect(draw.matches).toEqual([
      { round: 1, a: 2, b: 3, winner: 3, score: '6-4 6-4', outcome: 'played' },
      { round: 3, a: 1, b: 3, winner: 1, score: '6-1 3-0', outcome: 'retired' },
      { round: 4, a: 1, b: 9, winner: null, score: '', outcome: 'scheduled' },
    ]);
  });

  it('marks a walkover, and knows when the draw is out', () => {
    const draw = toDrawFile(table, players, [m({ Winner: '2', ScoreString: '' })]);
    expect(draw.matches[0]).toMatchObject({ winner: 2, outcome: 'walkover' });
    expect(isDrawOut([])).toBe(false);
    expect(isDrawOut([m({ DrawLevelType: 'Q' })])).toBe(false);
    expect(isDrawOut([m({ MatchState: 'U' })])).toBe(true);
  });
});
```

Run `npx vitest run src/update/draws.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `src/update/draws.ts`.**
  - In `src/update/matches.ts`, export the helpers: `export const ENTRY`, `export const num`, `export const positive`.
  - In `feedTypes.ts`, `EventPlayer.players` becomes `{ id: number; fullName: string; countryCode?: string | null }[]`.

```ts
import type { DrawFile } from '../draws/drawSchema';
import type { EventPlayersFeed, LiveMatch } from './feedTypes';
import { ENTRY, num, positive } from './matches';
import { IOC_TO_ISO } from './newPlayers';

const LETTER_ROUND: Record<string, string> = { Q: 'QF', S: 'SF', F: 'F' };
const mainSingles = (matches: LiveMatch[]) => matches.filter((m) => m.DrawMatchType === 'S' && m.DrawLevelType === 'M');

/** The draw is out once the event's main-draw singles matches are listed (before that, LS is only the entry list). */
export const isDrawOut = (matches: LiveMatch[]) => mainSingles(matches).length > 0;

/** An event's main singles draw from its players and matches feeds. `table` is its points table (first round first). */
export function toDrawFile(table: { round: string }[], playersFeed: EventPlayersFeed, matches: LiveMatch[]): DrawFile {
  const list = playersFeed.events.find((e) => e.eventTypeCode === 'LS')?.eventPlayers ?? [];
  const players = list
    .filter((ep) => ep.players[0])
    .map((ep) => {
      const p = ep.players[0]!;
      return {
        wtaId: p.id,
        name: p.fullName,
        country: p.countryCode ? IOC_TO_ISO[p.countryCode] ?? null : null,
        seed: positive(ep.seed),
        entry: ENTRY[String(ep.entryType ?? '').trim()] ?? null,
      };
    });
  const draw = mainSingles(matches).map((m) => {
    const id = String(m.RoundID).trim();
    const round = /^\d+$/.test(id) ? Number(id) : table.findIndex((r) => r.round === LETTER_ROUND[id]) + 1;
    if (round < 1) throw new Error(`unknown round id "${id}" in a match feed`);
    const a = positive(m.PlayerIDA);
    const b = positive(m.PlayerIDB);
    const finished = m.MatchState === 'F' && m.Winner !== undefined && m.Winner !== null && m.Winner !== '';
    const code = num(m.Winner);
    const score = finished ? (m.ScoreString ?? '').replace(/\s*Ret'?d\.?\s*$/i, '').split(',').map((s) => s.trim()).filter(Boolean).join(' ') : '';
    return {
      round,
      a,
      b,
      winner: finished && code !== null ? (code % 2 === 0 ? a : b) : null,
      score,
      outcome: !finished ? ('scheduled' as const) : code === 4 || code === 5 ? ('retired' as const) : score === '' ? ('walkover' as const) : ('played' as const),
    };
  });
  return { drawSize: players.length, players, matches: draw.sort((x, y) => x.round - y.round) };
}
```

- [ ] **Step 4:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(draws): draw files from the event feeds`.

---

### Task 2: Rebuilding the bracket

**Files:**
- Create: `src/draws/bracket.ts`, `src/draws/bracket.test.ts`

**Interfaces:** Produces:
- `buildBracket(draw): Bracket | null`;
- `finalists(bracket): { champion: number | null; runnerUp: number | null; score: string }`;
- types `Slot`, `BracketMatch`, `Bracket`.

- [ ] **Step 1: Failing tests,** `src/draws/bracket.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { DrawFile, DrawMatch } from './drawSchema';
import { buildBracket, finalists } from './bracket';

const player = (wtaId: number) => ({ wtaId, name: `P${wtaId}`, country: null, seed: null, entry: null });
const played = (round: number, a: number, b: number, winner: number, score = '6-1 6-1'): DrawMatch => ({ round, a, b, winner, score, outcome: 'played' });

// Six players in an 8 bracket: 1 and 6 have byes (Toronto-style, a seed first in each half with its bye).
const six: DrawFile = {
  drawSize: 6,
  players: [1, 2, 3, 4, 5, 6].map(player),
  matches: [played(1, 2, 3, 3), played(1, 4, 5, 4), played(2, 1, 3, 1), played(2, 4, 6, 6), played(3, 1, 6, 6, '7-6(3) 6-4')],
};

describe('buildBracket', () => {
  it('rebuilds a draw with byes, round by round', () => {
    const bracket = buildBracket(six)!;
    expect(bracket.size).toBe(8);
    expect(bracket.rounds.map((r) => r.map((m) => [m.top, m.bottom, m.winner, m.outcome]))).toEqual([
      [[1, 'bye', 1, 'bye'], [2, 3, 3, 'played'], [4, 5, 4, 'played'], [6, 'bye', 6, 'bye']],
      [[1, 3, 1, 'played'], [4, 6, 6, 'played']],
      [[1, 6, 6, 'played']],
    ]);
    expect(finalists(bracket)).toEqual({ champion: 6, runnerUp: 1, score: '7-6(3) 6-4' });
  });

  it('leaves undecided matches open, naming players the feed already pairs', () => {
    const live: DrawFile = { ...six, matches: [played(1, 2, 3, 3), played(1, 4, 5, 4), { round: 2, a: 3, b: 1, winner: null, score: '', outcome: 'scheduled' }] };
    const bracket = buildBracket(live)!;
    expect(bracket.rounds[1]!.map((m) => [m.top, m.bottom, m.winner, m.outcome])).toEqual([[1, 3, null, 'scheduled'], [4, 6, null, 'pending']]);
    expect(bracket.rounds[2]![0]).toMatchObject({ top: null, bottom: null, outcome: 'pending' });
    expect(finalists(bracket)).toEqual({ champion: null, runnerUp: null, score: '' });
  });

  it('handles a draw without byes, and refuses one whose first round does not fit', () => {
    const four: DrawFile = { drawSize: 4, players: [1, 2, 3, 4].map(player), matches: [played(1, 1, 2, 1), played(1, 3, 4, 4), played(2, 1, 4, 1)] };
    expect(finalists(buildBracket(four)!).champion).toBe(1);
    expect(buildBracket({ ...six, matches: [] })).toBeNull();
  });
});
```

Run it. Expected: FAIL.

- [ ] **Step 2: `src/draws/bracket.ts`:**

```ts
import type { DrawFile, DrawMatch } from './drawSchema';

/** A bracket line: a player (WTA id), a bye, or not known yet. */
export type Slot = number | 'bye' | null;

export interface BracketMatch {
  round: number;
  top: Slot;
  bottom: Slot;
  winner: number | null;
  score: string;
  outcome: DrawMatch['outcome'] | 'bye' | 'pending';
}

export interface Bracket {
  /** Lines in the first round: the draw size rounded up to a power of two. */
  size: number;
  /** First round first; each round has half as many matches as the one before. */
  rounds: BracketMatch[][];
}

/**
 * Rebuilds the bracket from the draw order. The bracket's empty lines are byes: walking the draw order,
 * a player with no first-round match takes a whole first-round pair (with her bye). Everyone else takes
 * one line. Later rounds pair the winners. Returns null if the draw and its first round don't fit
 * together (e.g. the draw is out but no first-round matches are listed yet).
 */
export function buildBracket(draw: DrawFile): Bracket | null {
  const ids = draw.players.map((p) => p.wtaId);
  const size = 2 ** Math.ceil(Math.log2(Math.max(2, ids.length)));
  const byes = size - ids.length;
  const playing = new Set(draw.matches.filter((m) => m.round === 1).flatMap((m) => [m.a, m.b]));
  const lines: Slot[] = [];
  for (const id of ids) {
    if (byes > 0 && !playing.has(id)) lines.push(id, 'bye');
    else lines.push(id);
  }
  if (lines.length !== size) return null;

  const rounds: BracketMatch[][] = [];
  let entrants: Slot[] = lines;
  for (let round = 1; entrants.length > 1; round++) {
    const matches: BracketMatch[] = [];
    for (let i = 0; i < entrants.length; i += 2) {
      let top = entrants[i]!;
      let bottom = entrants[i + 1]!;
      if (top === 'bye' || bottom === 'bye') {
        const through = top === 'bye' ? bottom : top;
        matches.push({ round, top, bottom, winner: typeof through === 'number' ? through : null, score: '', outcome: 'bye' });
        continue;
      }
      const known = [top, bottom].filter((s): s is number => typeof s === 'number');
      const found = draw.matches.find((m) => m.round === round && known.some((id) => id === m.a || id === m.b));
      if (found) {
        // The feed names both players once they're set, even if we haven't seen one of them win yet.
        if (top === null) top = found.a === bottom ? found.b : found.a;
        if (bottom === null) bottom = found.a === top ? found.b : found.a;
      }
      matches.push({ round, top, bottom, winner: found?.winner ?? null, score: found?.score ?? '', outcome: found?.outcome ?? 'pending' });
    }
    rounds.push(matches);
    entrants = matches.map((m) => m.winner);
  }
  return { size, rounds };
}

export function finalists(bracket: Bracket): { champion: number | null; runnerUp: number | null; score: string } {
  const final = bracket.rounds.at(-1)![0]!;
  if (final.winner === null) return { champion: null, runnerUp: null, score: '' };
  const other = final.top === final.winner ? final.bottom : final.top;
  return { champion: final.winner, runnerUp: typeof other === 'number' ? other : null, score: final.score };
}
```

- [ ] **Step 3:** Run `npx tsc -b && npx vitest run src/draws`. Expected: PASS.
- [ ] **Step 4:** Commit: `feat(draws): rebuild brackets, byes included`.

---

### Task 3: The updater keeps `data/draws/` current, then the first fill

**Files:**
- Modify: `src/update/draws.ts`, `src/update/draws.test.ts`, `src/update/feeds.ts`, `src/update/writeData.ts`, `scripts/update.ts`, `scripts/validate.ts`
- Create: `src/draws/validateDraws.ts`, `src/draws/validateDraws.test.ts`

**Interfaces:** Produces:
- `updateDrawFiles(raw, feeds, existing, failed)`;
- `fetchEventFeeds(t, get?)`;
- `readDrawFiles(dir)` and `writeDrawFiles(dir, files)`;
- `validateDrawFiles(files, tournamentIds)`.

- [ ] **Step 1: Failing tests,** appended to `src/update/draws.test.ts`. Add `updateDrawFiles` to the import, and `import { updaterSeason } from './testFeeds';`.

```ts
describe('updateDrawFiles', () => {
  const raw = updaterSeason();
  const feeds = (matches: LiveMatch[]) => ({ players: { '905': players }, matches: { '905': matches } });

  it('writes a draw once it is out, and only when it changes', () => {
    expect(updateDrawFiles(raw, feeds([]), {}, []).files).toEqual({});
    const first = updateDrawFiles(raw, feeds([m({ Winner: '3', ScoreString: '6-4,6-4' })]), {}, []);
    expect(Object.keys(first.files)).toEqual(['live']);
    expect(first.changes).toEqual(['Draw: Live Masters added']);
    expect(updateDrawFiles(raw, feeds([m({ Winner: '3', ScoreString: '6-4,6-4' })]), first.files, []).files).toEqual({});
    const more = updateDrawFiles(raw, feeds([m({ Winner: '3', ScoreString: '6-4,6-4' }), m({ RoundID: 2, PlayerIDA: '1', PlayerIDB: '3', MatchState: 'U' })]), first.files, []);
    expect(more.changes).toEqual(['Draw: Live Masters updated']);
  });

  it("keeps the previous draw when an event's feeds failed", () => {
    const out = updateDrawFiles(raw, { players: {}, matches: {} }, { live: { drawSize: 0, players: [], matches: [] } }, ['live']);
    expect(out.files).toEqual({});
    expect(out.notes).toEqual(["Live Masters: its draw feeds didn't load, so the previous draw was kept."]);
  });
});
```

`src/draws/validateDraws.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateDrawFiles } from './validateDraws';

describe('validateDrawFiles', () => {
  it('accepts valid draws for tracked events and reports the rest', () => {
    expect(validateDrawFiles({ live: { drawSize: 0, players: [], matches: [] } }, ['live'])).toEqual([]);
    expect(validateDrawFiles({ nope: { drawSize: 0, players: [], matches: [] } }, ['live'])).toEqual(['data/draws/nope.json: not a tracked tournament']);
    expect(validateDrawFiles({ live: { drawSize: 'x' } }, ['live'])[0]).toMatch(/^data\/draws\/live\.json: /);
  });
});
```

Run these. Expected: FAIL.

- [ ] **Step 2: `updateDrawFiles`,** appended to `src/update/draws.ts`. Add imports: `drawFileSchema`, and `type RawSeason` from `./shared`.

```ts
/**
 * New draw files for tracked events whose draws changed, plus commit-message lines. `feeds` are keyed by
 * WTA tournament id. An event in `failed` (tournament ids) keeps its previous file. Draws are published
 * fact: they never block an update.
 */
export function updateDrawFiles(
  raw: RawSeason,
  feeds: { players: Record<string, EventPlayersFeed>; matches: Record<string, LiveMatch[]> },
  existing: Record<string, DrawFile | undefined>,
  failed: string[],
): { files: Record<string, DrawFile>; changes: string[]; notes: string[] } {
  const files: Record<string, DrawFile> = {};
  const changes: string[] = [];
  const notes: string[] = [];
  for (const t of raw.tournaments) {
    if (t.wtaId === undefined) continue;
    if (failed.includes(t.id)) {
      notes.push(`${t.name}: its draw feeds didn't load, so the previous draw was kept.`);
      continue;
    }
    const playersFeed = feeds.players[String(t.wtaId)];
    const matches = feeds.matches[String(t.wtaId)];
    if (!playersFeed || !matches || !isDrawOut(matches)) continue;
    const next = toDrawFile(raw.rules.pointsTables[t.drawType]!, playersFeed, matches);
    const previous = existing[t.id];
    if (previous && JSON.stringify(previous) === JSON.stringify(next)) continue;
    const valid = drawFileSchema.safeParse(next);
    if (!valid.success) {
      notes.push(`${t.name}: its draw feed had something unexpected, so the previous draw was kept.`);
      continue;
    }
    files[t.id] = next;
    changes.push(`Draw: ${t.name} ${previous ? 'updated' : 'added'}`);
  }
  return { files, changes, notes };
}
```

- [ ] **Step 3: `src/draws/validateDraws.ts`:**

```ts
import { drawFileSchema } from './drawSchema';

/** Each draw file must belong to a tracked tournament and match the schema. */
export function validateDrawFiles(files: Record<string, unknown>, tournamentIds: string[]): string[] {
  const errors: string[] = [];
  for (const [id, body] of Object.entries(files)) {
    const where = `data/draws/${id}.json`;
    if (!tournamentIds.includes(id)) {
      errors.push(`${where}: not a tracked tournament`);
      continue;
    }
    const parsed = drawFileSchema.safeParse(body);
    if (!parsed.success) errors.push(`${where}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  }
  return errors;
}
```

- [ ] **Step 4: Read, write and fetch.**
  - In `writeData.ts`, add `readDrawFiles(dir)` and `writeDrawFiles(dir, files)`, mirroring the match-file pair with the folder `draws` and type `DrawFile`.
  - In `feeds.ts`, export a fetcher for one event's feeds, used for completed events' first fill:

```ts
/** One event's players and matches feeds. */
export async function fetchEventFeeds(t: { wtaId?: number; startDate: string }, get: GetJson = getJson): Promise<{ players: EventPlayersFeed; matches: LiveMatch[] }> {
  const base = `${API}/tournaments/${t.wtaId}/${t.startDate.slice(0, 4)}`;
  const players = await get(`${base}/players`);
  if (!Array.isArray((players as EventPlayersFeed | null)?.events)) throw new Error(`Unexpected response from ${base}/players`);
  return { players: players as EventPlayersFeed, matches: arrayOf<LiveMatch>(await get(`${base}/matches`), 'matches', `${base}/matches`) };
}
```

- [ ] **Step 5: `scripts/update.ts`.** After the match update, and only when the season isn't blocked, update the draws:

```ts
const existingDraws = readDrawFiles(dir);
const drawFeeds = { players: { ...snapshot.eventPlayers }, matches: { ...snapshot.eventMatches } };
const drawFailures: string[] = [];
if (!result.problems.length) {
  // Completed events are fetched once, for their first draw file.
  for (const t of result.raw.tournaments) {
    if (t.wtaId === undefined || t.status !== 'completed' || existingDraws[t.id] || drawFeeds.matches[String(t.wtaId)]) continue;
    try {
      const feeds = await fetchEventFeeds(t);
      drawFeeds.players[String(t.wtaId)] = feeds.players;
      drawFeeds.matches[String(t.wtaId)] = feeds.matches;
    } catch {
      drawFailures.push(t.id);
    }
  }
}
const drawUpdate = result.problems.length ? { files: {}, changes: [], notes: [] } : updateDrawFiles(result.raw, drawFeeds, existingDraws, drawFailures);
```

Then:
- fold `drawUpdate` into `changed` (`|| Object.keys(drawUpdate.files).length > 0`), and into `base.changes` and `base.notes`;
- after `writeMatchFiles(...)`, call `writeDrawFiles(dir, drawUpdate.files)`.

Import `fetchEventFeeds`, `updateDrawFiles`, `readDrawFiles` and `writeDrawFiles`.

- [ ] **Step 6: `scripts/validate.ts`.** Also check draws:

```ts
const tournaments = read('tournaments.json') as { id: string }[];
errors.push(...validateDrawFiles(readDrawFiles(new URL('../data/', import.meta.url).pathname), tournaments.map((t) => t.id)));
```

Change the OK message to `Data OK: schema valid, every official race total reproduced, match and draw files valid.`

- [ ] **Step 7:** Run `npx tsc -b && npx vitest run && npm run validate`. Expected: all pass.
- [ ] **Step 8: First fill.**
  - `npm run update -- --dry-run`. Expected: "Draw: … added" for every tracked event whose draw is out, which is all completed events plus Beijing. Wuhan and later appear once their draws are made. No problems.
  - Then `npm run update`, then `npm run validate`.
  - **Real-data check** (a throwaway script): for every `data/draws/*.json`:
    - `buildBracket` returns a bracket;
    - its round count equals the event's points table length minus 1;
    - every feed match appears in the bracket exactly once;
    - for completed events, the champion matches the tracked player whose stored result there is `W`, if one is tracked.

    Report any event that fails, and fix the cause (not the check). Record any ruling.
- [ ] **Step 9:** Commit: `feat(update): keep data/draws current; first fill of every tracked draw`.

---

### Task 4: The tournament page

**Files:**
- Create: `src/ui/TournamentPage.tsx`, `src/ui/TournamentPage.test.tsx`
- Modify: `src/ui/styles.css`, `src/ui/hydration.test.tsx`

**Interfaces:** Produces `TournamentPage({ season, tournamentId, draw }: { season: Season; tournamentId: string; draw: DrawFile | null })`.

- [ ] **Step 1: Failing tests,** `src/ui/TournamentPage.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { DrawFile, DrawMatch } from '../draws/drawSchema';
import type { Season } from '../data/schema';
import { season } from '../test/fixtures';
import { TournamentPage } from './TournamentPage';

const p = (wtaId: number, name: string, seed: number | null = null) => ({ wtaId, name, country: null, seed, entry: null });
const played = (round: number, a: number, b: number, winner: number, score = '6-1 6-1'): DrawMatch => ({ round, a, b, winner, score, outcome: 'played' });
// The fixture's d32 table has 5 rounds before W, so use a 32-line draw: 4 named players (ana=1, bea=2) and fillers.
const players = [p(1, 'Ana Alpha', 1), p(2, 'Bea Beta', 2), ...Array.from({ length: 30 }, (_, i) => p(100 + i, `Filler ${i}`))];
const withIds = (): Season => {
  const s = structuredClone(season);
  s.players.find((x) => x.id === 'ana')!.wtaId = 1;
  s.players.find((x) => x.id === 'bea')!.wtaId = 2;
  return s;
};

/** Every match in a 32 draw, with ana winning the title and bea the runner-up. */
function completedDraw(): DrawFile {
  // ana tops the draw; bea tops the bottom half, so the final is ana v bea.
  const order = [players[0]!, ...players.slice(2, 17), players[1]!, ...players.slice(17)];
  const matches: DrawMatch[] = [];
  let alive = order.map((x) => x.wtaId);
  for (let round = 1; alive.length > 1; round++) {
    const next: number[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const [a, b] = [alive[i]!, alive[i + 1]!];
      const winner = a === 1 || a === 2 ? a : b === 1 || b === 2 ? b : a;
      matches.push(played(round, a, b, winner, round === 5 ? '6-3 6-4' : '6-1 6-1'));
      next.push(winner);
    }
    alive = next;
  }
  return { drawSize: 32, players: order, matches };
}

describe('TournamentPage', () => {
  it('shows a completed event: header, champion, our players and the full bracket', () => {
    const s = withIds();
    const draw = completedDraw();
    render(<TournamentPage season={s} tournamentId="c500" draw={draw} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('City 500 2026');
    expect(screen.getByText(/WTA 500 · Completed/)).toBeInTheDocument();
    expect(screen.getByText('Champion: Ana Alpha · Runner-up: Bea Beta · 6-3 6-4')).toBeInTheDocument();
    const ours = screen.getByRole('region', { name: 'Our players' });
    expect(within(ours).getByRole('link', { name: 'Ana Alpha' })).toHaveAttribute('href', '/players/ana/');
    expect(ours).toHaveTextContent('Ana Alpha — Winner · 100 pts');
    const bracket = screen.getByRole('region', { name: 'Draw' });
    expect(within(bracket).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['R32', 'R16', 'QF', 'SF', 'F']);
  });

  it('shows an event under way with a bracket from the quarterfinals and the earlier rounds as lists', () => {
    const s = withIds();
    const full = completedDraw();
    const draw = { ...full, matches: full.matches.filter((m) => m.round <= 2) };
    render(<TournamentPage season={s} tournamentId="live" draw={draw} />);
    expect(screen.getByText(/In progress/)).toBeInTheDocument();
    const region = screen.getByRole('region', { name: 'Draw' });
    expect(within(region).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['QF', 'SF', 'F']);
    expect(within(region).getByText('R16 (8 matches)')).toBeInTheDocument();
    expect(within(region).getByText('R32 (16 matches)')).toBeInTheDocument();
  });

  it("says when the draw hasn't been made, listing our entrants", () => {
    const s = withIds();
    s.tournaments.find((t) => t.id === 'next')!.entries = ['cat'];
    render(<TournamentPage season={s} tournamentId="next" draw={null} />);
    expect(screen.getByText("The draw hasn't been made yet.")).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Our players' })).toHaveTextContent('Cat Gamma — Entered');
  });
});
```

In `hydration.test.tsx`, add:

```tsx
  it('a tournament page hydrates cleanly', async () => {
    expect(await hydrationErrors(<TournamentPage season={season} tournamentId="next" draw={null} />)).toEqual([]);
  });
```

Run these. Expected: FAIL.

- [ ] **Step 2: `src/ui/TournamentPage.tsx`:**

```tsx
import type { Season, Tournament } from '../data/schema';
import { buildBracket, finalists, type BracketMatch, type Slot } from '../draws/bracket';
import type { DrawFile, DrawMatch } from '../draws/drawSchema';
import { pointsTable } from '../engine/lookup';
import { categoryLabel, flagEmoji, formatPoints } from './format';
import { UpdatedTime } from './UpdatedTime';

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dates = (t: Tournament) => `${day.format(new Date(`${t.startDate}T00:00:00Z`))} – ${day.format(new Date(`${t.endDate}T00:00:00Z`))}`;
const STATUS = { completed: 'Completed', 'in-progress': 'In progress', upcoming: 'Upcoming' } as const;

function Name({ wtaId, draw, season }: { wtaId: Slot; draw: DrawFile; season: Season }) {
  if (wtaId === 'bye') return <span className="bye">Bye</span>;
  if (wtaId === null) return <span className="tbd">—</span>;
  const p = draw.players.find((x) => x.wtaId === wtaId);
  const tracked = season.players.find((x) => x.wtaId === wtaId);
  const label = p?.name ?? String(wtaId);
  const tag = p?.seed ? ` [${p.seed}]` : p?.entry ? ` (${p.entry})` : '';
  return (
    <>
      {p?.country && <span aria-hidden="true">{flagEmoji(p.country)} </span>}
      {tracked ? <a href={`/players/${tracked.id}/`}>{label}</a> : label}
      {tag}
    </>
  );
}

function MatchBox({ m, draw, season }: { m: BracketMatch; draw: DrawFile; season: Season }) {
  const line = (slot: Slot) => (
    <div className={`line${m.winner !== null && slot === m.winner ? ' winner' : ''}`}>
      <Name wtaId={slot} draw={draw} season={season} />
    </div>
  );
  return (
    <div className="match">
      {line(m.top)}
      {line(m.bottom)}
      {m.score && <div className="score">{`${m.score}${m.outcome === 'retired' ? ' ret.' : ''}`}</div>}
      {m.outcome === 'walkover' && <div className="score">w/o</div>}
    </div>
  );
}

function RoundList({ label, matches, draw, season, open }: { label: string; matches: DrawMatch[]; draw: DrawFile; season: Season; open: boolean }) {
  return (
    <details open={open}>
      <summary>{`${label} (${matches.length} matches)`}</summary>
      <ul className="round-list">
        {matches.map((m, i) => {
          const loser = m.winner === m.a ? m.b : m.a;
          return (
            <li key={i}>
              {m.winner === null ? (
                <><Name wtaId={m.a} draw={draw} season={season} /> vs <Name wtaId={m.b} draw={draw} season={season} /></>
              ) : (
                <><Name wtaId={m.winner} draw={draw} season={season} /> d. <Name wtaId={loser} draw={draw} season={season} />{` ${m.outcome === 'walkover' ? 'w/o' : `${m.score}${m.outcome === 'retired' ? ' ret.' : ''}`}`}</>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** Our tracked players at this event: result and points, current round, or entered. */
function OurPlayers({ season, t }: { season: Season; t: Tournament }) {
  const table = pointsTable(season.rules, t.drawType);
  const label = (round: string) => (round === 'W' ? 'Winner' : round === 'ZP' ? 'Zero-pointer' : round);
  const rows = season.players.flatMap((p) => {
    const result = p.results.find((r) => r.tournamentId === t.id);
    const live = p.live.find((l) => l.tournamentId === t.id);
    if (t.status === 'in-progress' && live) return [{ p, text: live.round === 'W' && live.state === 'alive' ? 'Winner' : `${live.state === 'alive' ? 'Alive in' : 'Out in'} ${live.round}`, depth: table.findIndex((r) => r.round === live.round) }];
    if (result) return [{ p, text: `${label(result.round)}${result.round === 'ZP' ? '' : ` · ${formatPoints(result.points)} pts`}`, depth: result.round === 'ZP' ? -1 : table.findIndex((r) => r.round === result.round) }];
    if (t.entries?.includes(p.id)) return [{ p, text: 'Entered', depth: -2 }];
    return [];
  });
  rows.sort((a, b) => b.depth - a.depth);
  return (
    <section aria-label="Our players">
      <h2>Our players</h2>
      {rows.length ? (
        <ul className="our-players">
          {rows.map(({ p, text }) => (
            <li key={p.id}>
              <span aria-hidden="true">{flagEmoji(p.country)} </span>
              <a href={`/players/${p.id}/`}>{p.name}</a>
              {` — ${text}`}
            </li>
          ))}
        </ul>
      ) : (
        <p>None of our tracked players {t.status === 'upcoming' ? 'have entered yet' : 'played here'}.</p>
      )}
    </section>
  );
}

interface Props {
  season: Season;
  tournamentId: string;
  /** Null until the draw is out. */
  draw: DrawFile | null;
}

/** An event: header, our players, and its draw (full bracket once completed; from the quarterfinals while live). */
export function TournamentPage({ season, tournamentId, draw }: Props) {
  const t = season.tournaments.find((x) => x.id === tournamentId)!;
  const year = t.startDate.slice(0, 4);
  const table = pointsTable(season.rules, t.drawType);
  const bracket = draw ? buildBracket(draw) : null;
  const final = bracket ? finalists(bracket) : null;
  const nameOf = (id: number | null) => (id === null ? '' : draw?.players.find((p) => p.wtaId === id)?.name ?? String(id));
  const roundLabel = (round: number) => table[round - 1]?.round ?? `R${round}`;
  const qf = table.findIndex((r) => r.round === 'QF') + 1;
  const firstShown = t.status === 'completed' ? 1 : Math.max(1, qf);
  const current = draw?.matches.find((m) => m.winner === null)?.round ?? 0;
  return (
    <div className="app tournament-page">
      <nav className="crumbs"><a href="/">← Full standings</a></nav>
      <header className="header">
        <h1>{`${t.name} ${year}`}</h1>
        <p className="player-status">
          {`${categoryLabel(t.category)} · ${STATUS[t.status]} · ${dates(t)}${draw ? ` · ${draw.drawSize}-player draw` : ''}`}
        </p>
        {final?.champion != null && (
          <p className="champion">{`Champion: ${nameOf(final.champion)} · Runner-up: ${nameOf(final.runnerUp)}${final.score ? ` · ${final.score}` : ''}`}</p>
        )}
        <UpdatedTime iso={season.meta.lastUpdated} />
      </header>
      <main>
        <OurPlayers season={season} t={t} />
        <section aria-label="Draw">
          <h2>Draw</h2>
          {!draw ? (
            <p>The draw hasn't been made yet.</p>
          ) : !bracket ? (
            <p>The draw is out, but its first round isn't complete in the WTA's data yet.</p>
          ) : (
            <>
              <div className="bracket">
                {bracket.rounds.slice(firstShown - 1).map((round, i) => (
                  <div className="bracket-round" key={firstShown + i}>
                    <h3>{roundLabel(firstShown + i)}</h3>
                    <div className="bracket-matches">
                      {round.map((m, j) => <MatchBox key={j} m={m} draw={draw} season={season} />)}
                    </div>
                  </div>
                ))}
              </div>
              {firstShown > 1 &&
                Array.from({ length: firstShown - 1 }, (_, i) => firstShown - 1 - i).map((round) => (
                  <RoundList
                    key={round}
                    label={roundLabel(round)}
                    matches={draw.matches.filter((m) => m.round === round)}
                    draw={draw}
                    season={season}
                    open={round === current}
                  />
                ))}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
```

`status` in the fixture's `live` event is `in-progress`, which gives "In progress". In the "under way" test, the draw has rounds 1–2 played, so the current round (first undecided) is 3, and both list sections render collapsed.

- [ ] **Step 3: Styles.** Append to `styles.css`:

```css
.tournament-page h2 { font-size: 1.1rem; margin: 20px 0 8px; }
.champion { margin: 0 0 6px; font-weight: 600; }
.our-players { margin: 0; padding-left: 20px; }
.our-players a, .tournament-page .bracket a, .round-list a { color: var(--accent-text); }
.bracket { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
.bracket-round { display: flex; flex-direction: column; min-width: 180px; }
.bracket-round h3 { margin: 0 0 6px; font-size: 0.85rem; color: var(--muted); }
.bracket-matches { display: flex; flex-direction: column; justify-content: space-around; flex: 1; gap: 6px; }
.match { border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; font-size: 0.85rem; }
.match .line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.match .line.winner { font-weight: 600; }
.match .score { color: var(--muted); font-size: 0.8rem; font-variant-numeric: tabular-nums; }
.match .bye, .match .tbd { color: var(--muted); }
.tournament-page details { margin: 8px 0; }
.tournament-page summary { cursor: pointer; font-weight: 600; }
.round-list { margin: 4px 0; padding-left: 20px; font-size: 0.9rem; }
```

- [ ] **Step 4:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(ui): tournament page — header, our players, bracket and round lists`.

---

### Task 5: Prerendering, routing and links

**Files:**
- Create: `tournament.html`, `src/entry-tournament.tsx`
- Modify: `vite.config.ts`, `src/prerender/pages.tsx`, `src/prerender/pages.test.tsx`, `scripts/prerender.ts`, `src/ui/PlayerPage.tsx`, `src/ui/PlayerPage.test.tsx`, `src/ui/ScenarioEditor.tsx`, `src/ui/ScenarioEditor.test.tsx`

- [ ] **Step 1: Failing tests.** In `src/prerender/pages.test.tsx`, add `tournamentHtml` to the import and:

```tsx
  it('writes a tournament page with its own title, description and embedded draw', () => {
    const html = tournamentHtml(PLAYER, season, 'next', null);
    expect(html).toContain('<title>Next Open 2026: draw and results</title>');
    expect(html).toContain('<link rel="canonical" href="https://finalsrace.win/tournaments/next/" />');
    expect(html).toContain('<script id="page-data" type="application/json">{"tournamentId":"next","draw":null}</script>');
    expect(html).toContain('The draw hasn&#x27;t been made yet.');
  });

  it('lists tournament pages in the sitemap', () => {
    expect(sitemapXml(season)).toContain('<loc>https://finalsrace.win/tournaments/next/</loc>');
  });
```

React escapes the apostrophe as `&#x27;`. If its output differs, match what `renderToString` produces.

In `PlayerPage.test.tsx`, add:

```tsx
  it('links a tracked tournament to its page', () => {
    const s = structuredClone(season);
    s.tournaments.find((t) => t.id === 'c500')!.wtaId = 903;
    render(<PlayerPage season={s} playerId="ana" matches={matches} />);
    expect(within(screen.getByRole('region', { name: 'City 500' })).getByRole('link', { name: 'City 500' })).toHaveAttribute('href', '/tournaments/c500/');
  });
```

In `ScenarioEditor.test.tsx`, add:

```tsx
  it('links the selected tournament to its page', () => {
    setup();
    expect(screen.getByRole('link', { name: 'Tournament page →' })).toHaveAttribute('href', `/tournaments/${screen.getByRole('combobox', { name: 'Tournament' }).getAttribute('value') ?? 'live'}/`);
  });
```

If the select's `value` attribute isn't exposed in jsdom, assert against the first remaining tournament's id (`live`) directly.

Run these. Expected: FAIL.

- [ ] **Step 2: Implement.**
  - **`pages.tsx`:**
    - Add `tournamentHtml(template, season, tournamentId, draw)`. It mirrors `playerHtml`: title `${t.name} ${year}: draw and results`, canonical `/tournaments/<id>/`, the same og/twitter tags, and the embedded `{ tournamentId, draw }`. It renders `<TournamentPage …/>`.
    - The description:
      - for a completed event with a champion: `${champion} won ${t.name} ${year} (${categoryLabel}), beating ${runnerUp} ${score} in the final. Full draw and results.`;
      - in progress: `${t.name} ${year} (${level}) is under way. The draw, results and where our players stand.`;
      - upcoming: `${t.name} ${year} (${level}) starts ${date}. Draw and entry list.`
    - The sitemap adds `/tournaments/${t.id}/` for every tournament with a `wtaId`.
  - **`tournament.html`:** a copy of `player.html` with the script `/src/entry-tournament.tsx`.
  - **`src/entry-tournament.tsx`:** mirrors `entry-player.tsx`.
    - The embedded data is `{ tournamentId, draw }`.
    - In development, the id comes from `/tournaments/<id>/` or `?id=`, and the draw from `import.meta.glob('../data/draws/*.json')`, gated on `import.meta.env.DEV`. It falls back to `null`.
    - It renders `TournamentPage`.
  - **`vite.config.ts`:**
    - add the `tournament` build input;
    - extend the dev middleware to rewrite `/tournaments/<id>/` to `/tournament.html?id=<id>`.
  - **`scripts/prerender.ts`:**
    - read the `tournament.html` template and the draw files (`readDrawFiles`);
    - write `dist/tournaments/<id>/index.html` for every tournament with a `wtaId`;
    - remove `dist/tournament.html`;
    - log the count.
  - **`PlayerPage.tsx`:**
    - in `Tournament`, find the tracked tournament: `season.tournaments.find((x) => x.wtaId === t.matches[0].tournamentId && Number(x.startDate.slice(0, 4)) === t.matches[0].year)`;
    - if found, render the `h3` text as `<a href={`/tournaments/${found.id}/`}>`.
  - **`ScenarioEditor.tsx`:** in `ByTournament`, after the select, add `<a className="tournament-link" href={`/tournaments/${tournament.id}/`}>Tournament page →</a>`.
- [ ] **Step 3:** Run `npx tsc -b && npx vitest run && npm run build`. Expected:
  - all pass;
  - "Prerendered the homepage, 40 player pages and 51 tournament pages";
  - `dist/tournaments/toronto-2026/index.html` contains "Champion: Iga Swiatek".
- [ ] **Step 4:** Commit: `feat: prerendered tournament pages, linked from player pages and the editor`.

---

### Task 6: End-to-end, browser check and docs

**Files:**
- Create: `e2e/tournament.spec.ts`
- Modify: `README.md`, `data/SOURCES.md`

- [ ] **Step 1: `e2e/tournament.spec.ts`:**

```ts
import { expect, test } from '@playwright/test';

test('a player page links to a tournament page, which links back to players', async ({ page }) => {
  await page.goto('/players/iga-swiatek/');
  await page.getByRole('link', { name: 'Toronto' }).first().click();
  await expect(page).toHaveURL(/\/tournaments\/toronto-2026\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Toronto 2026');
  await expect(page.getByText(/^Champion: Iga Swiatek/)).toBeVisible();
  await page.getByRole('region', { name: 'Our players' }).getByRole('link', { name: 'Elena Rybakina' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Elena Rybakina');
});

test('the scenario editor links to the selected tournament page', async ({ page }) => {
  await page.goto('/');
  const href = await page.getByRole('link', { name: 'Tournament page →' }).getAttribute('href');
  await page.getByRole('link', { name: 'Tournament page →' }).click();
  await expect(page).toHaveURL(new RegExp(`${href!.replace(/\//g, '\\/')}$`));
  await expect(page.getByRole('region', { name: 'Draw' })).toBeVisible();
});
```

- [ ] **Step 2:** Run `npm run build && npm run test:e2e`. Expected: all pass.
- [ ] **Step 3: Browser check** on `npm run preview`:
  - Toronto (completed 96 draw) at desktop and at phone width in dark mode: the bracket scrolls sideways and the winner is bold;
  - Beijing (in progress): the quarterfinal bracket, plus round lists;
  - Wuhan (upcoming): no draw, with entrants listed;
  - no console errors or hydration warnings.
- [ ] **Step 4: Docs.**
  - **`data/SOURCES.md`:** a section `## Draws (data/draws/)`:
    - sources;
    - written only once the draw is out;
    - draw order doesn't count byes, and how the bracket is rebuilt;
    - winner codes;
    - never blocks.
  - **`README.md`:**
    - tournament pages;
    - dev routes `/tournaments/<id>/`;
    - the updater keeping draws current;
    - validate checks draws.
- [ ] **Step 5:** Run `npx tsc -b && npx vitest run && npm run build && npm run test:e2e`. Expected: all pass.
- [ ] **Step 6:** Commit: `test(e2e): tournament pages; docs`.

## Review Focus

- **A 56, 48 or 28 draw** (byes 8, 16 or 4). Expected: the bracket builds exactly. Covered by the Task 3 real-data check over every stored draw.
- **A withdrawal after the draw replaced by a lucky loser.** The players feed may list the LL in place, or keep both. Expected: the bracket still fits, or `buildBracket` returns null and the page says the first round isn't complete. Covered by the `lines.length !== size` guard.
- **Hong Kong 2025 and a future Hong Kong 2026 share a WTA id.** Draw feeds are keyed by WTA id, and only one year is tracked now. Flag it if both are ever tracked.
- **An event credited in the same run.** Its feeds were fetched (it was in progress at fetch time), so the final draw is written. Covered by `updateDrawFiles` using the run's feeds.
- **Hourly churn for live events:** "Draw: Beijing updated" whenever a match finishes, which is expected. No churn when nothing changed.
