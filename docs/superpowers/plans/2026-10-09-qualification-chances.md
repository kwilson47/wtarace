# Qualification Chances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** show each tracked player's chance of qualifying for the WTA Finals. It comes from 10,000 simulated finishes to the season, using Elo ratings built from this season's results. The work happens at build time and the result is embedded in the homepage.

**Architecture:** pure modules in `src/sim/`:
- `random` (seeded PRNG, shuffle);
- `ratings` (Elo replay);
- `field` (field-player rating pools);
- `drawSim` (random seeded draws, bracket play-out);
- `chances` (turns each run into a scenario and scores it with the existing `projectStandings`).

`scripts/prerender.ts` runs it and embeds `{ chances }` in the homepage. The dev server computes 1,000 runs in the browser. `StandingsTable` shows a desktop "Chance" column and a line in the expanded row.

**Tech Stack:** TypeScript, React 19 (SSR plus hydration), Vitest, Playwright, tsx.

**Spec:** `docs/superpowers/specs/2026-10-09-qualification-chances-design.md`

## Global Constraints

- Run Node via `export PATH=/opt/homebrew/bin:$PATH`. After `npx tsc -b`, delete `tsconfig.tsbuildinfo`.
- 10,000 runs, seed `20261009`, mulberry32. The dev server uses 1,000 runs.
- The win chance is `1 / (1 + 10^((R_B − R_A) / 400))`, and `K = 250 / (n + 5)^0.4`.
- The prior is `1500 + 400 · (1 − log₂(rank) / log₂(200))`, with rank clamped to 1–500.
- Field pools need at least 20 ratings per level; otherwise all three levels are combined.
- Seeds: 16 for draws over 32 players, else 8 (at least as many as there are byes). Byes go to the top seeds.
- Display:
  - Q when clinched or qualified;
  - — when eliminated;
  - `>99%` for p ≥ 0.995;
  - `<1%` for p < 0.005;
  - otherwise a whole-number percent.
- Copy, verbatim:
  - **Header tooltip:** "Chance to qualify, from 10,000 simulated finishes to the season using real results only. Your picks don't change it."
  - **Footnote:** "Chances come from simulating the remaining events with ratings built from this season's results."
  - **Expanded row:** "Chance to qualify: …"
