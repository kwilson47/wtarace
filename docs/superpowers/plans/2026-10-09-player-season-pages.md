# Player Season Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Replace the race-focused player page on the `player-pages` branch with a WTA-style season page: a season summary, plus every tournament with its matches round by round.
- The hourly updater keeps `data/matches/<id>.json` current.

**Architecture:**
- The updater fetches every tracked player's match feed (paged), converts it to compact match records (`src/update/matches.ts`), and writes changed files.
- A pure `seasonSummary(matches, asOf)` (`src/season/`) works out the record, splits, titles and tournament blocks.
- `PlayerPage` renders them.
- The prerender reads each player's file at build time and embeds it in her page. The prerender, hydration and sitemap groundwork from the branch is unchanged.

**Tech Stack:** TypeScript, Zod, React 19 (SSR + hydrate), Vitest, Playwright, tsx, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-09-player-season-pages-design.md`

## Global Constraints

- Work on the existing `player-pages` branch. It isn't merged, and its race-focused page content is replaced here.
- Run Node via `export PATH=/opt/homebrew/bin:$PATH`. After `npx tsc -b`, delete `tsconfig.tsbuildinfo`.
- Match data is published fact. It is never validated against totals and never blocks an update. A failed feed keeps the player's previous file.
- Nothing reads `window`, `localStorage` or the clock during render. Dates are formatted in UTC with `en-US`, so they're deterministic.
- **Byes** (feed `reason_code: 'B'`) aren't matches, so they're left out.
- **The 2025 WTA Finals** (level `Finals`) belongs to the previous season, so it's left out.
- **Walkovers** are listed but don't count in win–loss, which is the WTA's own convention. **Retirements** count.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Feed facts (verified 2026-10-09)

- **Player match feeds** are `players/<id>/matches?page=N&pageSize=100&sort=desc&type=S`. Paging works: Sakkari's page 1 goes back to January 2025.
- **`reason_code` values:**
  - `W` normal;
  - `R` retirement;
  - `D` walkover (empty score);
  - `B` bye (no opponent).
- **Levels:** `Grand Slam`, `WTA 1000`, `WTA 500`, `WTA 250`, `WTA 125`, `ITF`, `Finals`.
  - `tournament.level` can be missing, e.g. Eastbourne 2025, which shows `IS`. Fall back to `tournament.tournamentGroup.level`, then `TournamentLevel`.
  - United Cup reports `WTA 500`.
- **Event details:** `tournament.surface` is `Hard`, `Clay` or `Grass`. `tournament.inOutdoor` is `I` or `O`.
- **`round_name`:**
  - main draw: `R128` … `R16`, `Q` (QF), `S`, `F`;
  - ITF and team events: empty or ` R1`;
  - qualifying uses the main-draw names, so use `tourn_round` for qualifying.
- **Per side** (`_1` / `_2`): `entry_type` (`Q`, `W`, `L`, `S`, `A`, `P` or blank), `seed` (int or null), `rank`, and `points` (ranking points).
- **`opponent`:** `{ id, fullName, countryCode }`.

---

### Task 1: Match records from the feed

**Files:**
- Create: `src/season/matchSchema.ts`, `src/update/matches.ts`, `src/update/matches.test.ts`
- Modify: `src/update/feedTypes.ts`, `src/update/newPlayers.ts` (export `IOC_TO_ISO`, `titleCase`)

**Interfaces:** Produces:
- `MatchRecord`, `matchFileSchema`;
- `toMatchRecords(raw, wtaId, feed): MatchRecord[]`;
- `raceWindow(raw)`;
- `roundLabel(r)`, exported from `src/season/matchSchema.ts`.

- [ ] **Step 1: Extend `PlayerMatch` and `PlayerMatchTournament`** in `feedTypes.ts`.
  - `PlayerMatchTournament`: `tournamentGroup` becomes `{ id: number; name: string; level?: string }`, `level` becomes optional (`level?: string`, which some events omit), and `surface?: string; inOutdoor?: string;` are added. `newPlayers.ts` already falls back when `level` is missing, via `?? first.TournamentLevel`.
  - `PlayerMatch` gets:

```ts
  reason_code?: string | null;
  scores?: string | null;
  Surface?: string | null;
  city?: string | null;
  entry_type_1?: string | null;
  entry_type_2?: string | null;
  seed_1?: number | string | null;
  seed_2?: number | string | null;
  rank_1?: number | string | null;
  rank_2?: number | string | null;
  points_1?: number | null;
  points_2?: number | null;
  opponent?: { id: number; fullName: string; countryCode: string | null } | null;
```

  In `newPlayers.ts`, change `const IOC_TO_ISO` to `export const IOC_TO_ISO`, and `const titleCase` to `export const titleCase`.

- [ ] **Step 2: `src/season/matchSchema.ts`:**

```ts
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One singles match as the WTA publishes it, trimmed to what the season page needs. */
export const matchRecordSchema = z.object({
  /** WTA tournament id and year. */
  tournamentId: z.number().int(),
  year: z.number().int(),
  /** Short name: ours for events we track, otherwise the city. */
  tournament: z.string().min(1),
  /** As published: 'Grand Slam', 'WTA 1000', 'WTA 500', 'WTA 250', 'WTA 125', 'ITF', … */
  level: z.string(),
  /** United Cup or Billie Jean King Cup. */
  team: z.boolean(),
  surface: z.string(),
  indoor: z.boolean(),
  startDate: isoDate,
  endDate: isoDate,
  qualifying: z.boolean(),
  /** 1, 2, … within the draw (main or qualifying). */
  round: z.number().int().nonnegative(),
  /** As published: R128 … R16, Q (quarterfinal), S, F; empty for some ITF and team events. */
  roundName: z.string(),
  opponent: z.object({
    id: z.number().int().nullable(),
    name: z.string(),
    /** ISO 3166-1 alpha-2, when known. */
    country: z.string().nullable(),
    seed: z.number().int().nullable(),
    /** Q, WC, LL, SE, Alt or PR. */
    entry: z.string().nullable(),
    /** Her ranking at the time of the match. */
    rank: z.number().int().nullable(),
  }),
  won: z.boolean(),
  /** As published, single-spaced; empty for a walkover. */
  score: z.string(),
  outcome: z.enum(['played', 'retired', 'walkover']),
  /** The player's ranking points for the event (as of this match), as published. */
  points: z.number().int().nullable(),
});

export type MatchRecord = z.infer<typeof matchRecordSchema>;
export const matchFileSchema = z.array(matchRecordSchema);

