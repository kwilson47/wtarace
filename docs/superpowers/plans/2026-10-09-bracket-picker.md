# Bracket Picker (Tournament Pages Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** on live events, and upcoming events with a draw, visitors pick match winners in the bracket and the earlier-round lists. The picks join the site's shared scenario (`?s=`), and a race impact panel shows the race top 10 under those picks.

**Architecture:**
- A pure module, `src/draws/picks.ts`:
  - maps scenario keys to draw players (tracked by id, untracked as `w<wtaId>`);
  - plays picks out over the actual bracket (`applyPicks`);
  - turns a click into a new scenario (`pickWinner`).
- Reconciliation accepts `w<wtaId>` keys.
- `TournamentPage` uses `useScenario` like the homepage. It renders pickable lines as buttons and adds `RaceImpact`.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-tournament-pages-design.md`, section "Phase 2: the bracket picker".

## Global Constraints

- Run Node via `export PATH=/opt/homebrew/bin:$PATH`. After `npx tsc -b`, delete `tsconfig.tsbuildinfo`.
- Completed events stay read-only. Played matches are never pickable.
- The race engine must be unaffected by `w<wtaId>` keys. `applyScenario` and `checkScenario` already look players up by tracked id and skip unknown ids. Keep it that way.
- The first render must match the prerendered HTML: `useScenario` already reads `?s=` after mount.
- No `<a>` inside a `<button>`. Pickable lines show names as plain text.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Task 1: Scenario keys for untracked players

**Files:**
- Modify: `src/scenario/reconcile.ts`, `src/scenario/reconcile.test.ts`

- [ ] **Step 1: Failing test,** appended to `reconcile.test.ts` (it uses the fixture `season`; `live` is in progress, `slam` completed):

```ts
  it('keeps picks for untracked players (w<WTA id>) at events still open, with a valid round', () => {
    const { scenario, ignored } = reconcileScenario({ 'w317964|live': 'SF', 'w1|slam': 'F', 'w2|live': 'ZZ', 'w3|nowhere': 'F' }, season);
    expect(scenario).toEqual({ 'w317964|live': 'SF' });
    expect(ignored.map((i) => i.reason)).toEqual(['not a pick for an open draw', 'not a pick for an open draw', 'not a pick for an open draw']);
  });
```

Check the import names at the top of `reconcile.test.ts` match (`reconcileScenario`, `season`), and add them if missing. Run it. Expected: FAIL (`unknown player`).

- [ ] **Step 2: Implement.** In `reconcileScenario`, before the player lookup:

```ts
    if (/^w\d+$/.test(playerId)) {
      // An untracked player's pick on a tournament page's bracket: kept for the bracket, ignored by the race.
      const tournament = season.tournaments.find((t) => t.id === tournamentId);
      const table = tournament ? season.rules.pointsTables[tournament.drawType] : undefined;
      if (!tournament || tournament.status === 'completed' || !table?.some((r) => r.round === round)) {
        ignored.push({ pick: `${playerId} at ${tournamentId}: ${round}`, reason: 'not a pick for an open draw' });
        continue;
      }
      kept[key] = round;
      continue;
    }
```

- [ ] **Step 3:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 4:** Commit: `feat(scenario): keep bracket picks for untracked players (w<WTA id>)`.

---

### Task 2: Picks over a bracket

**Files:**
- Create: `src/draws/picks.ts`, `src/draws/picks.test.ts`

**Interfaces:** Produces:
- `drawPickKey(season, wtaId, tournamentId)`;
- `pickedRounds(season, t, draw, scenario): Map<number, number>`;
- `applyPicks(bracket, picks): PickedMatch[][]`;
- `pickWinner(scenario, season, t, match, winner): Scenario`;
- `clearTournamentPicks(scenario, tournamentId): Scenario`;
- `PickedMatch`.

- [ ] **Step 1: Failing tests,** `src/draws/picks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Season } from '../data/schema';
import { season as fixture } from '../test/fixtures';
import { buildBracket } from './bracket';
import type { DrawFile, DrawMatch } from './drawSchema';
import { applyPicks, clearTournamentPicks, drawPickKey, pickedRounds, pickWinner } from './picks';

