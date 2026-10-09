# Automatic Data Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** an hourly GitHub workflow that refreshes `data/` from the official WTA feeds. It publishes when every check passes. Otherwise it opens a single `data-update` issue for a human. The header shows the update time in the visitor's own time zone.

**Architecture:**
- A pure function `updateSeason(raw, snapshot)` takes the raw data files and a snapshot of the WTA feeds. It returns the updated raw data, change lines, notes and problems.
- The work is split into focused stages:
  - totals;
  - new players;
  - events, draws and live rounds;
  - entry lists;
  - crediting finished events.
- `feeds.ts` is the only module that touches the network.
- A CLI ties fetch, update, validate and write together.
- A small script manages the issue.
- The update workflow commits the result, then calls the existing CI workflow (made reusable) to check and deploy.

**Tech Stack:** TypeScript (tsx scripts), Vitest, Zod schema, GitHub Actions, GitHub REST API, `api.wtatennis.com` public JSON.

**Spec:** `docs/superpowers/specs/2026-10-09-automatic-data-updates-design.md`

## Global Constraints

- Run Node via `export PATH=/opt/homebrew/bin:$PATH` (Node 23). After `npx tsc -b`, delete `tsconfig.tsbuildinfo`.
- Never change these:
  - stored results at already-completed events;
  - zero-pointers;
  - `qualified`;
  - `eventMinimumWaived`;
  - any `rules.json` field except `trackedPlayerCount`, which is the number of tracked players and only grows.
- Publish only if `validateSeason` passes, meaning every official total is reproduced.
- Never publish while an untracked player is in the race top 40.
- Data files keep their existing format:
  - 2-space JSON, unescaped Unicode;
  - `meta.json` on one line;
  - each file's existing trailing-newline state.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Automated data commits are authored by `github-actions[bot]` and carry no co-author line.

## Feed facts (verified 2026-10-09)

- **Race ranking:** `players/ranked?...metric=CHAMPSINGLES` returns a JSON array of `{ranking, points, tournamentsPlayed, player:{id, fullName, countryCode}}`.
- **Calendar:** `tournaments/?page=N&pageSize=100&...` returns at most 100 entries per page, so it has to be paged. Each entry has `status` (`past` | `live` | `inProgress` | `future`) and `tournamentGroup.id`. That id is the WTA tournament id.
- **Event matches:** `tournaments/{id}/{year}/matches` returns `{matches: [...]}`, an empty array before the draw.
  - Main singles matches have `DrawMatchType 'S'` and `DrawLevelType 'M'`.
  - `RoundID` is a number (1, 2, … from the first round) or `'Q'`, `'S'` or `'F'`.
  - `MatchState` is `'F'` when finished, `'U'` otherwise.
  - `Winner` codes: 2 = A, 3 = B, 4 = A on retirement, 5 = B on retirement. Even means A. It's missing until the match is played.
- **Event players:** `tournaments/{id}/{year}/players` returns `{events:[{eventTypeCode, eventPlayers:[{players:[{id, fullName}], seed, entryType}]}]}`.
  - `LS` is the singles main draw (the entry list before the draw, the draw order after).
  - `RS` is singles qualifying.
- **Player matches:** `players/{id}/matches?...&type=S` returns `{matches:[...]}`.
  - `tourn_nbr` may have a leading space.
  - `winner` is 1 or 2, the side.
  - `points_champ_1` and `points_champ_2` are the race points.

---

### Task 1: "Data updated" in the visitor's time zone

**Files:**
- Modify: `src/ui/format.ts`, `src/ui/format.test.ts`, `src/ui/App.test.tsx`

**Interfaces:** Produces `formatUpdated(iso: string, options?: { timeZone?: string; locale?: string; now?: Date }): string`.

- [ ] **Step 1: Failing tests.** In `src/ui/format.test.ts`, replace the `'formats the update time in UTC'` test with:

```ts
  it('formats the update time in a given time zone, naming the zone', () => {
    const now = new Date('2026-10-09T18:00:00Z');
    expect(formatUpdated('2026-10-09T13:03:00Z', { timeZone: 'America/New_York', locale: 'en-US', now })).toBe('Oct 9, 9:03 AM EDT');
    expect(formatUpdated('2026-10-09T13:03:00Z', { timeZone: 'UTC', locale: 'en-US', now })).toBe('Oct 9, 1:03 PM UTC');
  });
  it('adds the year only when it is not the current year', () => {
    const now = new Date('2027-01-05T00:00:00Z');
    expect(formatUpdated('2026-10-09T13:03:00Z', { timeZone: 'UTC', locale: 'en-US', now })).toBe('Oct 9, 2026, 1:03 PM UTC');
  });
```

In `src/ui/App.test.tsx`, change `expect(screen.getByText('Data updated 2026-10-07 12:00 UTC')).toBeInTheDocument();` to:

```ts
    expect(screen.getByText(/^Data updated Oct 7/)).toBeInTheDocument();
```

Run: `npx vitest run src/ui/format.test.ts`. Expected: FAIL.

- [ ] **Step 2: Implement.** Replace `formatUpdated` in `src/ui/format.ts`:

```ts
/** The update time in the visitor's time zone (or `timeZone`), naming the zone; the year only when it isn't this year. */
export function formatUpdated(iso: string, options: { timeZone?: string; locale?: string; now?: Date } = {}): string {
  const { timeZone, locale, now = new Date() } = options;
  const date = new Date(iso);
  const yearOf = (d: Date) => new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(d);
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(yearOf(date) === yearOf(now) ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(date);
}
```

- [ ] **Step 3:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 4:** Commit: `feat(ui): show the update time in the visitor's time zone`.

---

### Task 2: WTA ids in the data

**Files:**
- Modify: `src/data/schema.ts`, `src/data/schema.test.ts`, `data/players.json`, `data/tournaments.json`, `data/SOURCES.md`

**Interfaces:** Produces optional `wtaId: number` on tournaments and players, unique within each list.

- [ ] **Step 1: Failing tests** in `src/data/schema.test.ts`, before `'reports field-level problems with their path'`:

```ts
  it('accepts WTA ids on players and tournaments', () => {
    expect(errorsFor((raw) => { raw.players[0]!.wtaId = 1; raw.tournaments[0]!.wtaId = 901; })).toBe('');
  });

  it('rejects a WTA id used twice', () => {
    expect(errorsFor((raw) => { raw.players[0]!.wtaId = 1; raw.players[1]!.wtaId = 1; })).toContain('Duplicate player wtaId 1');
  });
```

Run them. Expected: FAIL. The duplicate test fails, and `tsc` rejects the unknown property.

- [ ] **Step 2: Implement.** In `tournamentSchema`, after `entries`, and in the player schema, after `id`, add:

```ts
  /** The WTA's own id for this tournament (calendar `tournamentGroup.id`) / player, used by the updater. */
  wtaId: z.number().int().positive().optional(),
```

In `superRefine`, after the existing duplicate checks:

```ts
    const duplicateWtaIds = (ids: (number | undefined)[], kind: string) => {
      const seen = new Set<number>();
      for (const value of ids) {
        if (value === undefined) continue;
        if (seen.has(value)) issue(`Duplicate ${kind} wtaId ${value}`);
        seen.add(value);
      }
    };
    duplicateWtaIds(s.tournaments.map((t) => `${t.wtaId}-${t.startDate.slice(0, 4)}`).map(() => undefined), 'tournament');
    duplicateWtaIds(s.players.map((p) => p.wtaId), 'player');
```

Tournament ids repeat across years (Hong Kong 2025 and 2026), so tournaments aren't checked for duplicates. The line above is a deliberate no-op; delete it rather than keep it. Keep only the player check.

- [ ] **Step 3: Backfill the data.** This is a one-off script in the scratchpad, not committed. Match players by exact `fullName` from the race feed (`pageSize=100`). Match tournaments by `startDate` and level from the paged calendar, narrowing by city or title when more than one matches. The `zp-*` placeholders get no id.
  - Insert `wtaId` right after `id` in each object.
  - Write with `json.dumps(indent=2, ensure_ascii=False)`, preserving the file's trailing newline.
  - It must match all 40 players and every non-placeholder tournament uniquely (verified 2026-10-09); stop if anything is unmatched.
- [ ] **Step 4:** Add to `data/SOURCES.md`, under Players and under Tournaments:

```md
- **`wtaId`** (2026-10-09): the WTA's ids, used by the automatic updater. Players were matched by exact full name in the race ranking feed. Tournaments were matched by start date and level in the calendar feed (`tournamentGroup.id`).
```

- [ ] **Step 5:** Run `npx tsc -b && npx vitest run && npm run validate`. Expected: all pass, `Data OK`.
- [ ] **Step 6:** Commit: `data: WTA ids for players and tournaments`.

---

### Task 3: Feed types, shared helpers, totals stage and the orchestrator