const MAIN_ROUND: Record<string, string> = { Q: 'QF', S: 'SF', F: 'F' };

/** "QF", "R32", "Qualifying R2", "Team". */
export function roundLabel(r: Pick<MatchRecord, 'team' | 'qualifying' | 'round' | 'roundName'>): string {
  if (r.team) return 'Team';
  if (r.qualifying) return `Qualifying R${r.round}`;
  return MAIN_ROUND[r.roundName] ?? (/^R\d+$/.test(r.roundName) ? r.roundName : `R${r.round}`);
}
```

- [ ] **Step 3: Failing tests,** `src/update/matches.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { playerMatch, updaterSeason } from './testFeeds';
import { toMatchRecords } from './matches';

const event = (over: Record<string, unknown> = {}) => ({
  tournamentGroup: { id: 903, name: 'CITY' }, year: 2026, title: 'City 500 - City', city: 'CITY', level: 'WTA 500',
  startDate: '2026-04-06', endDate: '2026-04-12', singlesDrawSize: 32, surface: 'Clay', inOutdoor: 'I', ...over,
});

describe('toMatchRecords', () => {
  it('keeps her side of each race-year match, as published', () => {
    const records = toMatchRecords(updaterSeason(), 2, [
      playerMatch({
        tourn_nbr: ' 903', player_1: '9', player_2: '2', winner: 2, round_name: 'Q', tourn_round: '3', scores: '6-1  4-6  6-2',
        reason_code: 'W', seed_1: 4, entry_type_1: 'W', rank_1: 8, points_2: 108, opponent: { id: 9, fullName: 'Opp One', countryCode: 'BEL' },
        tournament: event(),
      }),
    ]);
    expect(records).toEqual([{
      tournamentId: 903, year: 2026, tournament: 'City 500', level: 'WTA 500', team: false, surface: 'Clay', indoor: true,
      startDate: '2026-04-06', endDate: '2026-04-12', qualifying: false, round: 3, roundName: 'Q',
      opponent: { id: 9, name: 'Opp One', country: 'BE', seed: 4, entry: 'WC', rank: 8 },
      won: true, score: '6-1 4-6 6-2', outcome: 'played', points: 108,
    }]);
  });

  it('marks retirements and walkovers, drops byes, the previous WTA Finals and anything outside the race year', () => {
    const raw = updaterSeason();
    const base = { tourn_nbr: '903', player_1: '2', tournament: event() };
    const records = toMatchRecords(raw, 2, [
      playerMatch({ ...base, tourn_round: '1', round_name: 'R32', reason_code: 'R', scores: '4-6  2-0', winner: 1 }),
      playerMatch({ ...base, tourn_round: '2', round_name: 'R16', reason_code: 'D', scores: '', winner: 2 }),
      playerMatch({ ...base, tourn_round: '1', round_name: 'R32', reason_code: 'B', winner: 1 }),
      playerMatch({ tourn_nbr: '808', player_1: '2', tournament: event({ tournamentGroup: { id: 808, name: 'WTA FINALS' }, level: 'Finals', startDate: '2026-01-20' }) }),
      playerMatch({ tourn_nbr: '903', player_1: '2', tournament: event({ startDate: '2025-06-01' }) }),
    ]);
    expect(records.map((r) => [r.round, r.outcome, r.won, r.score])).toEqual([[1, 'retired', true, '4-6 2-0'], [2, 'walkover', false, '']]);
  });

  it('names events we do not track by city, falls back for a missing level, and spots team events', () => {
    const raw = updaterSeason();
    const records = toMatchRecords(raw, 2, [
      playerMatch({ tourn_nbr: '4463', player_1: '2', tournament: event({ tournamentGroup: { id: 4463, name: 'X', level: 'ITF' }, level: undefined, city: 'SZEKESFEHERVAR', title: 'W75 Szekesfehervar' }) }),
      playerMatch({ tourn_nbr: '2084', player_1: '2', round_name: '', tourn_round: '9', tournament: event({ tournamentGroup: { id: 2084, name: 'UNITED CUP' }, title: 'United Cup - Perth', city: 'PERTH', startDate: '2026-01-15' }) }),
    ]);
    expect(records.map((r) => [r.tournament, r.level, r.team])).toEqual([['Perth', 'WTA 500', true], ['Szekesfehervar', 'ITF', false]]);
  });
});
```

Run `npx vitest run src/update/matches.test.ts`. Expected: FAIL.

- [ ] **Step 4: `src/update/matches.ts`:**

```ts
import type { MatchRecord } from '../season/matchSchema';
import type { PlayerMatch } from './feedTypes';
import { IOC_TO_ISO, titleCase } from './newPlayers';
import type { RawSeason } from './shared';

const TEAM = /UNITED CUP|BILLIE JEAN KING|BJK CUP/i;
const ENTRY: Record<string, string> = { Q: 'Q', W: 'WC', L: 'LL', S: 'SE', A: 'Alt', P: 'PR' };
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/** The race year: from the first tracked event's start to the last one's end. */
export function raceWindow(raw: RawSeason): { start: string; end: string } {
  const real = raw.tournaments.filter((t) => t.wtaId !== undefined);
  return { start: real.map((t) => t.startDate).sort()[0]!, end: real.map((t) => t.endDate).sort().at(-1)! };
}

