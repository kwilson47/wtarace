# Player Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- A read-only page for every tracked player at `/players/<id>/`, prerendered to static HTML at build time (with her chances computed then).
- The homepage prerendered too.
- A "Player Profile" link in the standings table's expanded row.
- `?player=<id>` on the homepage to open the scenario builder on her.

**Architecture:**
- The React components render on the server via `react-dom/server`, run under `tsx` after `vite build`. The browser then hydrates them.
- Two Vite HTML inputs, `index.html` and a new `player.html` template, give each page type its hashed assets.
- `scripts/prerender.ts`:
  - fills the templates (`<!--app-start-->…<!--app-end-->` and `<!--head-->` / `<!--data-->` markers);
  - writes `dist/players/<id>/index.html` with the player's outlook embedded as JSON;
  - writes the sitemap.
- All browser-only state (URL picks, `localStorage`, local time zone) moves into effects, so the first client render matches the server HTML.

**Tech Stack:** React 19 (`react-dom/server`, `hydrateRoot`), Vite 7 multi-page build, tsx, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-09-player-pages-design.md`

## Global Constraints

- Run Node via `export PATH=/opt/homebrew/bin:$PATH`. After `npx tsc -b`, delete `tsconfig.tsbuildinfo`.
- Nothing may read `window`, `localStorage`, `navigator` or the time zone while rendering. Only effects and event handlers may.
- `App` stays at `src/ui/App.tsx`. The spec's `HomePage` name is cosmetic, and renaming it would only churn imports.
- Player page URLs end with a slash (`/players/<id>/`), matching the directory index Cloudflare Pages serves.
- Copy uses "she/her", as the rest of the site does.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **A shared `?s=` link on the prerendered homepage.** Expected: no hydration error, and the picks appear right after load. Covered in Task 1 by the hydration test.
- **A player page for a qualified or Out player.** Expected: a one-line "What she needs" and no "Try this scenario" links. Covered in Task 4.
- **An "as things stand" example (empty scenario).** Its link must go to `/`, not `/?s=`. Covered in Task 3.
- **`?player=` with an unknown id.** Expected: ignored, so the By tournament tab stays open. Covered in Task 2.
- **The data updater's build.** It must also prerender, since it uses the same `npm run build`. Covered by the Task 5 package script change.

---

### Task 1: Keep browser-only state out of rendering

**Files:**
- Create: `src/ui/UpdatedTime.tsx`, `src/ui/hydration.test.tsx`
- Modify: `src/ui/Header.tsx`, `src/ui/usePersistentFlag.ts`, `src/scenario/useScenario.ts`

- [ ] **Step 1: Failing test.** Create `src/ui/hydration.test.tsx`:

```tsx
import { act, type ReactElement } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { season } from '../test/fixtures';
import { App } from './App';

/** Renders `element` as the build would (a clean URL, no stored preferences), then hydrates it in a browser-like state. */
export async function hydrationErrors(element: ReactElement, browser: () => void = () => {}): Promise<unknown[]> {
  window.history.replaceState(null, '', '/');
  window.localStorage.clear();
  const container = document.createElement('div');
  container.innerHTML = renderToString(element);
  document.body.appendChild(container);
  browser();
  const errors: unknown[] = [];
  await act(async () => {
    hydrateRoot(container, element, { onRecoverableError: (error) => errors.push(error) });
  });
  container.remove();
  return errors;
}

describe('hydration', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
  });

  it('the homepage hydrates cleanly with shared picks in the URL and a stored preference', async () => {
    const errors = await hydrationErrors(<App season={season} />, () => {
      window.history.replaceState(null, '', '/?s=ana.live.W');
      window.localStorage.setItem('hideEliminated', 'false');
    });
    expect(errors).toEqual([]);
  });
});
```

Run `npx vitest run src/ui/hydration.test.tsx`. Expected: FAIL with hydration errors. The client's first render reads the URL and `localStorage`.

- [ ] **Step 2: `src/ui/UpdatedTime.tsx`:**

```tsx
import { useEffect, useState } from 'react';
import { formatUpdated } from './format';

/** "Data updated …": UTC in the prerendered HTML (the same for everyone), then the visitor's own time zone. */
export function UpdatedTime({ iso }: { iso: string }) {
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);
  return <p className="updated">Data updated {formatUpdated(iso, local ? {} : { timeZone: 'UTC', locale: 'en-US' })}</p>;
}
```

In `src/ui/Header.tsx`:
- import `UpdatedTime`, and drop the `formatUpdated` import;
- replace `<p className="updated">Data updated {formatUpdated(lastUpdated)}</p>` with `<UpdatedTime iso={lastUpdated} />`.

- [ ] **Step 3: `src/ui/usePersistentFlag.ts`.** Replace its body:

```ts
import { useEffect, useState } from 'react';