- The picks never change the chances.
- If the simulation throws at build time, log a warning and omit the chances. Never fail the build.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **An upcoming event whose draw gets published** (Wuhan's draw is due around Oct 10): it must take the real-draw path. Its `byes` come from the data, not the simulated draw, and draw size 56 gives a bracket of 64 lines.
- **An in-progress event with an unreadable draw:** it's skipped, so alive players keep their current round with no pick. Nothing should throw.
- **CI build time:** about 12 s of projections locally. Check the prerender log line, and drop the run count if the deploy job exceeds about 30 s for this step.
- **Hydration:** the first client render must equal the prerendered HTML. Q from the clinch worker arrives after mount and replaces a percentage. That's expected and isn't a hydration error.
- **Tracked players on an entry list who later withdraw:** the numbers follow the lists by design. Nothing to fix, but the README should say so.

---

### Task 1: Ratings and field pools

**Files:**
- Create: `src/sim/random.ts`, `src/sim/ratings.ts`, `src/sim/field.ts`, `src/sim/testHelpers.ts`, `src/sim/ratings.test.ts`, `src/sim/field.test.ts`

**Interfaces:** Produces:
- `Rng`, `mulberry32(seed)`, `shuffle(xs, rng)`;
- `Level`, `LEVELS`, `priorFromRank`, `winChance`, `kFactor`, `median`, `collectMatches`, `buildRatings(season, files) → Ratings { rating: Map<number,number>; latestRank: Map<number,number>; brier: number; matches: number }`;
- `Field { pools: Record<Level, number[]>; value: Record<Level, number> }`, `buildField(season, files, rating, minPool = 20)`, `levelOf(category)`, `sampleField(field, level, rng)`.

- [ ] **Step 1: Failing tests.** Create `src/sim/testHelpers.ts` (shared by the sim tests; it holds no tests itself):

```ts
import type { Season } from '../data/schema';
import type { MatchRecord } from '../season/matchSchema';
import { season as fixture } from '../test/fixtures';

/** A match record with defaults for everything a test doesn't care about. */
export function rec(o: Omit<Partial<MatchRecord>, 'opponent'> & { opponent?: Partial<MatchRecord['opponent']> }): MatchRecord {
  return {
    tournamentId: 1, year: 2026, tournament: 'X', level: 'WTA 500', team: false, surface: 'Hard', indoor: false,
    startDate: '2026-03-02', endDate: '2026-03-08', qualifying: false, round: 1, roundName: 'R32',
    won: true, score: '6-1 6-1', outcome: 'played', points: null,
    ...o,
    opponent: { id: 10, name: 'Opp', country: null, seed: null, entry: null, rank: null, ...o.opponent },
  };
}

/** The fixture season with WTA ids: ana 1, bea 2, cat 3. */
export const withIds = (): Season => {
  const s = structuredClone(fixture);
  s.players.forEach((p, i) => (p.wtaId = i + 1));
  return s;
};
```

Create `src/sim/ratings.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { season as realSeason } from '../data/season';
import { readMatchFiles } from '../update/writeData';
import { buildRatings, collectMatches, kFactor, priorFromRank, winChance } from './ratings';
import { rec, withIds } from './testHelpers';

describe('ratings', () => {
  it('starts from the WTA ranking: about 1,900 at No. 1, 1,500 at No. 200, clamped to 1–500', () => {
    expect(priorFromRank(1)).toBe(1900);
    expect(priorFromRank(200)).toBeCloseTo(1500, 6);
    expect(priorFromRank(0)).toBe(priorFromRank(1));
    expect(priorFromRank(900)).toBe(priorFromRank(500));
  });

  it('turns a rating gap into a win chance, and shrinks K as matches add up', () => {
    expect(winChance(1600, 1600)).toBe(0.5);
    expect(winChance(2000, 1600)).toBeCloseTo(0.909, 3);
    expect(kFactor(0)).toBeCloseTo(131.3, 1);
    expect(kFactor(30)).toBeLessThan(kFactor(0));
  });

  it('replays matches in date order, counts a match between two tracked players once, and skips walkovers', () => {
    const files = {
      ana: [
        rec({ startDate: '2026-04-06', round: 2, opponent: { id: 2, rank: 3 }, won: true }),
        rec({ startDate: '2026-03-02', round: 1, opponent: { id: 10, rank: 50 }, won: true }),
        rec({ startDate: '2026-05-04', opponent: { id: 11 }, outcome: 'walkover', score: '' }),
      ],
      bea: [rec({ startDate: '2026-04-06', round: 2, opponent: { id: 1, rank: 7 }, won: false })],
    };
    const played = collectMatches(withIds(), files);
    expect(played.map((m) => [m.date, m.winner, m.loser])).toEqual([['2026-03-02', 1, 10], ['2026-04-06', 1, 2]]);
    const r = buildRatings(withIds(), files);
    expect(r.matches).toBe(2);
    expect(r.rating.get(1)!).toBeGreaterThan(priorFromRank(7)); // ana won both
    expect(r.rating.get(2)!).toBeLessThan(priorFromRank(3)); // bea lost
    expect(r.latestRank.get(1)).toBe(7);
    expect(r.latestRank.get(10)).toBe(50);
  });

  it("predicts this season's matches better than a coin flip", () => {
    const r = buildRatings(realSeason, readMatchFiles(new URL('../../data/', import.meta.url).pathname));
    console.log(`Ratings: ${r.matches} matches, Brier ${r.brier.toFixed(4)} (coin flip 0.25)`);
    expect(r.matches).toBeGreaterThan(1000);
    expect(r.brier).toBeLessThan(0.24);
  });
});
```

Create `src/sim/field.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildField, levelOf, sampleField } from './field';
import { mulberry32 } from './random';
import { rec, withIds } from './testHelpers';

const files = {
  ana: [
    rec({ level: 'WTA 1000', opponent: { id: 10 } }),
    rec({ level: 'WTA 1000', opponent: { id: 11 } }),
    rec({ level: 'WTA 1000', opponent: { id: 12 }, qualifying: true }),
    rec({ level: 'WTA 500', opponent: { id: 2 } }), // tracked: not field
    rec({ level: 'WTA 500', opponent: { id: 14 } }),
    rec({ level: 'WTA 250', opponent: { id: 13 } }),
  ],
};
const rating = new Map([[10, 1500], [11, 1700], [12, 1300], [13, 1400], [14, 1600], [2, 2000]]);

describe('field players', () => {
  it('pools untracked main-draw opponents per level, with the median as the level value', () => {
    const f = buildField(withIds(), files, rating, 1);
    expect(f.pools['WTA 1000'].sort()).toEqual([1500, 1700]);
    expect(f.pools['WTA 500']).toEqual([1600]);
    expect(f.pools['WTA 250']).toEqual([1400]);
    expect(f.value['WTA 1000']).toBe(1600);
  });

  it('combines the levels when a pool is too small', () => {
    const f = buildField(withIds(), files, rating);
    expect(f.pools['WTA 500'].sort()).toEqual([1400, 1500, 1600, 1700]);
    expect(f.value['WTA 250']).toBe(1550);
  });

  it('maps categories to levels and samples from the pool', () => {
    expect(levelOf('WTA1000C')).toBe('WTA 1000');
    expect(levelOf('WTA500')).toBe('WTA 500');
    expect(levelOf('GS')).toBe('WTA 500');
    const f = buildField(withIds(), files, rating, 1);
    const rng = mulberry32(1);
    for (let i = 0; i < 20; i++) expect([1500, 1700]).toContain(sampleField(f, 'WTA 1000', rng));
  });
});
```

Run `npx vitest run src/sim`. Expected: FAIL (modules missing).

- [ ] **Step 2: `src/sim/random.ts`:**

```ts
export type Rng = () => number;

/** mulberry32: a small seeded PRNG, uniform in [0, 1). The same seed gives the same sequence. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A shuffled copy (Fisher–Yates). */
export function shuffle<T>(xs: readonly T[], rng: Rng): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
```

- [ ] **Step 3: `src/sim/ratings.ts`:**

```ts
import type { Season } from '../data/schema';
import type { MatchRecord } from '../season/matchSchema';

export type Level = 'WTA 1000' | 'WTA 500' | 'WTA 250';
export const LEVELS: readonly Level[] = ['WTA 1000', 'WTA 500', 'WTA 250'];
export const asLevel = (level: string | undefined): Level => (LEVELS as readonly string[]).includes(level ?? '') ? (level as Level) : 'WTA 500';

/** The starting rating for a WTA ranking: about 1,900 at No. 1 and 1,500 at No. 200 (rank clamped to 1–500). */
export function priorFromRank(rank: number): number {
  const r = Math.min(500, Math.max(1, rank));
  return 1500 + 400 * (1 - Math.log2(r) / Math.log2(200));
}

/** The chance that a player rated `a` beats one rated `b`. */
export function winChance(a: number, b: number): number {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/** Elo K for a player with `n` matches so far (FiveThirtyEight's tennis K). */
export const kFactor = (n: number) => 250 / (n + 5) ** 0.4;

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return 1500;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export interface Played {
  date: string;
  qualifying: boolean;
  round: number;
  winner: number;
  loser: number;
  level: string;
}

const trackedFiles = (season: Season, files: Record<string, MatchRecord[]>) =>
  season.players.flatMap((p) => (p.wtaId === undefined ? [] : [{ self: p.wtaId, records: files[p.id] ?? [] }]));

/** Every match in the tracked players' files once (walkovers left out), in date order, qualifying before main draw, then by round. */
export function collectMatches(season: Season, files: Record<string, MatchRecord[]>): Played[] {
  const seen = new Set<string>();
  const out: Played[] = [];
  for (const { self, records } of trackedFiles(season, files)) {
    for (const m of records) {
      const opp = m.opponent.id;
      if (opp === null || m.outcome === 'walkover') continue;
      const key = `${m.tournamentId}-${m.year}-${m.qualifying ? 'q' : 'm'}-${m.round}-${Math.min(self, opp)}-${Math.max(self, opp)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ date: m.startDate, qualifying: m.qualifying, round: m.round, winner: m.won ? self : opp, loser: m.won ? opp : self, level: m.level });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || Number(b.qualifying) - Number(a.qualifying) || a.round - b.round);
}