/** Her race-year singles matches from her match feed, as published. Byes and the previous season's WTA Finals are left out. */
export function toMatchRecords(raw: RawSeason, wtaId: number, feed: PlayerMatch[]): MatchRecord[] {
  const { start, end } = raceWindow(raw);
  const records: MatchRecord[] = [];
  for (const m of feed) {
    const info = m.tournament;
    const startDate = info?.startDate ?? m.StartDate.slice(0, 10);
    const level = info?.level ?? info?.tournamentGroup.level ?? m.TournamentLevel ?? '';
    if (startDate < start || startDate > end || level === 'Finals' || m.reason_code === 'B') continue;
    const side = m.player_1.trim() === String(wtaId) ? 1 : 2;
    const theirs = <T>(one: T, two: T) => (side === 1 ? two : one);
    const mine = <T>(one: T, two: T) => (side === 1 ? one : two);
    const id = Number(m.tourn_nbr.trim());
    const year = Number(m.tourn_year);
    const ours = raw.tournaments.find((t) => t.wtaId === id && Number(t.startDate.slice(0, 4)) === year);
    const title = info?.title ?? m.TournamentName;
    const country = m.opponent?.countryCode ? IOC_TO_ISO[m.opponent.countryCode] ?? null : null;
    records.push({
      tournamentId: id,
      year,
      tournament: ours?.name ?? titleCase((info?.city ?? m.city ?? m.TournamentName).trim()),
      level,
      team: TEAM.test(title) || TEAM.test(info?.tournamentGroup.name ?? '') || ours?.drawType === 'united-cup',
      surface: titleCase((info?.surface ?? m.Surface ?? '').trim()),
      indoor: info?.inOutdoor === 'I',
      startDate,
      endDate: info?.endDate ?? startDate,
      qualifying: m.qpm_flag === 'Q',
      round: num(m.tourn_round) ?? 0,
      roundName: m.round_name.trim(),
      opponent: {
        id: m.opponent?.id ?? null,
        name: m.opponent?.fullName ?? '',
        country,
        seed: num(theirs(m.seed_1, m.seed_2)),
        entry: ENTRY[String(theirs(m.entry_type_1, m.entry_type_2) ?? '').trim()] ?? null,
        rank: num(theirs(m.rank_1, m.rank_2)),
      },
      won: String(m.winner) === String(side),
      score: (m.scores ?? '').trim().replace(/\s+/g, ' '),
      outcome: m.reason_code === 'R' ? 'retired' : m.reason_code === 'D' ? 'walkover' : 'played',
      points: num(mine(m.points_1, m.points_2)),
    });
  }
  return records.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) || a.tournamentId - b.tournamentId || Number(b.qualifying) - Number(a.qualifying) || a.round - b.round,
  );
}
```

The test fixture names City 500 "City 500" (`ours.name`), and Perth comes before Szekesfehervar because its start date is earlier. If the expected order or names differ, check them against the fixture and fix the test, not the rule.

- [ ] **Step 5:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 6:** Commit: `feat(season): match records from the WTA match feed`.

---

### Task 2: Season summary

**Files:**
- Create: `src/season/seasonSummary.ts`, `src/season/seasonSummary.test.ts`

**Interfaces:** Produces:
- `seasonSummary(matches: MatchRecord[], asOf: string): SeasonSummary`;
- `levelLabel(r)`;
- types `Split`, `TournamentBlock`, `SeasonSummary`.

- [ ] **Step 1: Failing tests,** `src/season/seasonSummary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { MatchRecord } from './matchSchema';
import { seasonSummary } from './seasonSummary';

const m = (over: Partial<MatchRecord> & { opponent?: Partial<MatchRecord['opponent']> }): MatchRecord => ({
  tournamentId: 1, year: 2026, tournament: 'Alpha', level: 'WTA 500', team: false, surface: 'Hard', indoor: false,
  startDate: '2026-02-01', endDate: '2026-02-07', qualifying: false, round: 1, roundName: 'R32',
  won: true, score: '6-1 6-1', outcome: 'played', points: 30,
  ...over,
  opponent: { id: 50, name: 'Opp', country: 'US', seed: null, entry: null, rank: 40, ...over.opponent },
});

// Alpha (500, hard): won the title over a top-10 player. Beta (Slam, clay, indoor): lost in the R32, after a walkover win.
// Gamma (ITF, grass): lost in qualifying R2. Delta (1000, hard): still going on 2026-10-09.
const season: MatchRecord[] = [
  m({ round: 1, roundName: 'R32' }),
  m({ round: 2, roundName: 'R16' }),
  m({ round: 3, roundName: 'Q' }),
  m({ round: 4, roundName: 'S' }),
  m({ round: 5, roundName: 'F', points: 500, opponent: { rank: 7 } }),
  m({ tournamentId: 2, tournament: 'Beta', level: 'Grand Slam', surface: 'Clay', indoor: true, startDate: '2026-05-24', endDate: '2026-06-07', round: 1, roundName: 'R128', outcome: 'walkover', score: '', points: 10 }),
  m({ tournamentId: 2, tournament: 'Beta', level: 'Grand Slam', surface: 'Clay', indoor: true, startDate: '2026-05-24', endDate: '2026-06-07', round: 2, roundName: 'R64', points: 70 }),
  m({ tournamentId: 2, tournament: 'Beta', level: 'Grand Slam', surface: 'Clay', indoor: true, startDate: '2026-05-24', endDate: '2026-06-07', round: 3, roundName: 'R32', won: false, outcome: 'retired', score: '4-6 2-0', points: 130 }),
  m({ tournamentId: 3, tournament: 'Gamma', level: 'ITF', surface: 'Grass', startDate: '2026-06-15', endDate: '2026-06-21', qualifying: true, round: 1, roundName: 'R32', points: null }),
  m({ tournamentId: 3, tournament: 'Gamma', level: 'ITF', surface: 'Grass', startDate: '2026-06-15', endDate: '2026-06-21', qualifying: true, round: 2, roundName: 'R16', won: false, points: null }),
  m({ tournamentId: 4, tournament: 'Delta', level: 'WTA 1000', startDate: '2026-10-05', endDate: '2026-10-18', round: 2, roundName: 'R32', points: 65 }),
];

describe('seasonSummary', () => {
  const s = seasonSummary(season, '2026-10-09');

  it('counts the record, leaving walkovers out and keeping retirements', () => {
    expect([s.wins, s.losses]).toEqual([8, 2]);
  });

  it('splits by surface, indoor and level, leaving out empty rows', () => {
    expect(s.surfaces).toEqual([
      { label: 'Hard', wins: 6, losses: 0 },
      { label: 'Clay', wins: 1, losses: 1 },
      { label: 'Grass', wins: 1, losses: 1 },
    ]);
    expect(s.indoor).toEqual({ label: 'Indoor', wins: 1, losses: 1 });
    expect(s.levels.map((l) => `${l.label} ${l.wins}-${l.losses}`)).toEqual(['Grand Slam 1-1', 'WTA 1000 1-0', 'WTA 500 5-0', 'ITF 1-1']);
  });

  it('finds titles, finals and top-10 wins', () => {
    expect(s.titles).toEqual(['Alpha']);
    expect(s.finals).toBe(1);
    expect(s.top10Wins).toBe(1);
  });

  it('builds tournament blocks, newest first, with results and points', () => {
    expect(s.tournaments.map((t) => [t.name, t.result, t.points, t.inProgress])).toEqual([
      ['Delta', 'In progress', null, true],
      ['Gamma', 'Lost in qualifying R2', null, false],
      ['Beta', 'R32', 130, false],
      ['Alpha', 'Winner', 500, false],
    ]);
    expect(s.tournaments[3]!.matches.map((x) => x.roundName)).toEqual(['F', 'S', 'Q', 'R16', 'R32']);
  });
});
```

Run it. Expected: FAIL.

- [ ] **Step 2: `src/season/seasonSummary.ts`:**

```ts
import { roundLabel, type MatchRecord } from './matchSchema';