/**
 * A per-browser on/off preference. Starts at `initial` (so it matches the prerendered HTML), then applies
 * the stored choice. Falls back to `initial`, and stops saving, when storage is unavailable.
 */
export function usePersistentFlag(key: string, initial: boolean): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored !== null) setValue(stored === 'true');
    } catch {
      // Private mode or blocked storage: keep the default.
    }
  }, [key]);
  const set = (next: boolean) => {
    setValue(next);
    try {
      window.localStorage.setItem(key, String(next));
    } catch {
      // Keep it for this visit only.
    }
  };
  return [value, set];
}
```

- [ ] **Step 4: `src/scenario/useScenario.ts`.** Read the URL in an effect. Replace the two `useState` lines that use `initial`, and the URL-sync effect, with:

```ts
  const [scenario, setScenario] = useState<Scenario>({});
  const [ignored, setIgnored] = useState<IgnoredPick[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Shared picks are read after the first render, so it matches the prerendered HTML.
  useEffect(() => {
    const initial = loadFromUrl(season);
    setScenario(initial.scenario);
    setIgnored(initial.ignored);
    setLoaded(true);
  }, [season]);

  useEffect(() => {
    if (!loaded) return; // don't clear ?s= before it has been read
    const url = new URL(window.location.href);
    const encoded = encodeScenario(scenario);
    if (encoded) url.searchParams.set(PARAM, encoded);
    else url.searchParams.delete(PARAM);
    window.history.replaceState(null, '', url);
  }, [scenario, loaded]);
```

- [ ] **Step 5:** Run `npx tsc -b && npx vitest run`. Expected: all pass, including every existing App test (Testing Library's `render` flushes effects).
- [ ] **Step 6:** Commit: `refactor(ui): read browser-only state after the first render, ready for prerendering`.

---

### Task 2: `?player=` and the "Player Profile" link

**Files:**
- Modify: `src/ui/App.tsx`, `src/ui/ScenarioEditor.tsx`, `src/ui/StandingsTable.tsx`, `src/ui/ResultsBreakdown.tsx`, `src/ui/App.test.tsx`

- [ ] **Step 1: Failing tests** in `src/ui/App.test.tsx`:

```ts
  it('opens the scenario builder on a player named in ?player=', async () => {
    window.history.replaceState(null, '', '/?player=bea');
    render(<App season={season} />);
    expect(screen.getByRole('tab', { name: 'By player' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('combobox', { name: 'Player' })).toHaveValue('bea');
  });

  it('ignores ?player= for a player it does not track', () => {
    window.history.replaceState(null, '', '/?player=zed');
    render(<App season={season} />);
    expect(screen.getByRole('tab', { name: 'By tournament' })).toHaveAttribute('aria-selected', 'true');
  });

  it("links the expanded row to the player's profile page", async () => {
    render(<App season={season} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ana Alpha' }));
    expect(screen.getByRole('link', { name: 'Player Profile' })).toHaveAttribute('href', '/players/ana/');
  });
```

Run them. Expected: FAIL.

- [ ] **Step 2: `ResultsBreakdown`.** Add an optional `profileHref?: string` prop. Render it after the closing `</dl>`:

```tsx
      {profileHref && <p className="profile-link"><a href={profileHref}>Player Profile</a></p>}
```

The signature becomes `ResultsBreakdown({ name, breakdown, profileHref }: { name: string; breakdown: Breakdown; profileHref?: string })`.

In `StandingsTable.tsx`, pass `profileHref={`/players/${r.playerId}/`}` to `ResultsBreakdown`.

- [ ] **Step 3: `ScenarioEditor`.**
  - Add `focusPlayer?: string` to `Props`, and pass it through.
  - Add a ref on the `<section className="editor">`.
  - Add the effect:

```tsx
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!focusPlayer) return;
    setTab('player');
    sectionRef.current?.scrollIntoView?.({ block: 'start' });
  }, [focusPlayer]);
```

  - Render `<ByPlayer {...panelProps} season={season} onLoad={onLoad} initialId={focusPlayer} />`.
  - In `ByPlayer`, take `initialId?: string`, and use `useState(initialId ?? players[0]?.id ?? '')`.
  - Import `useEffect` and `useRef`.

- [ ] **Step 4: `App`.** Read `?player=` after the first render:

```tsx
  const [focusPlayer, setFocusPlayer] = useState<string | undefined>();
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('player');
    if (id && players.some((p) => p.id === id)) setFocusPlayer(id);
  }, [players]);