**Files:**
- Create: `src/update/feedTypes.ts`, `src/update/shared.ts`, `src/update/totals.ts`, `src/update/updateSeason.ts`, `src/update/testFeeds.ts`
- Test: `src/update/updateSeason.test.ts`

**Interfaces:**
- `updateSeason(raw: SeasonInput, snap: FeedSnapshot): UpdateResult`, where `UpdateResult = { raw; changed: boolean; changes: string[]; notes: string[]; problems: string[] }`.
- Later tasks add stage calls inside `updateSeason`, in this order:
  1. `updateTotals`
  2. `addNewPlayers`
  3. `updateEvents`
  4. `updateEntries`
  5. `creditFinished`

  Each takes a `Ctx`.

- [ ] **Step 1: `src/update/feedTypes.ts`:**

```ts
/** The parts of the WTA API responses the updater reads. Field names are the API's own. */
export interface RaceRow {
  ranking: number;
  points: number;
  tournamentsPlayed: number;
  player: { id: number; fullName: string; countryCode: string };
}

export interface CalendarEvent {
  tournamentGroup: { id: number; name: string };
  year: number;
  title: string;
  city: string;
  level: string;
  startDate: string;
  endDate: string;
  /** 'past' | 'live' | 'inProgress' | 'future' */
  status: string;
  singlesDrawSize: number;
}

export interface EventPlayer {
  players: { id: number; fullName: string }[];
  seed: string | number | null;
  entryType: string | null;
}

export interface EventPlayersFeed {
  /** 'LS' singles main draw (entry list before the draw, draw order after); 'RS' singles qualifying. */
  events: { eventTypeCode: string; eventPlayers: EventPlayer[] }[];
}

export interface LiveMatch {
  /** 'S' singles. */
  DrawMatchType: string;
  /** 'M' main draw, 'Q' qualifying. */
  DrawLevelType: string;
  /** 1, 2, … counting from the first round; 'Q', 'S', 'F' for the quarterfinal, semifinal and final. */
  RoundID: string | number;
  /** 'F' finished; anything else not finished. */
  MatchState: string;
  PlayerIDA: string | number;
  PlayerIDB: string | number;
  /** Even: player A won (2, or 4 on retirement); odd: player B won (3, or 5). Missing until played. */
  Winner?: string | number | null;
}

export interface PlayerMatchTournament {
  tournamentGroup: { id: number; name: string };
  year: number;
  title: string;
  city: string;
  level: string;
  startDate: string;
  endDate: string;
  singlesDrawSize: number;
}

export interface PlayerMatch {
  /** WTA tournament id, sometimes with a leading space. */
  tourn_nbr: string;
  tourn_year: string;
  /** 1, 2, … within the draw (main or qualifying). */
  tourn_round: string;
  /** R128 … R16, 'Q' quarterfinal, 'S' semifinal, 'F' final. */
  round_name: string;
  /** 'M' main draw, 'Q' qualifying. */
  qpm_flag: string;
  player_1: string;
  player_2: string;
  /** 1 or 2: which side won. */
  winner: number | string;
  points_champ_1: number | null;
  points_champ_2: number | null;
  StartDate: string;
  TournamentName: string;
  TournamentLevel?: string | null;
  tournament?: PlayerMatchTournament;
}

export interface FeedSnapshot {
  race: RaceRow[];
  calendar: CalendarEvent[];
  /** Keyed by WTA tournament id. */
  eventPlayers: Record<string, EventPlayersFeed>;
  eventMatches: Record<string, LiveMatch[]>;
  /** Keyed by WTA player id; only the feeds the update needs. */
  playerMatches: Record<string, PlayerMatch[]>;
}
```

- [ ] **Step 2: `src/update/shared.ts`:**

```ts
import type { Rules, SeasonInput } from '../data/schema';
import { pointsTable } from '../engine/lookup';
import type { CalendarEvent, EventPlayer, FeedSnapshot, LiveMatch } from './feedTypes';

export type RawSeason = SeasonInput;
export type RawTournament = RawSeason['tournaments'][number];
export type RawPlayer = RawSeason['players'][number];

/** Everything a stage reads and writes. Stages mutate `raw`, which is the updater's own copy. */
export interface Ctx {
  raw: RawSeason;
  snap: FeedSnapshot;
  changes: string[];
  notes: string[];
  problems: string[];
}

/** The race's top players must always be tracked, so the Q/Out bound on untracked players holds. */
export const TOP = 40;

export const yearOf = (t: { startDate: string }) => Number(t.startDate.slice(0, 4));

export const tableOf = (ctx: Ctx, t: RawTournament) => pointsTable(ctx.raw.rules as Rules, t.drawType);

export const calendarEvent = (ctx: Ctx, t: RawTournament): CalendarEvent | undefined =>
  ctx.snap.calendar.find((c) => c.tournamentGroup.id === t.wtaId && c.year === yearOf(t));

/** Main-draw singles matches of an event. */
export const mainSinglesMatches = (ctx: Ctx, t: RawTournament): LiveMatch[] =>
  (ctx.snap.eventMatches[String(t.wtaId)] ?? []).filter((m) => m.DrawMatchType === 'S' && m.DrawLevelType === 'M');

/** The singles main-draw list: the entry list before the draw, the draw order after. */
export const singlesList = (ctx: Ctx, t: RawTournament): EventPlayer[] =>
  ctx.snap.eventPlayers[String(t.wtaId)]?.events.find((e) => e.eventTypeCode === 'LS')?.eventPlayers ?? [];

export const nameOf = (ctx: Ctx, playerId: string) => ctx.raw.players.find((p) => p.id === playerId)?.name ?? playerId;

export const sameMembers = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
```

- [ ] **Step 3: `src/update/testFeeds.ts`.** These are synthetic feeds that agree with the fixture season.

```ts
// SYNTHETIC TEST FEEDS that agree with src/test/fixtures.ts (with WTA ids added). Not real WTA data.
import type { SeasonInput } from '../data/schema';
import { rawSeason } from '../test/fixtures';
import type { CalendarEvent, EventPlayer, FeedSnapshot, LiveMatch, PlayerMatch, RaceRow } from './feedTypes';

export const TOURNAMENT_IDS: Record<string, number> = { slam: 901, m1000: 902, c500: 903, c250: 904, live: 905, next: 906, clash: 907 };
export const PLAYER_IDS: Record<string, number> = { ana: 1, bea: 2, cat: 3 };

export function updaterSeason(): SeasonInput {
  const raw = rawSeason();
  for (const t of raw.tournaments) t.wtaId = TOURNAMENT_IDS[t.id];
  for (const p of raw.players) p.wtaId = PLAYER_IDS[p.id];
  return raw;
}

const filler = (position: number) => 100 + position;

/** A draw of `size` with tracked players at fixed positions; everyone else is a filler id. */
export function drawList(size: number, placed: Record<number, number>): EventPlayer[] {
  return Array.from({ length: size }, (_, i) => {
    const id = placed[i + 1] ?? filler(i + 1);
    return { players: [{ id, fullName: `Player ${id}` }], seed: '', entryType: '' };
  });
}

export function match(round: string | number, a: number, b: number, winner?: number): LiveMatch {
  return {
    DrawMatchType: 'S',
    DrawLevelType: 'M',
    RoundID: round,
    MatchState: winner === undefined ? 'U' : 'F',
    PlayerIDA: String(a),
    PlayerIDB: String(b),
    ...(winner === undefined ? {} : { Winner: winner === a ? '2' : '3' }),
  };
}

/** The live event as the fixture has it: ana (position 1) alive in the QF, bea (9) out in the R16. */
export function liveMatches(extra: LiveMatch[] = []): LiveMatch[] {
  const at = (position: number) => (position === 1 ? 1 : position === 9 ? 2 : filler(position));
  const r1 = Array.from({ length: 16 }, (_, i) => match(1, at(2 * i + 1), at(2 * i + 2), at(2 * i + 1)));
  const r2 = Array.from({ length: 8 }, (_, i) => {
    const a = at(4 * i + 1);
    const b = at(4 * i + 3);
    return match(2, a, b, i === 2 ? b : a);
  });
  const qf = extra.some((m) => String(m.RoundID) === 'Q' && (m.PlayerIDA === '1' || m.PlayerIDB === '1')) ? [] : [match('Q', 1, filler(5))];
  return [...r1, ...r2, ...qf, ...extra];
}

const calendarEntry = (raw: SeasonInput, id: string, status: string, singlesDrawSize = 32): CalendarEvent => {
  const t = raw.tournaments.find((x) => x.id === id)!;
  return {
    tournamentGroup: { id: TOURNAMENT_IDS[id]!, name: t.name.toUpperCase() },
    year: Number(t.startDate.slice(0, 4)),
    title: t.name,
    city: t.name.toUpperCase(),
    level: t.category,
    startDate: t.startDate,
    endDate: t.endDate,
    status,
    singlesDrawSize,
  };
};

export function raceRows(raw: SeasonInput, overrides: Record<string, number> = {}): RaceRow[] {
  return raw.players.map((p, i) => ({
    ranking: i + 1,
    points: overrides[p.id] ?? p.officialRaceTotal,
    tournamentsPlayed: p.results.length,
    player: { id: PLAYER_IDS[p.id]!, fullName: p.name, countryCode: 'USA' },
  }));
}

/** Feeds that agree with the fixture season: nothing new except what the feeds always add (draw size, positions, entries). */
export function snapshot(raw: SeasonInput = updaterSeason()): FeedSnapshot {
  const status: Record<string, string> = { live: 'live', next: 'future', clash: 'future' };
  return {
    race: raceRows(raw),
    calendar: raw.tournaments.map((t) => calendarEntry(raw, t.id, status[t.id] ?? 'past')),
    eventPlayers: {
      [TOURNAMENT_IDS.live!]: { events: [{ eventTypeCode: 'LS', eventPlayers: drawList(32, { 1: 1, 9: 2 }) }] },
      [TOURNAMENT_IDS.next!]: { events: [{ eventTypeCode: 'LS', eventPlayers: drawList(2, { 1: 1, 2: 3 }) }] },
      [TOURNAMENT_IDS.clash!]: { events: [] },
    },
    eventMatches: { [TOURNAMENT_IDS.live!]: liveMatches(), [TOURNAMENT_IDS.next!]: [], [TOURNAMENT_IDS.clash!]: [] },
    playerMatches: {},
  };
}

export function playerMatch(over: Partial<PlayerMatch> & Pick<PlayerMatch, 'tourn_nbr' | 'player_1'>): PlayerMatch {
  return {
    tourn_year: '2026',
    tourn_round: '1',
    round_name: 'R32',
    qpm_flag: 'M',
    player_2: '999',
    winner: 2,
    points_champ_1: null,
    points_champ_2: null,
    StartDate: '2026-01-01T00:00:00+00:00',
    TournamentName: 'X',
    ...over,
  };
}
```

