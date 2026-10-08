# Player Outlook ("What does she need?") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the "By player" tab, show the selected player's outlook. The panel has these parts:
- whether she has qualified, is out, or is still open;
- the total that is certain to be enough ("Safe at N"), and whether her own results can reach it;
- a verified example of how she could qualify and one of how she could miss out, each loadable into the picks with one click.

**Architecture:**
- The clinch search in `src/engine/clinch.ts` becomes a reusable `raceSearch()` factory. Its knockout search returns *which results* knock a player out, not just yes/no. `clinchedPlayers` keeps its behaviour on top of it.
- A new `src/engine/outlook.ts` uses the factory for three jobs:
  - "Safe at N": binary search over the target total.
  - The miss example: the knockout placement, turned into picks.
  - The qualify example: her own outcomes, with everyone else earning nothing more, binary-searched for the smallest one that is enough.
- Both examples are checked against `projectStandings` and `checkScenario` before they are offered.
- The UI runs the outlook in a Web Worker (inline fallback in tests), like `useClinched`.

**Tech Stack:** Vite 7, React 19, TypeScript, Vitest 3 (jsdom), Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-07-wta-finals-race-design.md`. This feature extends it as agreed with the user in conversation on 2026-10-08. The panel layout they approved:

```
Jessica Pegula: not certain yet
  Safe at 5,9xx: if she finishes with at least this, she's in whatever anyone else does.
  She has no events left, so it depends on others.
  How she could still miss: Swiatek wins Wuhan, Ningbo and Tokyo; Svitolina wins …
    [Load this scenario]