```

Pass `focusPlayer={focusPlayer}` to `ScenarioEditor`. Add `useEffect` and `useState` to the React import.

- [ ] **Step 5:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 6:** Commit: `feat(ui): ?player= opens the builder on her; Player Profile link`.

---

### Task 3: Outlook panel with links, and the player summary sentence

**Files:**
- Create: `src/ui/playerSummary.ts`, `src/ui/playerSummary.test.ts`
- Modify: `src/ui/PlayerOutlook.tsx`, `src/ui/PlayerOutlook.test.tsx`

**Interfaces:** Produces:
- `scenarioLink(scenario): string`, which returns `/` for an empty scenario and `/?s=<encoded>` otherwise;
- `routePhrase(route, season): string`;
- `playerSummary(season, playerId, rank, outlook): string`;
- `PlayerOutlook` props `heading?: string` and `scenarioHref?: (s) => string`. `onLoad` becomes optional.

- [ ] **Step 1: Failing tests,** `src/ui/playerSummary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { season } from '../test/fixtures';
import { playerSummary, routePhrase, scenarioLink } from './playerSummary';

describe('player summary', () => {
  it('links an example scenario, and "as things stand" to the plain homepage', () => {
    expect(scenarioLink({})).toBe('/');
    expect(scenarioLink({ 'ana|next': 'W', 'bea|next': 'F' })).toBe('/?s=ana.next.W_bea.next.F');
  });

  it('phrases a route in plain words, merging titles', () => {
    expect(routePhrase({ 'bea|next': 'W', 'bea|clash': 'W' }, season)).toBe('wins Next Open and Clash Cup');
    expect(routePhrase({ 'bea|next': 'W', 'bea|clash': 'F' }, season)).toBe('wins Next Open and reaches the Clash Cup final');
    expect(routePhrase({ 'bea|next': 'SF' }, season)).toBe('reaches the Next Open semifinals');
    expect(routePhrase({ 'bea|next': 'R16' }, season)).toBe('reaches the Round of 16 at Next Open');
  });

  it('summarises her standing for search results', () => {
    expect(playerSummary(season, 'ana', 1, { status: 'qualified' })).toBe(
      'Ana Alpha is #1 in the 2026 Race to the WTA Finals with 1,160 points. She has qualified for the WTA Finals.',
    );
    expect(playerSummary(season, 'cat', 3, { status: 'out' })).toBe(
      'Cat Gamma is #3 in the 2026 Race to the WTA Finals with 140 points. She can no longer qualify.',
    );
    const open = { status: 'open' as const, safeAt: 900, eventsLeft: true, eligibleNow: true, missExample: null, qualifyExample: null };
    expect(playerSummary(season, 'bea', 2, { ...open, guaranteedRoute: { 'bea|next': 'W' } })).toBe(
      "Bea Beta is #2 in the 2026 Race to the WTA Finals with 765 points. She's certain to qualify if she wins Next Open.",
    );
    expect(playerSummary(season, 'bea', 2, { ...open, guaranteedRoute: null })).toBe(
      'Bea Beta is #2 in the 2026 Race to the WTA Finals with 765 points. She needs other results to go her way to qualify.',
    );
  });
});
```

Run it. Expected: FAIL.

- [ ] **Step 2: `src/ui/playerSummary.ts`:**

```ts
import type { Season } from '../data/schema';
import { officialRace } from '../engine/countRace';
import { pointsTable } from '../engine/lookup';
import type { Outlook } from '../engine/outlook';
import { splitPickKey, type Scenario } from '../engine/types';
import { encodeScenario } from '../scenario/url';
import { formatPoints } from './format';

/** The homepage with these picks loaded; "as things stand" is the plain homepage. */
export function scenarioLink(scenario: Scenario): string {
  const encoded = encodeScenario(scenario);
  return encoded ? `/?s=${encoded}` : '/';
}

const list = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

/** "wins Wuhan, Ningbo and Tokyo" / "wins Ningbo and reaches the Tokyo final". */
export function routePhrase(route: Scenario, season: Season): string {
  const picks = Object.entries(route)
    .map(([key, round]) => ({ round, t: season.tournaments.find((t) => t.id === splitPickKey(key).tournamentId)! }))
    .sort((a, b) => a.t.startDate.localeCompare(b.t.startDate));
  const titles = picks.filter((p) => p.round === 'W').map((p) => p.t.name);
  const others = picks
    .filter((p) => p.round !== 'W')
    .map(({ round, t }) => {
      if (round === 'F') return `reaches the ${t.name} final`;
      if (round === 'SF') return `reaches the ${t.name} semifinals`;
      if (round === 'QF') return `reaches the ${t.name} quarterfinals`;
      const label = pointsTable(season.rules, t.drawType).find((r) => r.round === round)?.label ?? round;
      return `reaches the ${label} at ${t.name}`;
    });
  return list([...(titles.length ? [`wins ${list(titles)}`] : []), ...others]);
}