- [ ] **Step 4: Failing tests** in `src/update/updateSeason.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { raceRows, snapshot, updaterSeason } from './testFeeds';
import { updateSeason } from './updateSeason';

describe('updateSeason: totals', () => {
  it('takes official totals from the race ranking feed', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.race = raceRows(raw, { cat: 141 });
    const result = updateSeason(raw, snap);
    expect(result.raw.players.find((p) => p.id === 'cat')!.officialRaceTotal).toBe(141);
    expect(result.changes).toContain('Race total: Cat Gamma 140 → 141');
  });

  it('reports a total that no longer reproduces, instead of publishing', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.race = raceRows(raw, { bea: 800 });
    expect(updateSeason(raw, snap).problems).toContain('Bea Beta (bea): engine total 765 ≠ official 800');
  });

  it('reports a tracked player missing from the race feed', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.race = snap.race.filter((r) => r.player.id !== 3);
    expect(updateSeason(raw, snap).problems).toContain('Cat Gamma is tracked but missing from the race ranking feed.');
  });

  it('never changes the input it was given', () => {
    const raw = updaterSeason();
    const copy = structuredClone(raw);
    updateSeason(raw, snapshot(raw));
    expect(raw).toEqual(copy);
  });
});
```

Run: `npx vitest run src/update`. Expected: FAIL, because `./updateSeason` doesn't exist.

- [ ] **Step 5: `src/update/totals.ts`:**

```ts
import type { Ctx } from './shared';

/** Official race totals for every tracked player, from the race ranking feed. */
export function updateTotals(ctx: Ctx): void {
  for (const p of ctx.raw.players) {
    const row = ctx.snap.race.find((r) => r.player.id === p.wtaId);
    if (!row) {
      ctx.problems.push(`${p.name} is tracked but missing from the race ranking feed.`);
      continue;
    }
    if (row.points !== p.officialRaceTotal) {
      ctx.changes.push(`Race total: ${p.name} ${p.officialRaceTotal} → ${row.points}`);
      p.officialRaceTotal = row.points;
    }
  }
}
```

- [ ] **Step 6: `src/update/updateSeason.ts`:**

```ts
import { validateSeason } from '../data/validateSeason';
import type { FeedSnapshot } from './feedTypes';
import type { Ctx, RawSeason } from './shared';
import { updateTotals } from './totals';

export interface UpdateResult {
  raw: RawSeason;
  /** Whether any data differs from the input. */
  changed: boolean;
  /** One line per change, for the commit message. */
  changes: string[];
  /** Things worth knowing that didn't stop the update (e.g. an entry list kept because the feed emptied). */
  notes: string[];
  /** Anything that needs a human. When non-empty, nothing may be published. */
  problems: string[];
}

/** Refreshes a copy of the raw season from a snapshot of the WTA feeds. Pure: no I/O. */
export function updateSeason(raw: RawSeason, snap: FeedSnapshot): UpdateResult {
  const ctx: Ctx = { raw: structuredClone(raw), snap, changes: [], notes: [], problems: [] };
  updateTotals(ctx);
  if (ctx.problems.length === 0) ctx.problems.push(...validateSeason(ctx.raw));
  const changed = JSON.stringify(ctx.raw) !== JSON.stringify(raw);
  if (changed && ctx.changes.length === 0) ctx.changes.push('Data refresh');
  return { raw: ctx.raw, changed, changes: ctx.changes, notes: ctx.notes, problems: ctx.problems };
}
```

- [ ] **Step 7:** Run `npx tsc -b && npx vitest run src/update`. Expected: PASS.
- [ ] **Step 8:** Commit: `feat(update): feed types, totals stage and updateSeason`.

---

### Task 4: Events, draws and live rounds

**Files:**
- Create: `src/update/events.ts`
- Modify: `src/update/updateSeason.ts` (call `updateEvents` after `updateTotals`), `src/update/updateSeason.test.ts`

**Interfaces:** Produces `updateEvents(ctx)`, `liveState(...)` and `roundIndex(...)`.

- [ ] **Step 1: Failing tests,** appended to `updateSeason.test.ts`. Add `drawList`, `liveMatches`, `match` and `TOURNAMENT_IDS` to the `./testFeeds` import.

```ts
const player = (raw: ReturnType<typeof updaterSeason>, id: string) => raw.players.find((p) => p.id === id)!;
const liveOf = (raw: ReturnType<typeof updaterSeason>, id: string, t: string) => player(raw, id).live?.find((l) => l.tournamentId === t);

describe('updateSeason: events in progress', () => {
  it('records the draw size and each alive player position', () => {
    const result = updateSeason(updaterSeason(), snapshot());
    expect(result.problems).toEqual([]);
    expect(result.raw.tournaments.find((t) => t.id === 'live')!.drawSize).toBe(32);
    expect(liveOf(result.raw, 'ana', 'live')).toEqual({ tournamentId: 'live', state: 'alive', round: 'QF', drawPosition: 1 });
    expect(liveOf(result.raw, 'bea', 'live')).toEqual({ tournamentId: 'live', state: 'eliminated', round: 'R16' });
  });

  it('moves a winner on and keeps credited points', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.eventMatches[TOURNAMENT_IDS.live!] = liveMatches([match('Q', 1, 105, 1)]);
    const result = updateSeason(raw, snap);
    expect(liveOf(result.raw, 'ana', 'live')).toMatchObject({ state: 'alive', round: 'SF' });
    expect(player(result.raw, 'ana').results.find((r) => r.tournamentId === 'live')).toEqual({ tournamentId: 'live', round: 'SF', points: 10 });
    expect(result.changes).toContain('Live Masters: Ana Alpha alive in SF');
  });

  it('marks a loser out, without a draw position', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.eventMatches[TOURNAMENT_IDS.live!] = liveMatches([match('Q', 1, 105, 105)]);
    const result = updateSeason(raw, snap);
    expect(liveOf(result.raw, 'ana', 'live')).toEqual({ tournamentId: 'live', state: 'eliminated', round: 'QF' });
    expect(result.changes).toContain('Live Masters: Ana Alpha out in QF');
  });

  it('starts an event: status, byes, draw, live rounds and 0-point results', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.calendar.find((c) => c.tournamentGroup.id === TOURNAMENT_IDS.next)!.status = 'live';
    // A 28 draw: byes at 1, 8, 21 and 28; ana (1) has one, cat (5) plays and wins her first round.
    snap.eventPlayers[TOURNAMENT_IDS.next!] = { events: [{ eventTypeCode: 'LS', eventPlayers: drawList(28, { 1: 1, 5: 3 }) }] };
    const playing = [...Array(28).keys()].map((i) => i + 1).filter((p) => ![1, 8, 21, 28].includes(p));
    const id = (p: number) => (p === 1 ? 1 : p === 5 ? 3 : 100 + p);
    snap.eventMatches[TOURNAMENT_IDS.next!] = Array.from({ length: 12 }, (_, i) => {
      const a = id(playing[2 * i]!);
      const b = id(playing[2 * i + 1]!);
      return match(1, a, b, b === 3 ? 3 : a);
    });
    const result = updateSeason(raw, snap);
    expect(result.problems).toEqual([]);
    const next = result.raw.tournaments.find((t) => t.id === 'next')!;
    expect(next).toMatchObject({ status: 'in-progress', drawSize: 28, byes: ['ana'] });
    expect(next.entries).toBeUndefined();
    expect(liveOf(result.raw, 'ana', 'next')).toEqual({ tournamentId: 'next', state: 'alive', round: 'R16', drawPosition: 1 });
    expect(liveOf(result.raw, 'cat', 'next')).toEqual({ tournamentId: 'next', state: 'alive', round: 'R16', drawPosition: 5 });
    expect(player(result.raw, 'cat').results.find((r) => r.tournamentId === 'next')).toEqual({ tournamentId: 'next', round: 'R16', points: 0 });
  });

  it('reports an in-progress event whose draw is missing', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.eventMatches[TOURNAMENT_IDS.live!] = [];
    expect(updateSeason(raw, snap).problems).toContain("Live Masters is in progress but its draw isn't in the feeds.");
  });
});
```