// The fixture's live event (d32 table: R32 R16 QF SF F W) with a 4-player draw: 1 v 2 decided, 3 v 4 to play, then the final.
const season = (): Season => {
  const s = structuredClone(fixture);
  s.players.find((p) => p.id === 'ana')!.wtaId = 1;
  return s;
};
const player = (wtaId: number) => ({ wtaId, name: `P${wtaId}`, country: null, seed: null, entry: null });
const r1: DrawMatch = { round: 1, a: 1, b: 2, winner: 1, score: '6-1 6-1', outcome: 'played' };
const draw: DrawFile = { drawSize: 4, players: [1, 2, 3, 4].map(player), matches: [r1, { round: 1, a: 3, b: 4, winner: null, score: '', outcome: 'scheduled' }] };
const live = () => season().tournaments.find((t) => t.id === 'live')!;

describe('bracket picks', () => {
  it('keys tracked players by id and everyone else by WTA id', () => {
    expect(drawPickKey(season(), 1, 'live')).toBe('ana|live');
    expect(drawPickKey(season(), 3, 'live')).toBe('w3|live');
  });

  it('reads picks as the bracket round each player finishes in', () => {
    // A 4-player draw uses the table's first rounds: round 1 = R32, round 2 = R16, champion = round 3 (QF code).
    expect([...pickedRounds(season(), live(), draw, { 'w3|live': 'R16', 'ana|live': 'R32' }).entries()]).toEqual([[1, 1], [3, 2]]);
  });

  it('plays picks out: a winner advances, a loser hands the match to her opponent, results stay fixed', () => {
    const bracket = buildBracket(draw)!;
    const none = applyPicks(bracket, new Map());
    expect(none[0]!.map((m) => [m.winner, m.pickable])).toEqual([[1, false], [null, true]]);
    expect(none[1]![0]).toMatchObject({ top: 1, bottom: null, pickable: false });
    const picked = applyPicks(bracket, new Map([[4, 2]]));
    expect(picked[0]![1]).toMatchObject({ winner: 4, picked: true });
    expect(picked[1]![0]).toMatchObject({ top: 1, bottom: 4, pickable: true, winner: null });
    const lost = applyPicks(bracket, new Map([[3, 1]]));
    expect(lost[0]![1]).toMatchObject({ winner: 4, picked: true });
    const both = applyPicks(bracket, new Map([[3, 2], [4, 3]]));
    expect(both[0]![1]).toMatchObject({ winner: null, conflict: true });
  });

  it('turns a click into picks, keeps deeper picks, and clears on a second click', () => {
    const s = season();
    const t = live();
    const match = applyPicks(buildBracket(draw)!, new Map())[0]![1]!;
    const once = pickWinner({}, s, t, match, 3);
    expect(once).toEqual({ 'w3|live': 'R16', 'w4|live': 'R32' });
    const clicked = applyPicks(buildBracket(draw)!, pickedRounds(s, t, draw, once))[0]![1]!;
    expect(pickWinner(once, s, t, clicked, 3)).toEqual({});
    const deeper = pickWinner({ 'w3|live': 'QF' }, s, t, match, 3);
    expect(deeper['w3|live']).toBe('QF');
    expect(clearTournamentPicks({ 'w3|live': 'QF', 'ana|next': 'W' }, 'live')).toEqual({ 'ana|next': 'W' });
  });
});
```

The 4-player draw is deliberate: it keeps the table indexing visible. Round r's code is `table[r-1].round`, and the champion code is `table[rounds].round`. Real draws use their own table, where the champion is `W`.

Run it. Expected: FAIL.

- [ ] **Step 2: `src/draws/picks.ts`:**

```ts
import type { Season, Tournament } from '../data/schema';
import { pointsTable } from '../engine/lookup';
import { pickKey, splitPickKey, type Scenario } from '../engine/types';
import type { Bracket, BracketMatch, Slot } from './bracket';

/** The scenario key for a player in a draw: tracked players by id, everyone else as `w<wtaId>`. */
export function drawPickKey(season: Season, wtaId: number, tournamentId: string): string {
  const tracked = season.players.find((p) => p.wtaId === wtaId);
  return pickKey(tracked ? tracked.id : `w${wtaId}`, tournamentId);
}

/** The bracket round each draw player is picked to finish in: r = out in round r; one past the last round = champion. */
export function pickedRounds(season: Season, t: Tournament, draw: { players: { wtaId: number }[] }, scenario: Scenario): Map<number, number> {
  const table = pointsTable(season.rules, t.drawType);
  const picks = new Map<number, number>();
  for (const p of draw.players) {
    const code = scenario[drawPickKey(season, p.wtaId, t.id)];
    if (code === undefined) continue;
    const index = table.findIndex((r) => r.round === code);
    if (index >= 0) picks.set(p.wtaId, index + 1);
  }
  return picks;
}