export interface Ratings {
  /** Rating after the whole season, by WTA id. */
  rating: Map<number, number>;
  /** Latest published WTA ranking, by WTA id. Records only carry the opponent's ranking. */
  latestRank: Map<number, number>;
  /** Mean squared error of the pre-match win chances over the replayed matches (a coin flip scores 0.25). */
  brier: number;
  matches: number;
}

/** Elo ratings from the race-year matches: priors from the first known ranking, then one update per match. */
export function buildRatings(season: Season, files: Record<string, MatchRecord[]>): Ratings {
  const ranks = trackedFiles(season, files)
    .flatMap(({ records }) => records.flatMap((m) => (m.opponent.id !== null && m.opponent.rank !== null && m.opponent.rank > 0 ? [{ date: m.startDate, id: m.opponent.id, rank: m.opponent.rank, level: m.level, main: !m.qualifying && !m.team }] : [])))
    .sort((a, b) => a.date.localeCompare(b.date));
  const firstRank = new Map<number, number>();
  const latestRank = new Map<number, number>();
  for (const r of ranks) {
    if (!firstRank.has(r.id)) firstRank.set(r.id, r.rank);
    latestRank.set(r.id, r.rank);
  }
  // Players with no known ranking start at the typical opponent of the level they first played at.
  const levelPrior = Object.fromEntries(LEVELS.map((l) => [l, median(ranks.filter((r) => r.main && r.level === l).map((r) => priorFromRank(r.rank)))])) as Record<Level, number>;

  const played = collectMatches(season, files);
  const firstLevel = new Map<number, string>();
  for (const m of played) for (const id of [m.winner, m.loser]) if (!firstLevel.has(id)) firstLevel.set(id, m.level);
  const rating = new Map<number, number>();
  const count = new Map<number, number>();
  const get = (id: number) => {
    if (!rating.has(id)) rating.set(id, firstRank.has(id) ? priorFromRank(firstRank.get(id)!) : levelPrior[asLevel(firstLevel.get(id))]);
    return rating.get(id)!;
  };
  let squared = 0;
  for (const m of played) {
    const w = get(m.winner);
    const l = get(m.loser);
    const expected = winChance(w, l);
    squared += (1 - expected) ** 2;
    const nw = count.get(m.winner) ?? 0;
    const nl = count.get(m.loser) ?? 0;
    rating.set(m.winner, w + kFactor(nw) * (1 - expected));
    rating.set(m.loser, l - kFactor(nl) * (1 - expected));
    count.set(m.winner, nw + 1);
    count.set(m.loser, nl + 1);
  }
  return { rating, latestRank, brier: played.length ? squared / played.length : 0.25, matches: played.length };
}
```

- [ ] **Step 4: `src/sim/field.ts`:**

```ts
import type { Season } from '../data/schema';
import type { MatchRecord } from '../season/matchSchema';
import type { Rng } from './random';
import { LEVELS, median, type Level } from './ratings';

export interface Field {
  /** Ratings to draw field players from, per level. */
  pools: Record<Level, number[]>;
  /** The typical field player per level (the pool median): for unrated players in real draws. */
  value: Record<Level, number>;
}

export function levelOf(category: string): Level {
  if (category === 'WTA1000' || category === 'WTA1000C') return 'WTA 1000';
  if (category === 'WTA250') return 'WTA 250';
  return 'WTA 500';
}

/** The ratings of the untracked players our players met in main draws, per level; levels are combined if any has fewer than `minPool`. */
export function buildField(season: Season, files: Record<string, MatchRecord[]>, rating: ReadonlyMap<number, number>, minPool = 20): Field {
  const tracked = new Set(season.players.flatMap((p) => (p.wtaId === undefined ? [] : [p.wtaId])));
  const ids = Object.fromEntries(LEVELS.map((l) => [l, new Set<number>()])) as Record<Level, Set<number>>;
  for (const p of season.players) {
    for (const m of files[p.id] ?? []) {
      const id = m.opponent.id;
      if (id === null || m.qualifying || m.team || tracked.has(id) || !(LEVELS as readonly string[]).includes(m.level)) continue;
      ids[m.level as Level].add(id);
    }
  }
  let pools = Object.fromEntries(LEVELS.map((l) => [l, [...ids[l]].flatMap((id) => (rating.has(id) ? [rating.get(id)!] : []))])) as Record<Level, number[]>;
  if (LEVELS.some((l) => pools[l].length < minPool)) {
    const all = LEVELS.flatMap((l) => pools[l]);
    pools = Object.fromEntries(LEVELS.map((l) => [l, all])) as Record<Level, number[]>;
  }
  return { pools, value: Object.fromEntries(LEVELS.map((l) => [l, median(pools[l])])) as Record<Level, number> };
}

export function sampleField(field: Field, level: Level, rng: Rng): number {
  const pool = field.pools[level];
  return pool.length ? pool[Math.floor(rng() * pool.length)]! : field.value[level];
}
```

- [ ] **Step 5:** Run `npx tsc -b && npx vitest run src/sim`. Expected: PASS, with the Brier line printed. Record the Brier figure in the ledger. If the real-data check fails, debug the replay (systematic-debugging). Don't loosen the bound.
- [ ] **Step 6:** Commit: `feat(sim): Elo ratings and field pools from the season's matches`.

---

### Task 2: Draws and play-out

**Files:**
- Create: `src/sim/drawSim.ts`, `src/sim/drawSim.test.ts`