Run these. Expected: FAIL.

- [ ] **Step 2: `src/update/events.ts`:**

```ts
import type { LiveMatch } from './feedTypes';
import { calendarEvent, mainSinglesMatches, sameMembers, singlesList, tableOf, type Ctx, type RawPlayer, type RawTournament } from './shared';

const LETTER_ROUNDS: Record<string, string> = { Q: 'QF', S: 'SF', F: 'F' };

/** Index into the event's points table of a feed round id: numbers count from the first round. */
export function roundIndex(roundId: string | number, table: { round: string }[]): number {
  const id = String(roundId).trim();
  const letter = LETTER_ROUNDS[id];
  return letter ? table.findIndex((r) => r.round === letter) : Number(id) - 1;
}

const involves = (m: LiveMatch, wtaId: number) => String(m.PlayerIDA) === String(wtaId) || String(m.PlayerIDB) === String(wtaId);
/** Even winner codes are player A (2, or 4 on retirement); odd are player B. */
const wonBy = (m: LiveMatch, wtaId: number) =>
  m.Winner !== undefined && m.Winner !== null && (Number(m.Winner) % 2 === 0) === (String(m.PlayerIDA) === String(wtaId));

export type LiveState = { state: 'alive' | 'eliminated'; round: string };

/** Where a player in the draw stands: her current round if she's alive, or the round she lost in. */
export function liveState(matches: LiveMatch[], wtaId: number, table: { round: string }[], bye: boolean): LiveState {
  const mine = matches.filter((m) => involves(m, wtaId));
  if (mine.length === 0) return { state: 'alive', round: table[bye ? 1 : 0]!.round };
  const last = mine.reduce((a, b) => (roundIndex(b.RoundID, table) > roundIndex(a.RoundID, table) ? b : a));
  const index = roundIndex(last.RoundID, table);
  if (last.MatchState !== 'F') return { state: 'alive', round: table[index]!.round };
  return wonBy(last, wtaId) ? { state: 'alive', round: table[index + 1]!.round } : { state: 'eliminated', round: table[index]!.round };
}

/**
 * Tracked players in the draw with no first-round match. Only trusted when the first round is complete
 * in the feed: the bracket's empty slots are the byes, so (size − byes) / 2 first-round matches.
 */
function setByes(ctx: Ctx, t: RawTournament, matches: LiveMatch[], drawIds: string[]): void {
  const firstRound = matches.filter((m) => String(m.RoundID).trim() === '1');
  const bracket = 2 ** Math.ceil(Math.log2(drawIds.length));
  if (firstRound.length !== (drawIds.length - (bracket - drawIds.length)) / 2) return;
  const playing = new Set(firstRound.flatMap((m) => [String(m.PlayerIDA), String(m.PlayerIDB)]));
  const byes = ctx.raw.players
    .filter((p) => p.wtaId !== undefined && drawIds.includes(String(p.wtaId)) && !playing.has(String(p.wtaId)))
    .map((p) => p.id);
  if (sameMembers(t.byes ?? [], byes)) return;
  t.byes = byes;
  ctx.changes.push(`${t.name}: byes ${byes.length ? byes.map((id) => ctx.raw.players.find((p) => p.id === id)!.name).join(', ') : 'none'}`);
}

function updatePlayerAt(ctx: Ctx, p: RawPlayer, t: RawTournament, s: LiveState, position: number): void {
  p.live ??= [];
  const existing = p.live.find((l) => l.tournamentId === t.id);
  const before = existing ? `${existing.state}:${existing.round}` : '';
  const entry = { tournamentId: t.id, state: s.state, round: s.round, ...(s.state === 'alive' ? { drawPosition: position } : {}) };
  if (existing) {
    delete existing.drawPosition;
    Object.assign(existing, entry);
  } else {
    p.live.push(entry);
  }
  const result = p.results.find((r) => r.tournamentId === t.id);
  if (result) result.round = s.round;
  else p.results.push({ tournamentId: t.id, round: s.round, points: 0 });
  if (before !== `${s.state}:${s.round}`) {
    ctx.changes.push(`${t.name}: ${p.name} ${s.state === 'alive' ? `alive in ${s.round}` : `out in ${s.round}`}`);
  }
}

/** Event status, draw size, byes, and every tracked player's live round at events under way. */
export function updateEvents(ctx: Ctx): void {
  for (const t of ctx.raw.tournaments) {
    if (t.status === 'completed' || t.wtaId === undefined) continue;
    const cal = calendarEvent(ctx, t);
    if (!cal) {
      ctx.problems.push(`${t.name}: not found in the WTA calendar.`);
      continue;
    }
    const matches = mainSinglesMatches(ctx, t);
    const drawIds = singlesList(ctx, t).map((ep) => String(ep.players[0]?.id));
    if (t.status === 'upcoming' && cal.status !== 'future') {
      t.status = 'in-progress';
      delete t.entries;
      ctx.changes.push(`${t.name}: under way`);
    }
    if (matches.length > 0) setByes(ctx, t, matches, drawIds);
    if (t.status !== 'in-progress') continue;
    if (matches.length === 0 || drawIds.length === 0) {
      ctx.problems.push(`${t.name} is in progress but its draw isn't in the feeds.`);
      continue;
    }
    if (t.drawSize !== drawIds.length) {
      t.drawSize = drawIds.length;
      ctx.changes.push(`${t.name}: draw of ${drawIds.length}`);
    }
    const table = tableOf(ctx, t);
    for (const p of ctx.raw.players) {
      if (p.wtaId === undefined || !drawIds.includes(String(p.wtaId))) continue;
      const bye = (t.byes ?? []).includes(p.id);
      updatePlayerAt(ctx, p, t, liveState(matches, p.wtaId, table, bye), drawIds.indexOf(String(p.wtaId)) + 1);
    }
  }
}
```

- [ ] **Step 3:** In `updateSeason.ts`, import `updateEvents` and call it after `updateTotals(ctx);`.
- [ ] **Step 4:** Run `npx tsc -b && npx vitest run src/update`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(update): live rounds, draws and byes for events under way`.

---

### Task 5: Entry lists

**Files:**
- Create: `src/update/entries.ts`
- Modify: `updateSeason.ts` (call after `updateEvents`), `updateSeason.test.ts`

- [ ] **Step 1: Failing tests:**

```ts
describe('updateSeason: entry lists', () => {
  it('records tracked players on an upcoming entry list', () => {
    const result = updateSeason(updaterSeason(), snapshot());
    expect(result.raw.tournaments.find((t) => t.id === 'next')!.entries).toEqual(['ana', 'cat']);
    expect(result.changes).toContain('Next Open entries: +Ana Alpha, +Cat Gamma');
  });

  it('keeps the previous list when the feed empties or more than halves', () => {
    const raw = updaterSeason();
    raw.tournaments.find((t) => t.id === 'next')!.entries = ['ana', 'bea', 'cat'];
    const snap = snapshot(raw);
    snap.eventPlayers[TOURNAMENT_IDS.next!] = { events: [{ eventTypeCode: 'RS', eventPlayers: drawList(4, {}) }] };
    const result = updateSeason(raw, snap);
    expect(result.raw.tournaments.find((t) => t.id === 'next')!.entries).toEqual(['ana', 'bea', 'cat']);
    expect(result.notes).toContain('Next Open: the entry list came back with 0 of our 3 entrants, so the previous list was kept.');
  });
});
```

Run these. Expected: FAIL.

- [ ] **Step 2: `src/update/entries.ts`:**

