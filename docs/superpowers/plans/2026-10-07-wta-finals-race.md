# WTA Finals Race Projector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static, mobile-first fan site that shows the 2026 Race to the WTA Finals (singles) and lets visitors project the final top 8 by picking results for the remaining tournaments, with the scenario shareable by URL.

**Architecture:** Hand-curated JSON in `data/` is validated by Zod schemas and bundled at build time. A pure TypeScript rules engine (`src/engine/`) counts race totals, applies picks, ranks players and checks scenarios. The same engine powers the React UI and a validation script that blocks any build whose data does not reproduce the official WTA totals. Scenario state lives in the URL query string.

**Tech Stack:** Vite, React, TypeScript, Zod 4, Vitest + Testing Library (jsdom), Playwright, tsx (for scripts), GitHub Actions, Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-10-07-wta-finals-race-design.md`

## Global Constraints

- Season scope: 2026 only. Every season-specific value lives in `data/*.json`, not in code.
- Stack: Vite + React + TypeScript. Zod for data schema validation. Vitest for unit/component tests, Playwright for one end-to-end flow.
- No backend. Data JSON is bundled into the build at build time. All logic runs in the browser.
- `src/engine/` has no React or browser dependencies (it imports only from `src/data/schema.ts` types and its own files).
- Every rule value (cap, mandatory set, bye rule, tiebreakers, points tables) **must be verified against the official 2026 WTA Rulebook** before data is populated. None are filled in from memory. Test fixtures use obviously synthetic values and say so in a comment.
- `trackedPlayerCount` defaults to 25. The top 8 qualify (cutoff line after #8). Ranks 9–10 are lightly shaded as alternates.
- Projections never add zero-pointers for skipped mandatory events. The UI states this assumption.
- No clinching/elimination maths. Only the hand-set `qualified` flag is shown.
- Hosting: static build on Cloudflare Pages. GitHub Actions runs tests and data validation on every push. Deployment happens only when they pass.
- Node ≥ 20.19 is required by current Vite/Vitest. This machine has Node 20.2.0, so Task 1 upgrades to Node 24 LTS first.

### Decisions this plan makes where the spec was silent or loose (flagged for review)

1. `countRace`, `applyScenario`, `projectStandings` and `checkScenario` take `tournaments: Tournament[]` (and `rules`) explicitly, because deciding whether a result is mandatory needs the event's category.
2. Byes need to know *who* has a bye. `tournaments.json` gets an optional `byes: string[]` (player ids), filled in once the draw is out. `rules.byeRule` is `"points-of-round-lost"` or `"points-of-previous-round"`. Bye players' dropdowns start at the second round.
3. Result rounds may also be `"ZP"` (zero-pointer, must be 0 points) or a qualifying code matching `/^Q\d*$/` (for example `Q2`). Points are stored as published, not recomputed.
4. Tiebreakers are an ordered list from a fixed set: `mostMandatoryPoints`, `highestSingleResult`, `fewestResults`, `name`. Player id is always the final fallback so ranking is deterministic. If the rulebook needs a criterion not in this set, add it to the engine with TDD before populating data (Task 8 says so).
5. For in-progress events, a player with no `live` entry is shown as a locked "Not in draw".
6. Same-week overlap uses strict date comparison, so an event ending on the day the next one starts is not flagged.
7. Round-capacity checks count exact finishing rounds for picks (1 W, 1 F, 2 SF, 4 QF, …) and also an "at least this round" check that includes alive, unpicked players (≤1 reach W, ≤2 reach F, ≤4 reach SF, …). Only one at-least warning per event is shown, and only when there is no exact-count warning.

## Review Focus

1. **A shared link that is tampered, truncated or stale** (unknown ids, bad round codes, garbage text) must still load, with the bad parts listed in a dismissible notice. It must never crash or blank the page. → Task 6 (decode/reconcile tests), Task 11 (App test with a mixed-garbage URL).
2. **A pick worse than everything a capped player already counts** (for example, a first-round loss when she already has a full set of optional results) must leave her projected total unchanged. It must not add points or subtract them. → Task 3.
3. **Two players with exactly equal totals** must rank the same way no matter what order they appear in `players.json`. → Task 4.
4. **Back-to-back events where one ends on the day the next starts** must not raise a same-week warning. → Task 5.
5. **Data where a live entry has no matching result, or a live entry points at an event that isn't in progress,** must fail validation, so the deploy is blocked. → Task 1.

---

## File Structure

```
package.json, tsconfig.json, vite.config.ts, playwright.config.ts, index.html, .nvmrc, .gitignore
data/
  rules.json, tournaments.json, players.json, meta.json   (Task 8, real data)
  SOURCES.md                                              (Task 8, where each value came from)
scripts/
  validate.ts                 CLI: reads data/*.json, prints errors, exits 1 on failure
src/
  main.tsx                    entry; renders <App season={season} />
  test-setup.ts               jest-dom matchers + RTL cleanup
  test/fixtures.ts            SYNTHETIC season used by all unit/component tests
  data/
    schema.ts                 Zod schemas, types, parseSeason/parseOrThrow, referential checks
    validateSeason.ts         schema + official-total cross-check (used by script)
    season.ts                 imports data/*.json, exports parsed `season` for the app
  engine/
    types.ts                  Scenario type, pickKey/splitPickKey
    lookup.ts                 pointsTable, roundIndex, findTournament
    countRace.ts              isMandatory, countRace
    applyScenario.ts          projectedPoints, applyScenario
    standings.ts              compareEntries, projectStandings
    picks.ts                  pickOptions, pickProblem, describePickProblem
    checkScenario.ts          checkScenario + Warning type
  scenario/
    url.ts                    encodeScenario/decodeScenario
    reconcile.ts              reconcileScenario
    useScenario.ts            React hook: state + URL sync
  ui/
    format.ts                 flagEmoji, formatPoints, formatDelta, formatUpdated
    StandingsTable.tsx
    PickSelect.tsx
    warningText.ts            warnings → messages per pick
    ScenarioEditor.tsx        tabs, ByTournament, ByPlayer, footnotes
    Header.tsx
    App.tsx                   wires everything; ignored-picks notice
    styles.css
e2e/
  share.spec.ts
.github/workflows/ci.yml
README.md
```

Tests sit next to the code they test (`*.test.ts(x)`).

---

### Task 1: Project scaffold and data schema

**Files:**
- Create: `.nvmrc`, `.gitignore`, `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/test-setup.ts`
- Create: `src/data/schema.ts`
- Create: `src/test/fixtures.ts`
- Test: `src/data/schema.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (from `src/data/schema.ts`):
  - Types: `Rules`, `RoundPoints`, `Tournament`, `Player`, `Result`, `LiveStatus`, `Season`, `SeasonInput`
  - `ZERO_POINTER_ROUND = 'ZP'`
  - `parseSeason(raw: unknown): { ok: true; season: Season } | { ok: false; errors: string[] }`
  - `parseOrThrow(raw: unknown): Season`
- Produces (from `src/test/fixtures.ts`): `rawSeason(): SeasonInput` (fresh object every call) and `season: Season`.

- [ ] **Step 1: Upgrade Node**

Run:
```bash
node --version
```
If it prints below `v20.19.0`, install Node 24 LTS (for example `nvm install 24 && nvm use 24`, or `brew install node@24`). Re-run `node --version` and confirm it prints `v24.x`.

- [ ] **Step 2: Create toolchain files**

`.nvmrc`:
```
24
```

`.gitignore`:
```
node_modules
dist
test-results
playwright-report
.DS_Store
```

`package.json`:
```json
{
  "name": "wta-race",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=20.19" },
  "scripts": {
    "dev": "vite",
    "build": "npm run validate && npm run typecheck && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "validate": "tsx scripts/validate.ts"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["src", "scripts", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

`vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
});
```

`src/test-setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Race to the WTA Finals 2026</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx` (placeholder; replaced in Task 11):
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <h1>Race to the WTA Finals 2026</h1>
  </StrictMode>,
);
```

- [ ] **Step 3: Install dependencies**

Run:
```bash
npm install react react-dom zod
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/node vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event tsx
```
Then confirm `node_modules/zod/package.json` has `"version": "4.` or higher (the schema uses the Zod 4 `z.iso.datetime` API).

- [ ] **Step 4: Write the synthetic fixture**

`src/test/fixtures.ts`:
```ts
import { parseOrThrow, type RoundPoints, type SeasonInput } from '../data/schema';

// SYNTHETIC TEST DATA. These rules, points and players are invented so the
// arithmetic in tests is easy to follow. They are NOT real WTA values.

const d32: RoundPoints[] = [
  { round: 'R32', label: 'Round of 32', points: 1 },
  { round: 'R16', label: 'Round of 16', points: 5 },
  { round: 'QF', label: 'Quarterfinal', points: 10 },
  { round: 'SF', label: 'Semifinal', points: 20 },
  { round: 'F', label: 'Final', points: 40 },
  { round: 'W', label: 'Winner', points: 100 },
];

const gs128: RoundPoints[] = [
  { round: 'R128', label: 'Round of 128', points: 10 },
  { round: 'R64', label: 'Round of 64', points: 20 },
  { round: 'R32', label: 'Round of 32', points: 40 },
  { round: 'R16', label: 'Round of 16', points: 80 },
  { round: 'QF', label: 'Quarterfinal', points: 160 },
  { round: 'SF', label: 'Semifinal', points: 320 },
  { round: 'F', label: 'Final', points: 640 },
  { round: 'W', label: 'Winner', points: 1000 },
];

export function rawSeason(): SeasonInput {
  return {
    rules: {
      season: 2026,
      maxCountedResults: 4,
      mandatoryCategories: ['GS'],
      mandatoryEventIds: ['m1000'],
      pointsTables: { d32, gs128 },
      byeRule: 'points-of-previous-round',
      tiebreakers: ['mostMandatoryPoints', 'highestSingleResult', 'name'],
      trackedPlayerCount: 3,
    },
    tournaments: [
      { id: 'slam', name: 'Slam Open', category: 'GS', drawType: 'gs128', startDate: '2026-01-12', endDate: '2026-01-25', status: 'completed', byes: [] },
      { id: 'm1000', name: 'Mandatory 1000', category: 'WTA1000', drawType: 'd32', startDate: '2026-03-02', endDate: '2026-03-08', status: 'completed', byes: [] },
      { id: 'c500', name: 'City 500', category: 'WTA500', drawType: 'd32', startDate: '2026-04-06', endDate: '2026-04-12', status: 'completed', byes: [] },
      { id: 'c250', name: 'Town 250', category: 'WTA250', drawType: 'd32', startDate: '2026-05-04', endDate: '2026-05-10', status: 'completed', byes: [] },
      { id: 'live', name: 'Live Masters', category: 'WTA1000', drawType: 'd32', startDate: '2026-10-05', endDate: '2026-10-12', status: 'in-progress', byes: [] },
      { id: 'next', name: 'Next Open', category: 'WTA500', drawType: 'd32', startDate: '2026-10-12', endDate: '2026-10-18', status: 'upcoming', byes: ['ana'] },
      { id: 'clash', name: 'Clash Cup', category: 'WTA250', drawType: 'd32', startDate: '2026-10-14', endDate: '2026-10-20', status: 'upcoming', byes: [] },
    ],
    players: [
      {
        // Mandatory: slam 1000 + m1000 20. Optional best 2 of (100, 40, 10) = 140. Total 1160.
        id: 'ana', name: 'Ana Alpha', country: 'ES', officialRaceTotal: 1160, qualified: true,
        results: [
          { tournamentId: 'slam', round: 'W', points: 1000 },
          { tournamentId: 'm1000', round: 'SF', points: 20 },
          { tournamentId: 'c500', round: 'W', points: 100 },
          { tournamentId: 'c250', round: 'F', points: 40 },
          { tournamentId: 'live', round: 'QF', points: 10 },
        ],
        live: [{ tournamentId: 'live', state: 'alive', round: 'QF' }],
      },
      {
        // 640 + 100 + 20 + 5 = 765 (exactly 4 results, all count).
        id: 'bea', name: 'Bea Beta', country: 'US', officialRaceTotal: 765, qualified: false,
        results: [
          { tournamentId: 'slam', round: 'F', points: 640 },
          { tournamentId: 'm1000', round: 'W', points: 100 },
          { tournamentId: 'c500', round: 'SF', points: 20 },
          { tournamentId: 'live', round: 'R16', points: 5 },
        ],
        live: [{ tournamentId: 'live', state: 'eliminated', round: 'R16' }],
      },
      {
        // Zero-pointer at the slam. 0 + 40 + 100 = 140. Not in the live draw.
        id: 'cat', name: 'Cat Gamma', country: 'PL', officialRaceTotal: 140, qualified: false,
        results: [
          { tournamentId: 'slam', round: 'ZP', points: 0 },
          { tournamentId: 'm1000', round: 'F', points: 40 },
          { tournamentId: 'c250', round: 'W', points: 100 },
        ],
        live: [],
      },
    ],
    meta: { lastUpdated: '2026-10-07T12:00:00Z' },
  };
}

export const season = parseOrThrow(rawSeason());
```

- [ ] **Step 5: Write the failing schema tests**

`src/data/schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { parseSeason, type SeasonInput } from './schema';
import { rawSeason } from '../test/fixtures';

function errorsFor(mutate: (raw: SeasonInput) => void): string {
  const raw = rawSeason();
  mutate(raw);
  const result = parseSeason(raw);
  return result.ok ? '' : result.errors.join('\n');
}

const player = (raw: SeasonInput, id: string) => raw.players.find((p) => p.id === id)!;

describe('parseSeason', () => {
  it('accepts valid data and fills defaults', () => {
    const raw = rawSeason();
    delete raw.tournaments[0]!.byes;
    const result = parseSeason(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.season.tournaments[0]!.byes).toEqual([]);
  });

  it('rejects a result at an unknown tournament', () => {
    expect(errorsFor((raw) => { player(raw, 'ana').results[0]!.tournamentId = 'nope'; }))
      .toContain('ana: result references unknown tournament "nope"');
  });

  it('rejects a round that does not exist for the draw type', () => {
    expect(errorsFor((raw) => { player(raw, 'ana').results[1]!.round = 'R128'; }))
      .toContain('ana at m1000: round "R128" is not valid for draw type d32');
  });

  it('accepts qualifying rounds', () => {
    expect(errorsFor((raw) => { player(raw, 'cat').results[2]!.round = 'Q2'; })).toBe('');
  });

  it('rejects a zero-pointer with points', () => {
    expect(errorsFor((raw) => { player(raw, 'cat').results[0]!.points = 5; }))
      .toContain('cat at slam: zero-pointer must have 0 points');
  });

  it('rejects two results at the same tournament', () => {
    expect(errorsFor((raw) => { player(raw, 'cat').results.push({ tournamentId: 'c250', round: 'F', points: 40 }); }))
      .toContain('cat: more than one result for c250');
  });

  it('rejects a live entry with no matching result', () => {
    expect(errorsFor((raw) => { player(raw, 'cat').live = [{ tournamentId: 'live', state: 'alive', round: 'R32' }]; }))
      .toContain('cat: live status at live but no result recording points earned there');
  });

  it('rejects a live entry for an event that is not in progress', () => {
    expect(errorsFor((raw) => { player(raw, 'ana').live = [{ tournamentId: 'c500', state: 'alive', round: 'QF' }]; }))
      .toContain('ana: live status for c500, which is not in progress');
  });

  it('rejects a draw type with no points table', () => {
    expect(errorsFor((raw) => { raw.tournaments[2]!.drawType = 'd64'; }))
      .toContain('Tournament c500: drawType "d64" has no points table');
  });

  it('rejects a start date after the end date', () => {
    expect(errorsFor((raw) => { raw.tournaments[2]!.startDate = '2026-04-20'; }))
      .toContain('Tournament c500: startDate is after endDate');
  });

  it('rejects a player count that differs from trackedPlayerCount', () => {
    expect(errorsFor((raw) => { raw.rules.trackedPlayerCount = 25; }))
      .toContain('players.json has 3 players but rules.trackedPlayerCount is 25');
  });

  it('rejects duplicate ids', () => {
    expect(errorsFor((raw) => { raw.players[2]!.id = 'bea'; })).toContain('Duplicate player id "bea"');
  });

  it('reports field-level problems with their path', () => {
    expect(errorsFor((raw) => { raw.meta.lastUpdated = 'yesterday'; })).toContain('meta.lastUpdated');
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npx vitest run src/data/schema.test.ts`
Expected: FAIL. The error is that `./schema` cannot be resolved.

- [ ] **Step 7: Implement the schema**

`src/data/schema.ts`:
```ts
import { z } from 'zod';

export const ZERO_POINTER_ROUND = 'ZP';
const QUALIFYING_ROUND = /^Q\d*$/;

const id = z.string().regex(/^[a-z0-9-]+$/, 'must be lowercase letters, digits and hyphens');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
const roundCode = z.string().regex(/^[A-Z0-9]+$/, 'must be uppercase letters and digits');

const roundPointsSchema = z.object({
  round: roundCode,
  label: z.string().min(1),
  points: z.number().int().nonnegative(),
});

export const rulesSchema = z.object({
  season: z.number().int(),
  maxCountedResults: z.number().int().positive(),
  mandatoryCategories: z.array(z.string()),
  mandatoryEventIds: z.array(id),
  /** Each table is ordered from the first round to the winner. */
  pointsTables: z.record(z.string(), z.array(roundPointsSchema).min(2)),
  byeRule: z.enum(['points-of-round-lost', 'points-of-previous-round']),
  tiebreakers: z.array(z.enum(['mostMandatoryPoints', 'highestSingleResult', 'fewestResults', 'name'])).min(1),
  trackedPlayerCount: z.number().int().positive(),
});