**Interfaces:**
- Consumes: `Rng`, `shuffle` (random.ts), `winChance` (ratings.ts), `Bracket`, `BracketMatch`, `Slot`, `buildBracket` (`src/draws/bracket.ts`).
- Produces:
  - `seedPositions(lines, count, rng): number[]`;
  - `bracketFromLines(lines: Slot[]): Bracket`;
  - `randomDraw(lines, drawSize, entrants: number[], fieldRating: () => number, rng) → { bracket; field: Map<number, number>; byes: number[] }`, where field players get negative ids;
  - `simulateBracket(bracket, ratingOf, rng) → Map<wtaId, bracketRound>`, where the round is the one she lost in, or rounds + 1 for the champion. It only includes players whose finish was simulated.

- [ ] **Step 1: Failing tests,** `src/sim/drawSim.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildBracket } from '../draws/bracket';
import type { DrawFile } from '../draws/drawSchema';
import { bracketFromLines, randomDraw, seedPositions, simulateBracket } from './drawSim';
import { mulberry32 } from './random';

describe('simulated draws', () => {
  it('puts seeds at the ends of the draw, then the free ends of halves, quarters and eighths', () => {
    const p = seedPositions(64, 16, mulberry32(7));
    expect(p.slice(0, 2)).toEqual([0, 63]);
    expect(new Set(p.slice(2, 4))).toEqual(new Set([31, 32]));
    expect(new Set(p.slice(4, 8))).toEqual(new Set([15, 16, 47, 48]));
    expect(new Set(p.slice(8, 16))).toEqual(new Set([7, 8, 23, 24, 39, 40, 55, 56]));
  });

  it('builds a 56 draw: 64 lines, byes for the top 8 seeds, every entrant once, and the same draw for the same seed', () => {
    const entrants = [101, 102, 103, 104, 105];
    const d = randomDraw(64, 56, entrants, () => 1500, mulberry32(3));
    const lines = d.bracket.rounds[0]!.flatMap((m) => [m.top, m.bottom]);
    expect(lines).toHaveLength(64);
    expect(lines.filter((s) => s === 'bye')).toHaveLength(8);
    expect(lines[0]).toBe(101);
    expect(lines[1]).toBe('bye');
    expect(lines[63]).toBe(102);
    for (const id of entrants) expect(lines.filter((s) => s === id)).toHaveLength(1);
    expect(lines.filter((s) => typeof s === 'number' && s < 0)).toHaveLength(51);
    expect(d.field.size).toBe(51);
    expect(new Set(d.byes)).toEqual(new Set(entrants));
    expect(randomDraw(64, 56, entrants, () => 1500, mulberry32(3))).toEqual(d);
  });

  it('gives a 28 draw 4 byes and a 32 draw none', () => {
    const count = (size: number) => randomDraw(32, size, [1, 2], () => 1500, mulberry32(1)).bracket.rounds[0]!.filter((m) => m.outcome === 'bye').length;
    expect(count(28)).toBe(4);
    expect(count(32)).toBe(0);
  });

  it('plays out only undecided matches; results stand and the champion gets the round after the final', () => {
    const player = (wtaId: number) => ({ wtaId, name: `P${wtaId}`, country: null, seed: null, entry: null });
    const draw: DrawFile = {
      drawSize: 4,
      players: [1, 2, 3, 4].map(player),
      matches: [
        { round: 1, a: 1, b: 2, winner: 2, score: '6-1 6-1', outcome: 'played' },
        { round: 1, a: 3, b: 4, winner: null, score: '', outcome: 'scheduled' },
      ],
    };
    const strong = (id: number) => (id === 1 || id === 3 ? 3000 : 1000);
    for (let seed = 0; seed < 20; seed++) {
      const finish = simulateBracket(buildBracket(draw)!, strong, mulberry32(seed));
      expect(finish.has(1)).toBe(false); // lost for real: not re-decided
      expect(finish.get(4)).toBe(1);
      expect([finish.get(2), finish.get(3)].sort()).toEqual([2, 3]);
    }
  });

  it('a much stronger player nearly always wins', () => {
    const b = bracketFromLines([1, 2]);
    let wins = 0;
    const rng = mulberry32(9);
    for (let i = 0; i < 1000; i++) if (simulateBracket(b, (id) => (id === 1 ? 2400 : 1600), rng).get(1) === 2) wins++;
    expect(wins).toBeGreaterThan(980);
  });
});
```

Run `npx vitest run src/sim/drawSim.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 2: `src/sim/drawSim.ts`:**

```ts
import type { Bracket, BracketMatch, Slot } from '../draws/bracket';
import { shuffle, type Rng } from './random';
import { winChance } from './ratings';

/** Lines for seeds 1…count: the two ends of the draw, then the free ends of the halves, quarters, eighths… (random within each level). */
export function seedPositions(lines: number, count: number, rng: Rng): number[] {
  const taken = lines > 1 ? [0, lines - 1] : [0];
  for (let segment = lines / 2; taken.length < count && segment >= 1; segment /= 2) {
    const ends: number[] = [];
    for (let start = 0; start < lines; start += segment) {
      for (const end of new Set([start, start + segment - 1])) if (!taken.includes(end)) ends.push(end);
    }
    taken.push(...shuffle(ends, rng));
  }
  return taken.slice(0, count);
}

/** A bracket from its first-round lines, with every match still to play (byes go straight through). */
export function bracketFromLines(lines: Slot[]): Bracket {
  const rounds: BracketMatch[][] = [];
  let entrants: Slot[] = lines;
  for (let round = 1; entrants.length > 1; round++) {
    const matches: BracketMatch[] = [];
    for (let i = 0; i < entrants.length; i += 2) {
      const top = entrants[i] ?? null;
      const bottom = entrants[i + 1] ?? null;
      if (top === 'bye' || bottom === 'bye') {
        const through = top === 'bye' ? bottom : top;
        matches.push({ round, top, bottom, winner: typeof through === 'number' ? through : null, score: '', outcome: 'bye' });
      } else {
        matches.push({ round, top, bottom, winner: null, score: '', outcome: 'pending' });
      }
    }
    rounds.push(matches);
    entrants = matches.map((m) => m.winner);
  }
  return { size: lines.length, rounds };
}