```ts
import { nameOf, sameMembers, singlesList, type Ctx } from './shared';

/** Entry lists for upcoming events. A list that vanishes or more than halves is treated as taken down. */
export function updateEntries(ctx: Ctx): void {
  for (const t of ctx.raw.tournaments) {
    if (t.status !== 'upcoming' || t.wtaId === undefined) continue;
    const list = singlesList(ctx, t);
    const listed = new Set(list.map((ep) => ep.players[0]?.id));
    const entries = ctx.raw.players.filter((p) => p.wtaId !== undefined && listed.has(p.wtaId)).map((p) => p.id);
    const before = t.entries;
    if (before && before.length > 0 && entries.length * 2 < before.length) {
      ctx.notes.push(`${t.name}: the entry list came back with ${entries.length} of our ${before.length} entrants, so the previous list was kept.`);
      continue;
    }
    if (!before && list.length === 0) continue; // not published yet
    if (before && sameMembers(before, entries)) continue;
    const added = entries.filter((id) => !before?.includes(id)).map((id) => `+${nameOf(ctx, id)}`);
    const removed = (before ?? []).filter((id) => !entries.includes(id)).map((id) => `−${nameOf(ctx, id)}`);
    t.entries = entries;
    ctx.changes.push(`${t.name} entries: ${[...added, ...removed].join(', ') || 'published, none of ours'}`);
  }
}
```

- [ ] **Step 3:** Call `updateEntries(ctx)` after `updateEvents(ctx)` in `updateSeason.ts`. Run `npx tsc -b && npx vitest run src/update`. Expected: PASS.
- [ ] **Step 4:** Commit: `feat(update): entry lists with a guard against emptied feeds`.

---

### Task 6: Crediting a finished event

**Files:**
- Create: `src/update/credit.ts`
- Modify: `updateSeason.ts` (call `creditFinished` last), `updateSeason.test.ts`

**Interfaces:** Produces `creditFinished(ctx)` and `finishedEvents(ctx)`. `finishedEvents` is used by `playerFeedsNeeded` in Task 8.

- [ ] **Step 1: Failing tests:**

```ts
describe('updateSeason: a finished event', () => {
  const finalPlayed = () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.eventMatches[TOURNAMENT_IDS.live!] = liveMatches([match('Q', 1, 105, 1), match('S', 1, 111, 1), match('F', 1, 117, 1)]);
    return { raw, snap };
  };

  it('waits while the WTA has not credited it: still in progress, the champion alive in W', () => {
    const { raw, snap } = finalPlayed();
    const result = updateSeason(raw, snap);
    expect(result.problems).toEqual([]);
    expect(result.raw.tournaments.find((t) => t.id === 'live')!.status).toBe('in-progress');
    expect(liveOf(result.raw, 'ana', 'live')).toMatchObject({ state: 'alive', round: 'W' });
    expect(result.notes).toContain('Live Masters: finished; waiting for the WTA to credit its points.');
  });

  it('credits it once the official totals include it, leaving every other stored result alone', () => {
    const { raw, snap } = finalPlayed();
    snap.race = raceRows(raw, { ana: 1220 });
    snap.playerMatches = {
      '1': [playerMatch({ tourn_nbr: ' 905', player_1: '1', points_champ_1: 100 })],
      '2': [playerMatch({ tourn_nbr: '905', player_1: '2', points_champ_1: 5 })],
    };
    const result = updateSeason(raw, snap);
    expect(result.problems).toEqual([]);
    expect(result.raw.tournaments.find((t) => t.id === 'live')!.status).toBe('completed');
    expect(player(result.raw, 'ana').results.find((r) => r.tournamentId === 'live')).toEqual({ tournamentId: 'live', round: 'W', points: 100 });
    expect(player(result.raw, 'ana').live).toEqual([]);
    for (const id of ['ana', 'bea', 'cat']) {
      const completed = (rs: { tournamentId: string }[]) => rs.filter((r) => r.tournamentId !== 'live' && r.tournamentId !== 'next');
      expect(completed(player(result.raw, id).results)).toEqual(completed(player(raw, id).results));
    }
    expect(result.changes).toContain('Live Masters: points credited, event completed');
  });
});
```

Add `playerMatch` and `raceRows` to the imports. Run these. Expected: FAIL.

- [ ] **Step 2: `src/update/credit.ts`:**

```ts
import { validateSeason } from '../data/validateSeason';
import { mainSinglesMatches, yearOf, type Ctx, type RawPlayer, type RawSeason, type RawTournament } from './shared';

/** Events we still store as in progress whose final has been played. */
export function finishedEvents(ctx: Ctx): RawTournament[] {
  return ctx.raw.tournaments.filter(
    (t) => t.status === 'in-progress' && mainSinglesMatches(ctx, t).some((m) => String(m.RoundID).trim() === 'F' && m.MatchState === 'F'),
  );
}

/** A player's published race points at an event, from her match feed (undefined until posted). */
function postedPoints(ctx: Ctx, p: RawPlayer, t: RawTournament): number | undefined {
  const points = (ctx.snap.playerMatches[String(p.wtaId)] ?? [])
    .filter((m) => m.tourn_nbr.trim() === String(t.wtaId) && Number(m.tourn_year) === yearOf(t))
    .map((m) => (m.player_1.trim() === String(p.wtaId) ? m.points_champ_1 : m.points_champ_2))
    .filter((x): x is number => typeof x === 'number');
  return points.length ? Math.max(...points) : undefined;
}

/** Marks `t` completed in `raw` with every player's posted points; false if any player's points aren't posted. */
function credit(ctx: Ctx, raw: RawSeason, t: RawTournament): boolean {
  for (const p of raw.players) {
    const result = p.results.find((r) => r.tournamentId === t.id);
    if (!result) continue;
    const points = postedPoints(ctx, p, t);
    if (points === undefined) return false;
    result.points = points;
    p.live = (p.live ?? []).filter((l) => l.tournamentId !== t.id);
  }
  raw.tournaments.find((x) => x.id === t.id)!.status = 'completed';
  return true;
}

const subsets = <T>(items: T[]): T[][] =>
  items.reduce<T[][]>((acc, item) => [...acc, ...acc.map((s) => [...s, item])], [[]]).sort((a, b) => b.length - a.length);

/**
 * Finished events become completed once the official totals include them. Every combination is tried,
 * most credited first; the first that reproduces every official total wins. If none does, the final
 * validation reports it.
 */
export function creditFinished(ctx: Ctx): void {
  const events = finishedEvents(ctx);
  if (events.length === 0) return;
  for (const chosen of subsets(events)) {
    const raw = structuredClone(ctx.raw);
    if (!chosen.every((t) => credit(ctx, raw, t))) continue;
    if (validateSeason(raw).length > 0) continue;
    ctx.raw = raw;
    for (const t of chosen) ctx.changes.push(`${t.name}: points credited, event completed`);
    for (const t of events.filter((e) => !chosen.includes(e))) ctx.notes.push(`${t.name}: finished; waiting for the WTA to credit its points.`);
    return;
  }
}
```

- [ ] **Step 3:** Call `creditFinished(ctx)` after `updateEntries(ctx)`. Run `npx tsc -b && npx vitest run src/update`. Expected: PASS.
- [ ] **Step 4:** Commit: `feat(update): credit finished events once the official totals include them`.

---

### Task 7: New top-40 players

**Files:**
- Create: `src/update/newPlayers.ts`
- Modify: `updateSeason.ts` (call `addNewPlayers` right after `updateTotals`), `updateSeason.test.ts`

**Interfaces:** Produces `addNewPlayers(ctx)` and `slug(name)`.

- [ ] **Step 1: Failing tests.** Dee enters the top 40 after a first-round loss at City 500 and a title at Newtown, a 250 we don't track yet.

```ts
describe('updateSeason: a new player in the top 40', () => {
  const withDee = (played: number) => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    snap.race.push({ ranking: 4, points: 101, tournamentsPlayed: played, player: { id: 4, fullName: 'Dee Delta', countryCode: 'FRA' } });
    snap.playerMatches['4'] = [
      playerMatch({ tourn_nbr: '903', player_1: '4', round_name: 'R32', tourn_round: '1', winner: 2, points_champ_1: 1, StartDate: '2026-04-06T00:00:00+00:00' }),
      playerMatch({
        tourn_nbr: '908', player_1: '4', round_name: 'F', tourn_round: '5', winner: 1, points_champ_1: 100, StartDate: '2026-06-01T00:00:00+00:00',
        tournament: { tournamentGroup: { id: 908, name: 'NEWTOWN' }, year: 2026, title: 'Newtown Open - Newtown', city: 'NEWTOWN', level: 'WTA 250', startDate: '2026-06-01', endDate: '2026-06-07', singlesDrawSize: 32 },
      }),
    ];
    return { raw, snap };
  };

  it('adds her season, and any event we did not track, when her total and event count reproduce', () => {
    const { raw, snap } = withDee(2);
    const result = updateSeason(raw, snap);
    expect(result.problems).toEqual([]);
    const dee = player(result.raw, 'dee-delta');
    expect(dee).toMatchObject({ wtaId: 4, name: 'Dee Delta', country: 'FR', officialRaceTotal: 101 });
    expect(dee.results).toEqual([
      { tournamentId: 'c500', round: 'R32', points: 1 },
      { tournamentId: 'newtown-2026', round: 'W', points: 100 },
    ]);
    expect(result.raw.tournaments.find((t) => t.id === 'newtown-2026')).toMatchObject({
      wtaId: 908, name: 'Newtown', category: 'WTA250', drawType: 'd32', startDate: '2026-06-01', endDate: '2026-06-07', status: 'completed', byes: [],
    });
    expect(result.raw.rules.trackedPlayerCount).toBe(4);
    expect(result.changes).toContain('New player: Dee Delta (race #4, 101 points)');
  });

  it('stops with the likely zero-pointers when her event count does not reproduce', () => {
    const { raw, snap } = withDee(3);
    const result = updateSeason(raw, snap);
    expect(result.raw.players.some((p) => p.wtaId === 4)).toBe(false);
    expect(result.problems[0]).toContain('Dee Delta: her results add up to 101 from 2 events, but the WTA shows 101 from 3.');
    expect(result.problems[0]).toContain('Slam Open');
  });
});
```