export const tournamentSchema = z.object({
  id,
  name: z.string().min(1),
  category: z.string().min(1),
  drawType: z.string().min(1),
  startDate: isoDate,
  endDate: isoDate,
  status: z.enum(['completed', 'in-progress', 'upcoming']),
  /** Players known to have a first-round bye (fill in once the draw is out). */
  byes: z.array(id).default([]),
});

const resultSchema = z.object({ tournamentId: id, round: roundCode, points: z.number().int().nonnegative() });
const liveSchema = z.object({ tournamentId: id, state: z.enum(['alive', 'eliminated']), round: roundCode });

export const playerSchema = z.object({
  id,
  name: z.string().min(1),
  country: z.string().regex(/^[A-Z]{2}$/, 'must be an ISO 3166-1 alpha-2 code'),
  officialRaceTotal: z.number().int().nonnegative(),
  results: z.array(resultSchema),
  live: z.array(liveSchema).default([]),
  qualified: z.boolean().default(false),
});

export const metaSchema = z.object({ lastUpdated: z.iso.datetime({ offset: true }) });

export const seasonSchema = z
  .object({ rules: rulesSchema, tournaments: z.array(tournamentSchema), players: z.array(playerSchema), meta: metaSchema })
  .superRefine((s, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    const duplicates = (ids: string[], kind: string) => {
      const seen = new Set<string>();
      for (const value of ids) {
        if (seen.has(value)) issue(`Duplicate ${kind} id "${value}"`);
        seen.add(value);
      }
    };

    duplicates(s.tournaments.map((t) => t.id), 'tournament');
    duplicates(s.players.map((p) => p.id), 'player');
    if (s.players.length !== s.rules.trackedPlayerCount) {
      issue(`players.json has ${s.players.length} players but rules.trackedPlayerCount is ${s.rules.trackedPlayerCount}`);
    }

    const tournaments = new Map(s.tournaments.map((t) => [t.id, t]));
    for (const t of s.tournaments) {
      if (!s.rules.pointsTables[t.drawType]) issue(`Tournament ${t.id}: drawType "${t.drawType}" has no points table`);
      if (t.startDate > t.endDate) issue(`Tournament ${t.id}: startDate is after endDate`);
    }
    const roundExists = (drawType: string, round: string) =>
      s.rules.pointsTables[drawType]?.some((r) => r.round === round) ?? true; // missing table reported above

    for (const p of s.players) {
      const seen = new Set<string>();
      for (const r of p.results) {
        const t = tournaments.get(r.tournamentId);
        if (!t) {
          issue(`${p.id}: result references unknown tournament "${r.tournamentId}"`);
          continue;
        }
        if (seen.has(t.id)) issue(`${p.id}: more than one result for ${t.id}`);
        seen.add(t.id);
        if (r.round === ZERO_POINTER_ROUND) {
          if (r.points !== 0) issue(`${p.id} at ${t.id}: zero-pointer must have 0 points`);
        } else if (!QUALIFYING_ROUND.test(r.round) && !roundExists(t.drawType, r.round)) {
          issue(`${p.id} at ${t.id}: round "${r.round}" is not valid for draw type ${t.drawType}`);
        }
      }

      const liveSeen = new Set<string>();
      for (const l of p.live) {
        const t = tournaments.get(l.tournamentId);
        if (!t) {
          issue(`${p.id}: live status references unknown tournament "${l.tournamentId}"`);
          continue;
        }
        if (liveSeen.has(t.id)) issue(`${p.id}: more than one live status for ${t.id}`);
        liveSeen.add(t.id);
        if (t.status !== 'in-progress') issue(`${p.id}: live status for ${t.id}, which is not in progress`);
        if (!roundExists(t.drawType, l.round)) {
          issue(`${p.id} at ${t.id}: live round "${l.round}" is not valid for draw type ${t.drawType}`);
        }
        if (!p.results.some((r) => r.tournamentId === t.id)) {
          issue(`${p.id}: live status at ${t.id} but no result recording points earned there`);
        }
      }
    }
  });

export type Rules = z.infer<typeof rulesSchema>;
export type RoundPoints = z.infer<typeof roundPointsSchema>;
export type Tournament = z.infer<typeof tournamentSchema>;
export type Player = z.infer<typeof playerSchema>;
export type Result = z.infer<typeof resultSchema>;
export type LiveStatus = z.infer<typeof liveSchema>;
export type Season = z.infer<typeof seasonSchema>;
export type SeasonInput = z.input<typeof seasonSchema>;

export type ParseOutcome = { ok: true; season: Season } | { ok: false; errors: string[] };

export function parseSeason(raw: unknown): ParseOutcome {
  const result = seasonSchema.safeParse(raw);
  if (result.success) return { ok: true, season: result.data };
  return {
    ok: false,
    errors: result.error.issues.map((i) => (i.path.length ? `${i.path.map(String).join('.')}: ${i.message}` : i.message)),
  };
}

export function parseOrThrow(raw: unknown): Season {
  const result = parseSeason(raw);
  if (!result.ok) throw new Error(`Invalid season data:\n${result.errors.join('\n')}`);
  return result.season;
}
```

- [ ] **Step 8: Run tests and the typecheck**

Run: `npx vitest run src/data/schema.test.ts && npm run typecheck`
Expected: all 13 tests PASS. Typecheck exits 0.

- [ ] **Step 9: Commit**

```bash
git add .nvmrc .gitignore package.json package-lock.json tsconfig.json vite.config.ts index.html src
git commit -m "feat: scaffold project and add season data schema"
```

---

### Task 2: Race counting (`countRace`)

**Files:**
- Create: `src/engine/lookup.ts`, `src/engine/countRace.ts`
- Test: `src/engine/countRace.test.ts`

**Interfaces:**
- Consumes: `Rules`, `Tournament`, `Result`, `RoundPoints` from `src/data/schema.ts`. Fixture `season`.
- Produces:
  - `lookup.ts`: `pointsTable(rules: Rules, drawType: string): RoundPoints[]` (throws if missing), `roundIndex(table: RoundPoints[], round: string): number` (−1 if absent), `findTournament(tournaments: Tournament[], id: string): Tournament` (throws if missing)
  - `countRace.ts`: `interface CountedRace { total: number; counted: Result[]; dropped: Result[] }`, `isMandatory(tournament: Tournament, rules: Rules): boolean`, `countRace(results: Result[], tournaments: Tournament[], rules: Rules): CountedRace`

- [ ] **Step 1: Write the failing tests**

`src/engine/countRace.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { countRace } from './countRace';
import { season } from '../test/fixtures';
import type { Rules } from '../data/schema';

const { tournaments, rules } = season;
const results = (id: string) => season.players.find((p) => p.id === id)!.results;
const ids = (rs: { tournamentId: string }[]) => rs.map((r) => r.tournamentId).sort();