/**
 * A draw for an event whose draw isn't out. The tracked entrants (in seeding order) take the seed places, the
 * top seeds get the byes, the remaining entrants land at random, and field players (negative ids, rated by
 * `fieldRating`) fill the rest.
 */
export function randomDraw(lines: number, drawSize: number, entrants: readonly number[], fieldRating: () => number, rng: Rng) {
  const byeCount = Math.max(0, lines - drawSize);
  const seedCount = Math.min(lines / 2, Math.max(byeCount, drawSize > 32 ? 16 : 8));
  const slots: Slot[] = new Array<Slot>(lines).fill(null);
  const field = new Map<number, number>();
  let nextField = -1;
  const fieldPlayer = () => {
    const id = nextField--;
    field.set(id, fieldRating());
    return id;
  };
  const positions = seedPositions(lines, seedCount, rng);
  positions.forEach((line, i) => {
    slots[line] = entrants[i] ?? fieldPlayer();
    if (i < byeCount) slots[line ^ 1] = 'bye';
  });
  const free = shuffle(slots.flatMap((s, i) => (s === null ? [i] : [])), rng);
  const rest = entrants.slice(seedCount);
  free.forEach((line, i) => {
    slots[line] = rest[i] ?? fieldPlayer();
  });
  const byes = positions.slice(0, byeCount).flatMap((line) => {
    const s = slots[line];
    return typeof s === 'number' && s > 0 ? [s] : [];
  });
  return { bracket: bracketFromLines(slots), field, byes };
}

const decided = (m: BracketMatch) => m.outcome !== 'pending' && m.outcome !== 'scheduled' && m.winner !== null;

/**
 * Plays out every undecided match with the ratings' win chances; results and byes stand. Returns the bracket
 * round each player went out in (rounds + 1 for the champion), for players whose finish was simulated.
 */
export function simulateBracket(bracket: Bracket, ratingOf: (id: number) => number, rng: Rng): Map<number, number> {
  const finish = new Map<number, number>();
  let previous: (number | null)[] = [];
  bracket.rounds.forEach((round, index) => {
    previous = round.map((m, i) => {
      if (m.outcome === 'bye' || decided(m)) return m.winner;
      const a = typeof m.top === 'number' ? m.top : (previous[2 * i] ?? null);
      const b = typeof m.bottom === 'number' ? m.bottom : (previous[2 * i + 1] ?? null);
      if (a === null || b === null) return a ?? b;
      const aWins = rng() < winChance(ratingOf(a), ratingOf(b));
      finish.set(aWins ? b : a, index + 1);
      if (index === bracket.rounds.length - 1) finish.set(aWins ? a : b, index + 2);
      return aWins ? a : b;
    });
  });
  return finish;
}
```

- [ ] **Step 3:** Run `npx tsc -b && npx vitest run src/sim`. Expected: PASS.
- [ ] **Step 4:** Commit: `feat(sim): seeded random draws and bracket play-out`.

---

### Task 3: Chances

**Files:**
- Create: `src/sim/chances.ts`, `src/sim/chances.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–2, plus `projectStandings`, `pointsTable`, `pickKey`, `buildBracket`.
- Produces: `simulateChances(season, files, draws, { runs, seed }) → Record<playerId, number>`, plus `prepareSimulation`, `simulateRun`, `FULL_RUNS = 10_000`, `DEV_RUNS = 1_000` and `SEED = 20261009`.

- [ ] **Step 1: Failing tests,** `src/sim/chances.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { season as realSeason } from '../data/season';
import { eliminatedPlayers } from '../engine/elimination';
import { splitPickKey } from '../engine/types';
import { readDrawFiles, readMatchFiles } from '../update/writeData';
import { prepareSimulation, simulateChances, simulateRun } from './chances';
import { mulberry32 } from './random';
import { withIds } from './testHelpers';

const small = () => {
  const s = withIds();
  s.tournaments.find((t) => t.id === 'next')!.entries = ['bea', 'cat'];
  s.tournaments.find((t) => t.id === 'clash')!.entries = ['cat'];
  return s;
};

describe('qualification chances', () => {
  it('gives every player a chance between 0 and 1, the same for the same seed; an announced qualifier is 1', () => {
    const a = simulateChances(small(), {}, {}, { runs: 200, seed: 1 });
    expect(Object.keys(a).sort()).toEqual(['ana', 'bea', 'cat']);
    for (const p of Object.values(a)) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(a.ana).toBe(1);
    expect(simulateChances(small(), {}, {}, { runs: 200, seed: 1 })).toEqual(a);
  });

  it('picks only for entrants, at most one champion per event, and simulated byes reach the engine', () => {
    const s = small();
    const prep = prepareSimulation(s, {}, {});
    const rng = mulberry32(5);
    for (let i = 0; i < 200; i++) {
      const { scenario, tournaments } = simulateRun(prep, s, rng);
      for (const key of Object.keys(scenario)) {
        const { playerId, tournamentId } = splitPickKey(key);
        expect(s.tournaments.find((t) => t.id === tournamentId)!.entries).toContain(playerId);
      }
      for (const t of ['next', 'clash']) expect(Object.entries(scenario).filter(([k, r]) => k.endsWith(`|${t}`) && r === 'W').length).toBeLessThanOrEqual(1);
      // 'next' is a 32 draw (no byes), so the fixture's hand-entered bye list is replaced by the simulated one.
      expect(tournaments.find((t) => t.id === 'next')!.byes).toEqual([]);
    }
  });

  it('on real data: values in range, announced qualifiers at 1, eliminated players at 0', () => {
    const dir = new URL('../../data/', import.meta.url).pathname;
    const chances = simulateChances(realSeason, readMatchFiles(dir), readDrawFiles(dir), { runs: 200, seed: 1 });
    expect(Object.keys(chances)).toHaveLength(realSeason.players.length);
    for (const p of realSeason.players) {
      expect(chances[p.id]).toBeGreaterThanOrEqual(0);
      expect(chances[p.id]).toBeLessThanOrEqual(1);
      if (p.qualified) expect(chances[p.id]).toBe(1);
    }
    for (const id of eliminatedPlayers(realSeason.players, realSeason.tournaments, realSeason.rules)) expect(chances[id]).toBe(0);
  });
});
```