/** One or two sentences for the page description and link previews. */
export function playerSummary(season: Season, playerId: string, rank: number, outlook: Outlook): string {
  const player = season.players.find((p) => p.id === playerId)!;
  const total = officialRace(player.results, season.tournaments, season.rules).total;
  const standing = `${player.name} is #${rank} in the ${season.rules.season} Race to the WTA Finals with ${formatPoints(total)} points.`;
  const status =
    player.qualified || outlook.status === 'qualified' ? 'She has qualified for the WTA Finals.'
    : outlook.status === 'out' ? 'She can no longer qualify.'
    : outlook.guaranteedRoute ? `She's certain to qualify if she ${routePhrase(outlook.guaranteedRoute, season)}.`
    : outlook.eventsLeft ? 'She needs other results to go her way to qualify.'
    : 'She has no events left, so it depends on other players.';
  return `${standing} ${status}`;
}
```

The standing uses the official total (`officialRace`, which leaves out uncredited results at events under way), matching the table's "Current" column.

- [ ] **Step 3: `PlayerOutlook`.**
  - Make `onLoad` optional.
  - Add `heading?: string`, defaulting to `` `${player.name}'s chances` ``.
  - Add `scenarioHref?: (scenario: Scenario) => string`.
  - In `Example`, take `onLoad?` and `scenarioHref?`, and render:

```tsx
      {scenarioHref ? (
        <a className="button" href={scenarioHref(scenario)}>Try this scenario</a>
      ) : (
        <button type="button" title="Replaces your current picks" onClick={() => onLoad?.(scenario)}>Load this scenario</button>
      )}
```

  - Pass both props down from `PlayerOutlook`.
  - Use `<h3>{heading ?? `${player.name}'s chances`}</h3>`.
  - The closing note becomes:

```tsx
        <p className="note">{`In these examples, players not listed earn no more points.${scenarioHref ? '' : ' Loading one replaces your current picks.'}`}</p>
```

Add a test to `src/ui/PlayerOutlook.test.tsx`:

```tsx
  it('offers links instead of load buttons when given scenarioHref', () => {
    render(
      <PlayerOutlook
        player={xen}
        outlook={{ status: 'open', safeAt: 900, guaranteedRoute: null, eventsLeft: true, eligibleNow: true, missExample: { 'bea|next': 'W' }, qualifyExample: {} }}
        players={season.players}
        season={season}
        heading="What she needs"
        scenarioHref={(s) => (Object.keys(s).length ? '/?s=x' : '/')}
      />,
    );
    expect(screen.getByRole('heading', { name: 'What she needs' })).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Try this scenario' }).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/', '/?s=x']);
    expect(screen.queryByRole('button', { name: 'Load this scenario' })).toBeNull();
  });
```

- [ ] **Step 4:** Add `.button` link styling to `src/ui/styles.css`, matching the existing buttons:

```css
a.button { display: inline-block; padding: 6px 12px; border: 1px solid var(--line); border-radius: 6px; color: inherit; text-decoration: none; font-size: 0.9rem; }
```

- [ ] **Step 5:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 6:** Commit: `feat(ui): outlook links for player pages; plain-words player summary`.

---

### Task 4: The player page component

**Files:**
- Create: `src/ui/PlayerPage.tsx`, `src/ui/PlayerPage.test.tsx`
- Modify: `src/ui/hydration.test.tsx`, `src/ui/styles.css`

**Interfaces:** Produces `PlayerPage({ season, playerId, outlook }: { season: Season; playerId: string; outlook: Outlook })`.