The fixture has no `wta250-32` table, so a WTA 250 with 32 players maps to `d32`. See the `drawTypeFor` note in Step 2.

Run these. Expected: FAIL.

- [ ] **Step 2: `src/update/newPlayers.ts`.** The draw-type rule is the one in `SOURCES.md`. When a table with that name doesn't exist, it falls back to the season's 32-draw table: `d32` in tests, `wta250-32` in real data.

```ts
import { parseOrThrow, type Result } from '../data/schema';
import { officialRace } from '../engine/countRace';
import type { PlayerMatch } from './feedTypes';
import { TOP, yearOf, type Ctx, type RawTournament } from './shared';

/** IOC codes the WTA displays → ISO 3166-1 alpha-2 (RUS/BLR are shown for players without a flag). */
const IOC_TO_ISO: Record<string, string> = {
  AND: 'AD', ARG: 'AR', ARM: 'AM', AUS: 'AU', AUT: 'AT', BEL: 'BE', BIH: 'BA', BLR: 'BY', BRA: 'BR', BUL: 'BG', CAN: 'CA',
  CHN: 'CN', COL: 'CO', CRO: 'HR', CZE: 'CZ', DEN: 'DK', EGY: 'EG', ESP: 'ES', EST: 'EE', FIN: 'FI', FRA: 'FR', GBR: 'GB',
  GEO: 'GE', GER: 'DE', GRE: 'GR', HKG: 'HK', HUN: 'HU', INA: 'ID', IND: 'IN', IRL: 'IE', ISR: 'IL', ITA: 'IT', JPN: 'JP',
  KAZ: 'KZ', KOR: 'KR', LAT: 'LV', LTU: 'LT', LUX: 'LU', MEX: 'MX', MNE: 'ME', NED: 'NL', NOR: 'NO', NZL: 'NZ', PHI: 'PH',
  POL: 'PL', POR: 'PT', ROU: 'RO', RUS: 'RU', SLO: 'SI', SRB: 'RS', SUI: 'CH', SVK: 'SK', SWE: 'SE', THA: 'TH', TPE: 'TW',
  TUN: 'TN', TUR: 'TR', UKR: 'UA', USA: 'US', UZB: 'UZ',
};
const MAIN_ROUNDS: Record<string, string> = { R128: 'R128', R64: 'R64', R32: 'R32', R16: 'R16', Q: 'QF', S: 'SF', F: 'F' };
const NEXT_ROUND: Record<string, string> = { R128: 'R64', R64: 'R32', R32: 'R16', R16: 'QF', QF: 'SF', SF: 'F', F: 'W' };
const SKIPPED_LEVELS = new Set(['ITF', 'WTA 125', 'Finals']);
const LEVEL_CATEGORY: Record<string, string> = { 'WTA 500': 'WTA500', 'WTA 250': 'WTA250' };
const REQUIRED_CATEGORIES = ['GS', 'WTA1000C', 'WTA1000'];

export const slug = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());

/** Draw types by level and draw size (data/SOURCES.md), falling back to the season's 32-draw table. */
function drawTypeFor(ctx: Ctx, level: string, size: number): string | undefined {
  const tables = ctx.raw.rules.pointsTables;
  const wanted =
    level === 'WTA 500' ? (size === 48 ? 'wta500-48' : size === 28 || size === 30 ? 'wta500-28' : undefined)
    : level === 'WTA 250' && [0, 28, 30, 32].includes(size) ? 'wta250-32'
    : undefined;
  if (!wanted) return undefined;
  if (tables[wanted]) return wanted;
  return Object.keys(tables).find((k) => tables[k]![0]!.round === 'R32' && tables[k]!.length === 6);
}

interface Built { results: Result[]; created: RawTournament[]; problems: string[] }

/** Her race-year results from her match feed, using the conventions in data/SOURCES.md. */
function buildResults(ctx: Ctx, wtaId: number, feed: PlayerMatch[]): Built {
  const real = ctx.raw.tournaments.filter((t) => t.wtaId !== undefined);
  const start = real.map((t) => t.startDate).sort()[0]!;
  const end = real.map((t) => t.endDate).sort().at(-1)!;
  const groups = new Map<string, PlayerMatch[]>();
  for (const m of feed) {
    const key = `${m.tourn_nbr.trim()}-${m.tourn_year}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const built: Built = { results: [], created: [], problems: [] };
  const side = (m: PlayerMatch) => (m.player_1.trim() === String(wtaId) ? 1 : 2);
  for (const ms of groups.values()) {
    const first = ms[0]!;
    const level = first.tournament?.level ?? first.TournamentLevel ?? '';
    const startDate = first.tournament?.startDate ?? first.StartDate.slice(0, 10);
    if (SKIPPED_LEVELS.has(level) || startDate < start || startDate > end) continue;
    const id = Number(first.tourn_nbr.trim());
    const year = Number(first.tourn_year);
    let t = [...ctx.raw.tournaments, ...built.created].find((x) => x.wtaId === id && yearOf(x) === year);
    if (!t) {
      const info = first.tournament;
      const category = LEVEL_CATEGORY[level];
      const drawType = info ? drawTypeFor(ctx, level, info.singlesDrawSize) : undefined;
      if (!info || !category || !drawType) {
        built.problems.push(`played ${first.TournamentName.trim()} (${level || 'unknown level'}), which isn't tracked and can't be added automatically.`);
        continue;
      }
      t = { id: `${slug(info.city)}-${year}`, wtaId: id, name: titleCase(info.city), category, drawType, startDate: info.startDate, endDate: info.endDate, status: 'completed', byes: [] };
      built.created.push(t);
    }
    if (t.status !== 'completed') continue; // events under way are handled by the events stage
    const points = Math.max(...ms.map((m) => (side(m) === 1 ? m.points_champ_1 : m.points_champ_2) ?? -1));
    if (points < 0) {
      built.problems.push(`no race points published for ${t.name}.`);
      continue;
    }
    const table = ctx.raw.rules.pointsTables[t.drawType]!;
    let round: string | undefined;
    if (t.drawType === 'united-cup') {
      round = table.find((r) => r.points === points)?.round;
    } else {
      const main = ms.filter((m) => m.qpm_flag === 'M');
      const pool = main.length ? main : ms.filter((m) => m.qpm_flag === 'Q');
      const last = pool.reduce((a, b) => (Number(b.tourn_round) > Number(a.tourn_round) ? b : a));
      const won = String(last.winner) === String(side(last));
      if (main.length) {
        const reached = MAIN_ROUNDS[last.round_name.trim()];
        round = reached && (won ? NEXT_ROUND[reached] : reached);
      } else {
        round = won ? 'Q' : `Q${last.tourn_round.trim()}`;
      }
    }
    if (!round) {
      built.problems.push(`couldn't work out her round at ${t.name}.`);
      continue;
    }
    built.results.push({ tournamentId: t.id, round, points });
  }
  const order = (id: string) => [...ctx.raw.tournaments, ...built.created].find((t) => t.id === id)!.startDate;
  built.results.sort((a, b) => order(a.tournamentId).localeCompare(order(b.tournamentId)));
  return built;
}

/** Inserts tournaments in date order, after any placeholders that share a position. */
function insertTournaments(list: RawTournament[], created: RawTournament[]): RawTournament[] {
  const out = [...list];
  for (const t of created) {
    const at = out.findIndex((x) => !x.id.startsWith('zp-') && x.startDate > t.startDate);
    out.splice(at < 0 ? out.length : at, 0, t);
  }
  return out;
}