Run `npx vitest run src/sim/chances.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 2: `src/sim/chances.ts`:**

```ts
import type { Player, RoundPoints, Season, Tournament } from '../data/schema';
import { buildBracket, type Bracket } from '../draws/bracket';
import type { DrawFile } from '../draws/drawSchema';
import { pointsTable } from '../engine/lookup';
import { projectStandings } from '../engine/standings';
import { pickKey, type Scenario } from '../engine/types';
import type { MatchRecord } from '../season/matchSchema';
import { randomDraw, simulateBracket } from './drawSim';
import { buildField, levelOf, sampleField, type Field } from './field';
import { mulberry32, type Rng } from './random';
import { buildRatings, type Ratings } from './ratings';

export const FULL_RUNS = 10_000;
export const DEV_RUNS = 1_000;
export const SEED = 20261009;

interface Event {
  t: Tournament;
  table: RoundPoints[];
  /** The real bracket, when the draw is out and readable. */
  real: Bracket | null;
  lines: number;
  drawSize: number;
  /** Tracked entrants' WTA ids in seeding order (events without a draw). */
  entrants: number[];
}

export interface Simulation {
  ratings: Ratings;
  field: Field;
  byWta: Map<number, Player>;
  events: Event[];
}

const drawSizeOf = (t: Tournament, lines: number) => t.drawSize ?? Number(/-(\d+)$/.exec(t.drawType)?.[1] ?? lines);

/** Ratings, field pools and the events still to play (everything that doesn't change between runs). */
export function prepareSimulation(season: Season, files: Record<string, MatchRecord[]>, draws: Record<string, DrawFile>): Simulation {
  const ratings = buildRatings(season, files);
  const field = buildField(season, files, ratings.rating);
  const byWta = new Map(season.players.flatMap((p) => (p.wtaId === undefined ? [] : [[p.wtaId, p] as const])));
  const rank = (id: number) => ratings.latestRank.get(id) ?? Number.POSITIVE_INFINITY;
  const rating = (id: number) => ratings.rating.get(id) ?? field.value['WTA 500'];
  const events = season.tournaments
    .filter((t) => t.status !== 'completed' && t.drawType !== 'united-cup' && !t.id.startsWith('zp-'))
    .flatMap((t): Event[] => {
      const table = pointsTable(season.rules, t.drawType);
      const lines = 2 ** (table.length - 1);
      const draw = draws[t.id];
      const real = draw ? buildBracket(draw) : null;
      if (real && real.size === lines) return [{ t, table, real, lines, drawSize: draw!.drawSize, entrants: [] }];
      if (t.status === 'in-progress') return []; // no readable draw: alive players keep the round they're in
      const entrants = season.players
        .filter((p) => p.wtaId !== undefined && t.entries?.includes(p.id))
        .map((p) => p.wtaId!)
        .sort((a, b) => rank(a) - rank(b) || rating(b) - rating(a));
      return [{ t, table, real: null, lines, drawSize: drawSizeOf(t, lines), entrants }];
    });
  return { ratings, field, byWta, events };
}

/** One simulated finish to the season: a pick for every tracked player at every event still to play, and the byes it handed out. */
export function simulateRun(sim: Simulation, season: Season, rng: Rng): { scenario: Scenario; tournaments: Tournament[] } {
  const scenario: Record<string, string> = {};
  const byes = new Map<string, string[]>();
  for (const e of sim.events) {
    const level = levelOf(e.t.category);
    let bracket = e.real;
    let field = new Map<number, number>();
    if (!bracket) {
      const d = randomDraw(e.lines, e.drawSize, e.entrants, () => sampleField(sim.field, level, rng), rng);
      bracket = d.bracket;
      field = d.field;
      byes.set(e.t.id, d.byes.map((id) => sim.byWta.get(id)!.id));
    }
    const ratingOf = (id: number) => field.get(id) ?? sim.ratings.rating.get(id) ?? sim.field.value[level];
    for (const [id, round] of simulateBracket(bracket, ratingOf, rng)) {
      const p = sim.byWta.get(id);
      if (p) scenario[pickKey(p.id, e.t.id)] = e.table[round - 1]!.round;
    }
  }
  const tournaments = byes.size ? season.tournaments.map((t) => (byes.has(t.id) ? { ...t, byes: byes.get(t.id)! } : t)) : season.tournaments;
  return { scenario, tournaments };
}