```

## Global Constraints

- Node: run with `export PATH=/opt/homebrew/bin:$PATH` (Node 23). The default `node` is too old.
- Never claim certainty the search can't prove.
  - A search that runs out of budget means "not proven". It must never produce `qualified`, a smaller "Safe at", or an example that hasn't been checked.
  - Examples are offered only if `checkScenario` returns no warnings and `projectStandings` agrees with the claim.
- The outlook is computed from actual results only (no visitor picks), like the Q and Out badges.
- Copy says "she/her" for players, as the rest of the site does.
- Keep `clinchedPlayers`' results unchanged: all existing tests in `src/engine/clinch.test.ts` must still pass.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **A player with no remaining events** (e.g. xen in the bracket fixture). Expected: no route, `eventsLeft: false`, and copy saying it depends on others. Tested in Task 2.
- **The qualify example is "as things stand" (an empty scenario).** Expected: the copy says so and the Load button just clears picks. Tested in Tasks 2 and 3.
- **Ties in the projection.** The projection breaks a full tie by player id, so a knockout found at exactly her total may not show her missing out. The miss example first tries strictly-above (`floor + 1`). Tested in Task 2 via the projection check.
- **Switching players quickly in the dropdown.** Expected: a stale result never shows for the wrong player. The hook tags results with the player id and terminates the old worker. Tested in Task 3 by selecting two players in turn.
- **An official `qualified` flag on a player the search can't prove.** Expected: still "qualified", matching the Q badge. Tested in Task 2 (ana in the base fixture).

---

### Task 1: Make the knockout search return the results it found

**Files:**
- Modify: `src/engine/clinch.ts`
- Modify: `src/test/fixtures.ts` (receives `bracketSeason`, moved from the clinch test)
- Modify: `src/engine/clinch.test.ts`

**Interfaces:**
- Produces, in `src/engine/clinch.ts`:
  - `export interface Finish` and `export interface Outcome`. They are unchanged; they just become exported.
  - `export type Placement = ReadonlyMap<string, Finish[]>`.
  - `export type SearchResult = Placement | null | 'unknown'`.
  - `export function raceSearch(players: Player[], tournaments: Tournament[], rules: Rules)`. It returns `{ info: RaceInfo[]; outcomes: (i: RaceInfo) => Outcome[]; missPath: (x: RaceInfo, target: number, trackedOnly?: boolean) => SearchResult }`.
  - `export function clinchedPlayers(...)`, unchanged signature.
- Produces, in `src/test/fixtures.ts`: `export function bracketSeason(anaPosition: number, beaPosition: number, xenQualifyingPoints = 130): Season`.

- [ ] **Step 1: Move `bracketSeason` into the shared fixtures**

Cut the `bracketSeason` function and its doc comment out of `src/engine/clinch.test.ts`, and paste it at the end of `src/test/fixtures.ts` with `export` added. `fixtures.ts` already imports `parseOrThrow` and `SeasonInput`. Add `type Season` to that import:

```ts
import { parseOrThrow, type RoundPoints, type Season, type SeasonInput } from '../data/schema';
```

In `clinch.test.ts`, change the fixtures import to:

```ts
import { bracketSeason, rawSeason, season } from '../test/fixtures';
```

- [ ] **Step 2: Write the failing test**

Add to `src/engine/clinch.test.ts` (and add `raceSearch` to the `./clinch` import):

```ts
describe('raceSearch.missPath', () => {
  it('returns the results that knock a player out', () => {
    // Opposite halves: one of ana and bea wins (1040), the other reaches the final (980); both pass xen's 970.
    const s = bracketSeason(1, 17);
    const search = raceSearch(s.players, s.tournaments, s.rules);
    const xen = search.info.find((i) => i.id === 'xen')!;
    const found = search.missPath(xen, xen.floor);
    expect(found).toBeInstanceOf(Map);
    const rounds = [...(found as Map<string, { round: string }[]>).entries()].map(([id, f]) => `${id}:${f.map((x) => x.round).join()}`).sort();
    expect(rounds).toEqual(['ana:F', 'bea:W']);
  });

  it('returns null when nobody can knock her out', () => {
    const s = bracketSeason(1, 9);
    const search = raceSearch(s.players, s.tournaments, s.rules);
    const xen = search.info.find((i) => i.id === 'xen')!;
    expect(search.missPath(xen, xen.floor)).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `export PATH=/opt/homebrew/bin:$PATH && npx vitest run src/engine/clinch.test.ts`
Expected: the new tests fail because `raceSearch` is not exported. The existing tests still pass after the fixture move.

- [ ] **Step 4: Refactor `clinch.ts`**

Export `Finish` and `Outcome`: add `export` to both `interface` declarations. Replace everything from the `clinchedPlayers` doc comment to the end of the file with:

```ts
/** Each listed player's results that together achieve what was asked. */
export type Placement = ReadonlyMap<string, Finish[]>;
/** `null`: impossible. `'unknown'`: the search grew too large to tell. */
export type SearchResult = Placement | null | 'unknown';

/**
 * Searches over actual results for ways the remaining events could go. The search is generous to the
 * other players (they can enter every event; ties go against the player; players outside the tracked
 * list are bounded independently), so "impossible" is certain.
 */
export function raceSearch(players: Player[], tournaments: Tournament[], rules: Rules) {
  const { places, championPlace } = rules.qualification;
  const directPlaces = championPlace ? places - 1 : places;
  const info = raceInfo(players, tournaments, rules);
  const untracked = untrackedModel(players, tournaments, rules);
  const outcomeCache = new Map<string, Outcome[]>();
  const outcomes = (i: RaceInfo) => {
    if (!outcomeCache.has(i.id)) outcomeCache.set(i.id, outcomesFor(i.player, tournaments, rules));
    return outcomeCache.get(i.id)!;
  };
  const drawSize = new Map(tournaments.map((t) => [t.id, t.drawSize]));

  /**
   * Results under which `count` players (excluding `exclude`, including `must` if given) all finish on or
   * above `target`, each eligible, at the same time. Places at each event are limited, and so is who can
   * meet whom. With `trackedOnly`, players outside the tracked list take no places.
   */
  const memo = new Map<string, SearchResult>();
  const finishAbove = (target: number, count: number, exclude: Set<string>, must: string | undefined, trackedOnly: boolean): SearchResult => {
    const key = `${target}|${count}|${[...exclude].sort().join(',')}|${must ?? ''}|${trackedOnly}`;
    if (!memo.has(key)) memo.set(key, searchFinishAbove(target, count, exclude, must, trackedOnly));
    return memo.get(key)!;
  };
  const searchFinishAbove = (target: number, count: number, exclude: Set<string>, must: string | undefined, trackedOnly: boolean): SearchResult => {
    // Players outside the tracked list can fill some of the places; `must` still has to be one of them.
    const outside = trackedOnly ? 0 : maxUntrackedPassers(untracked.slots, target - untracked.base, count);
    const need = Math.max(must ? 1 : 0, count - outside);
    if (need === 0) return new Map();
    const candidates = info
      .filter((i) => !exclude.has(i.id) && (i.eligibleNow || i.canBeEligible) && i.ceiling >= target)
      .map((i) => ({ id: i.id, options: minimalOptions(outcomes(i).filter((o) => o.total >= target && o.eligible)) }))
      .filter((c) => c.options.length > 0)
      .sort((a, b) => (a.id === must ? -1 : b.id === must ? 1 : a.options.length - b.options.length));
    if (must && candidates[0]?.id !== must) return null;
    if (candidates.length < need) return null;

    const used = new Map<string, number>();
    const placed: Finish[] = [];
    const chosen: { id: string; finishes: Finish[] }[] = [];
    let budget = SEARCH_BUDGET;
    const fits = (o: Outcome) =>
      o.finishes.every((f) => {
        if ((used.get(`${f.tournamentId}:${f.round}`) ?? 0) >= roundCapacity(f.fromTop)) return false;
        const size = drawSize.get(f.tournamentId);
        if (size === undefined || f.drawPosition === undefined) return true;
        return placed.every((g) => {
          if (g.tournamentId !== f.tournamentId || g.drawPosition === undefined) return true;
          const meet = meetingFromTop(f.drawPosition!, g.drawPosition, size);
          // Both reached the round where they meet: exactly one loses there, the other goes further.
          if (f.fromTop > meet || g.fromTop > meet) return true;
          return (f.fromTop === meet && g.fromTop < meet) || (g.fromTop === meet && f.fromTop < meet);
        });
      });
    const search = (index: number): boolean => {
      if (chosen.length === need) return true;
      if (candidates.length - index < need - chosen.length) return false;
      if (--budget < 0) throw new BudgetExceeded();
      const c = candidates[index]!;
      for (const o of c.options) {
        if (!fits(o)) continue;
        for (const f of o.finishes) used.set(`${f.tournamentId}:${f.round}`, (used.get(`${f.tournamentId}:${f.round}`) ?? 0) + 1);
        placed.push(...o.finishes);
        chosen.push({ id: c.id, finishes: o.finishes });
        if (search(index + 1)) return true;
        chosen.pop();
        placed.splice(placed.length - o.finishes.length);
        for (const f of o.finishes) used.set(`${f.tournamentId}:${f.round}`, used.get(`${f.tournamentId}:${f.round}`)! - 1);
      }
      return c.id !== must && search(index + 1);
    };
    try {
      return search(0) ? new Map(chosen.map((c) => [c.id, c.finishes])) : null;
    } catch (e) {
      if (e instanceof BudgetExceeded) return 'unknown';
      throw e;
    }
  };

  /**
   * Results that leave `x` out of the qualifying places while she finishes on `target` points (her
   * actual worst case is her floor). `null` means no such results exist.
   */
  const missPath = (x: RaceInfo, target: number, trackedOnly = false): SearchResult => {
    const others = (...ids: string[]) => new Set([x.id, ...ids]);
    const above = (t: number, count: number, exclude: Set<string>, must?: string) => finishAbove(t, count, exclude, must, trackedOnly);
    if (!championPlace) return above(target, places, others());
    let unknown = false;
    const found = (r: SearchResult): Placement | null => {
      if (r === 'unknown') unknown = true;
      return r === 'unknown' ? null : r;
    };
    if (!x.champion) {
      // Every place taken by players above her…
      const all = found(above(target, places, others()));
      if (all) return all;
      // …or the direct places taken, and the champion place going to a champion who finishes below her.
      for (const c of info) {
        if (c === x || !c.canBeChampion || !(c.eligibleNow || c.canBeEligible) || c.floor > target) continue;
        const direct = found(above(target, directPlaces, others(c.id)));
        if (direct) return direct;
      }
      return unknown ? 'unknown' : null;
    }
    // A champion misses only by dropping out of the champion window…
    const window = found(above(target, championPlace.toRank, others()));
    if (window) return window;
    // …or when another champion finishes above her but outside the direct places, taking the champion place.
    for (const c of info) {
      if (c === x || !c.canBeChampion || !(c.eligibleNow || c.canBeEligible)) continue;
      const taken = found(above(Math.max(c.floor, target), directPlaces + 1, others(), c.id));
      if (taken) return taken;
    }
    return unknown ? 'unknown' : null;
  };

  return { info, outcomes, missPath };
}

/**
 * Players certain to qualify whatever happens in the remaining events, judged from actual results.
 * A player is only marked when no combination of results can knock her out; if a search grows too
 * large, she is not marked.
 */
export function clinchedPlayers(players: Player[], tournaments: Tournament[], rules: Rules): Set<string> {
  const search = raceSearch(players, tournaments, rules);
  return new Set(search.info.filter((x) => x.eligibleNow && search.missPath(x, x.floor) === null).map((x) => x.id));
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `export PATH=/opt/homebrew/bin:$PATH && npx tsc -b && npx vitest run`
Expected: typecheck clean; all tests pass (151).

- [ ] **Step 6: Check real data is unchanged and still fast**

Run this from the repo root:

```bash
export PATH=/opt/homebrew/bin:$PATH && npx tsx -e "
import { season as s } from './src/data/season';
import { clinchedPlayers } from './src/engine/clinch';
const t = Date.now();
console.log([...clinchedPlayers(s.players, s.tournaments, s.rules)].sort(), Date.now() - t, 'ms');"
```

Expected: `[ 'aryna-sabalenka', 'elena-rybakina', 'linda-noskova', 'mirra-andreeva' ]`, in about 1–2 s.

- [ ] **Step 7: Commit**

```bash
git add src/engine/clinch.ts src/engine/clinch.test.ts src/test/fixtures.ts
git commit -m "refactor(engine): knockout search returns the results it found

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Player outlook engine

**Files:**
- Create: `src/engine/outlook.ts`
- Test: `src/engine/outlook.test.ts`

**Interfaces:**
- Consumes `raceSearch`, `Placement` and `Outcome` from Task 1. Also uses `eliminatedPlayers` (`./elimination`), `projectStandings` (`./standings`), `checkScenario` (`./checkScenario`), and `pickKey` and `Scenario` (`./types`).
- Produces:
  - `export type Outlook`, as shown below;
  - `export function playerOutlook(playerId: string, players: Player[], tournaments: Tournament[], rules: Rules): Outlook`.

- [ ] **Step 1: Write the failing tests**

Create `src/engine/outlook.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Season } from '../data/schema';
import { bracketSeason, season } from '../test/fixtures';
import { checkScenario } from './checkScenario';
import { playerOutlook, type Outlook } from './outlook';
import { projectStandings } from './standings';
import type { Scenario } from './types';

const outlook = (s: Season, id: string) => playerOutlook(id, s.players, s.tournaments, s.rules);
const open = (o: Outlook) => {
  if (o.status !== 'open') throw new Error(`expected open, got ${o.status}`);
  return o;
};
/** The example is consistent and the projection agrees whether `id` qualifies. */
const shows = (s: Season, scenario: Scenario, id: string, qualifies: boolean) => {
  expect(checkScenario(scenario, s.players, s.tournaments, s.rules)).toEqual([]);
  const row = projectStandings(s.players, scenario, s.tournaments, s.rules).find((r) => r.playerId === id)!;
  expect(row.projectedQualifier !== null).toBe(qualifies);
};

describe('playerOutlook', () => {
  it('reports qualified for an official flag or a certain place, and out for eliminated players', () => {
    expect(outlook(season, 'ana').status).toBe('qualified'); // official flag
    expect(outlook(season, 'bea').status).toBe('qualified'); // certain
    expect(outlook(season, 'cat').status).toBe('out');
    expect(outlook(bracketSeason(1, 9), 'xen').status).toBe('qualified');
  });

  it('gives a player with no events left a safe total and examples, but no route of her own', () => {
    // xen 970. Opposite halves: ana and bea can reach 1040 (W) and 980 (F); at 981 only the winner can pass.
    const s = bracketSeason(1, 17);
    const o = open(outlook(s, 'xen'));
    expect(o.safeAt).toBe(981);
    expect(o.safeRoute).toBeNull();
    expect(o.eventsLeft).toBe(false);
    expect(o.qualifyExample).toEqual({}); // she is in as things stand
    expect(o.missExample).not.toBeNull();
    shows(s, o.missExample!, 'xen', false);
  });

  it('finds the smallest result of her own that qualifies, and her route to the safe total', () => {
    // bea 950 (alive, QF). With nobody else earning more, a semifinal (960) passes ana's 950.
    // Safe at 971: then only ana (up to 1040) can pass her, because xen is stuck on 970.
    const s = bracketSeason(1, 17);
    const o = open(outlook(s, 'bea'));
    expect(o.qualifyExample).toEqual({ 'bea|live': 'SF' });
    shows(s, o.qualifyExample!, 'bea', true);
    expect(o.safeAt).toBe(971);
    expect(o.safeRoute).toEqual({ 'bea|live': 'F' });
    expect(o.eventsLeft).toBe(true);
    expect(o.eligibleNow).toBe(true);
    shows(s, o.missExample!, 'bea', false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `export PATH=/opt/homebrew/bin:$PATH && npx vitest run src/engine/outlook.test.ts`
Expected: FAIL. `./outlook` does not exist.

- [ ] **Step 3: Implement `src/engine/outlook.ts`**

```ts
import type { Player, Rules, Tournament } from '../data/schema';
import { checkScenario } from './checkScenario';
import { raceSearch, type Outcome, type Placement } from './clinch';
import { eliminatedPlayers, type RaceInfo } from './elimination';
import { projectStandings } from './standings';
import { pickKey, type Scenario } from './types';

export type Outlook =
  | { status: 'qualified' }
  | { status: 'out' }
  | {
      status: 'open';
      /** Lowest total that guarantees a place whatever anyone else does (with the event minimum met); null if none could be proven. */
      safeAt: number | null;
      /** Her own results that reach `safeAt`; null when she can't reach it alone. */
      safeRoute: Scenario | null;
      /** Whether she has any remaining events she can still play. */
      eventsLeft: boolean;
      eligibleNow: boolean;
      /** Picks under which she misses out, checked against the projection; null if none could be shown. */
      missExample: Scenario | null;
      /** Picks under which she qualifies, checked against the projection; null if none was found. */
      qualifyExample: Scenario | null;
    };

type Search = ReturnType<typeof raceSearch>;

/** Picks for a placement. A finish in the round a player is already alive in is the same as no pick, so it is left out. */
function toScenario(placement: Placement, players: Player[]): Scenario {
  const picks: Record<string, string> = {};
  for (const [id, finishes] of placement) {
    const player = players.find((p) => p.id === id)!;
    for (const f of finishes) {
      const alive = player.live.find((l) => l.tournamentId === f.tournamentId && l.state === 'alive');
      if (alive?.round !== f.round) picks[pickKey(id, f.tournamentId)] = f.round;
    }
  }
  return picks;
}

/** Fewest events, then fewest points. */
const simplest = (outcomes: Outcome[]) =>
  [...outcomes].sort((a, b) => a.finishes.length - b.finishes.length || a.total - b.total)[0];

/** Lowest total at which no results can knock her out. Real qualification only gets easier with more points, so the search is monotonic. */
function lowestSafeTotal(search: Search, x: RaceInfo): number | null {
  let hi = Math.max(x.floor, ...search.info.filter((o) => o !== x).map((o) => o.ceiling)) + 1;
  if (search.missPath(x, hi) !== null) return null;
  let lo = x.floor;
  if (search.missPath(x, lo) === null) return lo;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (search.missPath(x, mid) === null) hi = mid;
    else lo = mid;
  }
  return hi;
}

export function playerOutlook(playerId: string, players: Player[], tournaments: Tournament[], rules: Rules): Outlook {
  const search = raceSearch(players, tournaments, rules);
  const x = search.info.find((i) => i.id === playerId);
  if (!x) throw new Error(`Unknown player ${playerId}`);
  if (x.player.qualified || (x.eligibleNow && search.missPath(x, x.floor) === null)) return { status: 'qualified' };
  if (eliminatedPlayers(players, tournaments, rules).has(playerId)) return { status: 'out' };

  const shows = (scenario: Scenario, qualifies: boolean) =>
    checkScenario(scenario, players, tournaments, rules).length === 0 &&
    (projectStandings(players, scenario, tournaments, rules).find((r) => r.playerId === playerId)!.projectedQualifier !== null) === qualifies;

  // Missing out: prefer players finishing strictly above her, so the projection's tiebreak can't save her.
  let missExample: Scenario | null = null;
  for (const target of [x.floor + 1, x.floor]) {
    const found = search.missPath(x, target, true);
    if (found === null || found === 'unknown') continue;
    const scenario = toScenario(found, players);
    if (shows(scenario, false)) {
      missExample = scenario;
      break;
    }
  }

  // Qualifying: everyone else earns nothing more; find the smallest of her own results that is enough.
  const own = search.outcomes(x).filter((o) => o.eligible);
  const byTotal = new Map<number, Outcome>();
  for (const o of own) {
    const best = byTotal.get(o.total);
    if (!best || o.finishes.length < best.finishes.length) byTotal.set(o.total, o);
  }
  const ladder = [...byTotal.entries()].sort((a, b) => a[0] - b[0]).map(([, o]) => toScenario(new Map([[x.id, o.finishes]]), players));
  let qualifyExample: Scenario | null = null;
  if (ladder.length > 0 && shows(ladder.at(-1)!, true)) {
    let lo = -1;
    let hi = ladder.length - 1;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (shows(ladder[mid]!, true)) hi = mid;
      else lo = mid;
    }
    qualifyExample = ladder[hi]!;
  }

  const safeAt = lowestSafeTotal(search, x);
  const route = safeAt === null ? undefined : simplest(own.filter((o) => o.total >= safeAt));
  return {
    status: 'open',
    safeAt,
    safeRoute: route ? toScenario(new Map([[x.id, route.finishes]]), players) : null,
    eventsLeft: search.outcomes(x).some((o) => o.finishes.length > 0),
    eligibleNow: x.eligibleNow,
    missExample,
    qualifyExample,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `export PATH=/opt/homebrew/bin:$PATH && npx tsc -b && npx vitest run`
Expected: typecheck clean; all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/engine/outlook.ts src/engine/outlook.test.ts
git commit -m "feat(engine): player outlook — safe total, route, and verified examples

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Outlook panel in the By player tab

**Files:**
- Modify: `src/scenario/useScenario.ts` (add `load`)
- Create: `src/ui/outlook.worker.ts`
- Create: `src/ui/useOutlook.ts`
- Create: `src/ui/PlayerOutlook.tsx`
- Modify: `src/ui/ScenarioEditor.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/styles.css`
- Modify: `src/ui/ScenarioEditor.test.tsx` (render helper gets `onLoad`)
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes `playerOutlook` and `Outlook` from Task 2.
- Produces:
  - `useScenario(...).load: (scenario: Scenario) => void`;
  - `useOutlook(season: Season, playerId: string): Outlook | null` (null = still working);
  - a new required `onLoad` prop on `ScenarioEditor`.

- [ ] **Step 1: Write the failing tests**

Add to `src/ui/App.test.tsx` (and add `bracketSeason` to the fixtures import):

```ts
  it("shows the selected player's outlook in the By player tab", async () => {
    render(<App season={season} />);
    await userEvent.click(screen.getByRole('tab', { name: 'By player' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Player' }), 'bea');
    expect(await screen.findByText('Bea Beta has qualified for the WTA Finals.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Player' }), 'cat');
    expect(await screen.findByText('Cat Gamma can no longer qualify.')).toBeInTheDocument();
  });

  it('loads an outlook example into the picks', async () => {
    const s = bracketSeason(1, 17);
    render(<App season={s} />);
    await userEvent.click(screen.getByRole('tab', { name: 'By player' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Player' }), 'bea');
    const chances = await screen.findByRole('region', { name: 'Chances' });
    await within(chances).findByText(/Safe at/);
    expect(chances).toHaveTextContent('Safe at 971 points');
    expect(chances).toHaveTextContent('Live Masters: Lost in Final');
    const qualify = within(chances).getByRole('region', { name: 'How she could qualify' });
    expect(qualify).toHaveTextContent('Bea Beta — Live Masters: Lost in Semifinal');
    await userEvent.click(within(qualify).getByRole('button', { name: 'Load this scenario' }));
    expect(projected('bea')).toHaveTextContent('960');
    expect(window.location.search).toBe('?s=bea.live.SF');
  });
```

In `src/ui/ScenarioEditor.test.tsx`, change the render helper (line 12) to pass `onLoad={() => {}}`:

```ts
  render(<ScenarioEditor season={season} players={season.players} scenario={scenario} warnings={warnings} onPick={onPick} onLoad={() => {}} />);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `export PATH=/opt/homebrew/bin:$PATH && npx vitest run src/ui`
Expected: the two new App tests fail because no outlook text is found. The ScenarioEditor tests still pass.

- [ ] **Step 3: Add `load` to `useScenario`**

In `src/scenario/useScenario.ts`, after `reset`:

```ts
  const load = useCallback((next: Scenario) => setScenario(next), []);
```

and return it: `return { scenario, setPick, reset, load, ignored, dismissIgnored };`

- [ ] **Step 4: Worker and hook**

`src/ui/outlook.worker.ts`:

```ts
// Works out one player's outlook off the main thread; the searches can take a few seconds on real data.
import type { Season } from '../data/schema';
import { playerOutlook, type Outlook } from '../engine/outlook';

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<{ season: Season; playerId: string }>) => void) | null;
  postMessage: (outlook: Outlook) => void;
};

scope.onmessage = ({ data }) =>
  scope.postMessage(playerOutlook(data.playerId, data.season.players, data.season.tournaments, data.season.rules));
```

`src/ui/useOutlook.ts`:

```ts
import { useEffect, useState } from 'react';
import type { Season } from '../data/schema';
import { playerOutlook, type Outlook } from '../engine/outlook';

/**
 * One player's outlook, from actual results. In the browser it runs in a worker and arrives after the
 * first render (null until then); without workers (tests) it runs inline. Results are tagged with the
 * player they belong to, so switching players never shows a stale answer.
 */
export function useOutlook(season: Season, playerId: string): Outlook | null {
  const [result, setResult] = useState<{ playerId: string; outlook: Outlook } | null>(null);
  useEffect(() => {
    if (!playerId) return;
    if (typeof Worker === 'undefined') {
      setResult({ playerId, outlook: playerOutlook(playerId, season.players, season.tournaments, season.rules) });
      return;
    }
    const worker = new Worker(new URL('./outlook.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<Outlook>) => setResult({ playerId, outlook: event.data });
    worker.postMessage({ season, playerId });
    return () => worker.terminate();
  }, [season, playerId]);
  return result?.playerId === playerId ? result.outlook : null;
}
```

- [ ] **Step 5: The panel component**

`src/ui/PlayerOutlook.tsx`:

```tsx
import type { ReactNode } from 'react';
import type { Player, Season } from '../data/schema';
import { pointsTable } from '../engine/lookup';
import type { Outlook } from '../engine/outlook';
import { splitPickKey, type Scenario } from '../engine/types';
import { formatPoints } from './format';

/** One line per player in `players` order: "Live Masters: Lost in Final; Next Open: Winner". */
export function describePicks(scenario: Scenario, players: Player[], season: Season): { name: string; picks: string }[] {
  const byPlayer = new Map<string, { tournamentId: string; round: string }[]>();
  for (const [key, round] of Object.entries(scenario)) {
    const { playerId, tournamentId } = splitPickKey(key);
    byPlayer.set(playerId, [...(byPlayer.get(playerId) ?? []), { tournamentId, round }]);
  }
  return players
    .filter((p) => byPlayer.has(p.id))
    .map((p) => {
      const picks = byPlayer
        .get(p.id)!
        .map((pick) => ({ ...pick, t: season.tournaments.find((t) => t.id === pick.tournamentId)! }))
        .sort((a, b) => a.t.startDate.localeCompare(b.t.startDate))
        .map(({ t, round }) => {
          const table = pointsTable(season.rules, t.drawType);
          const label = table.find((r) => r.round === round)!.label;
          return `${t.name}: ${round === table.at(-1)!.round ? label : `Lost in ${label}`}`;
        });
      return { name: p.name, picks: picks.join('; ') };
    });
}

function Example({ title, scenario, players, season, onLoad }: {
  title: string;
  scenario: Scenario;
  players: Player[];
  season: Season;
  onLoad: (scenario: Scenario) => void;
}) {
  const lines = describePicks(scenario, players, season);
  return (
    <section className="example" aria-label={title}>
      <p>
        <strong>{title}</strong>
        {lines.length === 0 ? ': as things stand, if nobody earns more points.' : ':'}
      </p>
      {lines.length > 0 && (
        <ul>
          {lines.map((l) => <li key={l.name}>{`${l.name} — ${l.picks}`}</li>)}
        </ul>
      )}
      <button type="button" title="Replaces your current picks" onClick={() => onLoad(scenario)}>Load this scenario</button>
    </section>
  );
}

interface Props {
  player: Player;
  /** null while it is being worked out. */
  outlook: Outlook | null;
  /** Tracked players in current-rank order, for listing example picks. */
  players: Player[];
  season: Season;
  onLoad: (scenario: Scenario) => void;
}

export function PlayerOutlook({ player, outlook, players, season, onLoad }: Props) {
  let body: ReactNode;
  if (outlook === null) body = <p className="muted">Working out her chances…</p>;
  else if (outlook.status === 'qualified') body = <p>{`${player.name} has qualified for the WTA Finals.`}</p>;
  else if (outlook.status === 'out') body = <p>{`${player.name} can no longer qualify.`}</p>;
  else {
    const route = outlook.safeRoute && describePicks(outlook.safeRoute, [player], season)[0];
    body = (
      <>
        {outlook.safeAt === null ? (
          <p>We couldn't prove a points total that is always enough.</p>
        ) : (
          <p>
            {`Safe at ${formatPoints(outlook.safeAt)} points: finishing with at least this many guarantees a place, whatever anyone else does`}
            {outlook.eligibleNow ? '.' : ', once she meets the event minimum.'}
            {' '}
            {route
              ? `She can get there herself — ${route.picks}.`
              : outlook.eventsLeft
                ? "She can't get there on her own results, so she also needs help from others."
                : 'She has no events left, so it depends on other players.'}
          </p>
        )}
        {outlook.qualifyExample ? (
          <Example title="How she could qualify" scenario={outlook.qualifyExample} players={players} season={season} onLoad={onLoad} />
        ) : (
          <p>We couldn't find a simple way for her to qualify.</p>
        )}
        {outlook.missExample ? (
          <Example title="How she could miss out" scenario={outlook.missExample} players={players} season={season} onLoad={onLoad} />
        ) : (
          <p>We couldn't build an example of her missing out to show here.</p>
        )}
        <p className="note">In these examples, players not listed earn no more points. Loading one replaces your current picks.</p>
      </>
    );
  }
  return (
    <section className="outlook" aria-label="Chances">
      <h3>{`${player.name}'s chances`}</h3>
      {body}
    </section>
  );
}
```

`Example` only lists players in `players`. In the safe-route call only `[player]` is passed, which is correct.

- [ ] **Step 6: Wire it into the editor and App**

In `src/ui/ScenarioEditor.tsx`:
- Import `PlayerOutlook` and `useOutlook`.
- Add `onLoad: (scenario: Scenario) => void;` to `Props`.
- Destructure it in `ScenarioEditor`.
- Change the By player render to `<ByPlayer {...panelProps} season={season} onLoad={onLoad} />`.
- Change `ByPlayer`:

```tsx
function ByPlayer({ season, onLoad, tournaments, players, ...rest }: PanelProps & { season: Season; onLoad: (scenario: Scenario) => void }) {
  const [id, setId] = useState(players[0]?.id ?? '');
  const player = players.find((p) => p.id === id) ?? players[0];
  const outlook = useOutlook(season, player?.id ?? '');
  if (!player) return null;
  return (
    <div role="tabpanel">
      <label className="picker">
        Player{' '}
        <select id="player-select" value={player.id} onChange={(e) => setId(e.target.value)}>
          {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <PlayerOutlook player={player} outlook={outlook} players={players} season={season} onLoad={onLoad} />
      <ClearButton
```

The rest of `ByPlayer` stays unchanged.

In `src/ui/App.tsx`:
- destructure `load` from `useScenario(season)`;
- pass `onLoad={load}` to `<ScenarioEditor … />`.

Append to `src/ui/styles.css`:

```css
.outlook { border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; }
.outlook h3 { margin: 0 0 6px; font-size: 1rem; }
.outlook p { margin: 6px 0; }
.outlook .example ul { margin: 4px 0 6px; padding-left: 20px; }
.outlook .example button { font-size: 0.9rem; }
.muted { color: var(--muted); }
```

- [ ] **Step 7: Run all checks**

Run: `export PATH=/opt/homebrew/bin:$PATH && npx tsc -b && npx vitest run && npm run build && rm -f tsconfig.tsbuildinfo`
Expected: typecheck clean, all tests pass, and the build lists both `clinch.worker-*.js` and `outlook.worker-*.js`.

- [ ] **Step 8: Commit**

```bash
git add src/scenario/useScenario.ts src/ui/outlook.worker.ts src/ui/useOutlook.ts src/ui/PlayerOutlook.tsx src/ui/ScenarioEditor.tsx src/ui/ScenarioEditor.test.tsx src/ui/App.tsx src/ui/App.test.tsx src/ui/styles.css
git commit -m "feat(ui): player chances panel with loadable examples

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Real-data and browser check (controller)

- [ ] **Step 1: Outlook for every player not yet Q or Out, on real data, with timings**

Use the same loader as Task 1 Step 6. Print each open player's outlook and how long it took. The open players are Pegula, Gauff, Svitolina, Muchova, Kostyuk, Swiatek and Mertens.

Sanity checks:
- Pegula and Gauff are `open`, with no events left (or only events they could still enter) and a miss example.
- Mertens has a qualify example.
- Each outlook takes no more than about 5 s. If one takes longer, report it before shipping; don't silently change the budgets.

- [ ] **Step 2: Browser check**

On the dev server (`http://localhost:5173/`), with Playwright:
- open the By player tab;
- select Pegula, then Swiatek;
- wait for "Safe at" or "We couldn't";
- screenshot the panel;
- click Load on an example and confirm the table updates;
- confirm there are no page errors.

- [ ] **Step 3: e2e**

Run: `export PATH=/opt/homebrew/bin:$PATH && npm run test:e2e`
Expected: 1 passed.