export interface Split { label: string; wins: number; losses: number }

export interface TournamentBlock {
  key: string;
  name: string;
  level: string;
  team: boolean;
  surface: string;
  indoor: boolean;
  startDate: string;
  endDate: string;
  /** "Winner", "Final", "QF", "R32", "Lost in qualifying R2", "In progress", "Withdrew", "Team event". */
  result: string;
  /** Ranking points for the event; null while it is in progress or when unpublished. */
  points: number | null;
  inProgress: boolean;
  /** Latest first. */
  matches: MatchRecord[];
}

export interface SeasonSummary {
  wins: number;
  losses: number;
  titles: string[];
  finals: number;
  surfaces: Split[];
  indoor: Split | null;
  levels: Split[];
  top10Wins: number;
  /** Newest first. */
  tournaments: TournamentBlock[];
}

const LEVELS = ['Grand Slam', 'WTA 1000', 'WTA 500', 'WTA 250', 'WTA 125', 'ITF'];
const SURFACES = ['Hard', 'Clay', 'Grass'];

export const levelLabel = (r: Pick<MatchRecord, 'level' | 'team'>) => (r.team ? 'Team events' : LEVELS.includes(r.level) ? r.level : 'Other');

const split = (label: string, matches: MatchRecord[]): Split => ({
  label,
  wins: matches.filter((m) => m.won).length,
  losses: matches.filter((m) => !m.won).length,
});
const nonEmpty = (s: Split) => s.wins + s.losses > 0;

function block(matches: MatchRecord[], asOf: string): TournamentBlock {
  const first = matches[0]!;
  const main = matches.filter((m) => !m.qualifying);
  const last = (main.length ? main : matches).at(-1)!;
  const isFinal = !last.qualifying && !last.team && last.roundName === 'F';
  const title = isFinal && last.won;
  const inProgress = asOf <= first.endDate && last.won && !title;
  let result: string;
  if (first.team) result = 'Team event';
  else if (title) result = 'Winner';
  else if (inProgress) result = 'In progress';
  else if (last.qualifying) result = last.won ? 'Qualified' : `Lost in qualifying R${last.round}`;
  else if (last.won) result = 'Withdrew';
  else result = `${isFinal ? 'Final' : roundLabel(last)}${last.outcome === 'walkover' ? ' (w/o)' : ''}`;
  const points = inProgress ? null : Math.max(-1, ...matches.map((m) => m.points ?? -1));
  return {
    key: `${first.tournamentId}-${first.year}`,
    name: first.tournament,
    level: first.level,
    team: first.team,
    surface: first.surface,
    indoor: first.indoor,
    startDate: first.startDate,
    endDate: first.endDate,
    result,
    points: points === null || points < 0 ? null : points,
    inProgress,
    matches: [...matches].reverse(),
  };
}

/** The season at a glance, from her match records. `asOf` (YYYY-MM-DD) decides which events are still going. */
export function seasonSummary(matches: MatchRecord[], asOf: string): SeasonSummary {
  const counted = matches.filter((m) => m.outcome !== 'walkover');
  const groups = new Map<string, MatchRecord[]>();
  for (const m of matches) {
    const key = `${m.tournamentId}-${m.year}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const tournaments = [...groups.values()]
    .map((ms) => block(ms, asOf))
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
  const indoor = counted.filter((m) => m.indoor);
  return {
    wins: counted.filter((m) => m.won).length,
    losses: counted.filter((m) => !m.won).length,
    titles: tournaments.filter((t) => t.result === 'Winner').map((t) => t.name),
    finals: tournaments.filter((t) => t.result === 'Winner' || t.result.startsWith('Final')).length,
    surfaces: [...SURFACES, 'Other'].map((s) => split(s, counted.filter((m) => (SURFACES.includes(m.surface) ? m.surface : 'Other') === s))).filter(nonEmpty),
    indoor: indoor.length ? split('Indoor', indoor) : null,
    levels: [...LEVELS, 'Team events', 'Other'].map((l) => split(l, counted.filter((m) => levelLabel(m) === l))).filter(nonEmpty),
    top10Wins: counted.filter((m) => m.won && m.opponent.rank !== null && m.opponent.rank <= 10).length,
    tournaments,
  };
}
```

- [ ] **Step 3:** Run `npx tsc -b && npx vitest run src/season`. Expected: PASS.
- [ ] **Step 4:** Commit: `feat(season): season summary — record, splits, titles, tournament blocks`.

---

### Task 3: The updater keeps `data/matches/` current

**Files:**
- Modify: `src/update/feedTypes.ts`, `src/update/feeds.ts`, `src/update/matches.ts`, `src/update/matches.test.ts`, `src/update/writeData.ts`, `scripts/update.ts`, `scripts/validate.ts`
- Create: `src/season/validateMatches.ts`, `src/season/validateMatches.test.ts`

**Interfaces:** Produces:
- `updateMatchFiles(raw, playerMatches, failed, existing): { files; changes; notes }`;
- `readMatchFiles(dir)` and `writeMatchFiles(dir, files)`;
- `validateMatchFiles(files, playerIds): string[]`.

- [ ] **Step 1: Failing tests,** appended to `src/update/matches.test.ts`. Add `updateMatchFiles` to the import.

```ts
describe('updateMatchFiles', () => {
  const raw = updaterSeason();
  const feed = [playerMatch({ tourn_nbr: '903', player_1: '2', round_name: 'R32', winner: 1, opponent: { id: 9, fullName: 'Opp One', countryCode: 'BEL' }, tournament: event() })];

  it('writes a file for each player whose matches changed, naming the new matches', () => {
    const out = updateMatchFiles(raw, { '2': feed }, [], {});
    expect(Object.keys(out.files)).toEqual(['bea']);
    expect(out.changes).toEqual(['Matches: Bea Beta +1 (first fill)']);
    const again = updateMatchFiles(raw, { '2': feed }, [], { bea: out.files.bea });
    expect(again.files).toEqual({});
    const more = [...feed, playerMatch({ tourn_nbr: '903', player_1: '2', round_name: 'R16', tourn_round: '2', winner: 2, opponent: { id: 8, fullName: 'Opp Two', countryCode: 'USA' }, tournament: event() })];
    expect(updateMatchFiles(raw, { '2': more }, [], { bea: out.files.bea }).changes).toEqual(['Matches: Opp Two d. Bea Beta (City 500 R16)']);
  });

  it('keeps her previous file when her feed failed, with a note', () => {
    const out = updateMatchFiles(raw, {}, [2], { bea: [] });
    expect(out.files).toEqual({});
    expect(out.notes).toEqual(["Bea Beta: her match feed didn't load, so her previous matches were kept."]);
  });
});
```

Also `src/season/validateMatches.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateMatchFiles } from './validateMatches';

describe('validateMatchFiles', () => {
  it('accepts valid files for tracked players and reports the rest', () => {
    expect(validateMatchFiles({ ana: [] }, ['ana'])).toEqual([]);
    expect(validateMatchFiles({ zed: [] }, ['ana'])).toEqual(['data/matches/zed.json: not a tracked player']);
    expect(validateMatchFiles({ ana: [{ won: 'yes' }] }, ['ana'])[0]).toMatch(/^data\/matches\/ana\.json: /);
  });
});
```

Run them. Expected: FAIL.

- [ ] **Step 2: `updateMatchFiles`,** appended to `src/update/matches.ts`. Import `roundLabel` from `../season/matchSchema`.

```ts
const matchKey = (r: MatchRecord) => `${r.tournamentId}-${r.year}-${r.qualifying}-${r.round}`;

/**
 * New match files for players whose race-year matches changed, plus commit-message lines. A player
 * whose feed failed keeps her previous file. Match data is published fact: it never blocks an update.
 */
export function updateMatchFiles(
  raw: RawSeason,
  playerMatches: Record<string, PlayerMatch[]>,
  failed: number[],
  existing: Record<string, MatchRecord[] | undefined>,
): { files: Record<string, MatchRecord[]>; changes: string[]; notes: string[] } {
  const files: Record<string, MatchRecord[]> = {};
  const changes: string[] = [];
  const notes: string[] = [];
  for (const p of raw.players) {
    if (p.wtaId === undefined) continue;
    const feed = playerMatches[String(p.wtaId)];
    if (!feed) {
      if (failed.includes(p.wtaId)) notes.push(`${p.name}: her match feed didn't load, so her previous matches were kept.`);
      continue;
    }
    const next = toMatchRecords(raw, p.wtaId, feed);
    const previous = existing[p.id];
    if (previous && JSON.stringify(previous) === JSON.stringify(next)) continue;
    files[p.id] = next;
    const added = next.filter((r) => !previous?.some((o) => matchKey(o) === matchKey(r)));
    if (!previous) changes.push(`Matches: ${p.name} +${added.length} (first fill)`);
    else if (added.length === 0) changes.push(`Matches: ${p.name} updated`);
    else if (added.length > 3) changes.push(`Matches: ${p.name} +${added.length}`);
    else {
      for (const r of added) {
        const players = r.won ? `${p.name} d. ${r.opponent.name}` : `${r.opponent.name} d. ${p.name}`;
        changes.push(`Matches: ${players} (${r.tournament} ${roundLabel(r)})`);
      }
    }
  }
  return { files, changes, notes };
}
```

- [ ] **Step 3: `src/season/validateMatches.ts`:**

```ts
import { matchFileSchema } from './matchSchema';