/** Zero-pointer attributions of `missing` events that would reproduce `official`. */
function candidates(ctx: Ctx, results: Result[], official: number, missing: number): string[] {
  const season = parseOrThrow(ctx.raw);
  const free = season.tournaments.filter(
    (t) => t.status === 'completed' && (REQUIRED_CATEGORIES.includes(t.category) || t.id.startsWith('zp-')) && !results.some((r) => r.tournamentId === t.id),
  );
  const found: string[] = [];
  const visit = (from: number, chosen: typeof free) => {
    if (found.length >= 8) return;
    if (chosen.length === missing) {
      const zeros = chosen.map((t) => ({ tournamentId: t.id, round: 'ZP', points: 0 }));
      if (officialRace([...results, ...zeros], season.tournaments, season.rules).total === official) found.push(chosen.map((t) => t.name).join(' + '));
      return;
    }
    for (let i = from; i < free.length; i++) visit(i + 1, [...chosen, free[i]!]);
  };
  if (missing >= 1 && missing <= 3) visit(0, []);
  return found;
}

/** Adds every race top-40 player we don't track yet, when her whole season reproduces exactly. */
export function addNewPlayers(ctx: Ctx): void {
  const tracked = new Set(ctx.raw.players.map((p) => p.wtaId));
  const fresh = ctx.snap.race.filter((r) => r.ranking <= TOP && !tracked.has(r.player.id)).sort((a, b) => a.ranking - b.ranking);
  for (const row of fresh) {
    const name = row.player.fullName;
    const feed = ctx.snap.playerMatches[String(row.player.id)];
    const country = IOC_TO_ISO[row.player.countryCode];
    if (!feed) {
      ctx.problems.push(`${name} entered the top ${TOP}, but her match feed wasn't fetched.`);
      continue;
    }
    if (!country) {
      ctx.problems.push(`${name}: country code ${row.player.countryCode} isn't in the IOC→ISO table (src/update/newPlayers.ts).`);
      continue;
    }
    const built = buildResults(ctx, row.player.id, feed);
    if (built.problems.length) {
      ctx.problems.push(...built.problems.map((p) => `${name}: ${p}`));
      continue;
    }
    const tournaments = insertTournaments(ctx.raw.tournaments, built.created);
    const season = parseOrThrow({ ...ctx.raw, tournaments });
    const total = officialRace(built.results, season.tournaments, season.rules).total;
    if (total !== row.points || built.results.length !== row.tournamentsPlayed) {
      const fits = built.results.length < row.tournamentsPlayed
        ? candidates({ ...ctx, raw: { ...ctx.raw, tournaments } }, built.results, row.points, row.tournamentsPlayed - built.results.length)
        : [];
      ctx.problems.push(
        `${name}: her results add up to ${total} from ${built.results.length} events, but the WTA shows ${row.points} from ${row.tournamentsPlayed}.` +
          (fits.length ? ` Zero-pointers that would fit (each needs a source, see data/SOURCES.md): ${fits.join('; ')}.` : ''),
      );
      continue;
    }
    let id = slug(name);
    while (ctx.raw.players.some((p) => p.id === id)) id += '-2';
    ctx.raw.tournaments = tournaments;
    for (const t of built.created) ctx.changes.push(`New tournament: ${t.name} ${yearOf(t)} (${t.category})`);
    ctx.raw.players.push({ id, wtaId: row.player.id, name, country, officialRaceTotal: row.points, results: built.results, live: [] });
    ctx.raw.rules.trackedPlayerCount = ctx.raw.players.length;
    tracked.add(row.player.id);
    ctx.changes.push(`New player: ${name} (race #${row.ranking}, ${row.points} points)`);
  }
}
```

- [ ] **Step 3:** Call `addNewPlayers(ctx)` right after `updateTotals(ctx)`. Run `npx tsc -b && npx vitest run src/update`. Expected: PASS. If the 2-event total isn't 101, re-derive from the fixture: City 500 R32 is 1 point and the Newtown title 100. With no Grand Slam or WTA 1000 results, both count. Correct the test numbers, not the code.
- [ ] **Step 4:** Commit: `feat(update): add new top-40 players when their season reproduces`.

---

### Task 8: Fetching, writing and the CLI

**Files:**
- Create: `src/update/feeds.ts`, `src/update/writeData.ts`, `src/update/writeData.test.ts`, `scripts/update.ts`
- Modify: `src/update/updateSeason.ts` (export `playerFeedsNeeded`)

- [ ] **Step 1: Failing writer test** in `src/update/writeData.test.ts`:

```ts
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
```

Run it. Expected: FAIL, because the module doesn't exist.

- [ ] **Step 2: `src/update/writeData.ts`:**

```ts
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
```

- [ ] **Step 3: `playerFeedsNeeded`** in `updateSeason.ts`. Import `finishedEvents` from `./credit` and `TOP` from `./shared`.

```ts
/** WTA player ids whose match feeds the update needs: new top-40 players, and players at finished events. */
export function playerFeedsNeeded(raw: RawSeason, snap: FeedSnapshot): number[] {
  const tracked = new Set(raw.players.map((p) => p.wtaId));
  const ids = snap.race.filter((r) => r.ranking <= TOP && !tracked.has(r.player.id)).map((r) => r.player.id);
  const ctx: Ctx = { raw, snap, changes: [], notes: [], problems: [] };
  for (const t of finishedEvents(ctx)) {
    for (const p of raw.players) if (p.wtaId !== undefined && p.results.some((r) => r.tournamentId === t.id)) ids.push(p.wtaId);
  }
  return [...new Set(ids)];
}
```

Add a test in `updateSeason.test.ts`:

```ts
describe('playerFeedsNeeded', () => {
  it('asks for new top-40 players and for players at a finished event', () => {
    const raw = updaterSeason();
    const snap = snapshot(raw);
    expect(playerFeedsNeeded(raw, snap)).toEqual([]);
    snap.race.push({ ranking: 4, points: 1, tournamentsPlayed: 1, player: { id: 4, fullName: 'Dee Delta', countryCode: 'FRA' } });
    snap.eventMatches[TOURNAMENT_IDS.live!] = liveMatches([match('Q', 1, 105, 1), match('S', 1, 111, 1), match('F', 1, 117, 1)]);
    expect(playerFeedsNeeded(raw, snap).sort()).toEqual([1, 2, 4]);
  });
});
```

- [ ] **Step 4: `src/update/feeds.ts`:**

```ts
import type { SeasonInput } from '../data/schema';
import type { CalendarEvent, EventPlayersFeed, FeedSnapshot, LiveMatch, PlayerMatch, RaceRow } from './feedTypes';
import { playerFeedsNeeded } from './updateSeason';

const API = 'https://api.wtatennis.com/tennis';

export type GetJson = (url: string) => Promise<unknown>;

export const getJson: GetJson = async (url) => {
  const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.json();
};

/** The array in a feed body: the body itself, or its `key` property. Anything else is a feed glitch. */
function arrayOf<T>(body: unknown, key: string, url: string): T[] {
  if (Array.isArray(body)) return body as T[];
  const value = (body as Record<string, unknown> | null)?.[key];
  if (Array.isArray(value)) return value as T[];
  throw new Error(`Unexpected response from ${url}`);
}

/** Everything one update reads. Throws on any failed or malformed response, so the run changes nothing. */
export async function fetchSnapshot(raw: SeasonInput, get: GetJson = getJson): Promise<FeedSnapshot> {
  const fetchArray = async <T>(url: string, key: string) => arrayOf<T>(await get(url), key, url);
  const race = await fetchArray<RaceRow>(`${API}/players/ranked?page=0&pageSize=100&type=rankSingles&sort=asc&metric=CHAMPSINGLES&name=`, 'content');
  const real = raw.tournaments.filter((t) => t.wtaId !== undefined);
  const from = real.map((t) => t.startDate).sort()[0];
  const to = real.map((t) => t.endDate).sort().at(-1);
  const calendar: CalendarEvent[] = [];
  for (let page = 0; ; page++) {
    const batch = await fetchArray<CalendarEvent>(`${API}/tournaments/?page=${page}&pageSize=100&excludeLevels=ITF&from=${from}&to=${to}`, 'content');
    calendar.push(...batch);
    if (batch.length < 100) break;
  }
  const eventPlayers: Record<string, EventPlayersFeed> = {};
  const eventMatches: Record<string, LiveMatch[]> = {};
  for (const t of real.filter((x) => x.status !== 'completed')) {
    const base = `${API}/tournaments/${t.wtaId}/${t.startDate.slice(0, 4)}`;
    const players = await get(`${base}/players`);
    if (!Array.isArray((players as EventPlayersFeed | null)?.events)) throw new Error(`Unexpected response from ${base}/players`);
    eventPlayers[String(t.wtaId)] = players as EventPlayersFeed;
    eventMatches[String(t.wtaId)] = await fetchArray<LiveMatch>(`${base}/matches`, 'matches');
  }
  const partial: FeedSnapshot = { race, calendar, eventPlayers, eventMatches, playerMatches: {} };
  for (const id of playerFeedsNeeded(raw, partial)) {
    partial.playerMatches[String(id)] = await fetchArray<PlayerMatch>(`${API}/players/${id}/matches?page=0&pageSize=100&sort=desc&type=S`, 'matches');
  }
  return partial;
}
```

- [ ] **Step 5: `scripts/update.ts`:**

```ts
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
try {
  const result = updateSeason(raw, await fetchSnapshot(raw));
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
} catch (error) {
  finish({ status: 'feed-error', at, changes: [], notes: [], problems: [], message: String(error) });
}
```

- [ ] **Step 6:** Add `"update": "tsx scripts/update.ts"` to `package.json` scripts.
- [ ] **Step 7:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 8: Dry run against the live feeds:** `npm run update -- --dry-run`. Expected: status `changed` or `unchanged`, no problems. Read every change line and check it against what's known on the day, such as Beijing semifinal results and entries. If there are problems, investigate before continuing; don't weaken the checks.
- [ ] **Step 9:** Commit: `feat(update): fetch the feeds, write the data, CLI with dry run`.

---

### Task 9: The `data-update` issue

**Files:**
- Create: `src/update/issue.ts`, `src/update/issue.test.ts`, `scripts/issue.ts`

- [ ] **Step 1: Failing tests** in `src/update/issue.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { keyOf, problemsKey, renderIssue } from './issue';