- [ ] **Step 1: Failing tests,** `src/ui/PlayerPage.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { season } from '../test/fixtures';
import { PlayerPage } from './PlayerPage';

const open = { status: 'open' as const, safeAt: 971, eventsLeft: true, eligibleNow: true };

describe('PlayerPage', () => {
  it('shows a qualified player: rank, total, status, schedule and links', () => {
    render(<PlayerPage season={season} playerId="ana" outlook={{ status: 'qualified' }} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ana Alpha');
    expect(screen.getByText(/#1 in the Race to the WTA Finals 2026 · 1,160 points/)).toBeInTheDocument();
    expect(screen.getByText('Qualified')).toBeInTheDocument();
    expect(screen.getByText('Ana Alpha has qualified for the WTA Finals.')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Schedule' })).getByText('Live Masters: alive in the Quarterfinal')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: "Ana Alpha's results" })).toHaveTextContent('Slam Open W 1,000');
    expect(screen.getByRole('link', { name: '← Full standings' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Explore scenarios for Ana Alpha' })).toHaveAttribute('href', '/?player=ana');
    expect(screen.queryByRole('link', { name: 'Try this scenario' })).toBeNull();
  });

  it('shows an Out player with no remaining events', () => {
    render(<PlayerPage season={season} playerId="cat" outlook={{ status: 'out' }} />);
    expect(screen.getByText('Out')).toBeInTheDocument();
    expect(screen.getByText('Cat Gamma can no longer qualify.')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Schedule' })).getByText('No remaining events entered.')).toBeInTheDocument();
  });

  it('shows an open player with her route and scenario links', () => {
    const outlook = { ...open, guaranteedRoute: { 'bea|next': 'W' }, missExample: { 'ana|next': 'W' }, qualifyExample: {} };
    render(<PlayerPage season={season} playerId="bea" outlook={outlook} />);
    expect(screen.getByText('Still in contention')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What she needs' })).toBeInTheDocument();
    expect(screen.getByText(/certain to qualify with these results of her own/)).toHaveTextContent('Next Open: Winner');
    const links = screen.getAllByRole('link', { name: 'Try this scenario' }).map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/', '/?s=ana.next.W']);
  });

  it('lists an upcoming event she has entered', () => {
    const s = structuredClone(season);
    s.tournaments.find((t) => t.id === 'next')!.entries = ['cat'];
    render(<PlayerPage season={s} playerId="cat" outlook={{ status: 'out' }} />);
    expect(within(screen.getByRole('region', { name: 'Schedule' })).getByText('Next Open: entered')).toBeInTheDocument();
  });
});
```

Also add to `hydration.test.tsx`, importing `PlayerPage`:

```tsx
  it('a player page hydrates cleanly', async () => {
    expect(await hydrationErrors(<PlayerPage season={season} playerId="ana" outlook={{ status: 'qualified' }} />)).toEqual([]);
  });
```

Run these. Expected: FAIL, because `./PlayerPage` doesn't exist.

- [ ] **Step 2: `src/ui/PlayerPage.tsx`:**

```tsx
import type { Player, Season } from '../data/schema';
import { playerBreakdown } from '../engine/breakdown';
import { pointsTable } from '../engine/lookup';
import type { Outlook } from '../engine/outlook';
import { projectStandings } from '../engine/standings';
import { flagEmoji, formatPoints } from './format';
import { PlayerOutlook } from './PlayerOutlook';
import { scenarioLink } from './playerSummary';
import { ResultsBreakdown } from './ResultsBreakdown';
import { UpdatedTime } from './UpdatedTime';

/** Her current round at events under way, and the upcoming events she has entered. */
function Schedule({ season, player }: { season: Season; player: Player }) {
  const lines = season.tournaments
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .flatMap((t) => {
      const live = player.live.find((l) => l.tournamentId === t.id);
      if (t.status === 'in-progress' && live) {
        if (live.state === 'alive' && live.round === 'W') return [`${t.name}: won the title`];
        const label = pointsTable(season.rules, t.drawType).find((r) => r.round === live.round)?.label ?? live.round;
        return [`${t.name}: ${live.state === 'alive' ? 'alive' : 'out'} in the ${label}`];
      }
      if (t.status === 'upcoming' && t.entries?.includes(player.id)) return [`${t.name}: entered`];
      return [];
    });
  return (
    <section className="schedule" aria-label="Schedule">
      <h2>Schedule</h2>
      {lines.length ? <ul>{lines.map((l) => <li key={l}>{l}</li>)}</ul> : <p>No remaining events entered.</p>}
    </section>
  );
}

interface Props {
  season: Season;
  playerId: string;
  /** Worked out at build time and embedded in the page. */
  outlook: Outlook;
}

/** A read-only page for one player: where she stands, what she needs, her results and her schedule. */
export function PlayerPage({ season, playerId, outlook }: Props) {
  const { players, tournaments, rules } = season;
  const player = players.find((p) => p.id === playerId)!;
  const rows = projectStandings(players, {}, tournaments, rules);
  const row = rows.find((r) => r.playerId === playerId)!;
  const byRank = [...players].sort(
    (a, b) => rows.find((r) => r.playerId === a.id)!.currentRank - rows.find((r) => r.playerId === b.id)!.currentRank,
  );
  const qualified = player.qualified || outlook.status === 'qualified';
  const status = qualified ? 'Qualified' : outlook.status === 'out' ? 'Out' : 'Still in contention';
  return (
    <div className="app player-page">
      <nav className="crumbs"><a href="/">← Full standings</a></nav>
      <header className="header">
        <h1>
          <span aria-hidden="true">{flagEmoji(player.country)}</span> {player.name}
        </h1>
        <p className="player-status">
          {`#${row.currentRank} in the Race to the WTA Finals ${rules.season} · ${formatPoints(row.currentTotal)} points · `}
          <span className={`status status-${status === 'Qualified' ? 'in' : status === 'Out' ? 'out' : 'open'}`}>{status}</span>
          {qualified && <span className="badge" title="Qualified">Q</span>}
        </p>
        <UpdatedTime iso={season.meta.lastUpdated} />
      </header>
      <main>
        <PlayerOutlook player={player} outlook={outlook} players={byRank} season={season} heading="What she needs" scenarioHref={scenarioLink} />
        <section aria-label="Results">
          <h2>Results</h2>
          <ResultsBreakdown name={player.name} breakdown={playerBreakdown(player, {}, tournaments, rules)} />
        </section>
        <Schedule season={season} player={player} />
        <p className="explore">
          <a href={`/?player=${player.id}`}>{`Explore scenarios for ${player.name}`}</a>
        </p>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Styles.** Append to `styles.css`:

```css
.crumbs { padding-top: 16px; font-size: 0.9rem; }
.crumbs a, .explore a, .profile-link a { color: var(--accent-text); }
.player-status { margin: 0 0 6px; }
.status-in { font-weight: 600; color: var(--accent-text); }
.status-out { color: var(--muted); }
.status-open { font-weight: 600; }
.player-page h2 { font-size: 1.1rem; margin: 20px 0 8px; }
.schedule ul { margin: 0; padding-left: 20px; }
.profile-link { margin: 6px 0 0; font-size: 0.9rem; }
```

- [ ] **Step 4:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 5:** Commit: `feat(ui): player page component`.

---

### Task 5: Prerender at build time

**Files:**
- Create: `player.html`, `src/entry-player.tsx`, `src/prerender/pages.tsx`, `src/prerender/pages.test.tsx`, `scripts/prerender.ts`
- Rename: `src/main.tsx` → `src/entry-home.tsx`
- Modify: `index.html`, `vite.config.ts`, `package.json`, `playwright.config.ts`

- [ ] **Step 1: Failing tests,** `src/prerender/pages.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { season } from '../test/fixtures';
import { homeHtml, playerHtml, sitemapXml } from './pages';

const HOME = '<html><head><title>T</title></head><body><div id="root"><!--app-start-->static<!--app-end--></div></body></html>';
const PLAYER = '<html><head><!--head--></head><body><div id="root"><!--app-start--><!--app-end--></div><!--data--></body></html>';

describe('prerendered pages', () => {
  it('writes the homepage standings into the HTML and marks it for hydration', () => {
    const html = homeHtml(HOME, season);
    expect(html).toContain('<div id="root" data-ssr="">');
    expect(html).toContain('Ana Alpha');
    expect(html).not.toContain('static');
    expect(html).not.toContain('<!--app-start-->');
  });

  it('writes a player page with its own title, description, canonical URL and embedded outlook', () => {
    const html = playerHtml(PLAYER, season, 'ana', { status: 'qualified' }, 1);
    expect(html).toContain('<title>Ana Alpha: Race to the WTA Finals 2026 chances</title>');
    expect(html).toContain('<meta name="description" content="Ana Alpha is #1 in the 2026 Race to the WTA Finals with 1,160 points. She has qualified for the WTA Finals." />');
    expect(html).toContain('<link rel="canonical" href="https://finalsrace.win/players/ana/" />');
    expect(html).toContain('<script id="page-data" type="application/json">{"playerId":"ana","outlook":{"status":"qualified"}}</script>');
    expect(html).toContain('Ana Alpha has qualified for the WTA Finals.');
  });

  it('refuses a template without the markers', () => {
    expect(() => homeHtml('<html></html>', season)).toThrow(/markers/);
  });

  it('lists the homepage and every player page in the sitemap', () => {
    const xml = sitemapXml(season);
    expect(xml).toContain('<loc>https://finalsrace.win/</loc>');
    for (const p of season.players) expect(xml).toContain(`<loc>https://finalsrace.win/players/${p.id}/</loc>`);
    expect(xml).toContain('<lastmod>2026-10-07</lastmod>');
  });
});
```

Run it. Expected: FAIL.

- [ ] **Step 2: `src/prerender/pages.tsx`:**

```tsx
import { renderToString } from 'react-dom/server';
import type { Season } from '../data/schema';
import type { Outlook } from '../engine/outlook';
import { App } from '../ui/App';
import { PlayerPage } from '../ui/PlayerPage';
import { playerSummary } from '../ui/playerSummary';

export const SITE = 'https://finalsrace.win';
const START = '<!--app-start-->';
const END = '<!--app-end-->';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Puts the rendered app between the template's markers and flags the root for hydration. */
function fillRoot(template: string, app: string): string {
  const start = template.indexOf(START);
  const end = template.indexOf(END);
  if (start < 0 || end < start) throw new Error('The page template is missing the <!--app-start--> / <!--app-end--> markers.');
  return (template.slice(0, start) + app + template.slice(end + END.length)).replace('<div id="root">', '<div id="root" data-ssr="">');
}