/** Each match file must belong to a tracked player and match the schema. */
export function validateMatchFiles(files: Record<string, unknown>, playerIds: string[]): string[] {
  const errors: string[] = [];
  for (const [id, body] of Object.entries(files)) {
    const where = `data/matches/${id}.json`;
    if (!playerIds.includes(id)) {
      errors.push(`${where}: not a tracked player`);
      continue;
    }
    const parsed = matchFileSchema.safeParse(body);
    if (!parsed.success) errors.push(`${where}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`);
  }
  return errors;
}
```

- [ ] **Step 4: Reading and writing,** appended to `src/update/writeData.ts`. Add `existsSync`, `mkdirSync` and `readdirSync` to the `node:fs` import, and import `type MatchRecord`.

```ts
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
```

- [ ] **Step 5: Fetch every tracked player's feed** in `src/update/feeds.ts`.
  - Add `playerFeedErrors?: number[]` to `FeedSnapshot` in `feedTypes.ts`.
  - Replace the final player-feed loop in `fetchSnapshot`:

```ts
  const partial: FeedSnapshot = { race, calendar, eventPlayers, eventMatches, playerMatches: {}, playerFeedErrors: [] };
  const raceStart = from!;
  const playerFeed = async (id: number) => {
    const all: PlayerMatch[] = [];
    for (let page = 0; page < 5; page++) {
      const batch = await fetchArray<PlayerMatch>(`${API}/players/${id}/matches?page=${page}&pageSize=100&sort=desc&type=S`, 'matches');
      all.push(...batch);
      if (batch.length < 100 || batch.at(-1)!.StartDate.slice(0, 10) < raceStart) break;
    }
    return all;
  };
  // Feeds the season update depends on (new players, crediting) must load, or the run is a feed error.
  const needed = playerFeedsNeeded(raw, partial);
  for (const id of needed) partial.playerMatches[String(id)] = await playerFeed(id);
  // Everyone else's feed is only for their match files: a failure keeps their previous file.
  for (const p of raw.players) {
    if (p.wtaId === undefined || needed.includes(p.wtaId)) continue;
    try {
      partial.playerMatches[String(p.wtaId)] = await playerFeed(p.wtaId);
    } catch {
      partial.playerFeedErrors!.push(p.wtaId);
    }
  }
  return partial;
```

- [ ] **Step 6: `scripts/update.ts`.** After `const result = updateSeason(raw, snapshot);`, add:

```ts
const matchUpdate = result.problems.length
  ? { files: {}, changes: [], notes: [] }
  : updateMatchFiles(result.raw, snapshot.playerMatches, snapshot.playerFeedErrors ?? [], readMatchFiles(dir));