describe('data-update issue', () => {
  it('lists the problems and carries a key that changes only when they change', () => {
    const body = renderIssue(['A total is off.'], '2026-10-09T14:17:00Z');
    expect(body).toContain('- A total is off.');
    expect(body).toContain('2026-10-09T14:17:00Z');
    expect(keyOf(body)).toBe(problemsKey(['A total is off.']));
    expect(problemsKey(['A total is off.'])).not.toBe(problemsKey(['Something else.']));
  });
});
```

- [ ] **Step 2: `src/update/issue.ts`:**

```ts
export const ISSUE_LABEL = 'data-update';
export const ISSUE_TITLE = 'Automatic data update is blocked';

/** A short stable fingerprint of a problem list, so repeated identical failures don't add comments. */
export function problemsKey(problems: string[]): string {
  let hash = 0;
  for (const ch of problems.join('\n')) hash = (hash * 31 + ch.codePointAt(0)!) | 0;
  return (hash >>> 0).toString(16);
}

export const keyOf = (body: string) => /<!-- problems:([0-9a-f]+) -->/.exec(body)?.[1];

export function renderIssue(problems: string[], at: string): string {
  return [
    `<!-- problems:${problemsKey(problems)} -->`,
    `The hourly data update at ${at} stopped without publishing anything, because:`,
    '',
    ...problems.map((p) => `- ${p}`),
    '',
    'Fix the data by hand, with sources as described in `data/SOURCES.md`, and push. The next run carries on from there, and this issue closes itself once an update succeeds.',
  ].join('\n');
}
```

- [ ] **Step 3: `scripts/issue.ts`:**

```ts
// Opens, updates or closes the single `data-update` issue from an update report (scripts/update.ts --out).
// Usage: tsx scripts/issue.ts update-result.json   (needs GITHUB_TOKEN and GITHUB_REPOSITORY)
import { readFileSync } from 'node:fs';
import { ISSUE_LABEL, ISSUE_TITLE, keyOf, problemsKey, renderIssue } from '../src/update/issue';

const report = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as { status: string; at: string; problems: string[] };
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

if (!repo || !token) {
  console.log('No GitHub token; issue left alone.');
} else {
  const [issue] = await api<{ number: number; body: string | null }[]>(`/issues?state=open&labels=${ISSUE_LABEL}`);
  if (report.status === 'blocked') {
    const body = renderIssue(report.problems, report.at);
    if (!issue) {
      await api('/issues', 'POST', { title: ISSUE_TITLE, body, labels: [ISSUE_LABEL] });
    } else {
      const isNew = keyOf(issue.body ?? '') !== problemsKey(report.problems);
      await api(`/issues/${issue.number}`, 'PATCH', { body });
      if (isNew) await api(`/issues/${issue.number}/comments`, 'POST', { body: `The problems changed:\n\n${report.problems.map((p) => `- ${p}`).join('\n')}` });
    }
  } else if (issue && (report.status === 'changed' || report.status === 'unchanged')) {
    await api(`/issues/${issue.number}/comments`, 'POST', { body: `Resolved: the update at ${report.at} succeeded.` });
    await api(`/issues/${issue.number}`, 'PATCH', { state: 'closed' });
  }
}
```

- [ ] **Step 4:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(update): manage the data-update issue`.

---

### Task 10: Workflows and docs

**Files:**
- Create: `.github/workflows/update.yml`
- Modify: `.github/workflows/ci.yml`, `README.md`, `data/SOURCES.md`

- [ ] **Step 1: Make CI callable.** In `ci.yml`, replace the `on:` block and the concurrency, checkout and deploy condition:

```yaml
on:
  push:
  pull_request:
  workflow_call:
    inputs:
      ref:
        description: Commit to check and deploy
        type: string
        required: true
    secrets:
      CLOUDFLARE_API_TOKEN:
        required: true
      CLOUDFLARE_ACCOUNT_ID:
        required: true

permissions:
  contents: read

concurrency:
  group: ci-${{ inputs.ref || github.ref }}
  cancel-in-progress: true
```

The checkout step:

```yaml
      - uses: actions/checkout@v7
        with:
          ref: ${{ inputs.ref }}
```

The deploy job condition:

```yaml
    if: (github.event_name == 'push' && github.ref == 'refs/heads/main') || inputs.ref != ''
```

- [ ] **Step 2: `.github/workflows/update.yml`:**

```yaml
name: Update data

on:
  schedule:
    - cron: '17 * * * *'
  workflow_dispatch:

permissions:
  contents: write
  issues: write

concurrency:
  group: update-data
  cancel-in-progress: false

jobs:
  update:
    runs-on: ubuntu-latest
    outputs:
      sha: ${{ steps.push.outputs.sha }}
    steps:
      - uses: actions/checkout@v7
        with:
          ref: main
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - name: Update from the WTA feeds
        run: npx tsx scripts/update.ts --out "$RUNNER_TEMP/update-result.json" --message "$RUNNER_TEMP/commit-message.txt"
      - name: Report on the data-update issue
        run: npx tsx scripts/issue.ts "$RUNNER_TEMP/update-result.json"
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - id: status
        run: echo "status=$(node -p "require('$RUNNER_TEMP/update-result.json').status")" >> "$GITHUB_OUTPUT"
      - name: Check before committing
        if: steps.status.outputs.status == 'changed'
        run: npm run typecheck && npm test && npm run validate
      - id: push
        if: steps.status.outputs.status == 'changed'
        name: Commit and push
        run: |
          git config user.name 'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git add data
          git commit -F "$RUNNER_TEMP/commit-message.txt"
          if git push origin HEAD:main; then
            echo "sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"
          else
            echo "main moved since checkout; the next run starts from the new main."
          fi

  publish:
    needs: update
    if: needs.update.outputs.sha != ''
    uses: ./.github/workflows/ci.yml
    with:
      ref: ${{ needs.update.outputs.sha }}
    secrets: inherit
```

- [ ] **Step 3: Docs.**
  - **`data/SOURCES.md`:** add a section, `## Automatic updates`. It says that from 2026-10-09 an hourly job refreshes the data:
    - totals, live rounds, draws, byes and entries;
    - crediting finished events;
    - new top-40 players.

    It uses the feeds listed in the spec, under the conventions above. Per-run detail is in the commit messages. A blocked run opens the `data-update` issue. Fixes are made by hand, with sources.
  - **`README.md`,** "Updating the data": say updates are automatic, how to start one manually (Actions → Update data → Run workflow), how to dry-run locally (`npm run update -- --dry-run`), and what to do with a `data-update` issue.
- [ ] **Step 4:** Run `npx tsc -b && npx vitest run && npm run build && npm run test:e2e`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat: hourly automatic data updates`.

---

### Task 11: First live run (controller)

- [ ] Merge to `main` and push. This needs the user's go-ahead. CI deploys as usual.
- [ ] Start the workflow manually (`gh workflow run update.yml`). Watch it (`gh run watch`), then confirm one of:
  - **status `unchanged`:** nothing committed;
  - **status `changed`:** a bot commit, then a publish run that deploys;
  - **status `blocked`:** an issue was opened. Read it, then fix the cause.
- [ ] Confirm the live site's "Data updated" shows local time.

## Review Focus

- **The feed goes down mid-run.** One request fails after others succeed. Expected: `feed-error`, nothing written, no issue. Covered: every fetch throws, and the CLI catches before any write.
- **Two events finish in the same week.** Expected: each is credited when the totals allow. Covered: `creditFinished` tries every combination.
- **A tracked player withdraws after the draw.** She's in the draw list but has no matches and is marked out. Expected: the feed's round-1 match shows her losing (a walkover counts as a finished match). If her only match has no winner, she shows as alive until the feed records it. Acceptable.
- **A walkover or retirement winner code (4/5).** Covered by `wonBy`, using even/odd.
- **`main` moves while a run is in flight.** Expected: the push fails, and the run ends quietly and retries next hour. Covered in `update.yml`.