export function homeHtml(template: string, season: Season): string {
  return fillRoot(template, renderToString(<App season={season} />));
}

export function playerHtml(template: string, season: Season, playerId: string, outlook: Outlook, rank: number): string {
  const player = season.players.find((p) => p.id === playerId)!;
  const title = `${player.name}: Race to the WTA Finals ${season.rules.season} chances`;
  const description = playerSummary(season, playerId, rank, outlook);
  const url = `${SITE}/players/${playerId}/`;
  const head = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    '<meta property="og:type" content="profile" />',
    '<meta property="og:site_name" content="Finals Race" />',
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:image" content="${SITE}/og.png" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta name="twitter:card" content="summary_large_image" />',
  ].join('\n    ');
  const data = JSON.stringify({ playerId, outlook }).replace(/</g, '\\u003c');
  return fillRoot(template, renderToString(<PlayerPage season={season} playerId={playerId} outlook={outlook} />))
    .replace('<!--head-->', head)
    .replace('<!--data-->', `<script id="page-data" type="application/json">${data}</script>`);
}

export function sitemapXml(season: Season): string {
  const lastmod = season.meta.lastUpdated.slice(0, 10);
  const urls = ['/', ...season.players.map((p) => `/players/${p.id}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${SITE}${u}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n  </url>`).join('\n')}
</urlset>
`;
}
```

Run `npx vitest run src/prerender`. Expected: PASS.

- [ ] **Step 3: Templates and entries.**
  - In `index.html`, wrap the root's current static content: `<div id="root"><!--app-start-->…existing static header, loading line and noscript…<!--app-end--></div>`. Change the script to `/src/entry-home.tsx`.
  - `git mv src/main.tsx src/entry-home.tsx`, then set its contents to:

```tsx
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { season } from './data/season';
import { App } from './ui/App';
import './ui/styles.css';

const root = document.getElementById('root')!;
const app = (
  <StrictMode>
    <App season={season} />
  </StrictMode>
);
// Built pages arrive prerendered (data-ssr); the dev server serves the bare template.
if (root.hasAttribute('data-ssr')) hydrateRoot(root, app);
else createRoot(root).render(app);
```

  - `player.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!--head-->
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="theme-color" content="#6b2c91" />
  </head>
  <body>
    <div id="root"><!--app-start--><!--app-end--></div>
    <!--data-->
    <script type="module" src="/src/entry-player.tsx"></script>
  </body>
</html>
```

  - `src/entry-player.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { season } from './data/season';
import { playerOutlook, type Outlook } from './engine/outlook';
import { PlayerPage } from './ui/PlayerPage';
import './ui/styles.css';

const root = document.getElementById('root')!;
const embedded = document.getElementById('page-data');
// Built pages embed the player and her outlook; in development, /player.html?id=<player> works it out here.
const { playerId, outlook }: { playerId: string; outlook: Outlook } = embedded
  ? JSON.parse(embedded.textContent ?? '{}')
  : (() => {
      const id = new URLSearchParams(window.location.search).get('id') ?? season.players[0]!.id;
      return { playerId: id, outlook: playerOutlook(id, season.players, season.tournaments, season.rules) };
    })();
const page = (
  <StrictMode>
    <PlayerPage season={season} playerId={playerId} outlook={outlook} />
  </StrictMode>
);
if (root.hasAttribute('data-ssr')) hydrateRoot(root, page);
else createRoot(root).render(page);
```

- [ ] **Step 4: `vite.config.ts`.** Remove the `sitemap()` plugin, its `readFileSync` import and the `SITE` constant; the prerender writes the sitemap now. Add the two HTML inputs:

```ts
import { fileURLToPath } from 'node:url';
// …
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        player: fileURLToPath(new URL('./player.html', import.meta.url)),
      },
    },
  },
  test: { /* unchanged */ },
});
```

- [ ] **Step 5: `scripts/prerender.ts`:**

```ts
// Prerenders the built site: the homepage, one page per tracked player (with her chances worked out
// now), and the sitemap. Runs after `vite build`; reads the built HTML templates from dist/.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { season } from '../src/data/season';
import { playerOutlook } from '../src/engine/outlook';
import { projectStandings } from '../src/engine/standings';
import { homeHtml, playerHtml, sitemapXml } from '../src/prerender/pages';

const dist = new URL('../dist/', import.meta.url).pathname;
const started = Date.now();
const homeTemplate = readFileSync(`${dist}index.html`, 'utf8');
const playerTemplate = readFileSync(`${dist}player.html`, 'utf8');
writeFileSync(`${dist}index.html`, homeHtml(homeTemplate, season));

const ranks = new Map(projectStandings(season.players, {}, season.tournaments, season.rules).map((r) => [r.playerId, r.currentRank]));
for (const p of season.players) {
  const outlook = playerOutlook(p.id, season.players, season.tournaments, season.rules);
  mkdirSync(`${dist}players/${p.id}`, { recursive: true });
  writeFileSync(`${dist}players/${p.id}/index.html`, playerHtml(playerTemplate, season, p.id, outlook, ranks.get(p.id)!));
}
rmSync(`${dist}player.html`); // the template itself is not a page
writeFileSync(`${dist}sitemap.xml`, sitemapXml(season));
console.log(`Prerendered the homepage and ${season.players.length} player pages in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
```

- [ ] **Step 6: `package.json`.** Change `"build"` to `"npm run validate && npm run typecheck && vite build && tsx scripts/prerender.ts"`.

In `playwright.config.ts`, test the built site:

```ts
  use: { baseURL: 'http://localhost:4173' },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
```

CI and the updater both run `npm run build` before `npm run test:e2e`. Locally, build first.

- [ ] **Step 7: Build and inspect.** Run `npm run build`.
  - Expected: "Prerendered the homepage and 40 player pages in …s".
  - `dist/players/iga-swiatek/index.html` has a title, description, `data-ssr` and `page-data`.
  - `dist/index.html` contains `row-elena-rybakina`.
  - `dist/player.html` is gone.
  - `dist/sitemap.xml` lists 41 URLs.
  - If Vite has stripped the `<!--head-->`, `<!--data-->` or app-marker comments from the built templates, stop: fix it by marking them with a non-comment placeholder (e.g. `<meta name="x-head" />`) instead of guessing, and record a ruling.
- [ ] **Step 8:** Run `npx tsc -b && npx vitest run`. Expected: all pass.
- [ ] **Step 9:** Commit: `feat: prerender the homepage and a page per player at build time`.

---

### Task 6: End-to-end, browser check and docs

**Files:**
- Create: `e2e/player.spec.ts`
- Modify: `README.md`

- [ ] **Step 1:** `e2e/player.spec.ts`:

```ts
import { expect, test } from '@playwright/test';

test('the table links to a player profile, which links back into the scenario builder', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('tbody button.name').first();
  const name = (await first.textContent())!.trim();
  await first.click();
  await page.getByRole('link', { name: 'Player Profile' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(name);
  await expect(page).toHaveTitle(new RegExp(`^${name}: Race to the WTA Finals`));
  const id = new URL(page.url()).pathname.split('/')[2]!;
  await page.getByRole('link', { name: `Explore scenarios for ${name}` }).click();
  await expect(page.getByRole('combobox', { name: 'Player', exact: true })).toHaveValue(id);
});

test('"Try this scenario" opens the homepage with those picks', async ({ page }) => {
  await page.goto('/');
  const names = await page.locator('tbody button.name').allTextContents();
  for (const name of names) {
    await page.goto('/');
    await page.getByRole('button', { name: name.trim() }).click();
    await page.getByRole('link', { name: 'Player Profile' }).click();
    const tries = page.getByRole('link', { name: 'Try this scenario' });
    const hrefs = await tries.evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
    const withPicks = hrefs.find((h) => h.startsWith('/?s='));
    if (!withPicks) continue;
    await page.goto(withPicks);
    await expect(page).toHaveURL(new RegExp(`\\${withPicks.replace(/[.?]/g, (c) => `\\${c}`)}$`));
    await expect(page.getByRole('button', { name: 'Reset' })).toBeVisible();
    return;
  }
  test.skip(true, 'No open player has an example scenario with picks right now.');
});
```

- [ ] **Step 2:** Run `npm run build && npm run test:e2e`. Expected: all pass.
- [ ] **Step 3: Browser check** with Playwright, on the preview server:
  - the homepage, after clicking a name, shows the Player Profile link;
  - a player page at desktop and phone width, in dark mode;
  - Swiatek's page shows her "certain to qualify" route;
  - there are no console errors or hydration warnings.
- [ ] **Step 4: `README.md`.**
  - Under Develop: the dev server shows a player page at `/player.html?id=<player>`. `npm run build` prerenders every page. `npm run test:e2e` runs against the built site, so build first.
  - Under Search: player pages, their titles and descriptions, and the sitemap now written by `scripts/prerender.ts`.
- [ ] **Step 5:** Run `npx tsc -b && npx vitest run && npm run build && npm run test:e2e`. Expected: all pass.
- [ ] **Step 6:** Commit: `test(e2e): player pages; docs`.