const changed = result.changed || Object.keys(matchUpdate.files).length > 0;
const base = { at, changes: [...result.changes, ...matchUpdate.changes], notes: [...result.notes, ...matchUpdate.notes], problems: result.problems };
```

Then:
- delete the old `const base = …` line;
- use `changed` in place of `result.changed`;
- in the write branch, after `writeData(dir, result.raw);`, add `writeMatchFiles(dir, matchUpdate.files);`;
- build the commit message from `base.changes`.

Import `updateMatchFiles` from `../src/update/matches`, and `readMatchFiles` and `writeMatchFiles` from `../src/update/writeData`.

- [ ] **Step 7: `scripts/validate.ts`.** Check the match files too:

```ts
import { readMatchFiles } from '../src/update/writeData';
import { validateMatchFiles } from '../src/season/validateMatches';
// … after computing `errors`:
const players = read('players.json') as { id: string }[];
errors.push(...validateMatchFiles(readMatchFiles(new URL('../data/', import.meta.url).pathname), players.map((p) => p.id)));
```

Change `const errors` to `let errors`, or push into it as above. It's an array, so `const` with `push` is fine. Update the OK message to `Data OK: schema valid, every official race total reproduced, match files valid.`

- [ ] **Step 8:** Run `npx tsc -b && npx vitest run && npm run validate`. Expected: all pass, Data OK.
- [ ] **Step 9: First fill.** Run `npm run update -- --dry-run`. Expected: `changed`, with one "first fill" line per tracked player, and no problems. Then run `npm run update`, which writes `data/matches/*.json` for all 40 and `meta.lastUpdated`. Check:
  - `npm run validate`;
  - a spot check of Swiatek's file against her known season: Beijing QF loss to Mertens 7-6(0) 6-3, and the Toronto title.
- [ ] **Step 10:** Commit: `feat(update): keep data/matches current; first fill for all tracked players`.

---

### Task 4: The season page replaces the race page

**Files:**
- Revert to `main`: `src/ui/PlayerOutlook.tsx`, `src/ui/PlayerOutlook.test.tsx`
- Delete: `src/ui/playerSummary.ts`, `src/ui/playerSummary.test.ts`
- Rewrite: `src/ui/PlayerPage.tsx`, `src/ui/PlayerPage.test.tsx`
- Modify: `src/prerender/pages.tsx`, `src/prerender/pages.test.tsx`, `scripts/prerender.ts`, `src/entry-player.tsx`, `src/ui/hydration.test.tsx`, `src/ui/styles.css`

**Interfaces:**
- `PlayerPage({ season, playerId, matches }: { season: Season; playerId: string; matches: MatchRecord[] | null })`;
- `playerHtml(template, season, playerId, matches)`;
- `seasonDescription(name, summary | null)`.

- [ ] **Step 1: Remove the race content.**
  - `git checkout main -- src/ui/PlayerOutlook.tsx src/ui/PlayerOutlook.test.tsx`
  - `git rm src/ui/playerSummary.ts src/ui/playerSummary.test.ts`
  - In `styles.css`, remove the `a.button`, `.status-in`, `.status-out`, `.status-open`, `.schedule ul` and `.player-page .outlook h3` rules.
- [ ] **Step 2: Failing tests.** Rewrite `src/ui/PlayerPage.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MatchRecord } from '../season/matchSchema';
import { season } from '../test/fixtures';
import { PlayerPage } from './PlayerPage';

const m = (over: Partial<MatchRecord> & { opponent?: Partial<MatchRecord['opponent']> }): MatchRecord => ({
  tournamentId: 903, year: 2026, tournament: 'City 500', level: 'WTA 500', team: false, surface: 'Hard', indoor: false,
  startDate: '2026-04-06', endDate: '2026-04-12', qualifying: false, round: 1, roundName: 'R32',
  won: true, score: '6-1 6-1', outcome: 'played', points: 100,
  ...over,
  opponent: { id: 99, name: 'Opp', country: 'BE', seed: null, entry: null, rank: 40, ...over.opponent },
});

const matches = [
  m({ round: 1, roundName: 'R32', opponent: { name: 'Bea Beta', id: 2, seed: 3 } }),
  m({ round: 2, roundName: 'F', score: '6-3 1-6 6-3', opponent: { name: 'Qualy Kid', entry: 'Q', rank: 9, country: null } }),
  m({ tournamentId: 904, tournament: 'Town 250', level: 'WTA 250', surface: 'Clay', startDate: '2026-05-04', endDate: '2026-05-10', won: false, outcome: 'retired', score: '4-6 2-0', points: 1 }),
];

describe('PlayerPage', () => {
  it('shows her season record, titles and race position', () => {
    const s = structuredClone(season);
    s.players.find((p) => p.id === 'bea')!.wtaId = 2;
    render(<PlayerPage season={s} playerId="ana" matches={matches} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ana Alpha');
    expect(screen.getByText(/2026 season · 2–1 · 1 title \(City 500\) · 1 final/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Race #1' })).toHaveAttribute('href', '/');
  });

  it('summarises by surface and level, with top-10 wins', () => {
    render(<PlayerPage season={season} playerId="ana" matches={matches} />);
    const summary = screen.getByRole('region', { name: 'Season summary' });
    expect(summary).toHaveTextContent('Hard 2–0');
    expect(summary).toHaveTextContent('Clay 0–1');
    expect(summary).toHaveTextContent('WTA 500 2–0');
    expect(summary).toHaveTextContent('Top-10 wins1');
  });

  it('lists each tournament with its matches, linking tracked opponents', () => {
    const s = structuredClone(season);
    s.players.find((p) => p.id === 'bea')!.wtaId = 2;
    render(<PlayerPage season={s} playerId="ana" matches={matches} />);
    const city = screen.getByRole('region', { name: 'City 500' });
    expect(city).toHaveTextContent('WTA 500 · Hard · Apr 6 – Apr 12');
    expect(city).toHaveTextContent('Winner · 100 pts');
    const rows = within(city).getAllByRole('row').map((r) => r.textContent);
    expect(rows[0]).toBe('FWQualy Kid (Q)6-3 1-6 6-3');
    expect(within(city).getByRole('link', { name: 'Bea Beta' })).toHaveAttribute('href', '/players/bea/');
    expect(screen.getByRole('region', { name: 'Town 250' })).toHaveTextContent('4-6 2-0 ret.');
  });

  it('says so when her matches are not available yet', () => {
    render(<PlayerPage season={season} playerId="ana" matches={null} />);
    expect(screen.getByText("Match results aren't available yet.")).toBeInTheDocument();
  });
});
```

In `hydration.test.tsx`, change the two `PlayerPage` renders to `<PlayerPage season={season} playerId="ana" matches={[]} />`.

Run these. Expected: FAIL.

- [ ] **Step 3: Rewrite `src/ui/PlayerPage.tsx`:**

```tsx
import type { Season } from '../data/schema';
import { projectStandings } from '../engine/standings';
import { roundLabel, type MatchRecord } from '../season/matchSchema';
import { levelLabel, seasonSummary, type Split, type TournamentBlock } from '../season/seasonSummary';
import { flagEmoji, formatPoints } from './format';
import { UpdatedTime } from './UpdatedTime';

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const dates = (start: string, end: string) => `${day.format(new Date(`${start}T00:00:00Z`))} – ${day.format(new Date(`${end}T00:00:00Z`))}`;
const record = (s: Pick<Split, 'wins' | 'losses'>) => `${s.wins}–${s.losses}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Opponent({ m, season }: { m: MatchRecord; season: Season }) {
  const tracked = m.opponent.id === null ? undefined : season.players.find((p) => p.wtaId === m.opponent.id);
  const tag = m.opponent.seed !== null ? ` [${m.opponent.seed}]` : m.opponent.entry ? ` (${m.opponent.entry})` : '';
  return (
    <>
      {m.opponent.country && <span aria-hidden="true">{flagEmoji(m.opponent.country)} </span>}
      {tracked ? <a href={`/players/${tracked.id}/`}>{m.opponent.name}</a> : m.opponent.name}
      {tag}
    </>
  );
}

function Tournament({ t, season }: { t: TournamentBlock; season: Season }) {
  const surface = `${t.surface}${t.indoor ? ' (indoor)' : ''}`;
  return (
    <section className="tournament" aria-label={t.name}>
      <h3>{t.name}</h3>
      <p className="meta">{`${t.team ? 'Team event' : levelLabel(t)} · ${surface} · ${dates(t.startDate, t.endDate)}`}</p>
      <p className="result">{`${t.result}${t.points !== null ? ` · ${formatPoints(t.points)} pts` : ''}`}</p>
      <table className="matches">
        <tbody>
          {t.matches.map((m) => (
            <tr key={`${m.qualifying}-${m.round}`} className={m.won ? 'won' : 'lost'}>
              <td className="round">{roundLabel(m)}</td>
              <td className="wl">{m.won ? 'W' : 'L'}</td>
              <td className="opponent"><Opponent m={m} season={season} /></td>
              <td className="score">
                {m.outcome === 'walkover' ? 'w/o' : `${m.score}${m.outcome === 'retired' ? ' ret.' : ''}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

interface Props {
  season: Season;
  playerId: string;
  /** Her race-year matches; null if not fetched yet. */
  matches: MatchRecord[] | null;
}