export interface PickedMatch extends BracketMatch {
  /** The winner comes from a pick, not a result. */
  picked: boolean;
  /** Both players are picked past this match. */
  conflict: boolean;
  /** Undecided, with both players known: either can be picked. */
  pickable: boolean;
}

const decided = (m: BracketMatch) => m.outcome !== 'pending' && m.outcome !== 'scheduled';

/** The bracket with picks played out. Results stay fixed; an undecided match follows the picks, or stays open. */
export function applyPicks(bracket: Bracket, picks: Map<number, number>): PickedMatch[][] {
  const rounds: PickedMatch[][] = [];
  bracket.rounds.forEach((round, index) => {
    const roundNo = index + 1;
    const previous = rounds[index - 1];
    rounds.push(
      round.map((m, i): PickedMatch => {
        const top: Slot = m.top ?? previous?.[2 * i]?.winner ?? null;
        const bottom: Slot = m.bottom ?? previous?.[2 * i + 1]?.winner ?? null;
        if (m.outcome === 'bye' || decided(m)) return { ...m, top, bottom, picked: false, conflict: false, pickable: false };
        const known = typeof top === 'number' && typeof bottom === 'number';
        const reach = (s: Slot) => (typeof s === 'number' ? picks.get(s) : undefined);
        const a = reach(top);
        const b = reach(bottom);
        const aOn = a !== undefined && a > roundNo;
        const bOn = b !== undefined && b > roundNo;
        let winner: number | null = null;
        if (!(aOn && bOn)) {
          if (aOn) winner = top as number;
          else if (bOn) winner = bottom as number;
          else if (known && a === roundNo) winner = bottom as number;
          else if (known && b === roundNo) winner = top as number;
        }
        return { ...m, top, bottom, winner, picked: winner !== null, conflict: aOn && bOn, pickable: known };
      }),
    );
  });
  return rounds;
}

/**
 * The scenario after clicking `winner` in `match`: she goes through (keeping any deeper pick she has) and
 * her opponent is out here. Clicking a picked winner again clears both picks.
 */
export function pickWinner(scenario: Scenario, season: Season, t: Tournament, match: PickedMatch, winner: number): Scenario {
  const loser = match.top === winner ? match.bottom : match.top;
  if (typeof loser !== 'number') return scenario;
  const table = pointsTable(season.rules, t.drawType);
  const next: Record<string, string> = { ...scenario };
  const winnerKey = drawPickKey(season, winner, t.id);
  const loserKey = drawPickKey(season, loser, t.id);
  if (match.picked && match.winner === winner) {
    delete next[winnerKey];
    delete next[loserKey];
    return next;
  }
  const already = table.findIndex((r) => r.round === next[winnerKey]) + 1;
  next[winnerKey] = table[Math.max(already, match.round + 1) - 1]!.round;
  next[loserKey] = table[match.round - 1]!.round;
  return next;
}

/** Every pick at one tournament removed. */
export function clearTournamentPicks(scenario: Scenario, tournamentId: string): Scenario {
  return Object.fromEntries(Object.entries(scenario).filter(([key]) => splitPickKey(key).tournamentId !== tournamentId));
}
```

- [ ] **Step 3:** Run `npx tsc -b && npx vitest run src/draws`. Expected: PASS.
- [ ] **Step 4:** Commit: `feat(draws): play bracket picks out over the draw`.

---

### Task 3: The race impact panel

**Files:**
- Create: `src/ui/RaceImpact.tsx`, `src/ui/RaceImpact.test.tsx`
- Modify: `src/ui/StandingsTable.tsx` (export `RankChange`)

**Interfaces:** Produces `RaceImpact({ season, scenario }: { season: Season; scenario: Scenario })`.

- [ ] **Step 1: Failing test,** `src/ui/RaceImpact.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { season } from '../test/fixtures';
import { RaceImpact } from './RaceImpact';