/** Each tracked player's share of simulated finishes in which she qualifies. */
export function simulateChances(
  season: Season,
  files: Record<string, MatchRecord[]>,
  draws: Record<string, DrawFile>,
  { runs, seed }: { runs: number; seed: number },
): Record<string, number> {
  const sim = prepareSimulation(season, files, draws);
  const rng = mulberry32(seed);
  const hits = new Map(season.players.map((p) => [p.id, 0]));
  for (let i = 0; i < runs; i++) {
    const { scenario, tournaments } = simulateRun(sim, season, rng);
    for (const row of projectStandings(season.players, scenario, tournaments, season.rules)) {
      if (row.projectedQualifier !== null) hits.set(row.playerId, hits.get(row.playerId)! + 1);
    }
  }
  return Object.fromEntries([...hits].map(([id, n]) => [id, n / runs]));
}
```

- [ ] **Step 3:** Run `npx tsc -b && npx vitest run src/sim`. Expected: PASS. If `a.ana` isn't 1, check how `projectStandings` treats `qualified: true` before changing anything. The spec says announced qualifiers are certain.
- [ ] **Step 4: Timing check.** Run the following and record the timing and the top-12 chances in the ledger:

```bash
npx tsx -e "import {season} from './src/data/season'; import {readMatchFiles, readDrawFiles} from './src/update/writeData'; import {simulateChances, FULL_RUNS, SEED} from './src/sim/chances'; const t=Date.now(); const c=simulateChances(season, readMatchFiles('data'), readDrawFiles('data'), {runs: FULL_RUNS, seed: SEED}); console.log(((Date.now()-t)/1000).toFixed(1)+'s'); console.log(Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,12));"
```

Expected: under about 15 s, and an ordering that makes sense next to the standings. If it takes longer, lower `FULL_RUNS` to 5,000, update the tooltip copy to match, and record a ruling.
- [ ] **Step 5:** Commit: `feat(sim): qualification chances from simulated season finishes`.

---

### Task 4: The Chance column and line

**Files:**
- Modify: `src/ui/format.ts`, `src/ui/StandingsTable.tsx`, `src/ui/App.tsx`, `src/ui/styles.css`, `src/ui/StandingsTable.test.tsx`

**Interfaces:**
- Produces: `formatChance(p: number): string`, `StandingsTable` prop `chances?: Readonly<Record<string, number>>`, and `App` prop `chances?: Readonly<Record<string, number>> | null`.

- [ ] **Step 1: Failing tests,** appended to `StandingsTable.test.tsx`. Use the file's existing imports and its existing way of building `rows` (read the top of the file first, and reuse its helper for fixture rows). Add `formatChance` to the imports from `./format`, and `userEvent` if it isn't already imported.

```tsx
describe('chances', () => {
  it('formats a chance: whole percent, >99%, <1%', () => {
    expect(formatChance(0.874)).toBe('87%');
    expect(formatChance(0.995)).toBe('>99%');
    expect(formatChance(1)).toBe('>99%');
    expect(formatChance(0.004)).toBe('<1%');
    expect(formatChance(0)).toBe('<1%');
  });

  it('shows Q for qualified or clinched, — for eliminated, the percent otherwise, and a line in the expanded row', async () => {
    const rows = projectStandings(season.players, {}, season.tournaments, season.rules);
    render(
      <StandingsTable rows={rows} eliminated={new Set(['cat'])} chances={{ ana: 1, bea: 0.42, cat: 0 }} breakdownOf={(id) => playerBreakdown(season.players.find((p) => p.id === id)!, {}, season.tournaments, season.rules)} />,
    );
    expect(screen.getByRole('columnheader', { name: 'Chance' })).toHaveAttribute('title', "Chance to qualify, from 10,000 simulated finishes to the season using real results only. Your picks don't change it.");
    await userEvent.click(screen.getByRole('checkbox', { name: /Hide eliminated/ })); // show cat
    const cell = (id: string) => within(screen.getByTestId(`row-${id}`)).getByTestId('chance');
    expect(cell('ana')).toHaveTextContent('Q');
    expect(cell('bea')).toHaveTextContent('42%');
    expect(cell('cat')).toHaveTextContent('—');
    await userEvent.click(screen.getByRole('button', { name: 'Bea Beta' }));
    expect(screen.getByText('Chance to qualify: 42%')).toBeInTheDocument();
    expect(screen.getByText(/Chances come from simulating the remaining events/)).toBeInTheDocument();
  });

  it('leaves the column, line and note out without chances', () => {
    render(<StandingsTable rows={projectStandings(season.players, {}, season.tournaments, season.rules)} />);
    expect(screen.queryByRole('columnheader', { name: 'Chance' })).toBeNull();
    expect(screen.queryByText(/Chances come from/)).toBeNull();
  });
});
```

Run it. Expected: FAIL. If the hide-eliminated checkbox has a different default or name in this test environment, adjust that one click so `cat`'s row is visible. Check the localStorage state the file's other tests use.

- [ ] **Step 2: Implement.**

In `format.ts`:

```ts
/** A simulated chance as shown: whole percent, capped at >99% and <1% (the simulation never proves anything). */
export function formatChance(p: number): string {
  if (p >= 0.995) return '>99%';
  if (p < 0.005) return '<1%';
  return `${Math.round(p * 100)}%`;
}
```

In `StandingsTable.tsx`:
- Import `formatChance`.
- Add `const CHANCE_TITLE = "Chance to qualify, from 10,000 simulated finishes to the season using real results only. Your picks don't change it.";`.
- Add the prop `/** Each player's simulated chance of qualifying, from actual results (independent of the visitor's picks). */ chances?: Readonly<Record<string, number>>;` and destructure it.
- Inside the component:

```tsx
  const chanceOf = (r: StandingRow) =>
    r.qualified || clinched.has(r.playerId) ? 'Q' : eliminated.has(r.playerId) ? '—' : formatChance(chances?.[r.playerId] ?? 0);
  const chanceLine = (r: StandingRow) => {
    const c = chanceOf(r);
    return `Chance to qualify: ${c === 'Q' ? 'qualified' : c === '—' ? 'none' : c}`;
  };