describe('countRace', () => {
  it('counts mandatory results plus the best optional results up to the cap', () => {
    const race = countRace(results('ana'), tournaments, rules);
    expect(race.total).toBe(1160);
    expect(ids(race.counted)).toEqual(['c250', 'c500', 'm1000', 'slam']);
    expect(ids(race.dropped)).toEqual(['live']);
  });

  it('counts everything when under the cap', () => {
    const race = countRace(results('bea'), tournaments, rules);
    expect(race.total).toBe(765);
    expect(race.dropped).toEqual([]);
  });

  it('counts a zero-pointer as a mandatory result', () => {
    const race = countRace(results('cat'), tournaments, rules);
    expect(race.total).toBe(140);
    expect(ids(race.counted)).toContain('slam');
  });

  it('always counts mandatory results, even when better optional results exist', () => {
    const capTwo: Rules = { ...rules, maxCountedResults: 2 };
    const race = countRace(results('ana'), tournaments, capTwo);
    expect(race.total).toBe(1020);
    expect(ids(race.counted)).toEqual(['m1000', 'slam']);
  });

  it('counts all mandatory results even if they exceed the cap', () => {
    const capOne: Rules = { ...rules, maxCountedResults: 1 };
    expect(countRace(results('ana'), tournaments, capOne).total).toBe(1020);
  });

  it('throws on a result at an unknown tournament', () => {
    expect(() => countRace([{ tournamentId: 'nope', round: 'W', points: 1 }], tournaments, rules))
      .toThrow('Unknown tournament "nope"');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/countRace.test.ts`
Expected: FAIL. The error is that `./countRace` cannot be resolved.

- [ ] **Step 3: Implement**

`src/engine/lookup.ts`:
```ts
import type { RoundPoints, Rules, Tournament } from '../data/schema';

export function pointsTable(rules: Rules, drawType: string): RoundPoints[] {
  const table = rules.pointsTables[drawType];
  if (!table) throw new Error(`No points table for draw type "${drawType}"`);
  return table;
}

export function roundIndex(table: RoundPoints[], round: string): number {
  return table.findIndex((r) => r.round === round);
}

export function findTournament(tournaments: Tournament[], id: string): Tournament {
  const tournament = tournaments.find((t) => t.id === id);
  if (!tournament) throw new Error(`Unknown tournament "${id}"`);
  return tournament;
}
```

`src/engine/countRace.ts`:
```ts
import type { Result, Rules, Tournament } from '../data/schema';
import { findTournament } from './lookup';

export interface CountedRace {
  total: number;
  counted: Result[];
  dropped: Result[];
}

export function isMandatory(tournament: Tournament, rules: Rules): boolean {
  return rules.mandatoryCategories.includes(tournament.category) || rules.mandatoryEventIds.includes(tournament.id);
}

/** Mandatory results always count; remaining slots up to the cap take the best optional results. */
export function countRace(results: Result[], tournaments: Tournament[], rules: Rules): CountedRace {
  const mandatory: Result[] = [];
  const optional: Result[] = [];
  for (const result of results) {
    (isMandatory(findTournament(tournaments, result.tournamentId), rules) ? mandatory : optional).push(result);
  }
  const slots = Math.max(0, rules.maxCountedResults - mandatory.length);
  const best = [...optional].sort((a, b) => b.points - a.points);
  const counted = [...mandatory, ...best.slice(0, slots)];
  return {
    total: counted.reduce((sum, r) => sum + r.points, 0),
    counted,
    dropped: best.slice(slots),
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/countRace.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine
git commit -m "feat(engine): count race totals with mandatory results and cap"
```

---

### Task 3: Applying picks (`applyScenario`)

**Files:**
- Create: `src/engine/types.ts`, `src/engine/applyScenario.ts`
- Test: `src/engine/applyScenario.test.ts`

**Interfaces:**
- Consumes: `pointsTable`, `roundIndex` (Task 2), `countRace` (Task 2), schema types.
- Produces:
  - `types.ts`: `type Scenario = Readonly<Record<string, string>>` (key from `pickKey`, value = round code; no entry = no pick), `pickKey(playerId: string, tournamentId: string): string` (returns `` `${playerId}|${tournamentId}` ``), `splitPickKey(key: string): { playerId: string; tournamentId: string }`
  - `applyScenario.ts`: `projectedPoints(playerId: string, tournament: Tournament, round: string, rules: Rules): number` (throws on an unknown round), `applyScenario(player: Player, scenario: Scenario, tournaments: Tournament[], rules: Rules): Result[]`

- [ ] **Step 1: Write the failing tests**

`src/engine/applyScenario.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { applyScenario, projectedPoints } from './applyScenario';
import { countRace } from './countRace';
import { pickKey, type Scenario } from './types';
import { season } from '../test/fixtures';
import type { Rules } from '../data/schema';

const { tournaments, rules } = season;
const player = (id: string) => season.players.find((p) => p.id === id)!;
const tournament = (id: string) => tournaments.find((t) => t.id === id)!;
const projectedTotal = (id: string, scenario: Scenario, r: Rules = rules) =>
  countRace(applyScenario(player(id), scenario, tournaments, r), tournaments, r).total;

describe('applyScenario', () => {
  it('returns the existing results when there are no picks', () => {
    expect(applyScenario(player('ana'), {}, tournaments, rules)).toEqual(player('ana').results);
  });

  it('adds a result for a pick at an upcoming event', () => {
    const results = applyScenario(player('ana'), { [pickKey('ana', 'clash')]: 'SF' }, tournaments, rules);
    expect(results).toContainEqual({ tournamentId: 'clash', round: 'SF', points: 20 });
    expect(results).toHaveLength(player('ana').results.length + 1);
  });

  it('replaces, not adds to, points already earned at an in-progress event', () => {
    const results = applyScenario(player('ana'), { [pickKey('ana', 'live')]: 'W' }, tournaments, rules);
    expect(results.filter((r) => r.tournamentId === 'live')).toEqual([{ tournamentId: 'live', round: 'W', points: 100 }]);
    // Optional best 2 of (c500 100, c250 40, live 100) = 200; 1000 + 20 + 200.
    expect(projectedTotal('ana', { [pickKey('ana', 'live')]: 'W' })).toBe(1220);
  });

  it('ignores picks for completed events', () => {
    expect(applyScenario(player('ana'), { [pickKey('ana', 'slam')]: 'QF' }, tournaments, rules)).toEqual(player('ana').results);
  });

  it('ignores picks belonging to other players', () => {
    expect(applyScenario(player('ana'), { [pickKey('bea', 'clash')]: 'W' }, tournaments, rules)).toEqual(player('ana').results);
  });

  it('leaves a capped total unchanged when the pick is worse than every counted optional result', () => {
    expect(projectedTotal('ana', { [pickKey('ana', 'clash')]: 'R32' })).toBe(1160);
  });

  it('never lowers a total by adding a pick', () => {
    expect(projectedTotal('bea', { [pickKey('bea', 'clash')]: 'R32' })).toBeGreaterThanOrEqual(765);
  });
});

describe('projectedPoints and byes', () => {
  it('scores a bye player losing her first match per byeRule = points-of-previous-round', () => {
    expect(projectedPoints('ana', tournament('next'), 'R16', rules)).toBe(1);
  });

  it('scores a bye player losing her first match per byeRule = points-of-round-lost', () => {
    expect(projectedPoints('ana', tournament('next'), 'R16', { ...rules, byeRule: 'points-of-round-lost' })).toBe(5);
  });

  it('does not apply the bye rule beyond the first match', () => {
    expect(projectedPoints('ana', tournament('next'), 'QF', rules)).toBe(10);
  });

  it('does not apply the bye rule to players without a bye', () => {
    expect(projectedPoints('bea', tournament('next'), 'R16', rules)).toBe(5);
  });

  it('throws on a round that is not in the table', () => {
    expect(() => projectedPoints('ana', tournament('next'), 'XX', rules)).toThrow('Round "XX" is not valid for next');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/applyScenario.test.ts`
Expected: FAIL. The error is that `./applyScenario` cannot be resolved.

- [ ] **Step 3: Implement**

`src/engine/types.ts`:
```ts
/** Picks keyed by pickKey(playerId, tournamentId). The value is a round code. No entry = no pick. */
export type Scenario = Readonly<Record<string, string>>;

export function pickKey(playerId: string, tournamentId: string): string {
  return `${playerId}|${tournamentId}`;
}

export function splitPickKey(key: string): { playerId: string; tournamentId: string } {
  const [playerId = '', tournamentId = ''] = key.split('|');
  return { playerId, tournamentId };
}
```

`src/engine/applyScenario.ts`:
```ts
import type { Player, Result, Rules, Tournament } from '../data/schema';
import { pointsTable, roundIndex } from './lookup';
import { pickKey, type Scenario } from './types';

export function projectedPoints(playerId: string, tournament: Tournament, round: string, rules: Rules): number {
  const table = pointsTable(rules, tournament.drawType);
  const index = roundIndex(table, round);
  if (index < 0) throw new Error(`Round "${round}" is not valid for ${tournament.id}`);
  const losesFirstMatchAfterBye = index === 1 && tournament.byes.includes(playerId);
  if (losesFirstMatchAfterBye && rules.byeRule === 'points-of-previous-round') return table[0].points;
  return table[index].points;
}

/**
 * Returns the player's results with picks applied. A pick at an event replaces any
 * result already recorded there (in-progress points are replaced, not added to).
 * Never adds zero-pointers. Callers must pass a reconciled scenario.
 */
export function applyScenario(player: Player, scenario: Scenario, tournaments: Tournament[], rules: Rules): Result[] {
  const picked = new Map<string, Result>();
  for (const t of tournaments) {
    if (t.status === 'completed') continue;
    const round = scenario[pickKey(player.id, t.id)];
    if (round === undefined) continue;
    picked.set(t.id, { tournamentId: t.id, round, points: projectedPoints(player.id, t, round, rules) });
  }
  return [...player.results.filter((r) => !picked.has(r.tournamentId)), ...picked.values()];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/applyScenario.test.ts`
Expected: 12 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine
git commit -m "feat(engine): apply picks with in-progress replacement and bye scoring"
```

---

### Task 4: Ranking and projected standings

**Files:**
- Create: `src/engine/standings.ts`
- Test: `src/engine/standings.test.ts`

**Interfaces:**
- Consumes: `countRace`, `isMandatory`, `CountedRace` (Task 2), `applyScenario` (Task 3), `findTournament` (Task 2), `Scenario` (Task 3), `ZERO_POINTER_ROUND` (Task 1).
- Produces:
  - `interface RankEntry { id: string; name: string; race: CountedRace }`
  - `compareEntries(a: RankEntry, b: RankEntry, tournaments: Tournament[], rules: Rules): number` (negative = `a` ranks ahead)
  - `interface StandingRow { playerId: string; name: string; country: string; currentRank: number; currentTotal: number; projectedTotal: number; delta: number; projectedRank: number; rankChange: number; qualified: boolean }` (`rankChange` is positive when a player moves up)
  - `projectStandings(players: Player[], scenario: Scenario, tournaments: Tournament[], rules: Rules): StandingRow[]`, sorted by `projectedRank`

- [ ] **Step 1: Write the failing tests**

`src/engine/standings.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { compareEntries, projectStandings, type RankEntry } from './standings';
import { pickKey } from './types';
import { rawSeason, season } from '../test/fixtures';
import { parseOrThrow, type Result, type Rules } from '../data/schema';

const { tournaments, rules } = season;
const res = (tournamentId: string, points: number, round = 'W'): Result => ({ tournamentId, round, points });
const entry = (id: string, name: string, counted: Result[], dropped: Result[] = []): RankEntry => ({
  id, name, race: { total: counted.reduce((s, r) => s + r.points, 0), counted, dropped },
});
const withTiebreakers = (tiebreakers: Rules['tiebreakers']): Rules => ({ ...rules, tiebreakers });

describe('compareEntries', () => {
  it('ranks a higher total first', () => {
    expect(compareEntries(entry('a', 'A', [res('c500', 200)]), entry('b', 'B', [res('c500', 100)]), tournaments, rules)).toBeLessThan(0);
  });

  it('breaks ties by mostMandatoryPoints', () => {
    const a = entry('a', 'A', [res('slam', 100), res('c500', 100)]);
    const b = entry('b', 'B', [res('c250', 100), res('c500', 100)]);
    expect(compareEntries(b, a, tournaments, withTiebreakers(['mostMandatoryPoints']))).toBeGreaterThan(0);
  });

  it('breaks ties by highestSingleResult', () => {
    const a = entry('a', 'A', [res('c500', 150), res('c250', 50)]);
    const b = entry('b', 'B', [res('c500', 100), res('c250', 100)]);
    expect(compareEntries(b, a, tournaments, withTiebreakers(['highestSingleResult']))).toBeGreaterThan(0);
  });

  it('breaks ties by fewestResults, ignoring zero-pointers', () => {
    const a = entry('a', 'A', [res('c500', 100), res('slam', 0, 'ZP')]);
    const b = entry('b', 'B', [res('c500', 50), res('c250', 50)]);
    expect(compareEntries(b, a, tournaments, withTiebreakers(['fewestResults']))).toBeGreaterThan(0);
  });

  it('breaks ties by name', () => {
    const zed = entry('a', 'Zed', [res('c500', 100)]);
    const amy = entry('b', 'Amy', [res('c500', 100)]);
    expect(compareEntries(zed, amy, tournaments, withTiebreakers(['name']))).toBeGreaterThan(0);
  });

  it('falls back to id when every criterion ties', () => {
    const x = entry('x', 'Same', [res('c500', 100)]);
    const y = entry('y', 'Same', [res('c500', 100)]);
    expect(compareEntries(y, x, tournaments, withTiebreakers(['name']))).toBeGreaterThan(0);
  });
});

describe('projectStandings', () => {
  it('equals the current race when there are no picks', () => {
    const rows = projectStandings(season.players, {}, tournaments, rules);
    expect(rows.map((r) => [r.playerId, r.currentRank, r.projectedRank, r.currentTotal, r.projectedTotal, r.delta, r.rankChange])).toEqual([
      ['ana', 1, 1, 1160, 1160, 0, 0],
      ['bea', 2, 2, 765, 765, 0, 0],
      ['cat', 3, 3, 140, 140, 0, 0],
    ]);
    expect(rows[0]!.qualified).toBe(true);
    expect(rows[0]!.country).toBe('ES');
  });

  it('reorders by projected totals and reports deltas and rank changes', () => {
    const raw = rawSeason();
    raw.tournaments = raw.tournaments.map((t) => (t.id === 'clash' ? { ...t, category: 'GS', drawType: 'gs128' } : t));
    const s = parseOrThrow(raw);
    // cat: mandatory 0 + 40 + 1000, plus best optional (100) = 1140.
    const rows = projectStandings(s.players, { [pickKey('cat', 'clash')]: 'W' }, s.tournaments, s.rules);
    expect(rows.map((r) => r.playerId)).toEqual(['ana', 'cat', 'bea']);
    const cat = rows.find((r) => r.playerId === 'cat')!;
    expect(cat).toMatchObject({ currentRank: 3, projectedRank: 2, rankChange: 1, projectedTotal: 1140, delta: 1000 });
    expect(rows.find((r) => r.playerId === 'bea')!.rankChange).toBe(-1);
  });

  it('ranks exact ties the same way regardless of input order', () => {
    const raw = rawSeason();
    const shared = [res('slam', 640, 'F'), res('m1000', 100), res('c500', 20, 'SF')];
    for (const p of raw.players.filter((p) => p.id !== 'ana')) {
      p.results = shared.map((r) => ({ ...r }));
      p.live = [];
      p.officialRaceTotal = 760;
    }
    const s = parseOrThrow(raw);
    const order = (players: typeof s.players) =>
      projectStandings(players, {}, s.tournaments, s.rules).map((r) => [r.playerId, r.projectedRank]);
    expect(order(s.players)).toEqual([['ana', 1], ['bea', 2], ['cat', 3]]);
    expect(order([...s.players].reverse())).toEqual([['ana', 1], ['bea', 2], ['cat', 3]]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/engine/standings.test.ts`
Expected: FAIL. The error is that `./standings` cannot be resolved.

- [ ] **Step 3: Implement**

`src/engine/standings.ts`:
```ts
import { ZERO_POINTER_ROUND, type Player, type Rules, type Tournament } from '../data/schema';
import { applyScenario } from './applyScenario';
import { countRace, isMandatory, type CountedRace } from './countRace';
import { findTournament } from './lookup';
import type { Scenario } from './types';

export interface RankEntry {
  id: string;
  name: string;
  race: CountedRace;
}

export interface StandingRow {
  playerId: string;
  name: string;
  country: string;
  currentRank: number;
  currentTotal: number;
  projectedTotal: number;
  delta: number;
  projectedRank: number;
  /** Positive = moved up. */
  rankChange: number;
  qualified: boolean;
}

/** Negative when `a` ranks ahead of `b`. Player id is the final fallback so ranking is deterministic. */
export function compareEntries(a: RankEntry, b: RankEntry, tournaments: Tournament[], rules: Rules): number {
  if (a.race.total !== b.race.total) return b.race.total - a.race.total;
  const mandatoryPoints = (e: RankEntry) =>
    e.race.counted
      .filter((r) => isMandatory(findTournament(tournaments, r.tournamentId), rules))
      .reduce((sum, r) => sum + r.points, 0);
  const highest = (e: RankEntry) => Math.max(0, ...e.race.counted.map((r) => r.points));
  const played = (e: RankEntry) => [...e.race.counted, ...e.race.dropped].filter((r) => r.round !== ZERO_POINTER_ROUND).length;

  for (const tiebreaker of rules.tiebreakers) {
    let diff = 0;
    switch (tiebreaker) {
      case 'mostMandatoryPoints': diff = mandatoryPoints(b) - mandatoryPoints(a); break;
      case 'highestSingleResult': diff = highest(b) - highest(a); break;
      case 'fewestResults': diff = played(a) - played(b); break;
      case 'name': diff = a.name.localeCompare(b.name, 'en'); break;
    }
    if (diff !== 0) return diff;
  }
  return a.id.localeCompare(b.id, 'en');
}

function ranks(entries: RankEntry[], tournaments: Tournament[], rules: Rules): Map<string, number> {
  const sorted = [...entries].sort((a, b) => compareEntries(a, b, tournaments, rules));
  return new Map(sorted.map((e, i) => [e.id, i + 1]));
}

export function projectStandings(players: Player[], scenario: Scenario, tournaments: Tournament[], rules: Rules): StandingRow[] {
  const current = players.map((p) => ({ id: p.id, name: p.name, race: countRace(p.results, tournaments, rules) }));
  const projected = players.map((p) => ({
    id: p.id,
    name: p.name,
    race: countRace(applyScenario(p, scenario, tournaments, rules), tournaments, rules),
  }));
  const currentRanks = ranks(current, tournaments, rules);
  const projectedRanks = ranks(projected, tournaments, rules);

  return players
    .map((p, i): StandingRow => {
      const currentRank = currentRanks.get(p.id)!;
      const projectedRank = projectedRanks.get(p.id)!;
      const currentTotal = current[i]!.race.total;
      const projectedTotal = projected[i]!.race.total;
      return {
        playerId: p.id,
        name: p.name,
        country: p.country,
        currentRank,
        currentTotal,
        projectedTotal,
        delta: projectedTotal - currentTotal,
        projectedRank,
        rankChange: currentRank - projectedRank,
        qualified: p.qualified,
      };
    })
    .sort((a, b) => a.projectedRank - b.projectedRank);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/engine/standings.test.ts`
Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engine
git commit -m "feat(engine): rank players with tiebreakers and project standings"
```

---

### Task 5: Pick options and scenario warnings (`checkScenario`)

**Files:**
- Create: `src/engine/picks.ts`, `src/engine/checkScenario.ts`
- Test: `src/engine/picks.test.ts`, `src/engine/checkScenario.test.ts`

**Interfaces:**
- Consumes: `pointsTable`, `roundIndex` (Task 2), `Scenario`, `pickKey`, `splitPickKey` (Task 3), schema types.
- Produces:
  - `picks.ts`:
    - `type PickOptions = { kind: 'locked'; label: string } | { kind: 'open'; allowNone: boolean; currentRound: RoundPoints | null; rounds: RoundPoints[] }`. `rounds` always ends with the winner entry.
    - `pickOptions(player: Player, tournament: Tournament, rules: Rules): PickOptions`
    - `type PickProblem = 'completed' | 'not-in-draw' | 'eliminated' | 'below-current-round' | 'invalid-round'`
    - `pickProblem(player: Player, tournament: Tournament, round: string, rules: Rules): PickProblem | null`
    - `describePickProblem(problem: PickProblem): string`
  - `checkScenario.ts`:
    - `type Warning = { kind: 'round-capacity'; mode: 'exact' | 'at-least'; tournamentId: string; round: string; count: number; limit: number; playerIds: string[] } | { kind: 'same-week'; playerId: string; tournamentIds: [string, string] } | { kind: 'pick-conflict'; playerId: string; tournamentId: string; problem: PickProblem }`
    - `checkScenario(scenario: Scenario, players: Player[], tournaments: Tournament[], rules: Rules): Warning[]`

- [ ] **Step 1: Write the failing pick-option tests**

`src/engine/picks.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { pickOptions, pickProblem } from './picks';
import { season } from '../test/fixtures';

const { rules } = season;
const player = (id: string) => season.players.find((p) => p.id === id)!;
const tournament = (id: string) => season.tournaments.find((t) => t.id === id)!;
const rounds = (o: ReturnType<typeof pickOptions>) => (o.kind === 'open' ? o.rounds.map((r) => r.round) : o.label);

describe('pickOptions', () => {
  it('offers Not playing and every round at an upcoming event', () => {
    const o = pickOptions(player('bea'), tournament('clash'), rules);
    expect(o).toMatchObject({ kind: 'open', allowNone: true, currentRound: null });
    expect(rounds(o)).toEqual(['R32', 'R16', 'QF', 'SF', 'F', 'W']);
  });

  it('skips the first round for a player with a bye', () => {
    expect(rounds(pickOptions(player('ana'), tournament('next'), rules))).toEqual(['R16', 'QF', 'SF', 'F', 'W']);
  });

  it('starts at the current round for an alive player and has no Not playing', () => {
    const o = pickOptions(player('ana'), tournament('live'), rules);
    expect(o).toMatchObject({ kind: 'open', allowNone: false, currentRound: { round: 'QF' } });
    expect(rounds(o)).toEqual(['QF', 'SF', 'F', 'W']);
  });

  it('locks an eliminated player', () => {
    expect(pickOptions(player('bea'), tournament('live'), rules)).toEqual({ kind: 'locked', label: 'Out in Round of 16' });
  });

  it('locks a player not in the draw of an in-progress event', () => {
    expect(pickOptions(player('cat'), tournament('live'), rules)).toEqual({ kind: 'locked', label: 'Not in draw' });
  });
});

describe('pickProblem', () => {
  it.each([
    ['ana', 'live', 'SF', null],
    ['ana', 'next', 'W', null],
    ['ana', 'slam', 'W', 'completed'],
    ['bea', 'live', 'W', 'eliminated'],
    ['cat', 'live', 'W', 'not-in-draw'],
    ['ana', 'live', 'R16', 'below-current-round'],
    ['ana', 'next', 'R32', 'invalid-round'],
    ['ana', 'clash', 'XX', 'invalid-round'],
  ])('%s at %s picking %s → %s', (playerId, tournamentId, round, expected) => {
    expect(pickProblem(player(playerId), tournament(tournamentId), round, rules)).toBe(expected);
  });
});
```

- [ ] **Step 2: Write the failing checkScenario tests**

`src/engine/checkScenario.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { checkScenario } from './checkScenario';
import { pickKey, type Scenario } from './types';
import { rawSeason, season } from '../test/fixtures';
import { parseOrThrow } from '../data/schema';

const check = (scenario: Scenario, s = season) => checkScenario(scenario, s.players, s.tournaments, s.rules);

describe('checkScenario', () => {
  it('returns no warnings for a consistent scenario', () => {
    expect(check({ [pickKey('ana', 'live')]: 'W', [pickKey('bea', 'next')]: 'F' })).toEqual([]);
  });

  it('flags more players picked for a round than it can hold', () => {
    expect(check({ [pickKey('ana', 'next')]: 'W', [pickKey('bea', 'next')]: 'W' })).toEqual([
      { kind: 'round-capacity', mode: 'exact', tournamentId: 'next', round: 'W', count: 2, limit: 1, playerIds: ['ana', 'bea'] },
    ]);
  });

  it('counts alive, unpicked players toward how many can reach a round', () => {
    const raw = rawSeason();
    for (const p of raw.players) {
      const round = p.id === 'cat' ? 'SF' : 'F';
      p.results = [...p.results.filter((r) => r.tournamentId !== 'live'), { tournamentId: 'live', round, points: 0 }];
      p.live = [{ tournamentId: 'live', state: 'alive', round }];
    }
    const s = parseOrThrow({ ...raw, players: raw.players.map((p) => ({ ...p, officialRaceTotal: 0 })) });
    expect(check({ [pickKey('cat', 'live')]: 'W' }, s)).toEqual([
      { kind: 'round-capacity', mode: 'at-least', tournamentId: 'live', round: 'F', count: 3, limit: 2, playerIds: ['ana', 'bea', 'cat'] },
    ]);
  });

  it('flags a player picked for two overlapping events', () => {
    expect(check({ [pickKey('ana', 'next')]: 'SF', [pickKey('ana', 'clash')]: 'R32' })).toEqual([
      { kind: 'same-week', playerId: 'ana', tournamentIds: ['next', 'clash'] },
    ]);
  });

  it('does not flag back-to-back events that share a boundary date', () => {
    // ana is alive at live (ends 2026-10-12); next starts 2026-10-12.
    expect(check({ [pickKey('ana', 'next')]: 'SF' })).toEqual([]);
  });

  it('flags picks that contradict live status', () => {
    const warnings = check({
      [pickKey('bea', 'live')]: 'W',
      [pickKey('ana', 'live')]: 'R16',
      [pickKey('cat', 'live')]: 'W',
    });
    expect(warnings).toContainEqual({ kind: 'pick-conflict', playerId: 'bea', tournamentId: 'live', problem: 'eliminated' });
    expect(warnings).toContainEqual({ kind: 'pick-conflict', playerId: 'ana', tournamentId: 'live', problem: 'below-current-round' });
    expect(warnings).toContainEqual({ kind: 'pick-conflict', playerId: 'cat', tournamentId: 'live', problem: 'not-in-draw' });
  });

  it('ignores picks for unknown players or events', () => {
    expect(check({ [pickKey('zed', 'next')]: 'W', [pickKey('ana', 'nope')]: 'W' })).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/engine/picks.test.ts src/engine/checkScenario.test.ts`
Expected: FAIL. The errors are that `./picks` and `./checkScenario` cannot be resolved.

- [ ] **Step 4: Implement `picks.ts`**

`src/engine/picks.ts`:
```ts
import type { Player, RoundPoints, Rules, Tournament } from '../data/schema';
import { pointsTable, roundIndex } from './lookup';

export type PickOptions =
  | { kind: 'locked'; label: string }
  /** `rounds` always ends with the winner entry. */
  | { kind: 'open'; allowNone: boolean; currentRound: RoundPoints | null; rounds: RoundPoints[] };

export type PickProblem = 'completed' | 'not-in-draw' | 'eliminated' | 'below-current-round' | 'invalid-round';

export function pickOptions(player: Player, tournament: Tournament, rules: Rules): PickOptions {
  if (tournament.status === 'completed') return { kind: 'locked', label: 'Completed' };
  const table = pointsTable(rules, tournament.drawType);
  if (tournament.status === 'upcoming') {
    const first = tournament.byes.includes(player.id) ? 1 : 0;
    return { kind: 'open', allowNone: true, currentRound: null, rounds: table.slice(first) };
  }
  const live = player.live.find((l) => l.tournamentId === tournament.id);
  if (!live) return { kind: 'locked', label: 'Not in draw' };
  const index = roundIndex(table, live.round);
  const current = table[index];
  if (live.state === 'eliminated') return { kind: 'locked', label: `Out in ${current.label}` };
  return { kind: 'open', allowNone: false, currentRound: current, rounds: table.slice(index) };
}

export function pickProblem(player: Player, tournament: Tournament, round: string, rules: Rules): PickProblem | null {
  if (tournament.status === 'completed') return 'completed';
  const options = pickOptions(player, tournament, rules);
  if (options.kind === 'locked') {
    return player.live.some((l) => l.tournamentId === tournament.id) ? 'eliminated' : 'not-in-draw';
  }
  if (options.rounds.some((r) => r.round === round)) return null;
  const inTable = roundIndex(pointsTable(rules, tournament.drawType), round) >= 0;
  return tournament.status === 'in-progress' && inTable ? 'below-current-round' : 'invalid-round';
}

const PROBLEM_TEXT: Record<PickProblem, string> = {
  completed: 'tournament already completed',
  'not-in-draw': 'player is not in the draw',
  eliminated: 'player is already out',
  'below-current-round': 'player has already gone further',
  'invalid-round': 'not a valid round for this tournament',
};

export function describePickProblem(problem: PickProblem): string {
  return PROBLEM_TEXT[problem];
}
```

- [ ] **Step 5: Implement `checkScenario.ts`**

`src/engine/checkScenario.ts`:
```ts
import type { Player, Rules, Tournament } from '../data/schema';
import { pointsTable, roundIndex } from './lookup';
import { pickProblem, type PickProblem } from './picks';
import { pickKey, splitPickKey, type Scenario } from './types';

export type Warning =
  | { kind: 'round-capacity'; mode: 'exact' | 'at-least'; tournamentId: string; round: string; count: number; limit: number; playerIds: string[] }
  | { kind: 'same-week'; playerId: string; tournamentIds: [string, string] }
  | { kind: 'pick-conflict'; playerId: string; tournamentId: string; problem: PickProblem };

export function checkScenario(scenario: Scenario, players: Player[], tournaments: Tournament[], rules: Rules): Warning[] {
  const warnings: Warning[] = [];
  for (const [key, round] of Object.entries(scenario)) {
    const { playerId, tournamentId } = splitPickKey(key);
    const player = players.find((p) => p.id === playerId);
    const tournament = tournaments.find((t) => t.id === tournamentId);
    if (!player || !tournament) continue; // reconcileScenario drops these
    const problem = pickProblem(player, tournament, round, rules);
    if (problem) warnings.push({ kind: 'pick-conflict', playerId, tournamentId, problem });
  }
  const remaining = tournaments.filter((t) => t.status !== 'completed');
  for (const t of remaining) warnings.push(...capacityWarnings(t, scenario, players, rules));
  for (const p of players) warnings.push(...sameWeekWarnings(p, scenario, remaining, rules));
  return warnings;
}

function validPick(scenario: Scenario, player: Player, t: Tournament, rules: Rules): string | undefined {
  const round = scenario[pickKey(player.id, t.id)];
  return round !== undefined && pickProblem(player, t, round, rules) === null ? round : undefined;
}

function aliveRound(player: Player, t: Tournament): string | undefined {
  return player.live.find((l) => l.tournamentId === t.id && l.state === 'alive')?.round;
}

function capacityWarnings(t: Tournament, scenario: Scenario, players: Player[], rules: Rules): Warning[] {
  const table = pointsTable(rules, t.drawType);
  const last = table.length - 1;
  const exact = new Map<number, string[]>();
  const reaching: { playerId: string; index: number }[] = [];

  for (const p of players) {
    const picked = validPick(scenario, p, t, rules);
    if (picked !== undefined) {
      const index = roundIndex(table, picked);
      exact.set(index, [...(exact.get(index) ?? []), p.id]);
      reaching.push({ playerId: p.id, index });
    } else if (scenario[pickKey(p.id, t.id)] === undefined) {
      const alive = aliveRound(p, t);
      if (alive !== undefined) reaching.push({ playerId: p.id, index: roundIndex(table, alive) });
    }
  }

  const warnings: Warning[] = [];
  for (let index = last; index >= 0; index--) {
    const ids = exact.get(index) ?? [];
    const fromTop = last - index;
    const limit = fromTop === 0 ? 1 : 2 ** (fromTop - 1); // 1 W, 1 F, 2 SF, 4 QF, …
    if (ids.length > limit) {
      warnings.push({ kind: 'round-capacity', mode: 'exact', tournamentId: t.id, round: table[index].round, count: ids.length, limit, playerIds: ids });
    }
  }
  if (warnings.length > 0) return warnings;

  for (let index = last; index >= 0; index--) {
    const ids = reaching.filter((r) => r.index >= index).map((r) => r.playerId);
    const limit = 2 ** (last - index); // ≤1 reach W, ≤2 reach F, ≤4 reach SF, …
    if (ids.length > limit) {
      return [{ kind: 'round-capacity', mode: 'at-least', tournamentId: t.id, round: table[index].round, count: ids.length, limit, playerIds: ids }];
    }
  }
  return [];
}

function sameWeekWarnings(player: Player, scenario: Scenario, remaining: Tournament[], rules: Rules): Warning[] {
  const playing = remaining.filter((t) =>
    scenario[pickKey(player.id, t.id)] !== undefined
      ? validPick(scenario, player, t, rules) !== undefined
      : aliveRound(player, t) !== undefined,
  );
  const warnings: Warning[] = [];
  for (let i = 0; i < playing.length; i++) {
    for (let j = i + 1; j < playing.length; j++) {
      const a = playing[i]!;
      const b = playing[j]!;
      if (a.startDate < b.endDate && b.startDate < a.endDate) {
        warnings.push({ kind: 'same-week', playerId: player.id, tournamentIds: [a.id, b.id] });
      }
    }
  }
  return warnings;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/engine`
Expected: all engine tests PASS (picks: 13, checkScenario: 7, plus the earlier files).

- [ ] **Step 7: Commit**

```bash
git add src/engine
git commit -m "feat(engine): pick options and scenario consistency warnings"
```

---

### Task 6: Scenario URL encoding and reconciliation

**Files:**
- Create: `src/scenario/url.ts`, `src/scenario/reconcile.ts`
- Test: `src/scenario/url.test.ts`, `src/scenario/reconcile.test.ts`

**Interfaces:**
- Consumes: `Scenario`, `pickKey`, `splitPickKey` (Task 3), `pickProblem`, `describePickProblem` (Task 5), `Season`.
- Produces:
  - `encodeScenario(scenario: Scenario): string`. The format is `player.tournament.ROUND` entries joined with `_`, sorted. Returns `''` when empty.
  - `decodeScenario(param: string | null): { scenario: Scenario; malformed: string[] }`
  - `interface IgnoredPick { pick: string; reason: string }`
  - `reconcileScenario(scenario: Scenario, season: Season): { scenario: Scenario; ignored: IgnoredPick[] }`

- [ ] **Step 1: Write the failing tests**

`src/scenario/url.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { decodeScenario, encodeScenario } from './url';
import { pickKey } from '../engine/types';

describe('scenario URL codec', () => {
  it('round-trips a scenario', () => {
    const scenario = { [pickKey('bea', 'next')]: 'F', [pickKey('ana', 'live')]: 'W' };
    const encoded = encodeScenario(scenario);
    expect(encoded).toBe('ana.live.W_bea.next.F');
    expect(decodeScenario(encoded)).toEqual({ scenario, malformed: [] });
  });

  it('survives URLSearchParams unchanged', () => {
    const encoded = encodeScenario({ [pickKey('ana-b', 'wuhan-open')]: 'QF' });
    const params = new URLSearchParams({ s: encoded });
    expect(params.toString()).toBe(`s=${encoded}`);
  });

  it('encodes an empty scenario as an empty string', () => {
    expect(encodeScenario({})).toBe('');
    expect(decodeScenario(null)).toEqual({ scenario: {}, malformed: [] });
    expect(decodeScenario('')).toEqual({ scenario: {}, malformed: [] });
  });

  it('keeps good entries and reports malformed ones', () => {
    const result = decodeScenario('ana.live.W_ana.next_ANA.next.W_ana.next.W.extra_<script>__bea.next.F');
    expect(result.scenario).toEqual({ [pickKey('ana', 'live')]: 'W', [pickKey('bea', 'next')]: 'F' });
    expect(result.malformed).toEqual(['ana.next', 'ANA.next.W', 'ana.next.W.extra', '<script>']);
  });
});
```

`src/scenario/reconcile.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { reconcileScenario } from './reconcile';
import { pickKey } from '../engine/types';
import { season } from '../test/fixtures';

describe('reconcileScenario', () => {
  it('keeps valid picks and lists every dropped pick with a reason', () => {
    const result = reconcileScenario(
      {
        [pickKey('ana', 'live')]: 'W',
        [pickKey('zed', 'live')]: 'W',
        [pickKey('ana', 'nope')]: 'W',
        [pickKey('ana', 'slam')]: 'W',
        [pickKey('bea', 'live')]: 'SF',
        [pickKey('ana', 'clash')]: 'XX',
      },
      season,
    );
    expect(result.scenario).toEqual({ [pickKey('ana', 'live')]: 'W' });
    expect(result.ignored).toEqual([
      { pick: 'zed at live: W', reason: 'unknown player' },
      { pick: 'ana at nope: W', reason: 'unknown tournament' },
      { pick: 'Ana Alpha at Slam Open: W', reason: 'tournament already completed' },
      { pick: 'Bea Beta at Live Masters: SF', reason: 'player is already out' },
      { pick: 'Ana Alpha at Clash Cup: XX', reason: 'not a valid round for this tournament' },
    ]);
  });

  it('returns an empty scenario unchanged', () => {
    expect(reconcileScenario({}, season)).toEqual({ scenario: {}, ignored: [] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/scenario`
Expected: FAIL. The errors are that `./url` and `./reconcile` cannot be resolved.

- [ ] **Step 3: Implement**

`src/scenario/url.ts`:
```ts
import { pickKey, splitPickKey, type Scenario } from '../engine/types';

// '.' and '_' are left unescaped by URLSearchParams, so links stay readable.
const ENTRY_SEPARATOR = '_';
const FIELD_SEPARATOR = '.';
const ENTRY = /^([a-z0-9-]+)\.([a-z0-9-]+)\.([A-Z0-9]+)$/;

export function encodeScenario(scenario: Scenario): string {
  return Object.entries(scenario)
    .map(([key, round]) => {
      const { playerId, tournamentId } = splitPickKey(key);
      return [playerId, tournamentId, round].join(FIELD_SEPARATOR);
    })
    .sort()
    .join(ENTRY_SEPARATOR);
}

export function decodeScenario(param: string | null): { scenario: Scenario; malformed: string[] } {
  const scenario: Record<string, string> = {};
  const malformed: string[] = [];
  for (const entry of (param ?? '').split(ENTRY_SEPARATOR)) {
    if (entry === '') continue;
    const match = ENTRY.exec(entry);
    if (!match) {
      malformed.push(entry);
      continue;
    }
    scenario[pickKey(match[1], match[2])] = match[3];
  }
  return { scenario, malformed };
}
```

`src/scenario/reconcile.ts`:
```ts
import type { Season } from '../data/schema';
import { describePickProblem, pickProblem } from '../engine/picks';
import { splitPickKey, type Scenario } from '../engine/types';

export interface IgnoredPick {
  pick: string;
  reason: string;
}

/** Drops picks that reference unknown ids or are impossible under current data. */
export function reconcileScenario(scenario: Scenario, season: Season): { scenario: Scenario; ignored: IgnoredPick[] } {
  const kept: Record<string, string> = {};
  const ignored: IgnoredPick[] = [];
  for (const [key, round] of Object.entries(scenario)) {
    const { playerId, tournamentId } = splitPickKey(key);
    const player = season.players.find((p) => p.id === playerId);
    if (!player) {
      ignored.push({ pick: `${playerId} at ${tournamentId}: ${round}`, reason: 'unknown player' });
      continue;
    }
    const tournament = season.tournaments.find((t) => t.id === tournamentId);
    if (!tournament) {
      ignored.push({ pick: `${playerId} at ${tournamentId}: ${round}`, reason: 'unknown tournament' });
      continue;
    }
    const problem = pickProblem(player, tournament, round, season.rules);
    if (problem) {
      ignored.push({ pick: `${player.name} at ${tournament.name}: ${round}`, reason: describePickProblem(problem) });
      continue;
    }
    kept[key] = round;
  }
  return { scenario: kept, ignored };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/scenario`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/scenario
git commit -m "feat(scenario): URL encoding and reconciliation of stale picks"
```

---

### Task 7: Data validation script

**Files:**
- Create: `src/data/validateSeason.ts`, `scripts/validate.ts`
- Test: `src/data/validateSeason.test.ts`

**Interfaces:**
- Consumes: `parseSeason` (Task 1), `countRace` (Task 2).
- Produces: `validateSeason(raw: unknown): string[]`, which is empty when valid. The `npm run validate` CLI exits 1 on any error.

- [ ] **Step 1: Write the failing tests**

`src/data/validateSeason.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { validateSeason } from './validateSeason';
import { rawSeason } from '../test/fixtures';

describe('validateSeason', () => {
  it('passes when every official total is reproduced', () => {
    expect(validateSeason(rawSeason())).toEqual([]);
  });

  it('reports a player whose official total does not match the engine', () => {
    const raw = rawSeason();
    raw.players[1]!.officialRaceTotal = 770;
    expect(validateSeason(raw)).toEqual(['Bea Beta (bea): engine total 765 ≠ official 770']);
  });

  it('reports schema errors without running the cross-check', () => {
    const raw = rawSeason();
    raw.players[0]!.results[0]!.tournamentId = 'nope';
    raw.players[1]!.officialRaceTotal = 770;
    expect(validateSeason(raw)).toEqual(['ana: result references unknown tournament "nope"']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/data/validateSeason.test.ts`
Expected: FAIL. The error is that `./validateSeason` cannot be resolved.

- [ ] **Step 3: Implement**

`src/data/validateSeason.ts`:
```ts
import { countRace } from '../engine/countRace';
import { parseSeason } from './schema';

/** Schema + referential checks, then confirms the engine reproduces every official race total. */
export function validateSeason(raw: unknown): string[] {
  const parsed = parseSeason(raw);
  if (!parsed.ok) return parsed.errors;
  const { players, tournaments, rules } = parsed.season;
  return players.flatMap((p) => {
    const { total } = countRace(p.results, tournaments, rules);
    return total === p.officialRaceTotal ? [] : [`${p.name} (${p.id}): engine total ${total} ≠ official ${p.officialRaceTotal}`];
  });
}
```

`scripts/validate.ts`:
```ts
import { readFileSync } from 'node:fs';
import { validateSeason } from '../src/data/validateSeason';

const read = (file: string): unknown => JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), 'utf8'));

const errors = validateSeason({
  rules: read('rules.json'),
  tournaments: read('tournaments.json'),
  players: read('players.json'),
  meta: read('meta.json'),
});

if (errors.length > 0) {
  console.error(`Data validation failed (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log('Data OK: schema valid and every official race total reproduced.');
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/data && npm run typecheck`
Expected: PASS. (`npm run validate` itself will fail with ENOENT until Task 8 adds `data/*.json`.)

- [ ] **Step 5: Commit**

```bash
git add src/data scripts
git commit -m "feat(data): validation script cross-checking official race totals"
```

---

### Task 8: Populate real 2026 data

This task is research and data entry. It is not code. Do not fill in any rule value from memory. Every value must come from an official source, recorded in `data/SOURCES.md`.

**Files:**
- Create: `data/rules.json`, `data/tournaments.json`, `data/players.json`, `data/meta.json`, `data/SOURCES.md`
- Create: `src/data/season.ts`

**Interfaces:**
- Consumes: schema (Task 1), `parseOrThrow`, `npm run validate` (Task 7).
- Produces: `src/data/season.ts` exporting `season: Season` (parsed real data), used by `src/main.tsx` in Task 11.

- [ ] **Step 1: Verify the rules against the 2026 WTA Rulebook**

Download the official 2026 WTA Rulebook (wtatennis.com → About → Rules, or the "WTA Official Rulebook 2026" PDF). Find the sections on Rankings / Race to the WTA Finals. Record each of the following in `data/SOURCES.md`, with the rulebook section number and page:
- Maximum number of results counted (`maxCountedResults`).
- Which events always count (`mandatoryCategories`, and any individual `mandatoryEventIds`).
- Points per round for every category and draw size that appears in 2026 results (`pointsTables`, ordered first round → winner). Include qualifying rules only as needed to interpret stored results.
- How a player with a bye who loses her first match is scored (`byeRule`).
- The tiebreak criteria for equal race totals (`tiebreakers`).
- Whether Finals qualification is purely "top 8 by race points".

**Stop and raise it before continuing** if any of these hold:
- The rulebook has a counting rule the engine doesn't model (for example "best N of a category").
- The bye rule isn't one of the two `byeRule` values.
- A tiebreaker isn't in `mostMandatoryPoints | highestSingleResult | fewestResults | name`.
- Qualification isn't purely top-8 by points (for example a Grand Slam champion provision).

Each of these needs an engine change, made with TDD in its own task, before data entry.

- [ ] **Step 2: Write `data/rules.json`**

Shape (values come from Step 1, not from this example):
```json
{
  "season": 2026,
  "maxCountedResults": 0,
  "mandatoryCategories": ["<category key>"],
  "mandatoryEventIds": [],
  "pointsTables": {
    "<draw-type key, e.g. gs-128>": [
      { "round": "R128", "label": "Round of 128", "points": 0 }
    ]
  },
  "byeRule": "points-of-round-lost",
  "tiebreakers": ["<from rulebook>"],
  "trackedPlayerCount": 25
}
```
Rules for this file:
- Use `label` values "Round of 128", "Round of 64", "Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final", "Winner". The UI shows them as "Lost in …" and "Winner".
- Round codes: `R128 R64 R32 R16 QF SF F W` (uppercase letters and digits).
- An event whose points don't follow rounds (for example a team event) gets its own draw type whose rows are whatever codes its results use.

- [ ] **Step 3: Write `data/tournaments.json`**

Include every 2026 event at which any tracked player has a result, plus every remaining event before the WTA Finals. Exclude the WTA Finals itself. Use ids like `wuhan-2026`. Example entry:
```json
{ "id": "wuhan-2026", "name": "Wuhan Open", "category": "WTA1000", "drawType": "wta1000-56", "startDate": "2026-10-05", "endDate": "2026-10-11", "status": "in-progress", "byes": [] }
```
Use main-draw dates from the official WTA calendar. Fill `byes` with tracked player ids once the draw is published.

- [ ] **Step 4: Write `data/players.json`**

Take the top 25 of the official Race to the WTA Finals singles standings on wtatennis.com. For each player, take her per-tournament race breakdown from her WTA profile:
- `officialRaceTotal`: copy exactly as published.
- `results`: one entry per counted or dropped result. Missed mandatory events become `{ "round": "ZP", "points": 0 }`. Qualifying-only results use codes such as `Q2`. Store `points` as published.
- In-progress events: add a `results` entry with the points the official race currently credits. Add a `live` entry `{ tournamentId, state: "alive" | "eliminated", round }`, where `round` is the round she is in (alive) or lost in (eliminated).
- `qualified: true` only once the WTA has officially announced it.
- `country`: ISO 3166-1 alpha-2 code (for example `"BY"`, `"US"`, `"PL"`). For players competing without a flag, use the code the WTA displays, if any. If it shows none, use `"UN"` and note the choice in SOURCES.md.

- [ ] **Step 5: Write `data/meta.json`**

```json
{ "lastUpdated": "2026-10-07T18:00:00Z" }
```
Use the actual UTC time the data was checked.

- [ ] **Step 6: Run validation until it passes**

Run: `npm run validate`
Expected: `Data OK: schema valid and every official race total reproduced.`

A mismatch means a data-entry error or a misread rule. Find which. **Never edit `officialRaceTotal` to make it pass.** If a rule is wrong, fix `rules.json` and update SOURCES.md.

- [ ] **Step 7: Create the app's data module**

`src/data/season.ts`:
```ts
import meta from '../../data/meta.json';
import players from '../../data/players.json';
import rules from '../../data/rules.json';
import tournaments from '../../data/tournaments.json';
import { parseOrThrow } from './schema';

export const season = parseOrThrow({ rules, tournaments, players, meta });
```
Add `"data"` to the `include` array in `tsconfig.json`, then run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 8: Commit**

```bash
git add data src/data/season.ts tsconfig.json
git commit -m "data: 2026 race rules, tournaments and top-25 players"
```

---

### Task 9: Formatting helpers and standings table

**Files:**
- Create: `src/ui/format.ts`, `src/ui/StandingsTable.tsx`
- Test: `src/ui/format.test.ts`, `src/ui/StandingsTable.test.tsx`

**Interfaces:**
- Consumes: `StandingRow` (Task 4).
- Produces:
  - `flagEmoji(country: string): string`, `formatPoints(n: number): string`, `formatDelta(n: number): string`, `formatUpdated(iso: string): string`
  - `QUALIFYING_PLACES = 8`
  - `<StandingsTable rows={StandingRow[]} />`. Rows carry `data-testid="row-<playerId>"`. Cells carry `data-testid` values `current`, `projected` and `delta`.

- [ ] **Step 1: Write the failing tests**

`src/ui/format.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { flagEmoji, formatDelta, formatPoints, formatUpdated } from './format';

describe('format', () => {
  it('builds a flag emoji from an ISO code', () => expect(flagEmoji('PL')).toBe('🇵🇱'));
  it('groups thousands', () => expect(formatPoints(4210)).toBe('4,210'));
  it('signs deltas', () => {
    expect(formatDelta(650)).toBe('+650');
    expect(formatDelta(-1200)).toBe('−1,200');
    expect(formatDelta(0)).toBe('0');
  });
  it('formats the update time in UTC', () => expect(formatUpdated('2026-10-07T14:05:00+02:00')).toBe('2026-10-07 12:05 UTC'));
});
```

`src/ui/StandingsTable.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StandingsTable } from './StandingsTable';
import type { StandingRow } from '../engine/standings';

const row = (rank: number, overrides: Partial<StandingRow> = {}): StandingRow => ({
  playerId: `p${rank}`, name: `Player ${rank}`, country: 'US',
  currentRank: rank, projectedRank: rank, rankChange: 0,
  currentTotal: 5000 - rank * 100, projectedTotal: 5000 - rank * 100, delta: 0, qualified: false,
  ...overrides,
});
const rows = Array.from({ length: 11 }, (_, i) => row(i + 1));

describe('StandingsTable', () => {
  it('draws the cutoff after #8 and shades #9–10 as alternates', () => {
    render(<StandingsTable rows={rows} />);
    expect(screen.getByTestId('row-p8')).toHaveClass('cutoff');
    expect(screen.getByTestId('row-p9')).toHaveClass('alternate');
    expect(screen.getByTestId('row-p10')).toHaveClass('alternate');
    expect(screen.getByTestId('row-p11')).not.toHaveClass('alternate');
    expect(screen.getByTestId('row-p7')).not.toHaveClass('cutoff');
  });

  it('shows points, delta, rank movement and the qualified badge', () => {
    render(<StandingsTable rows={[row(1, { qualified: true, currentRank: 3, rankChange: 2, currentTotal: 4210, projectedTotal: 4860, delta: 650 }), row(2)]} />);
    const first = within(screen.getByTestId('row-p1'));
    expect(first.getByTestId('current')).toHaveTextContent('4,210');
    expect(first.getByTestId('projected')).toHaveTextContent('4,860');
    expect(first.getByText('4,210 → 4,860')).toBeInTheDocument();
    expect(first.getByTestId('delta')).toHaveTextContent('+650');
    expect(first.getByLabelText('Up 2')).toBeInTheDocument();
    expect(first.getByTitle('Officially qualified')).toBeInTheDocument();
    expect(within(screen.getByTestId('row-p2')).queryByTitle('Officially qualified')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui`
Expected: FAIL. The errors are that `./format` and `./StandingsTable` cannot be resolved.

- [ ] **Step 3: Implement**

`src/ui/format.ts`:
```ts
export function flagEmoji(country: string): string {
  return String.fromCodePoint(...[...country.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function formatPoints(n: number): string {
  return n.toLocaleString('en-US');
}

export function formatDelta(n: number): string {
  if (n > 0) return `+${formatPoints(n)}`;
  if (n < 0) return `−${formatPoints(-n)}`;
  return '0';
}

export function formatUpdated(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
```

`src/ui/StandingsTable.tsx`:
```tsx
import type { StandingRow } from '../engine/standings';
import { flagEmoji, formatDelta, formatPoints } from './format';

export const QUALIFYING_PLACES = 8;
const ALTERNATES = 2;

function rowClass(rank: number): string | undefined {
  if (rank === QUALIFYING_PLACES) return 'cutoff';
  if (rank > QUALIFYING_PLACES && rank <= QUALIFYING_PLACES + ALTERNATES) return 'alternate';
  return undefined;
}

function RankChange({ change }: { change: number }) {
  if (change > 0) return <span className="up" aria-label={`Up ${change}`}>▲{change}</span>;
  if (change < 0) return <span className="down" aria-label={`Down ${-change}`}>▼{-change}</span>;
  return <span className="same" aria-label="No change">–</span>;
}

export function StandingsTable({ rows }: { rows: StandingRow[] }) {
  return (
    <table className="standings">
      <caption>Projected race — top {QUALIFYING_PLACES} qualify for the WTA Finals</caption>
      <thead>
        <tr>
          <th scope="col">#</th>
          <th scope="col">Player</th>
          <th scope="col" className="wide">Current</th>
          <th scope="col" className="wide">Projected</th>
          <th scope="col" className="narrow">Points</th>
          <th scope="col">+/−</th>
          <th scope="col"><span className="visually-hidden">Rank change</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.playerId} data-testid={`row-${r.playerId}`} className={rowClass(r.projectedRank)}>
            <td>{r.projectedRank}</td>
            <td className="player">
              <span aria-hidden="true">{flagEmoji(r.country)}</span> {r.name}
              {r.qualified && <span className="badge" title="Officially qualified">Q</span>}
            </td>
            <td className="wide num" data-testid="current">{formatPoints(r.currentTotal)}</td>
            <td className="wide num" data-testid="projected">{formatPoints(r.projectedTotal)}</td>
            <td className="narrow num">{`${formatPoints(r.currentTotal)} → ${formatPoints(r.projectedTotal)}`}</td>
            <td className="num" data-testid="delta">{formatDelta(r.delta)}</td>
            <td><RankChange change={r.rankChange} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui`
Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui
git commit -m "feat(ui): standings table with cutoff, alternates and movement"
```

---

### Task 10: Pick dropdowns and scenario editor

**Files:**
- Create: `src/ui/PickSelect.tsx`, `src/ui/warningText.ts`, `src/ui/ScenarioEditor.tsx`
- Test: `src/ui/PickSelect.test.tsx`, `src/ui/ScenarioEditor.test.tsx`

**Interfaces:**
- Consumes: `pickOptions` (Task 5), `Warning`, `checkScenario` (Task 5), `describePickProblem` (Task 5), `pointsTable` (Task 2), `pickKey`, `Scenario` (Task 3), `Season`, `Player`, `Tournament`, `Rules`.
- Produces:
  - `<PickSelect player tournament rules value={string | undefined} onChange={(round: string | null) => void} messages={string[]} />`. The select's accessible name is `` `${player.name} at ${tournament.name}` ``. Option text is "Not playing" (upcoming) or "Alive in <label> — no pick" (alive), then "Lost in <label>" … "Winner". Locked cells render their label as text.
  - `warningsByPick(warnings: Warning[], season: Season): Map<string, string[]>`, keyed by `pickKey`
  - `<ScenarioEditor season players={Player[]} scenario warnings onPick={(playerId: string, tournamentId: string, round: string | null) => void} />`. It has tabs "By tournament" and "By player" and selects labelled "Tournament" and "Player".

- [ ] **Step 1: Write the failing tests**

`src/ui/PickSelect.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PickSelect } from './PickSelect';
import { rawSeason, season } from '../test/fixtures';
import { parseOrThrow, type Season } from '../data/schema';

function setup(playerId: string, tournamentId: string, s: Season = season, value?: string) {
  const onChange = vi.fn();
  const player = s.players.find((p) => p.id === playerId)!;
  const tournament = s.tournaments.find((t) => t.id === tournamentId)!;
  render(<PickSelect player={player} tournament={tournament} rules={s.rules} value={value} onChange={onChange} messages={['Watch out']} />);
  return { onChange };
}
const optionTexts = () => screen.getAllByRole('option').map((o) => o.textContent);

describe('PickSelect', () => {
  it('offers Not playing plus rounds trimmed to a 32 draw', () => {
    setup('bea', 'clash');
    expect(optionTexts()).toEqual(['Not playing', 'Lost in Round of 32', 'Lost in Round of 16', 'Lost in Quarterfinal', 'Lost in Semifinal', 'Lost in Final', 'Winner']);
  });

  it('offers every round of a 128 draw', () => {
    const raw = rawSeason();
    raw.tournaments = raw.tournaments.map((t) => (t.id === 'clash' ? { ...t, drawType: 'gs128' } : t));
    setup('bea', 'clash', parseOrThrow(raw));
    expect(optionTexts()).toHaveLength(9);
    expect(optionTexts()[1]).toBe('Lost in Round of 128');
  });

  it('starts a bye player at the second round', () => {
    setup('ana', 'next');
    expect(optionTexts()[1]).toBe('Lost in Round of 16');
  });

  it('starts an alive player at her current round', () => {
    setup('ana', 'live');
    expect(optionTexts()).toEqual(['Alive in Quarterfinal — no pick', 'Lost in Quarterfinal', 'Lost in Semifinal', 'Lost in Final', 'Winner']);
  });

  it('locks an eliminated player', () => {
    setup('bea', 'live');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByText('Out in Round of 16')).toBeInTheDocument();
  });

  it('locks a player not in the draw', () => {
    setup('cat', 'live');
    expect(screen.getByText('Not in draw')).toBeInTheDocument();
  });

  it('reports picks and clears', async () => {
    const { onChange } = setup('bea', 'clash', season, 'W');
    const select = screen.getByRole('combobox', { name: 'Bea Beta at Clash Cup' });
    expect(select).toHaveValue('W');
    await userEvent.selectOptions(select, 'SF');
    expect(onChange).toHaveBeenLastCalledWith('SF');
    await userEvent.selectOptions(select, '');
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('shows warning messages next to the dropdown', () => {
    setup('bea', 'clash');
    expect(screen.getByText('Watch out')).toBeInTheDocument();
  });
});
```

`src/ui/ScenarioEditor.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ScenarioEditor } from './ScenarioEditor';
import { checkScenario } from '../engine/checkScenario';
import { pickKey, type Scenario } from '../engine/types';
import { season } from '../test/fixtures';

function setup(scenario: Scenario = {}) {
  const onPick = vi.fn();
  const warnings = checkScenario(scenario, season.players, season.tournaments, season.rules);
  render(<ScenarioEditor season={season} players={season.players} scenario={scenario} warnings={warnings} onPick={onPick} />);
  return { onPick };
}

describe('ScenarioEditor', () => {
  it('lists remaining events by date and marks live ones', () => {
    setup();
    const options = screen.getAllByRole('option').filter((o) => o.closest('select')?.getAttribute('id') === 'tournament-select');
    expect(options.map((o) => o.textContent)).toEqual(['Live Masters — LIVE', 'Next Open', 'Clash Cup']);
  });

  it('by tournament: one dropdown or locked cell per player, and picks reach onPick', async () => {
    const { onPick } = setup();
    expect(screen.getByRole('combobox', { name: 'Ana Alpha at Live Masters' })).toBeInTheDocument();
    expect(screen.getByText('Out in Round of 16')).toBeInTheDocument();
    expect(screen.getByText('Not in draw')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ana Alpha at Live Masters' }), 'W');
    expect(onPick).toHaveBeenCalledWith('ana', 'live', 'W');
  });

  it('by player: one dropdown per remaining event', async () => {
    setup();
    await userEvent.click(screen.getByRole('tab', { name: 'By player' }));
    await userEvent.selectOptions(screen.getByLabelText('Player'), 'bea');
    expect(screen.getByText('Out in Round of 16')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Bea Beta at Next Open' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Bea Beta at Clash Cup' })).toBeInTheDocument();
  });

  it('shows warnings next to the affected dropdowns', async () => {
    setup({ [pickKey('ana', 'next')]: 'W', [pickKey('bea', 'next')]: 'W' });
    await userEvent.selectOptions(screen.getByLabelText('Tournament'), 'next');
    expect(screen.getAllByText('Too many picks at Winner: 2 picked, at most 1 possible.')).toHaveLength(2);
  });

  it('shows the zero-pointer and draw-conflict footnotes', () => {
    setup();
    expect(screen.getByText(/zero-pointer/i)).toBeInTheDocument();
    expect(screen.getByText(/draw/i, { selector: '.footnotes p' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/PickSelect.test.tsx src/ui/ScenarioEditor.test.tsx`
Expected: FAIL. The errors are that the modules cannot be resolved.

- [ ] **Step 3: Implement `PickSelect.tsx`**

```tsx
import type { Player, Rules, Tournament } from '../data/schema';
import { pickOptions } from '../engine/picks';

interface Props {
  player: Player;
  tournament: Tournament;
  rules: Rules;
  value: string | undefined;
  onChange: (round: string | null) => void;
  messages: string[];
}

export function PickSelect({ player, tournament, rules, value, onChange, messages }: Props) {
  const options = pickOptions(player, tournament, rules);
  return (
    <span className="pick">
      {options.kind === 'locked' ? (
        <span className="locked">{options.label}</span>
      ) : (
        <select
          aria-label={`${player.name} at ${tournament.name}`}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
        >
          <option value="">{options.allowNone ? 'Not playing' : `Alive in ${options.currentRound?.label} — no pick`}</option>
          {options.rounds.map((r, i) => (
            <option key={r.round} value={r.round}>
              {i === options.rounds.length - 1 ? r.label : `Lost in ${r.label}`}
            </option>
          ))}
        </select>
      )}
      {messages.map((m) => (
        <span key={m} className="warning">{m}</span>
      ))}
    </span>
  );
}
```

- [ ] **Step 4: Implement `warningText.ts`**

```ts
import type { Season } from '../data/schema';
import type { Warning } from '../engine/checkScenario';
import { pointsTable } from '../engine/lookup';
import { describePickProblem } from '../engine/picks';
import { pickKey } from '../engine/types';

/** Turns warnings into messages keyed by pickKey, so each dropdown can show its own. */
export function warningsByPick(warnings: Warning[], season: Season): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (playerId: string, tournamentId: string, message: string) => {
    const key = pickKey(playerId, tournamentId);
    out.set(key, [...(out.get(key) ?? []), message]);
  };
  const tournament = (id: string) => season.tournaments.find((t) => t.id === id);
  const roundLabel = (tournamentId: string, round: string) => {
    const t = tournament(tournamentId);
    return (t && pointsTable(season.rules, t.drawType).find((r) => r.round === round)?.label) ?? round;
  };

  for (const w of warnings) {
    switch (w.kind) {
      case 'round-capacity': {
        const label = roundLabel(w.tournamentId, w.round);
        const message =
          w.mode === 'exact'
            ? `Too many picks at ${label}: ${w.count} picked, at most ${w.limit} possible.`
            : `${w.count} players are picked or still alive to reach the ${label} or beyond; only ${w.limit} can.`;
        for (const id of w.playerIds) add(id, w.tournamentId, message);
        break;
      }
      case 'same-week': {
        const [a, b] = w.tournamentIds;
        add(w.playerId, a, `Overlaps with ${tournament(b)?.name ?? b}.`);
        add(w.playerId, b, `Overlaps with ${tournament(a)?.name ?? a}.`);
        break;
      }
      case 'pick-conflict':
        add(w.playerId, w.tournamentId, `This pick can't apply: ${describePickProblem(w.problem)}.`);
        break;
    }
  }
  return out;
}
```

- [ ] **Step 5: Implement `ScenarioEditor.tsx`**

```tsx
import { useMemo, useState } from 'react';
import type { Player, Rules, Season, Tournament } from '../data/schema';
import type { Warning } from '../engine/checkScenario';
import { pickKey, type Scenario } from '../engine/types';
import { PickSelect } from './PickSelect';
import { warningsByPick } from './warningText';

type OnPick = (playerId: string, tournamentId: string, round: string | null) => void;

interface Props {
  season: Season;
  /** Tracked players in current-rank order. */
  players: Player[];
  scenario: Scenario;
  warnings: Warning[];
  onPick: OnPick;
}

interface PanelProps {
  tournaments: Tournament[];
  players: Player[];
  rules: Rules;
  scenario: Scenario;
  messages: Map<string, string[]>;
  onPick: OnPick;
}

const eventName = (t: Tournament) => `${t.name}${t.status === 'in-progress' ? ' — LIVE' : ''}`;

function Cell({ player, tournament, rules, scenario, messages, onPick }: Omit<PanelProps, 'tournaments' | 'players'> & { player: Player; tournament: Tournament }) {
  const key = pickKey(player.id, tournament.id);
  return (
    <PickSelect
      player={player}
      tournament={tournament}
      rules={rules}
      value={scenario[key]}
      onChange={(round) => onPick(player.id, tournament.id, round)}
      messages={messages.get(key) ?? []}
    />
  );
}

function ByTournament({ tournaments, players, ...rest }: PanelProps) {
  const [id, setId] = useState(tournaments[0].id);
  const tournament = tournaments.find((t) => t.id === id) ?? tournaments[0];
  return (
    <div role="tabpanel">
      <label className="picker">
        Tournament{' '}
        <select id="tournament-select" value={tournament.id} onChange={(e) => setId(e.target.value)}>
          {tournaments.map((t) => <option key={t.id} value={t.id}>{eventName(t)}</option>)}
        </select>
      </label>
      <ul className="picks">
        {players.map((p) => (
          <li key={p.id}>
            <span className="who">{p.name}</span>
            <Cell player={p} tournament={tournament} {...rest} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ByPlayer({ tournaments, players, ...rest }: PanelProps) {
  const [id, setId] = useState(players[0]?.id ?? '');
  const player = players.find((p) => p.id === id) ?? players[0];
  if (!player) return null;
  return (
    <div role="tabpanel">
      <label className="picker">
        Player{' '}
        <select id="player-select" value={player.id} onChange={(e) => setId(e.target.value)}>
          {players.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <ul className="picks">
        {tournaments.map((t) => (
          <li key={t.id}>
            <span className="who">{eventName(t)}</span>
            <Cell player={player} tournament={t} {...rest} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScenarioEditor({ season, players, scenario, warnings, onPick }: Props) {
  const [tab, setTab] = useState<'tournament' | 'player'>('tournament');
  const remaining = useMemo(
    () => season.tournaments.filter((t) => t.status !== 'completed').sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [season],
  );
  const messages = useMemo(() => warningsByPick(warnings, season), [warnings, season]);

  if (remaining.length === 0) {
    return <section className="editor" aria-label="Scenario editor"><p>No tournaments remain before the Finals.</p></section>;
  }
  const panelProps: PanelProps = { tournaments: remaining, players, rules: season.rules, scenario, messages, onPick };
  return (
    <section className="editor" aria-label="Scenario editor">
      <h2>Your scenario</h2>
      <div role="tablist" className="tabs">
        <button type="button" role="tab" aria-selected={tab === 'tournament'} onClick={() => setTab('tournament')}>By tournament</button>
        <button type="button" role="tab" aria-selected={tab === 'player'} onClick={() => setTab('player')}>By player</button>
      </div>
      {tab === 'tournament' ? <ByTournament {...panelProps} /> : <ByPlayer {...panelProps} />}
      <div className="footnotes">
        <p>Projections never add zero-pointers for skipped mandatory events. Those depend on WTA rulings such as injury exemptions.</p>
        <p>Without draw data we can't tell when two players you've picked would have to meet earlier in the draw.</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/ui && npm run typecheck`
Expected: all UI tests PASS. Typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/ui
git commit -m "feat(ui): pick dropdowns and by-tournament/by-player scenario editor"
```

---

### Task 11: Scenario hook, header and app wiring

**Files:**
- Create: `src/scenario/useScenario.ts`, `src/ui/Header.tsx`, `src/ui/App.tsx`, `src/ui/styles.css`
- Modify: `src/main.tsx` (replace placeholder)
- Test: `src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `decodeScenario`, `encodeScenario` (Task 6), `reconcileScenario`, `IgnoredPick` (Task 6), `projectStandings` (Task 4), `checkScenario` (Task 5), `StandingsTable` (Task 9), `ScenarioEditor` (Task 10), `formatUpdated` (Task 9), `season` (Task 8).
- Produces:
  - `useScenario(season: Season): { scenario: Scenario; setPick(playerId: string, tournamentId: string, round: string | null): void; reset(): void; ignored: IgnoredPick[]; dismissIgnored(): void }`. It reads `?s=` on mount and writes it with `history.replaceState` on every change.
  - `<App season={Season} />`

- [ ] **Step 1: Write the failing tests**

`src/ui/App.test.tsx`:
```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { season } from '../test/fixtures';

const projected = (id: string) => within(screen.getByTestId(`row-${id}`)).getByTestId('projected');
const delta = (id: string) => within(screen.getByTestId(`row-${id}`)).getByTestId('delta');

describe('App', () => {
  beforeEach(() => window.history.replaceState(null, '', '/'));

  it('shows the current race when there are no picks', () => {
    render(<App season={season} />);
    expect(screen.getByText('Data updated 2026-10-07 12:00 UTC')).toBeInTheDocument();
    expect(projected('ana')).toHaveTextContent('1,160');
    expect(delta('ana')).toHaveTextContent('0');
  });

  it('updates the projection and the URL when a pick is made', async () => {
    render(<App season={season} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ana Alpha at Live Masters' }), 'W');
    expect(projected('ana')).toHaveTextContent('1,220');
    expect(delta('ana')).toHaveTextContent('+60');
    expect(window.location.search).toBe('?s=ana.live.W');
  });

  it('restores a scenario from the URL and lists what was ignored', async () => {
    window.history.replaceState(null, '', '/?s=ana.live.W_zed.live.W_bad');
    render(<App season={season} />);
    expect(projected('ana')).toHaveTextContent('1,220');
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('bad — unreadable');
    expect(notice).toHaveTextContent('zed at live: W — unknown player');
    expect(window.location.search).toBe('?s=ana.live.W');
    await userEvent.click(within(notice).getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('Reset clears every pick', async () => {
    window.history.replaceState(null, '', '/?s=ana.live.W');
    render(<App season={season} />);
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(projected('ana')).toHaveTextContent('1,160');
    expect(window.location.search).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/App.test.tsx`
Expected: FAIL. The error is that `./App` cannot be resolved.

- [ ] **Step 3: Implement `useScenario.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';
import type { Season } from '../data/schema';
import { pickKey, type Scenario } from '../engine/types';
import { reconcileScenario, type IgnoredPick } from './reconcile';
import { decodeScenario, encodeScenario } from './url';

const PARAM = 's';

function loadFromUrl(season: Season): { scenario: Scenario; ignored: IgnoredPick[] } {
  const decoded = decodeScenario(new URLSearchParams(window.location.search).get(PARAM));
  const reconciled = reconcileScenario(decoded.scenario, season);
  return {
    scenario: reconciled.scenario,
    ignored: [...decoded.malformed.map((pick) => ({ pick, reason: 'unreadable' })), ...reconciled.ignored],
  };
}

export function useScenario(season: Season) {
  const [initial] = useState(() => loadFromUrl(season));
  const [scenario, setScenario] = useState<Scenario>(initial.scenario);
  const [ignored, setIgnored] = useState<IgnoredPick[]>(initial.ignored);

  useEffect(() => {
    const url = new URL(window.location.href);
    const encoded = encodeScenario(scenario);
    if (encoded) url.searchParams.set(PARAM, encoded);
    else url.searchParams.delete(PARAM);
    window.history.replaceState(null, '', url);
  }, [scenario]);

  const setPick = useCallback((playerId: string, tournamentId: string, round: string | null) => {
    setScenario((prev) => {
      const next = { ...prev };
      const key = pickKey(playerId, tournamentId);
      if (round === null) delete next[key];
      else next[key] = round;
      return next;
    });
  }, []);

  const reset = useCallback(() => setScenario({}), []);
  const dismissIgnored = useCallback(() => setIgnored([]), []);

  return { scenario, setPick, reset, ignored, dismissIgnored };
}
```

- [ ] **Step 4: Implement `Header.tsx`**

```tsx
import { useState } from 'react';
import { formatUpdated } from './format';

interface Props {
  season: number;
  lastUpdated: string;
  onReset: () => void;
}

export function Header({ season, lastUpdated, onReset }: Props) {
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link to share your scenario:', window.location.href);
    }
  }

  return (
    <header className="header">
      <h1>Race to the WTA Finals {season}</h1>
      <p className="updated">Data updated {formatUpdated(lastUpdated)}</p>
      <div className="actions">
        <button type="button" onClick={share}>{copied ? 'Link copied' : 'Share'}</button>
        <button type="button" onClick={onReset}>Reset</button>
      </div>
    </header>
  );
}
```

- [ ] **Step 5: Implement `App.tsx`**

```tsx
import { useMemo } from 'react';
import type { Season } from '../data/schema';
import { checkScenario } from '../engine/checkScenario';
import { projectStandings } from '../engine/standings';
import { useScenario } from '../scenario/useScenario';
import type { IgnoredPick } from '../scenario/reconcile';
import { Header } from './Header';
import { ScenarioEditor } from './ScenarioEditor';
import { StandingsTable } from './StandingsTable';

function IgnoredNotice({ ignored, onDismiss }: { ignored: IgnoredPick[]; onDismiss: () => void }) {
  return (
    <div className="notice" role="status">
      <p>Some picks in this link were ignored:</p>
      <ul>
        {ignored.map((i, n) => <li key={n}>{`${i.pick} — ${i.reason}`}</li>)}
      </ul>
      <button type="button" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}

export function App({ season }: { season: Season }) {
  const { scenario, setPick, reset, ignored, dismissIgnored } = useScenario(season);
  const { players, tournaments, rules } = season;
  const rows = useMemo(() => projectStandings(players, scenario, tournaments, rules), [players, scenario, tournaments, rules]);
  const warnings = useMemo(() => checkScenario(scenario, players, tournaments, rules), [players, scenario, tournaments, rules]);
  const byCurrentRank = useMemo(() => {
    const rank = new Map(rows.map((r) => [r.playerId, r.currentRank]));
    return [...players].sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  }, [rows, players]);

  return (
    <div className="app">
      <Header season={rules.season} lastUpdated={season.meta.lastUpdated} onReset={reset} />
      {ignored.length > 0 && <IgnoredNotice ignored={ignored} onDismiss={dismissIgnored} />}
      <main>
        <StandingsTable rows={rows} />
        <ScenarioEditor season={season} players={byCurrentRank} scenario={scenario} warnings={warnings} onPick={setPick} />
      </main>
    </div>
  );
}
```

- [ ] **Step 6: Write `styles.css` and the real entry point**

`src/ui/styles.css`:
```css
:root {
  --bg: #ffffff;
  --fg: #1a1a1a;
  --muted: #666;
  --accent: #6b2c91;
  --line: #ddd;
  --alt-bg: #f4f0f7;
  --warn: #a14d00;
  --up: #1b7f3b;
  --down: #b3261e;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: var(--fg);
  background: var(--bg);
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #121212; --fg: #eee; --muted: #aaa; --line: #333; --alt-bg: #231a2b; --warn: #f0a050; --up: #5fd38a; --down: #ff8a80; }
}
body { margin: 0; background: var(--bg); }
.app { max-width: 960px; margin: 0 auto; padding: 0 16px 48px; }
.header { padding: 16px 0; }
.header h1 { font-size: 1.4rem; margin: 0 0 4px; }
.updated { color: var(--muted); margin: 0 0 12px; font-size: 0.9rem; }
.actions { display: flex; gap: 8px; }
button { font: inherit; padding: 6px 12px; border: 1px solid var(--line); border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
.notice { border: 1px solid var(--warn); border-radius: 6px; padding: 8px 12px; margin-bottom: 16px; }
.standings { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
.standings caption { text-align: left; color: var(--muted); padding-bottom: 8px; }
.standings th, .standings td { padding: 6px 4px; border-bottom: 1px solid var(--line); text-align: left; }
.standings .num { text-align: right; font-variant-numeric: tabular-nums; }
.standings tr.cutoff td { border-bottom: 3px solid var(--accent); }
.standings tr.alternate { background: var(--alt-bg); }
.badge { margin-left: 6px; font-size: 0.75rem; padding: 1px 5px; border-radius: 4px; background: var(--accent); color: #fff; }
.up { color: var(--up); } .down { color: var(--down); } .same { color: var(--muted); }
.wide { display: none; }
@media (min-width: 600px) {
  .wide { display: table-cell; }
  .narrow { display: none; }
}
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.tabs [aria-selected='true'] { background: var(--accent); color: #fff; border-color: var(--accent); }
.picker { display: block; margin-bottom: 12px; }
.picks { list-style: none; padding: 0; margin: 0; }
.picks li { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; padding: 6px 0; border-bottom: 1px solid var(--line); }
.pick { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.locked { color: var(--muted); }
.warning { color: var(--warn); font-size: 0.85rem; }
.footnotes { color: var(--muted); font-size: 0.85rem; margin-top: 16px; }
select { font: inherit; max-width: 100%; }
```

`src/main.tsx` (replace the whole file):
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { season } from './data/season';
import { App } from './ui/App';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App season={season} />
  </StrictMode>,
);
```

- [ ] **Step 7: Run all tests, the typecheck and the build**

Run: `npm test && npm run build`
Expected: all Vitest tests PASS. The build prints `Data OK…` and then the Vite build summary.

- [ ] **Step 8: Check it in a browser**

Run: `npm run dev`. Open the printed URL at desktop width and at a 375px-wide viewport. Confirm:
- The table shows the real top 25 with the cutoff after #8.
- At narrow width, the points columns merge into "a → b".
- Making a pick updates the table and the URL.

- [ ] **Step 9: Commit**

```bash
git add src
git commit -m "feat(ui): wire app with URL-synced scenario, header and notice"
```

---

### Task 12: End-to-end share flow (Playwright)

**Files:**
- Create: `playwright.config.ts`, `e2e/share.spec.ts`

**Interfaces:**
- Consumes: the running app (Task 11), test ids `row-<id>` / `projected`, the "Scenario editor" region, the "Player" select, `.picks select`, and the "Share" button.
- Produces: `npm run test:e2e`.

- [ ] **Step 1: Install Playwright**

Run:
```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: Write the config and the test**

`playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:5173' },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
```

`e2e/share.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('picks update standings and survive a shared link', async ({ page, context }) => {
  await page.goto('/');
  const editor = page.getByRole('region', { name: 'Scenario editor' });
  await editor.getByRole('tab', { name: 'By player' }).click();

  // Choose the lowest-ranked player who still has an editable event.
  const playerSelect = editor.getByLabel('Player', { exact: true });
  const ids = await playerSelect.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));
  let chosen: string | undefined;
  for (const id of ids.reverse()) {
    await playerSelect.selectOption(id);
    if ((await editor.locator('.picks select').count()) > 0) {
      chosen = id;
      break;
    }
  }
  expect(chosen, 'some tracked player has an editable remaining event').toBeDefined();

  const projected = page.getByTestId(`row-${chosen}`).getByTestId('projected');
  const before = await projected.textContent();
  await editor.locator('.picks select').first().selectOption({ label: 'Winner' });
  await expect(projected).not.toHaveText(before!);
  await expect(page).toHaveURL(/[?&]s=/);
  const after = await projected.textContent();

  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());

  const shared = await context.newPage();
  await shared.goto(link);
  await expect(shared.getByTestId(`row-${chosen}`).getByTestId('projected')).toHaveText(after!);
  const sharedEditor = shared.getByRole('region', { name: 'Scenario editor' });
  await sharedEditor.getByRole('tab', { name: 'By player' }).click();
  await sharedEditor.getByLabel('Player', { exact: true }).selectOption(chosen!);
  await expect(sharedEditor.locator('.picks select').first()).toHaveValue('W');
});
```

- [ ] **Step 3: Run it**

Run: `npm run test:e2e`
Expected: 1 test PASS.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts e2e package.json package-lock.json
git commit -m "test(e2e): picks, share link and restore"
```

---

### Task 13: CI, deployment and update docs

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: the npm scripts `typecheck`, `test`, `validate`, `build` and `test:e2e`.
- Produces: CI on every push, plus a deploy to Cloudflare Pages from `main` that runs only after every check passes.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml` (check each action's latest major version when writing this and use it):
```yaml
name: CI

on:
  push:
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run validate
      - run: npm run build
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist

  deploy:
    needs: check
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: dist
          path: dist
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy dist --project-name=wta-race --branch=main
```

- [ ] **Step 2: Write the README**

`README.md`:
````markdown
# Race to the WTA Finals 2026 — projector

A static site showing the 2026 Race to the WTA Finals (singles). Fans can project the final top 8 by picking results for the remaining tournaments. Scenarios are shared by URL.

Design: `docs/superpowers/specs/2026-10-07-wta-finals-race-design.md`

## Develop

```bash
nvm use            # Node 24
npm install
npm run dev
npm test           # unit + component tests
npm run test:e2e   # Playwright
```

## Updating the data (about daily during events)

1. Edit `data/*.json`: results, `live` status, `officialRaceTotal`, `qualified`, and `meta.json` → `lastUpdated` (UTC).
   - In-progress event: keep a `results` entry with the points currently credited, and a `live` entry (`alive` + current round, or `eliminated` + round lost).
   - When an event finishes: set its `status` to `completed` and remove the `live` entries for it.
   - When a draw comes out: fill that tournament's `byes` with tracked player ids.
2. `npm run validate`. It must print `Data OK`. Never change an `officialRaceTotal` to make it pass. A mismatch means a data or rules error.
3. Commit and push. CI runs every check and deploys only if they all pass. A failing push leaves the live site unchanged.

Rule values and their sources are recorded in `data/SOURCES.md`.

## Deployment setup (one-time)

1. In Cloudflare, create a Pages project named `wta-race` (Direct Upload).
2. Create an API token with the "Cloudflare Pages: Edit" permission.
3. In the GitHub repo settings → Secrets → Actions, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
````

- [ ] **Step 3: Verify the full local pipeline**

Run: `npm ci && npm run typecheck && npm test && npm run validate && npm run build && npm run test:e2e`
Expected: every command exits 0.

- [ ] **Step 4: Commit**

```bash
git add .github README.md
git commit -m "ci: test, validate and deploy to Cloudflare Pages on main"
```

- [ ] **Step 5: Hand off the external setup**

Tell the user that the README "Deployment setup" steps and pushing to a GitHub remote are theirs to do. Do not push or create cloud resources without explicit approval.

---

## Addendum A (2026-10-07): rulebook corrections

Task 8 checked the 2026 WTA Rulebook (7-27-2026 revision) and found three rules the original engine did not model.

**Counting (VI.A.1, p.95).** Race points come from 18 results:
- 4 Grand Slams;
- 6 combined WTA 1000s;
- 1 WTA-only WTA 1000;
- the best 7 from WTA 1000, 500 and 250 events.

WTA 125 and ITF results never count.

**Tiebreak (VI.B.2.c.i, p.97).** Ties are broken in this order, all using counted results:
1. most points from WTA 1000s;
2. highest single WTA 1000 result;
3. highest single WTA 500 result;
4. highest single WTA 250 result.

**Qualification (VI.B.2.a, p.96).**
- The top 7 qualify.
- The 8th place goes to the highest-ranked Grand Slam champion of the current year who is ranked 8–20 and not already in. If there is none, it goes to the next player.
- Every qualifier needs at least 8 WTA 1000 or 500 events, unless this is waived for a long-term injury.

The spec's success criteria require the real counting rules, so Tasks 8a and 8b below run before Task 8. The changes to Task 8 and Task 9 follow them. This addendum supersedes Decision 4 and the "top 8 / cutoff after #8" constraint above.

### Task 8a: Rulebook counting groups and category tiebreakers

**Files:**
- Modify `src/data/schema.ts`: the rules shape.
- Modify `src/test/fixtures.ts`: the rules, and the m1000 category.
- Modify `src/engine/countRace.ts`: replace `isMandatory` and the counting algorithm.
- Modify `src/engine/standings.ts`: `compareEntries` and `RankEntry`.
- Test `src/engine/countRace.test.ts`: add 2 tests.
- Test `src/engine/standings.test.ts`: replace the `compareEntries` describe block and its helpers.

**Interfaces:**
- Rules lose `mandatoryCategories` and `mandatoryEventIds`, and gain:
  - `requiredGroups: { categories: string[]; count: number }[]`
  - `excludedCategories: string[]`
  - `tiebreakers: Tiebreaker[]`, where `type Tiebreaker = { kind: 'pointsIn'; categories: string[] } | { kind: 'highestIn'; categories: string[] }`. Export `Tiebreaker` from schema.ts.
- `isMandatory` is deleted. `countRace` keeps its signature.
- `RankEntry` becomes `{ id: string; race: CountedRace }`. The `name` field is removed. `compareEntries` keeps its signature.

- [ ] **Step 1: Update the schema rules.**

In `src/data/schema.ts`, add these definitions above `rulesSchema`:
```ts
const categoryList = z.array(z.string().min(1)).min(1);

const tiebreakerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('pointsIn'), categories: categoryList }),
  z.object({ kind: z.literal('highestIn'), categories: categoryList }),
]);
```
In `rulesSchema`, replace the `mandatoryCategories`, `mandatoryEventIds` and `tiebreakers` lines with:
```ts
  /** In order, each group's best `count` results always count (even past the cap). */
  requiredGroups: z.array(z.object({ categories: categoryList, count: z.number().int().positive() })),
  /** Results from these categories never count. */
  excludedCategories: z.array(z.string().min(1)),
  /** Applied in order over counted results; player id is the final fallback. */
  tiebreakers: z.array(tiebreakerSchema).min(1),
```
Then add `export type Tiebreaker = z.infer<typeof tiebreakerSchema>;` next to the other type exports.

- [ ] **Step 2: Update the fixture** in `src/test/fixtures.ts`.

Change the `rules` fields to:
```ts
      maxCountedResults: 4,
      requiredGroups: [
        { categories: ['GS'], count: 1 },
        { categories: ['WTA1000C'], count: 1 },
      ],
      excludedCategories: ['ITF'],
      pointsTables: { d32, gs128 },
      byeRule: 'points-of-previous-round',
      tiebreakers: [
        { kind: 'pointsIn', categories: ['GS', 'WTA1000C'] },
        { kind: 'highestIn', categories: ['GS', 'WTA1000C', 'WTA1000', 'WTA500', 'WTA250'] },
      ],
      trackedPlayerCount: 3,
```
Then make two more edits:
- Change the `m1000` tournament's `category` from `'WTA1000'` to `'WTA1000C'`.
- In ana's comment, change the word "Mandatory" to "Required".

All existing fixture totals stay the same: 1160, 765 and 140.

- [ ] **Step 3: Write the failing tests.**

Add these two tests inside `describe('countRace')` in `src/engine/countRace.test.ts`:
```ts
  it('requires only the best `count` results of a group; the surplus competes for open slots', () => {
    const r: Rules = {
      ...rules,
      maxCountedResults: 3,
      requiredGroups: [{ categories: ['GS'], count: 1 }, { categories: ['WTA500', 'WTA250'], count: 1 }],
    };
    const race = countRace(results('ana'), tournaments, r);
    // Required: slam 1000, c500 100. One open slot: best of c250 40, m1000 20, live 10.
    expect(race.total).toBe(1140);
    expect(ids(race.counted)).toEqual(['c250', 'c500', 'slam']);
    expect(ids(race.dropped)).toEqual(['live', 'm1000']);
  });

  it('never counts excluded categories', () => {
    const race = countRace(results('ana'), tournaments, { ...rules, excludedCategories: ['WTA250'] });
    // Required: slam 1000 + m1000 20. Open: c500 100, live 10. c250 is excluded.
    expect(race.total).toBe(1130);
    expect(ids(race.dropped)).toEqual(['c250']);
  });
```

In `src/engine/standings.test.ts`, replace three things with the code below: the `entry` helper, the `withTiebreakers` helper, and the whole `describe('compareEntries', …)` block.
```ts
const entry = (id: string, counted: Result[]): RankEntry => ({
  id, race: { total: counted.reduce((s, r) => s + r.points, 0), counted, dropped: [] },
});
const withTiebreakers = (tiebreakers: Rules['tiebreakers']): Rules => ({ ...rules, tiebreakers });

describe('compareEntries', () => {
  it('ranks a higher total first', () => {
    expect(compareEntries(entry('a', [res('c500', 200)]), entry('b', [res('c500', 100)]), tournaments, rules)).toBeLessThan(0);
  });

  it('pointsIn sums counted points from the listed categories only', () => {
    // a has more Grand Slam points, b more combined-WTA-1000 points.
    const a = entry('a', [res('slam', 150), res('c500', 50)]);
    const b = entry('b', [res('m1000', 100), res('c500', 100)]);
    expect(compareEntries(a, b, tournaments, withTiebreakers([{ kind: 'pointsIn', categories: ['WTA1000C'] }]))).toBeGreaterThan(0);
  });

  it('highestIn compares the best counted result within the listed categories only', () => {
    // a has the best result overall (slam 150), b the best WTA 500 result.
    const a = entry('a', [res('slam', 150), res('c500', 50)]);
    const b = entry('b', [res('c500', 100), res('c250', 100)]);
    expect(compareEntries(a, b, tournaments, withTiebreakers([{ kind: 'highestIn', categories: ['WTA500'] }]))).toBeGreaterThan(0);
  });

  it('treats no result in the listed categories as 0', () => {
    const a = entry('a', [res('c500', 100)]);
    const b = entry('b', [res('c250', 100)]);
    expect(compareEntries(a, b, tournaments, withTiebreakers([{ kind: 'highestIn', categories: ['WTA250'] }]))).toBeGreaterThan(0);
  });

  it('moves to the next criterion only when the previous one ties', () => {
    const a = entry('a', [res('c500', 120), res('m1000', 40)]);
    const b = entry('b', [res('c500', 120), res('slam', 40)]);
    const r = withTiebreakers([{ kind: 'highestIn', categories: ['WTA500'] }, { kind: 'pointsIn', categories: ['WTA1000C'] }]);
    expect(compareEntries(a, b, tournaments, r)).toBeLessThan(0);
    expect(compareEntries(b, a, tournaments, r)).toBeGreaterThan(0);
  });

  it('falls back to id when every criterion ties', () => {
    const x = entry('x', [res('c500', 100)]);
    const y = entry('y', [res('c500', 100)]);
    expect(compareEntries(y, x, tournaments, rules)).toBeGreaterThan(0);
  });
});
```
Leave `describe('projectStandings')` unchanged, because its expected values still hold under the new rules. In the reorder test, clash becomes a second Grand Slam and the GS group requires only the best one, so cat still totals 1140.

- [ ] **Step 4: Run the tests to verify they fail.**

Run `npx vitest run src/engine` and `npm run typecheck`. Expect type errors and failures from the old `isMandatory` and the enum tiebreakers.

- [ ] **Step 5: Implement `countRace`.**

In `src/engine/countRace.ts`, replace everything after the `CountedRace` interface (the `isMandatory` function and the old `countRace`) with:
```ts
const byPointsDesc = (a: Result, b: Result) => b.points - a.points;

/**
 * Results in excluded categories never count. Each required group, in order, takes its best
 * `count` results; those always count, even past the cap. Remaining slots up to the cap take
 * the best of everything else, including any group's surplus results.
 */
export function countRace(results: Result[], tournaments: Tournament[], rules: Rules): CountedRace {
  const category = (r: Result) => findTournament(tournaments, r.tournamentId).category;
  const excluded = results.filter((r) => rules.excludedCategories.includes(category(r)));
  let open = results.filter((r) => !rules.excludedCategories.includes(category(r))).sort(byPointsDesc);
  const required: Result[] = [];
  for (const group of rules.requiredGroups) {
    const best = open.filter((r) => group.categories.includes(category(r))).slice(0, group.count);
    required.push(...best);
    open = open.filter((r) => !best.includes(r));
  }
  const slots = Math.max(0, rules.maxCountedResults - required.length);
  const counted = [...required, ...open.slice(0, slots)];
  return {
    total: counted.reduce((sum, r) => sum + r.points, 0),
    counted,
    dropped: [...open.slice(slots), ...excluded],
  };
}
```

- [ ] **Step 6: Implement `compareEntries`.**

In `src/engine/standings.ts`:
- Remove `name` from `RankEntry`, and remove `name: p.name` from both entry maps in `projectStandings`.
- Change the imports to:
  - `import type { Player, Rules, Tournament } from '../data/schema';`
  - `import { countRace, type CountedRace } from './countRace';`
- Replace `compareEntries` with:
```ts
/** Negative when `a` ranks ahead of `b`. Player id is the final fallback so ranking is deterministic. */
export function compareEntries(a: RankEntry, b: RankEntry, tournaments: Tournament[], rules: Rules): number {
  if (a.race.total !== b.race.total) return b.race.total - a.race.total;
  const pointsIn = (e: RankEntry, categories: string[]) =>
    e.race.counted
      .filter((r) => categories.includes(findTournament(tournaments, r.tournamentId).category))
      .map((r) => r.points);

  for (const tiebreaker of rules.tiebreakers) {
    const pa = pointsIn(a, tiebreaker.categories);
    const pb = pointsIn(b, tiebreaker.categories);
    const diff =
      tiebreaker.kind === 'pointsIn'
        ? pb.reduce((s, p) => s + p, 0) - pa.reduce((s, p) => s + p, 0)
        : Math.max(0, ...pb) - Math.max(0, ...pa);
    if (diff !== 0) return diff;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
```

- [ ] **Step 7: Run all tests and the typecheck.**

Run `npm run typecheck && npx vitest run`. Everything should pass, with 8 countRace tests and 6 compareEntries tests.

- [ ] **Step 8: Commit.**

Use the commit message `feat(engine): rulebook counting groups and category tiebreakers`.

### Task 8b: Finals qualification rules

**Files:**
- Modify `src/data/schema.ts`: add `rules.qualification` and `player.eventMinimumWaived`.
- Modify `src/test/fixtures.ts`: add the `qualification` rules.
- Create `src/engine/qualification.ts`.
- Modify `src/engine/standings.ts`: `StandingRow` gains `eligible` and `projectedQualifier`.
- Test `src/engine/qualification.test.ts`.

**Interfaces:**
- Rules gain:
  ```ts
  qualification: {
    places: number;
    championPlace: { categories: string[]; fromRank: number; toRank: number } | null;
    minEvents: { count: number; categories: string[] } | null;
  }
  ```
- Player gains `eventMinimumWaived: boolean`, default `false`.
- `qualification.ts` exports:
  - `type QualifierKind = 'direct' | 'champion'`
  - `interface QualifierCandidate { playerId: string; rank: number; eligible: boolean; champion: boolean }`
  - `isEligible(results: Result[], waived: boolean, tournaments: Tournament[], rules: Rules): boolean`
  - `isChampion(results: Result[], tournaments: Tournament[], rules: Rules): boolean`
  - `selectQualifiers(candidates: QualifierCandidate[], rules: Rules): Map<string, QualifierKind>`
- `StandingRow` gains `eligible: boolean` and `projectedQualifier: QualifierKind | null`. Both are computed from projected results and projected ranks.

- [ ] **Step 1: Update the schema.**

In `rulesSchema`, add this after `tiebreakers`:
```ts
  qualification: z.object({
    places: z.number().int().positive(),
    /** The last place goes to the best-ranked eligible winner of an event in `categories` within the rank window, if any. */
    championPlace: z.object({ categories: categoryList, fromRank: z.number().int().positive(), toRank: z.number().int().positive() }).nullable(),
    /** Qualifiers must have played `count` events in `categories` (zero-pointers excluded) unless waived. */
    minEvents: z.object({ count: z.number().int().positive(), categories: categoryList }).nullable(),
  }),
```
In `playerSchema`, add `eventMinimumWaived: z.boolean().default(false),` after `qualified`.

- [ ] **Step 2: Update the fixture.**

Add this to the fixture's `rules`, after `tiebreakers`:
```ts
      qualification: {
        places: 2,
        championPlace: { categories: ['GS'], fromRank: 2, toRank: 3 },
        minEvents: { count: 2, categories: ['WTA1000C', 'WTA1000', 'WTA500'] },
      },
```
Under these rules:
- ana has 3 qualifying events and bea has 3, so both are eligible.
- cat has only m1000, so she is not eligible.
- ana is the only Grand Slam champion.

- [ ] **Step 3: Write the failing tests.**

Create `src/engine/qualification.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { selectQualifiers, type QualifierCandidate } from './qualification';
import { projectStandings } from './standings';
import { pickKey, type Scenario } from './types';
import { rawSeason, season } from '../test/fixtures';
import { parseOrThrow, type Rules, type Season } from '../data/schema';

const c = (playerId: string, rank: number, eligible = true, champion = false): QualifierCandidate => ({ playerId, rank, eligible, champion });
const withQualification = (q: Partial<Rules['qualification']>): Rules => ({
  ...season.rules,
  qualification: { ...season.rules.qualification, ...q },
});
const qualifiers = (m: Map<string, string>) => Object.fromEntries([...m.entries()].sort());

describe('selectQualifiers', () => {
  it('takes the top places in rank order when there is no champion place', () => {
    expect(qualifiers(selectQualifiers([c('c', 3), c('a', 1), c('b', 2)], withQualification({ championPlace: null }))))
      .toEqual({ a: 'direct', b: 'direct' });
  });

  it('skips ineligible players', () => {
    expect(qualifiers(selectQualifiers([c('a', 1, false), c('b', 2), c('c', 3)], withQualification({ championPlace: null }))))
      .toEqual({ b: 'direct', c: 'direct' });
  });

  it('gives the last place to the best-ranked eligible champion inside the window', () => {
    expect(qualifiers(selectQualifiers([c('a', 1), c('b', 2), c('c', 3, true, true)], season.rules)))
      .toEqual({ a: 'direct', c: 'champion' });
  });

  it('ignores champions outside the window', () => {
    expect(qualifiers(selectQualifiers([c('a', 1), c('b', 2), c('c', 4, true, true)], season.rules)))
      .toEqual({ a: 'direct', b: 'direct' });
  });

  it('ignores ineligible champions', () => {
    expect(qualifiers(selectQualifiers([c('a', 1), c('b', 2), c('c', 3, false, true)], season.rules)))
      .toEqual({ a: 'direct', b: 'direct' });
  });

  it('does not reserve a place for a champion who already qualified directly', () => {
    expect(qualifiers(selectQualifiers([c('a', 1, true, true), c('b', 2)], season.rules)))
      .toEqual({ a: 'direct', b: 'direct' });
  });
});

describe('projectStandings qualification', () => {
  const rows = (s: Season, scenario: Scenario = {}) =>
    Object.fromEntries(projectStandings(s.players, scenario, s.tournaments, s.rules).map((r) => [r.playerId, [r.eligible, r.projectedQualifier]]));

  it('marks eligibility and projected qualifiers', () => {
    expect(rows(season)).toEqual({ ana: [true, 'direct'], bea: [true, 'direct'], cat: [false, null] });
  });

  it('counts picked events toward the event minimum', () => {
    expect(rows(season, { [pickKey('cat', 'next')]: 'R32' }).cat).toEqual([true, null]);
  });

  it('does not count zero-pointers as events played', () => {
    const raw = rawSeason();
    raw.players[2]!.results.push({ tournamentId: 'c500', round: 'ZP', points: 0 });
    expect(rows(parseOrThrow(raw)).cat).toEqual([false, null]);
  });

  it('honours an event-minimum waiver', () => {
    const raw = rawSeason();
    raw.players[2]!.eventMinimumWaived = true;
    expect(rows(parseOrThrow(raw)).cat).toEqual([true, null]);
  });

  it('gives the last place to a lower-ranked champion', () => {
    const raw = rawSeason();
    // cat: required slam 500 + m1000 40, open c250 100 + c500 1 = 641, below bea's 765.
    raw.players[2]!.results = [
      { tournamentId: 'slam', round: 'W', points: 500 },
      { tournamentId: 'm1000', round: 'F', points: 40 },
      { tournamentId: 'c250', round: 'W', points: 100 },
      { tournamentId: 'c500', round: 'R32', points: 1 },
    ];
    expect(rows(parseOrThrow(raw))).toEqual({ ana: [true, 'direct'], bea: [true, null], cat: [true, 'champion'] });
  });

  it('passes over an ineligible player ranked inside the places', () => {
    const raw = rawSeason();
    raw.tournaments = raw.tournaments.map((t) => (t.id === 'clash' ? { ...t, category: 'GS', drawType: 'gs128' } : t));
    // cat wins clash: 1140, rank 2, but has played only 1 counting event.
    expect(rows(parseOrThrow(raw), { [pickKey('cat', 'clash')]: 'W' })).toEqual({ ana: [true, 'direct'], bea: [true, 'direct'], cat: [false, null] });
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail.**

Run `npx vitest run src/engine/qualification.test.ts`. It should fail because `./qualification` cannot be resolved.

- [ ] **Step 5: Implement `src/engine/qualification.ts`.**
```ts
import { ZERO_POINTER_ROUND, type Result, type Rules, type Tournament } from '../data/schema';
import { findTournament, pointsTable } from './lookup';

export type QualifierKind = 'direct' | 'champion';

export interface QualifierCandidate {
  playerId: string;
  rank: number;
  eligible: boolean;
  champion: boolean;
}

export function isEligible(results: Result[], waived: boolean, tournaments: Tournament[], rules: Rules): boolean {
  const min = rules.qualification.minEvents;
  if (!min || waived) return true;
  const played = results.filter(
    (r) => r.round !== ZERO_POINTER_ROUND && min.categories.includes(findTournament(tournaments, r.tournamentId).category),
  ).length;
  return played >= min.count;
}

/** True when the player won (reached the last round of the points table) an event in the champion categories. */
export function isChampion(results: Result[], tournaments: Tournament[], rules: Rules): boolean {
  const place = rules.qualification.championPlace;
  if (!place) return false;
  return results.some((r) => {
    const t = findTournament(tournaments, r.tournamentId);
    if (!place.categories.includes(t.category)) return false;
    const table = pointsTable(rules, t.drawType);
    return table[table.length - 1].round === r.round;
  });
}

export function selectQualifiers(candidates: QualifierCandidate[], rules: Rules): Map<string, QualifierKind> {
  const { places, championPlace } = rules.qualification;
  const eligible = [...candidates].sort((a, b) => a.rank - b.rank).filter((c) => c.eligible);
  const directPlaces = championPlace ? places - 1 : places;
  const result = new Map<string, QualifierKind>();
  for (const c of eligible.slice(0, directPlaces)) result.set(c.playerId, 'direct');
  if (championPlace) {
    const rest = eligible.slice(directPlaces);
    const champion = rest.find((c) => c.champion && c.rank >= championPlace.fromRank && c.rank <= championPlace.toRank);
    if (champion) result.set(champion.playerId, 'champion');
    else if (rest[0]) result.set(rest[0].playerId, 'direct');
  }
  return result;
}
```

- [ ] **Step 6: Wire it into `projectStandings`.**

In `src/engine/standings.ts`:
- Import `isChampion`, `isEligible`, `selectQualifiers` and `type QualifierKind` from `./qualification`.
- Add `eligible: boolean;` and `projectedQualifier: QualifierKind | null;` to `StandingRow`.
- In `projectStandings`, compute `const projectedResults = players.map((p) => applyScenario(p, scenario, tournaments, rules));`. Build `projected` from it with `race: countRace(projectedResults[i]!, tournaments, rules)`.
- After `projectedRanks`, add:
  ```ts
    const eligible = players.map((p, i) => isEligible(projectedResults[i]!, p.eventMinimumWaived, tournaments, rules));
    const qualifiers = selectQualifiers(
      players.map((p, i) => ({
        playerId: p.id,
        rank: projectedRanks.get(p.id)!,
        eligible: eligible[i]!,
        champion: isChampion(projectedResults[i]!, tournaments, rules),
      })),
      rules,
    );
  ```
- Add `eligible: eligible[i]!, projectedQualifier: qualifiers.get(p.id) ?? null,` to each row.

- [ ] **Step 7: Run all tests and the typecheck.**

Run `npm run typecheck && npx vitest run`. Everything should pass.

- [ ] **Step 8: Commit.**

Use the commit message `feat(engine): WTA Finals qualification with champion place and event minimum`.

### Changes to Task 8 (data entry)

`data/rules.json` uses the Task 8a/8b shape. Use the following values, verified against the rulebook sections cited above, and record each section and page in SOURCES.md:
- `maxCountedResults: 18`
- `requiredGroups: [{GS, 4}, {WTA1000C, 6}, {WTA1000, 1}]`
- `excludedCategories: ["WTA125", "ITF"]`
- `tiebreakers`, in this order:
  1. `pointsIn [WTA1000C, WTA1000]`
  2. `highestIn [WTA1000C, WTA1000]`
  3. `highestIn [WTA500]`
  4. `highestIn [WTA250]`
- `qualification: { places: 8, championPlace: { categories: ["GS"], fromRank: 8, toRank: 20 }, minEvents: { count: 8, categories: ["WTA1000C", "WTA1000", "WTA500"] } }`
- `byeRule: "points-of-previous-round"`, per VIII.B.3.b.i.

Tournament categories:
- `GS`
- `WTA1000C` for combined WTA 1000s
- `WTA1000` for WTA-only WTA 1000s
- `WTA500`, `WTA250`, `WTA125`, `ITF`

Data-entry rules:
- Store only the zero-pointers that the official race breakdown shows. The WTA applies the conditional commitment rules, not the engine.
- `results` must list every 2026 WTA 1000 and WTA 500 event a player played, whether or not it counted, because the event minimum is computed from them.
- Set `eventMinimumWaived: true` only when the WTA has announced a long-term-injury exemption.
- The Race Year includes late-2025 events from the week before the 2025 Finals.

### Changes to Task 9 (standings table)

Replace `QUALIFYING_PLACES` and `rowClass` with rules driven by the row data:
- Rows where `projectedQualifier !== null` get class `qualifier`.
- The qualifier with the largest `projectedRank` also gets class `cutoff`.
- The first two eligible non-qualifiers by rank get class `alternate`.
- A `champion` row shows a badge titled "Grand Slam champion place".
- An ineligible row shows a small note: "Not eligible (event minimum)".
- The caption reads "Projected race — highlighted players are projected to qualify for the WTA Finals".

The full replacement text for Task 9 is in the controller's Task 9 brief.