describe('RaceImpact', () => {
  it('shows the race as the picks leave it, with each player linked', () => {
    render(<RaceImpact season={season} scenario={{ 'ana|live': 'W' }} />);
    const panel = screen.getByRole('region', { name: 'Race impact' });
    const ana = within(panel).getByRole('row', { name: /Ana Alpha/ });
    expect(ana).toHaveTextContent('1,220');
    expect(ana).toHaveTextContent('+60');
    expect(within(ana).getByRole('link', { name: 'Ana Alpha' })).toHaveAttribute('href', '/players/ana/');
    expect(ana).toHaveClass('qualifier');
  });
});
```

Run it. Expected: FAIL.

- [ ] **Step 2: Implement.** In `StandingsTable.tsx`, change `function RankChange` to `export function RankChange`. Then create `src/ui/RaceImpact.tsx`:

```tsx
import type { Season } from '../data/schema';
import { projectStandings } from '../engine/standings';
import type { Scenario } from '../engine/types';
import { flagEmoji, formatDelta, formatPoints } from './format';
import { RankChange } from './StandingsTable';

const SHOWN = 10;

/** The race top 10 under the visitor's picks, plus any qualifier ranked lower (the Grand Slam champion place). */
export function RaceImpact({ season, scenario }: { season: Season; scenario: Scenario }) {
  const rows = projectStandings(season.players, scenario, season.tournaments, season.rules);
  const shown = rows.filter((r, i) => i < SHOWN || r.projectedQualifier !== null);
  const lastQualifier = [...shown].reverse().find((r) => r.projectedQualifier !== null);
  return (
    <section className="race-impact" aria-label="Race impact">
      <h2>Race impact</h2>
      <table className="impact">
        <tbody>
          {shown.map((r) => (
            <tr key={r.playerId} className={[r.projectedQualifier ? 'qualifier' : '', r === lastQualifier ? 'cutoff' : ''].join(' ').trim() || undefined}>
              <td className="num">{r.projectedRank}</td>
              <td>
                <span aria-hidden="true">{flagEmoji(r.country)} </span>
                <a href={`/players/${r.playerId}/`}>{r.name}</a>
                {r.projectedQualifier === 'champion' && <span className="badge champion" title="Grand Slam champion place">GS</span>}
              </td>
              <td className="num">{formatPoints(r.projectedTotal)}</td>
              <td className="num">{formatDelta(r.delta)}</td>
              <td><RankChange change={r.rankChange} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 3: Styles,** appended to `styles.css`:

```css
.draw-layout { display: flex; flex-wrap: wrap; gap: 16px 24px; align-items: flex-start; }
.draw-layout > .draw-main { flex: 1 1 560px; min-width: 0; }
.draw-layout > .race-impact { flex: 0 1 340px; }
.impact { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.impact td { padding: 4px 4px; border-bottom: 1px solid var(--line); }
.impact td.num { text-align: right; font-variant-numeric: tabular-nums; }
.impact tr.qualifier { background: var(--qualifier-bg); }
.impact tr.cutoff td { border-bottom: 3px solid var(--accent); }
.impact a { color: var(--accent-text); }
.impact-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 10px; font-size: 0.9rem; }
.impact-actions a { color: var(--accent-text); }
.match button.line, .round-list button.pick { display: block; width: 100%; text-align: left; font: inherit; border: 0; border-radius: 4px; padding: 1px 3px; background: transparent; color: inherit; cursor: pointer; }
.round-list button.pick { display: inline; width: auto; }
.match button.line:hover, .round-list button.pick:hover { background: var(--alt-bg); }
.match button.line[aria-pressed='true'], .round-list button.pick[aria-pressed='true'] { font-weight: 600; background: var(--qualifier-bg); }
.match.conflict { border-color: var(--warn); }
.match .pick-note { color: var(--accent-text); font-size: 0.75rem; }
```

- [ ] **Step 4:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(ui): race impact panel`.

---

### Task 4: Picking on the tournament page

**Files:**
- Modify: `src/ui/TournamentPage.tsx`, `src/ui/TournamentPage.test.tsx`, `src/ui/hydration.test.tsx`

- [ ] **Step 1: Failing tests,** appended to `TournamentPage.test.tsx`. Add `userEvent` from `@testing-library/user-event` and `beforeEach` from vitest to the imports.

```tsx
describe('TournamentPage: picking', () => {
  beforeEach(() => window.history.replaceState(null, '', '/tournaments/live/'));

  it('picks a winner in an undecided match, shows the race impact, and clears it on a second click', async () => {
    const s = withIds();
    const full = completedDraw();
    const draw = { ...full, matches: full.matches.filter((m) => m.round <= 2) };
    render(<TournamentPage season={s} tournamentId="live" draw={draw} />);
    expect(screen.getByRole('region', { name: 'Race impact' })).toBeInTheDocument();
    const ana = screen.getAllByRole('button', { name: /Ana Alpha/ })[0]!;
    await userEvent.click(ana);
    expect(ana).toHaveAttribute('aria-pressed', 'true');
    expect(window.location.search).toMatch(/ana\.live\.SF/);
    expect(window.location.search).toMatch(/w\d+\.live\.QF/);
    expect(screen.getByRole('link', { name: 'Full standings with these picks →' }).getAttribute('href')).toMatch(/^\/\?s=.*ana\.live\.SF/);
    await userEvent.click(screen.getAllByRole('button', { name: /Ana Alpha/ })[0]!);
    expect(window.location.search).toBe('');
  });

  it('clears every pick at the event', async () => {
    window.history.replaceState(null, '', '/tournaments/live/?s=ana.live.SF_w105.live.QF_ana.next.W');
    const s = withIds();
    const full = completedDraw();
    render(<TournamentPage season={s} tournamentId="live" draw={{ ...full, matches: full.matches.filter((m) => m.round <= 2) }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Clear picks for this event' }));
    expect(window.location.search).toBe('?s=ana.next.W');
  });

  it('keeps a completed event read-only, without the panel', () => {
    render(<TournamentPage season={withIds()} tournamentId="c500" draw={completedDraw()} />);
    expect(screen.queryByRole('region', { name: 'Race impact' })).toBeNull();
    expect(screen.queryAllByRole('button', { name: /Ana Alpha/ })).toEqual([]);
  });
});
```

In `hydration.test.tsx`, add:

```tsx
  it('a tournament page hydrates cleanly with shared bracket picks in the URL', async () => {
    const errors = await hydrationErrors(<TournamentPage season={season} tournamentId="live" draw={null} />, () => {
      window.history.replaceState(null, '', '/tournaments/live/?s=w5.live.SF');
    });
    expect(errors).toEqual([]);
  });
```

Run these. Expected: FAIL.

The completed-draw fixture plays rounds in order, and the filtered draw keeps rounds 1–2. So the quarterfinal containing ana is undecided, with both players known. `getAllByRole('button', { name: /Ana Alpha/ })[0]` is ana's line in that quarterfinal.

- [ ] **Step 2: Implement in `TournamentPage.tsx`.**
  - Import `useScenario` from `../scenario/useScenario`, `encodeScenario` from `../scenario/url`, `applyPicks`, `clearTournamentPicks`, `pickedRounds`, `pickWinner` and `type PickedMatch` from `../draws/picks`, and `RaceImpact` from `./RaceImpact`.
  - **`Name`** gets an optional `plain` prop: when true, the tracked player's name is plain text, not a link (it sits inside a button).
  - **`MatchBox`** takes `m: PickedMatch` and `onPick?: (wtaId: number) => void`. Each line:

```tsx
  const line = (slot: Slot) => {
    const won = m.winner !== null && slot === m.winner;
    if (onPick && m.pickable && typeof slot === 'number') {
      return (
        <button type="button" className={`line${won ? ' winner' : ''}`} aria-pressed={won} onClick={() => onPick(slot)}>
          <Name wtaId={slot} draw={draw} season={season} plain />
        </button>
      );
    }
    return (
      <div className={`line${won ? ' winner' : ''}`}>
        <Name wtaId={slot} draw={draw} season={season} />
      </div>
    );
  };
```

  The box's class becomes `` `match${m.conflict ? ' conflict' : ''}` ``. After the score lines, add `{m.picked && <div className="pick-note">your pick</div>}` and `{m.conflict && <div className="pick-note">Your picks clash here</div>}`.

  - **`RoundList`** takes `matches: PickedMatch[]` and `onPick?: (m: PickedMatch, wtaId: number) => void`. Each item:
    - **a decided result** (`!m.picked && m.winner !== null`): as now, using `m.top`/`m.bottom` in place of `a`/`b`;
    - **pickable with `onPick`:** `<button className="pick" aria-pressed={m.winner === top} …>{top name}</button> vs <button …>{bottom name}</button>`, plus " (your pick)" when `m.picked`;
    - **otherwise:** `<Name top/> vs <Name bottom/>`, where "—" means unknown.

  The `open` logic is unchanged.

  - **`TournamentPage`:**

```tsx
  const { scenario, load } = useScenario(season);
  const interactive = t.status !== 'completed' && t.drawType !== 'united-cup';
  const applied = bracket ? applyPicks(bracket, interactive && draw ? pickedRounds(season, t, draw, scenario) : new Map()) : null;
  const onPick = interactive ? (m: PickedMatch, wtaId: number) => load(pickWinner(scenario, season, t, m, wtaId)) : undefined;
  const encoded = encodeScenario(scenario);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      window.prompt('Copy this link to share your picks:', window.location.href);
    }
  };
```

  Render the bracket and lists from `applied` (in place of `bracket.rounds` and `draw.matches`), passing `onPick={onPick && ((wtaId) => onPick(m, wtaId))}` to each `MatchBox` and `onPick` to each `RoundList`. Wrap the bracket area and the panel:

```tsx
            <div className="draw-layout">
              <div className="draw-main">{/* bracket + round lists */}</div>
              {interactive && (
                <div className="race-impact">
                  <RaceImpact season={season} scenario={scenario} />
                  <div className="impact-actions">
                    <a href={encoded ? `/?s=${encoded}` : '/'}>Full standings with these picks →</a>
                    <button type="button" onClick={share}>Share these picks</button>
                    <button type="button" onClick={() => load(clearTournamentPicks(scenario, t.id))}>Clear picks for this event</button>
                  </div>
                </div>
              )}
            </div>
```

  `RaceImpact` renders its own `<section aria-label="Race impact">`, so the wrapper is a plain `div` with the layout class.

- [ ] **Step 3:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 4:** Commit: `feat(ui): pick winners on tournament pages, with the race impact`.

---

### Task 5: End-to-end, browser check and docs

**Files:**
- Modify: `e2e/tournament.spec.ts`, `README.md`

- [ ] **Step 1: Append to `e2e/tournament.spec.ts`.** It's data-independent: it finds any open event with a pickable match.

```ts
test('picking a winner moves the race impact and carries over to the standings', async ({ page, request }) => {
  const sitemap = await (await request.get('/sitemap.xml')).text();
  const paths = [...sitemap.matchAll(/finalsrace\.win(\/tournaments\/[a-z0-9-]+\/)/g)].map((m) => m[1]!);
  for (const path of paths) {
    await page.goto(path);
    const pick = page.locator('.match button.line, .round-list button.pick').first();
    if ((await pick.count()) === 0) continue;
    await pick.click();
    await expect(page).toHaveURL(/[?&]s=/);
    await expect(page.getByRole('region', { name: 'Race impact' })).toBeVisible();
    const s = new URL(page.url()).searchParams.get('s')!;
    await page.getByRole('link', { name: 'Full standings with these picks →' }).click();
    await expect(page).toHaveURL(new RegExp(`[?&]s=${s.replace(/\./g, '\\.')}`));
    return;
  }
  test.skip(true, 'No open event has a pickable match right now.');
});
```

- [ ] **Step 2:** Run `npm run build && npm run test:e2e`. Expected: all pass, or this one skipped with its message when no event is open.
- [ ] **Step 3: Browser check** on `npm run preview`:
  - On Beijing (or another open event), at desktop and at phone width in dark mode: pick a semifinal winner, then the final. The panel updates, a second click clears, and the conflict styling shows for a clash created via the homepage (e.g. two players set to F from the same half).
  - The shared link restores the picks.
  - No console errors or hydration warnings.
- [ ] **Step 4: `README.md`.** In the scenario section, note that tournament pages for open events let you pick winners in the bracket. Bracket picks for untracked players are stored as `w<WTA id>` keys in `?s=`, which the race ignores.
- [ ] **Step 5:** Run `npx tsc -b && npx vitest run && npm run build && npm run test:e2e`. Expected: all pass.
- [ ] **Step 6:** Commit: `test(e2e): bracket picking; docs`.

## Review Focus

- **A homepage pick for a tracked player beyond what the bracket allows**, e.g. "Swiatek: Winner" when Swiatek is already out. Reconciliation drops it on load (`below-current-round`), so the bracket never sees it.
- **A bye player's first match is round 2.** Picking her to lose it gives code `table[1]`, which is the second-round loss after a bye, so the engine's bye rule gives the right points.
- **Clicking the winner of an early round where a deeper pick exists** keeps the deeper pick (`Math.max`). Clicking her opponent instead sets her to "out here" and clears her deeper picks.
- **The event finishes, or a pending match gets played, while a link holds picks for it.** Results override picks (decided matches ignore picks), and reconciliation drops tracked picks below the current round.
- **A URL with many `w` keys** (a full 96-draw bracket): fine with the existing format, at roughly 25 characters a pick.