/** A player's season: her record, splits and every tournament, round by round. */
export function PlayerPage({ season, playerId, matches }: Props) {
  const { players, tournaments, rules } = season;
  const player = players.find((p) => p.id === playerId)!;
  const rank = projectStandings(players, {}, tournaments, rules).find((r) => r.playerId === playerId)!.currentRank;
  const summary = matches ? seasonSummary(matches, season.meta.lastUpdated.slice(0, 10)) : null;
  const line = summary
    ? [
        `${rules.season} season`,
        record(summary),
        ...(summary.titles.length ? [`${plural(summary.titles.length, 'title')} (${summary.titles.join(', ')})`] : []),
        ...(summary.finals ? [plural(summary.finals, 'final')] : []),
      ].join(' · ')
    : `${rules.season} season`;
  return (
    <div className="app player-page">
      <nav className="crumbs"><a href="/">← Full standings</a></nav>
      <header className="header">
        <h1>
          <span aria-hidden="true">{flagEmoji(player.country)}</span> {player.name}
        </h1>
        <p className="player-status">
          {`${line} · `}
          <a href="/">{`Race #${rank}`}</a>
        </p>
        <UpdatedTime iso={season.meta.lastUpdated} />
      </header>
      <main>
        {summary ? (
          <>
            <section className="season-summary" aria-label="Season summary">
              <h2>Season summary</h2>
              <dl>
                <div><dt>Surface</dt><dd>{[...summary.surfaces, ...(summary.indoor ? [summary.indoor] : [])].map((s) => `${s.label} ${record(s)}`).join(' · ')}</dd></div>
                <div><dt>Level</dt><dd>{summary.levels.map((s) => `${s.label} ${record(s)}`).join(' · ')}</dd></div>
                <div><dt>Top-10 wins</dt><dd>{summary.top10Wins}</dd></div>
              </dl>
            </section>
            <section aria-label="Tournaments">
              <h2>Tournaments</h2>
              {summary.tournaments.map((t) => <Tournament key={t.key} t={t} season={season} />)}
            </section>
          </>
        ) : (
          <p>Match results aren't available yet.</p>
        )}
        <p className="note">The season follows the Race to the WTA Finals year, so it starts with events in late October 2025.</p>
        <p className="explore">
          <a href={`/?player=${player.id}`}>{`Explore scenarios for ${player.name}`}</a>
        </p>
      </main>
    </div>
  );
}
```

- [ ] **Step 4: Styles.** Append:

```css
.season-summary dl { margin: 0; }
.season-summary dl > div { display: flex; gap: 8px; padding: 2px 0; }
.season-summary dt { flex: 0 0 90px; color: var(--muted); font-size: 0.85rem; }
.season-summary dd { margin: 0; }
.tournament { border-top: 1px solid var(--line); padding: 10px 0; }
.tournament h3 { margin: 0; font-size: 1rem; }
.tournament .meta { margin: 2px 0; color: var(--muted); font-size: 0.85rem; }
.tournament .result { margin: 2px 0 6px; font-weight: 600; }
.matches { border-collapse: collapse; font-size: 0.9rem; }
.matches td { padding: 2px 10px 2px 0; vertical-align: top; }
.matches .round { color: var(--muted); white-space: nowrap; }
.matches tr.lost .wl { color: var(--down); }
.matches tr.won .wl { color: var(--up); }
.matches .score { white-space: nowrap; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 5: Prerender with matches.** In `src/prerender/pages.tsx`:
  - Drop the `Outlook` and `playerSummary` imports.
  - Import `MatchRecord` and `seasonSummary, type SeasonSummary`.
  - Add:

```tsx
/** "Iga Swiatek's 2026 season: 48–15, 2 titles (Toronto, Doha), 3 finals. Every match, round by round." */
export function seasonDescription(name: string, year: number, summary: SeasonSummary | null): string {
  if (!summary) return `${name}'s ${year} season, match by match.`;
  const parts = [`${summary.wins}–${summary.losses}`];
  if (summary.titles.length) parts.push(`${summary.titles.length} title${summary.titles.length === 1 ? '' : 's'} (${summary.titles.join(', ')})`);
  if (summary.finals) parts.push(`${summary.finals} final${summary.finals === 1 ? '' : 's'}`);
  return `${name}'s ${year} season: ${parts.join(', ')}. Every match, round by round.`;
}
```

  - Change `playerHtml` to `playerHtml(template, season, playerId, matches: MatchRecord[] | null)`:
    - title `${player.name}: ${season.rules.season} season results`;
    - description `seasonDescription(player.name, season.rules.season, matches ? seasonSummary(matches, season.meta.lastUpdated.slice(0, 10)) : null)`;
    - render `<PlayerPage season={season} playerId={playerId} matches={matches} />`;
    - embed `JSON.stringify({ playerId, matches })`;
    - add `<meta property="og:image:alt" content="${escapeHtml(title)}" />`;
    - use function replacements (`.replace('<!--head-->', () => head)`) so a `$` in data can't be read as a pattern.

  Update `src/prerender/pages.test.tsx`'s player test:

```tsx
  it('writes a player page with its own title, description, canonical URL and embedded matches', () => {
    const html = playerHtml(PLAYER, season, 'ana', []);
    expect(html).toContain('<title>Ana Alpha: 2026 season results</title>');
    expect(html).toContain('<meta name="description" content="Ana Alpha&#39;s 2026 season: 0–0. Every match, round by round." />');
    expect(html).toContain('<link rel="canonical" href="https://finalsrace.win/players/ana/" />');
    expect(html).toContain('<script id="page-data" type="application/json">{"playerId":"ana","matches":[]}</script>');
  });