```

- After the Max header: `{chances && <th scope="col" className="wide num chance" title={CHANCE_TITLE}>Chance</th>}`.
- After the Max cell: `{chances && <td className="wide num chance" data-testid="chance">{chanceOf(r)}</td>}`.
- In the breakdown row: `<td colSpan={chances ? 9 : 8}>`. Before `<ResultsBreakdown …/>`, add `{chances && <p className="chance-line">{chanceLine(r)}</p>}`.
- After the legend paragraph: `{chances && <p className="legend">Chance = chance to qualify. Chances come from simulating the remaining events with ratings built from this season's results.</p>}`.

Check that `StandingRow` is imported as a type, and add it if not.

In `App.tsx`, change the signature to `export function App({ season, chances = null }: { season: Season; chances?: Readonly<Record<string, number>> | null })` and pass `chances={chances ?? undefined}` to `StandingsTable`.

In `styles.css`, add `.chance-line { margin: 0 0 8px; font-weight: 600; }`. The column reuses `.wide.num`, which hides it on phones as for Max. Check that the existing `.max` color rule doesn't need a `.chance` twin. Rows use their own color, so give `.chance` the same treatment as `.max` if `.max` has a color rule.

- [ ] **Step 3:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 4:** Commit: `feat(ui): Chance column and expanded-row line`.

---

### Task 5: Build-time chances, dev chances, end-to-end

**Files:**
- Modify: `index.html`, `src/prerender/pages.tsx`, `src/prerender/pages.test.tsx`, `scripts/prerender.ts`, `src/entry-home.tsx`, `src/ui/hydration.test.tsx`, `e2e/` (new `e2e/chances.spec.ts`), `README.md`

- [ ] **Step 1: Failing tests.** In `pages.test.tsx`:

```tsx
  it('embeds the chances in the homepage and renders the column', () => {
    const html = homeHtml(HOME.replace('</body>', '<!--data--></body>'), season, { ana: 1, bea: 0.42, cat: 0 });
    expect(html).toContain('<script id="page-data" type="application/json">{"chances":{"ana":1,"bea":0.42,"cat":0}}</script>');
    expect(html).toContain('>Chance</th>');
  });
```

In `hydration.test.tsx` (import `App` if it isn't already):

```tsx
  it('the homepage hydrates cleanly with chances embedded', async () => {
    expect(await hydrationErrors(<App season={season} chances={{ ana: 1, bea: 0.42, cat: 0 }} />)).toEqual([]);
  });
```

Create `e2e/chances.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test("the standings show each player's chance to qualify", async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('columnheader', { name: 'Chance' })).toBeVisible();
  const first = page.locator('[data-testid^="row-"]').first();
  await expect(first.getByTestId('chance')).toHaveText(/^(Q|>99%|<1%|\d{1,2}%)$/);
  await first.getByRole('button').first().click();
  await expect(page.getByText(/^Chance to qualify: /)).toBeVisible();
});
```

Run `npx vitest run src/prerender src/ui/hydration.test.tsx`. Expected: FAIL (homeHtml has no chances parameter).

- [ ] **Step 2: Implement.**

`pages.tsx`:

```tsx
export function homeHtml(template: string, season: Season, chances: Readonly<Record<string, number>> | null = null): string {
  const json = JSON.stringify({ chances }).replace(/</g, '\\u003c');
  return fillRoot(template, renderToString(<App season={season} chances={chances} />)).replace(
    '<!--data-->',
    () => `<script id="page-data" type="application/json">${json}</script>`,
  );
}
```

In `index.html`, put `<!--data-->` on its own line directly before `<script type="module" src="/src/entry-home.tsx"></script>`.

`scripts/prerender.ts`:
- Read `matches` and `draws` before writing the homepage, and remove the later duplicate reads.
- Import `simulateChances`, `FULL_RUNS` and `SEED` from `../src/sim/chances`.
- Replace the homepage write with:

```ts
const dataDir = new URL('../data/', import.meta.url).pathname;
const matches = readMatchFiles(dataDir);
const draws = readDrawFiles(dataDir);
let chances: Record<string, number> | null = null;
const simStarted = Date.now();
try {
  chances = simulateChances(season, matches, draws, { runs: FULL_RUNS, seed: SEED });
  console.log(`Simulated ${FULL_RUNS.toLocaleString('en-US')} season finishes in ${((Date.now() - simStarted) / 1000).toFixed(1)}s.`);
} catch (error) {
  console.warn(`Chances left out: the simulation failed (${error instanceof Error ? error.message : String(error)}).`);
}
writeFileSync(`${dist}index.html`, homeHtml(homeTemplate, season, chances));
```

`src/entry-home.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { season } from './data/season';
import type { DrawFile } from './draws/drawSchema';
import type { MatchRecord } from './season/matchSchema';
import { DEV_RUNS, SEED, simulateChances } from './sim/chances';
import { App } from './ui/App';
import './ui/styles.css';

// Development only: the dev server has no prerendered data, so it simulates (fewer runs) from the data files.
const devMatches: Record<string, { default: MatchRecord[] }> = import.meta.env.DEV
  ? import.meta.glob<{ default: MatchRecord[] }>('../data/matches/*.json', { eager: true })
  : {};
const devDraws: Record<string, { default: DrawFile }> = import.meta.env.DEV
  ? import.meta.glob<{ default: DrawFile }>('../data/draws/*.json', { eager: true })
  : {};
const byName = <T,>(files: Record<string, { default: T }>): Record<string, T> =>
  Object.fromEntries(Object.entries(files).map(([path, mod]) => [path.replace(/^.*\/([^/]+)\.json$/, '$1'), mod.default]));

function pageChances(): Record<string, number> | null {
  const embedded = document.getElementById('page-data');
  if (embedded) return (JSON.parse(embedded.textContent ?? '{}') as { chances?: Record<string, number> | null }).chances ?? null;
  if (!import.meta.env.DEV) return null;
  return simulateChances(season, byName(devMatches), byName(devDraws), { runs: DEV_RUNS, seed: SEED });
}

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App season={season} chances={pageChances()} />
  </StrictMode>
);
// Built pages arrive prerendered (data-ssr); the dev server serves the bare template.
if (root.hasAttribute('data-ssr')) hydrateRoot(root, app);
else createRoot(root).render(app);
```

`README.md`: after the tournament-pages paragraph, add a paragraph on the Chance column:
- **What it is:** a simulation of the rest of the season, 10,000 runs at build time (1,000 on the dev server), seed `20261009`.
- **Ratings:** Elo ratings replayed from `data/matches/`, with priors from WTA rankings.
- **Who plays:** players play the events whose published entry list includes them, so a withdrawal moves the numbers once the list changes.
- **Scoring:** the existing engine scores each run.
- **Where it lives:** the code is in `src/sim/`, and its tests include a calibration check against a coin flip.

- [ ] **Step 3:** Run `npx tsc -b && npx vitest run && npm run build && npx playwright test`. Expected: all pass. The build log shows "Simulated 10,000 season finishes in …s." Record the time in the ledger.
- [ ] **Step 4: Browser check** with `npm run preview`:
  - On desktop, the Chance column shows next to Max, and Q appears once the clinch worker finishes.
  - On a phone in dark mode, there's no column, and the expanded row shows the line.
  - On `npm run dev`, the column appears after the in-browser simulation.
  - No console errors or hydration warnings.
- [ ] **Step 5:** Commit: `feat: qualification chances on the built homepage; docs`.
