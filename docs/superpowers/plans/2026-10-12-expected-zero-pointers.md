# Expected Zero-Pointers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** projections include the zero-pointers that committed players are about to get at a WTA 1000 or Grand Slam they're not playing. The updater adds them automatically when the WTA credits the event and the official figures confirm them.

**Architecture:**
- **Data:**
  - `tournaments.json` gains `commitment` (the deadline and each committed tracked player's ranking at it), filled by the updater once the draw is known.
  - `players.json` gains `longTermInjury`.
- **Engine:** `src/engine/expected.ts` computes the expected zero-pointers. `projectStandings` and `playerBreakdown` add them; `applyScenario`, clinch and elimination stay official-only.
- **Updater:** a commitment stage (`scripts/update.ts`, with pure helpers in `src/update/commitment.ts`) fills `commitment`. `creditFinished` adds confirmed zero-pointers before its all-or-nothing check.

**Tech Stack:** TypeScript, Zod 4, React 19, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-12-expected-zero-pointers-design.md`

## Global Constraints

- Run Node via `export PATH=/opt/homebrew/bin:$PATH`. After `npx tsc -b`, delete `tsconfig.tsbuildinfo`.
- Only categories `GS`, `WTA1000C` and `WTA1000` get expected zero-pointers.
- **Entry deadline:** the Monday of the event's start week, minus 28 days (WTA 1000) or 42 days (GS).
- **Direct-entry places:** `drawSize` minus draw players with a non-null `entry`, minus `null` lines.
- **Committed:** her ranking at the deadline is at most the number of direct-entry places.
- **Long-Term Injury** exempts WTA 1000 zero-pointers only, never Grand Slam ones.
- **Unchanged:** the Current column, `applyScenario`, `clinchedPlayers`, `eliminatedPlayers` and `raceBounds`, which all use official results only.
- **The breakdown label** is "zero-pointer (expected)".
- **Commit-message line for an automatic zero-pointer:** `<Event>: zero-pointer for <Name> (committed, #<rank> at the <deadline> deadline; not in the draw)`.
- **The commitment stage never blocks.** A failed ranking fetch adds a note and retries on the next run.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **A player who withdraws after the draw is made** (she's in the draw with a walkover loss): she has a live state, so she gets no expected zero-pointer. That's correct, because she gets her first-round result.
- **A committed player who plays qualifying** (a protected-ranking or lucky-loser case): she has a live state or a qualifying result, so she gets none.
- **Wuhan right now:** expected zero-pointers for Rybakina, Andreeva, Gauff, Noskova, Osaka, Keys, Kalinskaya, Anisimova, Potapova and Navarro. Not for Mboko or Baptiste (Long-Term Injury), Zheng (not committed) or Stearns (qualifying).
- **Crediting when the race feed's page 0 lacks a player:** no event count means no automatic zero-pointer, so the run blocks for a human. That's the safe fallback.
- **The chances simulation:** an expected zero-pointer must not stop the simulator giving picks to players actually in the draw.

---

### Task 1: Schema, data and the engine

**Files:**
- Modify: `src/data/schema.ts`, `src/data/validateSeason.ts`, `data/players.json` (Mboko, Baptiste), `data/SOURCES.md`, `src/engine/standings.ts`, `src/engine/breakdown.ts`, `src/ui/ResultsBreakdown.tsx`
- Create: `src/engine/expected.ts`, `src/engine/expected.test.ts`

**Interfaces:** Produces:
- `Tournament.commitment?: { deadline: string; ranks: Record<string, number> }`;
- `Player.longTermInjury?: { from: string; to?: string }`;
- `expectedZeroPointers(player, tournaments): Result[]`;
- `BreakdownEntry.source` gains `'expected'`.

- [ ] **Step 1: Failing tests,** `src/engine/expected.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseOrThrow, type SeasonInput } from '../data/schema';
import { rawSeason } from '../test/fixtures';
import { playerBreakdown } from './breakdown';
import { eliminatedPlayers } from './elimination';
import { expectedZeroPointers } from './expected';
import { projectStandings } from './standings';

// The fixture's `live` event is a WTA 1000 in progress. Cat isn't in its draw; give her a commitment there.
const withCommitment = (edit: (raw: SeasonInput) => void = () => {}) => {
  const raw = rawSeason();
  raw.tournaments.find((t) => t.id === 'live')!.commitment = { deadline: '2026-09-07', ranks: { cat: 12, bea: 20 } };
  edit(raw);
  return parseOrThrow(raw);
};
const player = (s: ReturnType<typeof withCommitment>, id: string) => s.players.find((p) => p.id === id)!;

describe('expected zero-pointers', () => {
  it('gives one to a committed player who is not in the draw, and none to one who is', () => {
    const s = withCommitment();
    expect(expectedZeroPointers(player(s, 'cat'), s.tournaments)).toEqual([{ tournamentId: 'live', round: 'ZP', points: 0 }]);
    expect(expectedZeroPointers(player(s, 'bea'), s.tournaments)).toEqual([]); // in the draw (out in R16)
  });

  it('skips a WTA 1000 during a Long-Term Injury, but not a Grand Slam', () => {
    const s = withCommitment((raw) => {
      raw.players.find((p) => p.id === 'cat')!.longTermInjury = { from: '2026-06-01' };
    });
    expect(expectedZeroPointers(player(s, 'cat'), s.tournaments)).toEqual([]);
    const slam = withCommitment((raw) => {
      raw.players.find((p) => p.id === 'cat')!.longTermInjury = { from: '2026-06-01' };
      const live = raw.tournaments.find((t) => t.id === 'live')!;
      live.category = 'GS';
      live.drawType = 'gs128';
    });
    expect(expectedZeroPointers(player(slam, 'cat'), slam.tournaments)).toHaveLength(1);
  });

  it('ignores WTA 500s and events without a commitment record', () => {
    const s = withCommitment((raw) => {
      raw.tournaments.find((t) => t.id === 'live')!.category = 'WTA500';
    });
    expect(expectedZeroPointers(player(s, 'cat'), s.tournaments)).toEqual([]);
    const none = parseOrThrow(rawSeason());
    expect(expectedZeroPointers(player(none, 'cat'), none.tournaments)).toEqual([]);
  });

  it('counts in the projection and the breakdown (labelled expected), not in the current total or elimination', () => {
    // Cat has 3 results; a 4-result cap makes the zero-pointer count, pushing nothing out: totals equal, but it's listed.
    const s = withCommitment();
    const row = projectStandings(s.players, {}, s.tournaments, s.rules).find((r) => r.playerId === 'cat')!;
    expect(row.currentTotal).toBe(140);
    const entry = playerBreakdown(player(s, 'cat'), {}, s.tournaments, s.rules).entries.find((e) => e.tournamentId === 'live');
    expect(entry).toMatchObject({ round: 'ZP', points: 0, source: 'expected' });
    expect(eliminatedPlayers(s.players, s.tournaments, s.rules)).toEqual(eliminatedPlayers(parseOrThrow(rawSeason()).players, s.tournaments, s.rules));
  });

  it('pushes a low result out of the best results when she is at the cap', () => {
    // Cap of 3 results: Cat's 0 (slam ZP), 40 (m1000 F) and 100 (c250 W) all count today; the expected zero-pointer takes a place.
    const s = withCommitment((raw) => {
      raw.rules.maxCountedResults = 3;
      raw.rules.requiredGroups = [{ categories: ['GS'], count: 1 }, { categories: ['WTA1000'], count: 1 }];
      raw.players.find((p) => p.id === 'cat')!.officialRaceTotal = 140;
    });
    const row = projectStandings(s.players, {}, s.tournaments, s.rules).find((r) => r.playerId === 'cat')!;
    expect(row.projectedTotal).toBe(100);
  });
});
```

Run `npx vitest run src/engine/expected.test.ts`. Expected: FAIL (module missing; schema fields unknown).

If the last test's arithmetic doesn't hold with the fixture's required groups, adjust the test's rules, not the code. Then ledger a ruling with the actual counted results.

- [ ] **Step 2: Schema.** In `src/data/schema.ts`:
  - `tournamentSchema` gets `commitment: z.object({ deadline: isoDate, ranks: z.record(id, z.number().int().positive()) }).optional()`, with the doc comment: "WTA 1000s and Grand Slams: tracked players who were committed (ranked within the direct-entry places at the entry deadline), with that ranking. Filled by the updater once the draw is known."
  - `playerSchema` gets `longTermInjury: z.object({ from: isoDate, to: isoDate.optional() }).optional()`, with the doc comment: "A Long-Term Injury (R §VIII.A.4.a.ii): WTA 1000 zero-pointers during it don't count. Source in data/SOURCES.md."

  In `validateSeason.ts`, add a check that every `commitment.ranks` key is a tracked player id: `${t.id}: commitment lists unknown player ${id}`.

- [ ] **Step 3: `src/engine/expected.ts`:**

```ts
import type { Player, Result, Tournament } from '../data/schema';
import { ZERO_POINTER_ROUND } from './countRace';

const COMMITMENT_CATEGORIES = ['GS', 'WTA1000C', 'WTA1000'];

const injuredDuring = (p: Player, t: Tournament) =>
  p.longTermInjury !== undefined && p.longTermInjury.from <= t.startDate && (p.longTermInjury.to === undefined || t.startDate <= p.longTermInjury.to);

/**
 * Zero-pointers she's about to get: events under way (or finished but not yet credited) that she was committed to,
 * and isn't playing. Grand Slams always count; WTA 1000s not during a Long-Term Injury (R §II.A, §VIII.A.4.a.ii).
 */
export function expectedZeroPointers(player: Player, tournaments: Tournament[]): Result[] {
  return tournaments
    .filter(
      (t) =>
        t.status === 'in-progress' &&
        COMMITMENT_CATEGORIES.includes(t.category) &&
        t.commitment?.ranks[player.id] !== undefined &&
        !player.live.some((l) => l.tournamentId === t.id) &&
        !player.results.some((r) => r.tournamentId === t.id) &&
        !(t.category !== 'GS' && injuredDuring(player, t)),
    )
    .map((t) => ({ tournamentId: t.id, round: ZERO_POINTER_ROUND, points: 0 }));
}
```

Check that `ZERO_POINTER_ROUND` is exported from `countRace.ts`. If it lives elsewhere, import it from there, or export it.

- [ ] **Step 4: Projections.**
  - **`standings.ts`:** `const projectedResults = players.map((p) => [...applyScenario(p, scenario, tournaments, rules), ...expectedZeroPointers(p, tournaments)]);`
  - **`breakdown.ts`:**
    - `const expected = expectedZeroPointers(player, tournaments); const results = [...applyScenario(player, scenario, tournaments, rules), ...expected];`
    - in `source`, first: `if (expected.some((e) => e.tournamentId === tournamentId)) return 'expected';`
    - extend the `source` union: `'result' | 'pick' | 'live' | 'expected'`, with the doc: "'expected': a zero-pointer she's about to get".
  - **`ResultsBreakdown.tsx`:** the note map adds `e.source === 'expected' ? 'expected' : …`. Check how a `ZP` round renders. If its label is "zero-pointer", the line reads "Wuhan zero-pointer 0 (expected)". Adjust the notes so the visible text includes "zero-pointer (expected)", and add an assertion for that text to the breakdown test above, rendering `ResultsBreakdown` with the entry.

- [ ] **Step 5: Data.**
  - For **Mboko**, set `longTermInjury.from` to the start date of her last tournament played. That's the latest `startDate` in `data/matches/victoria-mboko.json` whose events she played, Queen's 2026.
  - For **Baptiste**, use her last tournament played: Roland Garros 2026, `2026-05-24`. Check it against `data/matches/hailey-baptiste.json` and use the actual date.
  - Neither gets a `to`.
  - In SOURCES.md, add a short "Long-Term Injury" note citing T-USO and the Mboko note for Mboko, and TT-BAPTISTE for Baptiste, with the rule reference.
- [ ] **Step 6:** Run `npx tsc -b && npx vitest run && npm run validate`. Expected: all pass. The engine tests are green, and existing tests are unaffected because no event in the data has `commitment` yet.
- [ ] **Step 7:** Commit: `feat(engine): expected zero-pointers in projections`.

---

### Task 2: Commitment data from the updater

**Files:**
- Create: `src/update/commitment.ts`, `src/update/commitment.test.ts`
- Modify: `src/update/feeds.ts` (a `metric` parameter on `fetchRaceList`), `scripts/update.ts`

**Interfaces:**
- Consumes: Task 1's `Tournament.commitment` and the draw files.
- Produces:
  - `entryDeadline(t): string`;
  - `directPlaces(draw: DrawFile): number`;
  - `commitmentFor(t, draw, rankings: RaceRow[], players): { deadline: string; ranks: Record<string, number> }`;
  - `fetchRaceList(at?, get?, metric = 'CHAMPSINGLES')`.

- [ ] **Step 1: Failing tests,** `src/update/commitment.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { DrawFile } from '../draws/drawSchema';
import { commitmentFor, directPlaces, entryDeadline } from './commitment';

const p = (wtaId: number, entry: string | null = null) => ({ wtaId, name: `P${wtaId}`, country: null, seed: null, entry });

describe('commitment', () => {
  it('puts the entry deadline 4 weeks before the start week (6 for a Grand Slam)', () => {
    expect(entryDeadline({ startDate: '2026-09-30', category: 'WTA1000C' })).toBe('2026-08-31'); // Beijing starts on a Wednesday
    expect(entryDeadline({ startDate: '2026-10-12', category: 'WTA1000' })).toBe('2026-09-14');
    expect(entryDeadline({ startDate: '2026-08-30', category: 'GS' })).toBe('2026-07-13'); // US Open starts on a Sunday
  });

  it('counts direct-entry places: the draw size less entry types and open lines', () => {
    const draw: DrawFile = { drawSize: 8, players: [p(1), p(2), p(3, 'Q'), p(4, 'WC'), p(5), p(6, 'LL'), p(7)], matches: [], lines: [1, 2, 3, 4, 5, 6, 7, null] };
    expect(directPlaces(draw)).toBe(4);
  });

  it('records the tracked players ranked within the places at the deadline', () => {
    const draw: DrawFile = { drawSize: 4, players: [p(1), p(2), p(3), p(4, 'Q')], matches: [], lines: [1, 2, 3, 4] };
    const row = (ranking: number, id: number) => ({ ranking, points: 0, tournamentsPlayed: 0, player: { id, fullName: '', countryCode: '' } });
    const players = [{ id: 'ana', wtaId: 10 }, { id: 'bea', wtaId: 20 }, { id: 'cat', wtaId: 30 }];
    expect(commitmentFor({ startDate: '2026-10-12', category: 'WTA1000' }, draw, [row(2, 10), row(3, 20), row(4, 30)], players)).toEqual({
      deadline: '2026-09-14',
      ranks: { ana: 2, bea: 3 },
    });
  });
});
```

Run it. Expected: FAIL.

- [ ] **Step 2: `src/update/commitment.ts`:**

```ts
import type { DrawFile } from '../draws/drawSchema';
import type { RaceRow } from './feedTypes';

/** The main-draw entry deadline: 4 weeks before the Monday of the event's start week, 6 for a Grand Slam (R §III). */
export function entryDeadline(t: { startDate: string; category: string }): string {
  const d = new Date(`${t.startDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) - (t.category === 'GS' ? 42 : 28));
  return d.toISOString().slice(0, 10);
}

/** Main-draw places filled by ranking: the draw size less qualifiers, wild cards, lucky losers, special exempts, protected rankings and open lines. */
export function directPlaces(draw: DrawFile): number {
  return draw.drawSize - draw.players.filter((p) => p.entry !== null).length - (draw.lines?.filter((l) => l === null).length ?? 0);
}

/** Tracked players committed to the event (ranked within its direct-entry places at the deadline), with that ranking. */
export function commitmentFor(
  t: { startDate: string; category: string },
  draw: DrawFile,
  rankings: RaceRow[],
  players: { id: string; wtaId?: number }[],
): { deadline: string; ranks: Record<string, number> } {
  const places = directPlaces(draw);
  const ranks: Record<string, number> = {};
  for (const p of players) {
    const rank = rankings.find((r) => r.player.id === p.wtaId)?.ranking;
    if (rank !== undefined && rank > 0 && rank <= places) ranks[p.id] = rank;
  }
  return { deadline: entryDeadline(t), ranks };
}
```

In `feeds.ts`, `fetchRaceList(at?: string, get: GetJson = getJson, metric = 'CHAMPSINGLES')` puts `metric=${metric}` in the URL. Also update the feeds test to assert that the default URL contains `metric=CHAMPSINGLES`.

- [ ] **Step 3: The updater stage,** in `scripts/update.ts` after the draw update and before the history stage:

```ts
// Commitment: who was committed to each WTA 1000 or Grand Slam whose draw is known. Never blocks.
const commitmentChanges: string[] = [];
const commitmentNotes: string[] = [];
if (!result.problems.length) {
  const drawsNow = { ...existingDraws, ...drawUpdate.files };
  for (const t of result.raw.tournaments) {
    if (t.status === 'completed' || t.commitment || !['GS', 'WTA1000C', 'WTA1000'].includes(t.category)) continue;
    const draw = drawsNow[t.id];
    if (!draw) continue;
    try {
      t.commitment = commitmentFor(t, draw, await fetchRaceList(entryDeadline(t), undefined, 'SINGLES'), result.raw.players);
      commitmentChanges.push(`${t.name}: commitment recorded (${Object.keys(t.commitment.ranks).length} tracked players, deadline ${t.commitment.deadline})`);
    } catch (error) {
      commitmentNotes.push(`${t.name}: the ranking at its entry deadline didn't load (${error instanceof Error ? error.message : String(error)}); the next run will try again.`);
    }
  }
}
```

Add `commitmentChanges.length > 0` to `changed`, and the arrays to `base.changes` and `base.notes`. The commitment is on `result.raw`, so `writeData` writes it. Import `commitmentFor` and `entryDeadline`.

- [ ] **Step 4:** Run `npx tsc -b && npx vitest run && npm run update -- --dry-run`. Expected:
  - tests pass;
  - the dry run lists "Wuhan: commitment recorded (… tracked players, deadline 2026-09-14)".
- [ ] **Step 5:** Commit: `feat(update): record who was committed to each WTA 1000 and Grand Slam`.

---

### Task 3: Automatic zero-pointers on crediting

**Files:**
- Modify: `src/update/credit.ts`, `src/update/updateSeason.test.ts`

**Interfaces:**
- Consumes: `expectedZeroPointers` (Task 1) and `Tournament.commitment`.
- Produces: changes lines for automatic zero-pointers.

- [ ] **Step 1: Failing tests,** added to `updateSeason.test.ts` in "a finished event":

```ts
  it('adds a confirmed zero-pointer for a committed player who did not play, when her event count rose by one', () => {
    const { raw, snap } = finalPlayed();
    raw.tournaments.find((t) => t.id === 'live')!.commitment = { deadline: '2026-09-07', ranks: { cat: 12 } };
    snap.race = raceRows(raw, { ana: 1220 });
    snap.race.find((r) => r.player.id === 3)!.tournamentsPlayed += 1; // cat: one more event, no result
    snap.playerMatches = {
      '1': [playerMatch({ tourn_nbr: '905', player_1: '1', points_champ_1: 100 })],
      '2': [playerMatch({ tourn_nbr: '905', player_1: '2', points_champ_1: 5 })],
    };
    const result = updateSeason(raw, snap);
    expect(result.problems).toEqual([]);
    expect(player(result.raw, 'cat').results).toContainEqual({ tournamentId: 'live', round: 'ZP', points: 0 });
    expect(result.changes).toContain('Live Masters: zero-pointer for Cat Gamma (committed, #12 at the 2026-09-07 deadline; not in the draw)');
  });

  it('adds no zero-pointer when her event count did not rise', () => {
    const { raw, snap } = finalPlayed();
    raw.tournaments.find((t) => t.id === 'live')!.commitment = { deadline: '2026-09-07', ranks: { cat: 12 } };
    snap.race = raceRows(raw, { ana: 1220 });
    snap.playerMatches = {
      '1': [playerMatch({ tourn_nbr: '905', player_1: '1', points_champ_1: 100 })],
      '2': [playerMatch({ tourn_nbr: '905', player_1: '2', points_champ_1: 5 })],
    };
    const result = updateSeason(raw, snap);
    expect(player(result.raw, 'cat').results.some((r) => r.tournamentId === 'live')).toBe(false);
    expect(result.raw.tournaments.find((t) => t.id === 'live')!.status).toBe('completed');
  });
```

`raceRows` sets `tournamentsPlayed` to `p.results.length`. Check that this matches the stored count the credit step computes, and if it differs, ledger a ruling.

Run them. Expected: the first FAILS, the second passes. Also run the two existing credit tests (they must stay green).

- [ ] **Step 2: Implement in `credit.ts`.** In `credit(ctx, raw, t)`, after the loop over players and before marking the event completed:

```ts
  // Committed players who didn't play: the WTA adds a zero-pointer, which shows as one more event with no result.
  for (const p of raw.players) {
    const expected = expectedZeroPointers(p as Player, [t as Tournament]);
    if (!expected.length) continue;
    const row = ctx.snap.race.find((r) => r.player.id === p.wtaId);
    if (!row || row.tournamentsPlayed !== storedEvents(raw, p) + 1) continue;
    p.results.push(...expected);
    ctx.changes.push(`${t.name}: zero-pointer for ${p.name} (committed, #${t.commitment!.ranks[p.id]} at the ${t.commitment!.deadline} deadline; not in the draw)`);
  }
```

The `ctx.changes.push` here must only happen for the combination that's finally chosen: `creditFinished` tries combinations on clones. Collect these lines in a local array returned from `credit()` (change its return type to `string[] | null`, where null means it couldn't credit). In `creditFinished`, push the chosen combination's lines.

`storedEvents(raw, p)` counts her results at completed events plus zero-pointers. Events still in progress don't count, and that includes `t` itself, which is still in progress in `raw` at this point:

```ts
const storedEvents = (raw: RawSeason, p: RawPlayer) =>
  p.results.filter((r) => r.round === 'ZP' || raw.tournaments.find((x) => x.id === r.tournamentId)?.status === 'completed').length;
```

The `Player`/`Tournament` casts: `expectedZeroPointers` takes the parsed types. If the raw types differ (defaults such as `live`), pass `{ ...p, live: p.live ?? [] }` and the tournament with `byes: t.byes ?? []`. Keep it type-safe without `any`.

- [ ] **Step 3:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 4: A real-data check** (record it in the ledger): `npm run update -- --dry-run`. Expected:
  - unchanged except "Wuhan: commitment recorded …";
  - no problems;
  - after the stage, the projections show Andreeva and Keys 65 lower in a local build.
- [ ] **Step 5:** Commit: `feat(update): add confirmed zero-pointers when an event is credited`.

---

### Task 4: Wuhan's commitment, checks and docs

**Files:**
- Modify: `data/tournaments.json` (via the updater), `data/SOURCES.md`, `README.md`

- [ ] **Step 1:** Run `npm run update` (a real run, locally) to record Wuhan's commitment. Check `wuhan-2026.commitment.ranks`: it includes Rybakina, Andreeva, Gauff, Noskova, Osaka, Keys, Kalinskaya, Anisimova, Potapova, Navarro, Mboko and Baptiste (plus players in the draw), and not Zheng or Stearns.
- [ ] **Step 2: SOURCES.md.** Under the zero-pointer conventions, add an "Expected and automatic zero-pointers (from 2026-10-12)" paragraph covering:
  - the commitment test, with the R §II.A and R §III references;
  - that `commitment` stores rankings at the deadline from the ranking feed with `at=`;
  - that automatic zero-pointers need the official event count to rise by one, and cite the WTA's own count;
  - that Long-Term Injury players are exempt for WTA 1000s.
- [ ] **Step 3: README.** In the updater section, a sentence on expected zero-pointers in projections and automatic ones on crediting.
- [ ] **Step 4: Browser check** with `npm run build && npm run preview`:
  - Andreeva's expanded row shows "Wuhan · zero-pointer (expected)";
  - her Projected is 6,306 against a Current of 6,371;
  - Rybakina's Projected is unchanged (fewer than 18 results);
  - no console errors.
- [ ] **Step 5:** Run `npx tsc -b && npx vitest run && npm run build && npx playwright test`. Expected: all pass.
- [ ] **Step 6:** Commit: `data: Wuhan commitment; docs for expected zero-pointers`.