```

`escapeHtml` must also escape `'` as `&#39;`. Add `.replace(/'/g, '&#39;')`.

In `scripts/prerender.ts`:
- drop the outlook, ranks and `projectStandings` code;
- read the matches with `readMatchFiles` from `../src/update/writeData` (data dir `new URL('../data/', import.meta.url).pathname`);
- call `playerHtml(playerTemplate, season, p.id, files[p.id] ?? null)`.

- [ ] **Step 6: `src/entry-player.tsx`.** Embedded data is `{ playerId, matches }`. In dev, with no embedded data, load the file lazily:

```tsx
const devFiles = import.meta.glob<{ default: MatchRecord[] }>('../data/matches/*.json');
async function start() {
  const embedded = document.getElementById('page-data');
  const data: { playerId: string; matches: MatchRecord[] | null } = embedded
    ? JSON.parse(embedded.textContent ?? '{}')
    : await (async () => {
        const id = new URLSearchParams(window.location.search).get('id') ?? season.players[0]!.id;
        const load = devFiles[`../data/matches/${id}.json`];
        return { playerId: season.players.some((p) => p.id === id) ? id : season.players[0]!.id, matches: load ? (await load()).default : null };
      })();
  const page = (
    <StrictMode>
      <PlayerPage season={season} playerId={data.playerId} matches={data.matches} />
    </StrictMode>
  );
  if (root.hasAttribute('data-ssr')) hydrateRoot(root, page);
  else createRoot(root).render(page);
}
void start();
```

Remove the `playerOutlook` import. Keep `root`, the imports of `StrictMode`, `createRoot`, `hydrateRoot`, `season` and `PlayerPage`, and the styles. Add `import type { MatchRecord } from './season/matchSchema';`.

- [ ] **Step 7:** Run `npx tsc -b && npx vitest run && npm run build`. Expected: all pass, and 40 player pages prerendered. In `dist/players/iga-swiatek/index.html`: the title "Iga Swiatek: 2026 season results", a "Beijing" tournament section, and `"matches":[` in the page data.
- [ ] **Step 8:** Commit: `feat(ui): player pages show her season, tournament by tournament`.

---

### Task 5: End-to-end, browser check and docs

**Files:**
- Modify: `e2e/player.spec.ts`, `README.md`, `data/SOURCES.md`

- [ ] **Step 1: Replace `e2e/player.spec.ts`:**

```ts
import { expect, test } from '@playwright/test';

test('the table links to a player profile with her season, which links back into the scenario builder', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('tbody button.name').first();
  const name = (await first.textContent())!.trim();
  await first.click();
  await page.getByRole('link', { name: 'Player Profile' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
  await expect(page).toHaveTitle(`${name}: 2026 season results`);
  await expect(page.getByRole('region', { name: 'Season summary' })).toBeVisible();
  await expect(page.locator('section.tournament').first()).toBeVisible();
  const id = new URL(page.url()).pathname.split('/')[2]!;
  await page.getByRole('link', { name: `Explore scenarios for ${name}` }).click();
  await expect(page.getByRole('combobox', { name: 'Player', exact: true })).toHaveValue(id);
});

test('an opponent who is tracked links to her own page', async ({ page }) => {
  await page.goto('/players/iga-swiatek/');
  const link = page.locator('section.tournament td.opponent a').first();
  const opponent = (await link.textContent())!.trim();
  await link.click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(opponent);
});
```

- [ ] **Step 2:** Run `npm run build && npm run test:e2e`. Expected: all pass.
- [ ] **Step 3: Browser check** on `npm run preview`:
  - Swiatek's page at desktop and at phone width in dark mode;
  - the page Bartunkova (Beijing in progress) shows "In progress";
  - a player with ITF or 125 events, e.g. Birrell, shows those labelled;
  - no console errors or hydration warnings.
- [ ] **Step 4: Docs.**
  - **`data/SOURCES.md`, new section `## Match results (data/matches/)`:**
    - where the data comes from: player match feeds, race window, byes and 2025 WTA Finals left out;
    - what's stored, which is published fact, never validated against totals;
    - reason codes R/D/B;
    - walkovers aren't counted in win–loss.
  - **`README.md`:**
    - the updater also keeps `data/matches/` current;
    - `npm run validate` checks match files;
    - player pages show the season;
    - in development, a player page is at `/player.html?id=<id>`.
- [ ] **Step 5:** Run `npx tsc -b && npx vitest run && npm run build && npm run test:e2e`. Expected: all pass.
- [ ] **Step 6:** Commit: `test(e2e): season pages; docs`.

## Review Focus

- **A player whose feed has more than 100 race-year matches.** The second page must be fetched. Covered by the paging loop in Task 3, and checked in the first fill by comparing against the WTA site.
- **An opponent with no country or seed.** Expected: shown without them. Covered by `num`/`IOC_TO_ISO` returning null, and the `Opponent` component skipping them.
- **An event with qualifying and main-draw matches.** Expected: one block, with qualifying listed after the main draw (latest first). Covered by the sort in `toMatchRecords` and the reverse in `block`.
- **A walkover loss as her last match.** Expected: "R16 (w/o)". Covered by `block`.
- **Hourly updates touching 40 match files.** Expected: only changed files are written, so no churn. Covered by the `updateMatchFiles` equality check.
