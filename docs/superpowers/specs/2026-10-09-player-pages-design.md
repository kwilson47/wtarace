# Player pages: design

> **Superseded** by `2026-10-09-player-season-pages-design.md`. The user decided this race-focused page repeated the homepage. Its build-time prerendering groundwork is kept.

Approved in conversation on 2026-10-09. This is the second of four sub-projects. The first was automatic data updates. Still to come: tournament pages with a bracket picker, and qualification percentages.

## Goal

Give every tracked player a page at `finalsrace.win/players/<id>`, built as real HTML at deploy time, so that:
- fans land straight on the answer to "can she still qualify, and what does she need?";
- search engines can index it ("Iga Swiatek WTA Finals chances").

## Decisions (from the user)

- **Read-only "state of play" page.** There's no scenario builder on the page. It links to the homepage's builder instead. A per-player builder can come later if fans ask for it.
- **The homepage table keeps its expanding row.** The expanded breakdown gets a link labelled **"Player Profile"** to her page.
- **Pages are built at deploy time,** as option 1: the existing React components are rendered to static HTML for every page, and the browser then takes over. The homepage's standings table is written into its HTML the same way.

## Pages

### Player page: `/players/<player id>/`

One page per tracked player, using the ids already in `data/players.json`, e.g. `/players/iga-swiatek/`.

1. **Header**
   - Flag, name, current race rank and official total.
   - Status: **Qualified** (with the Q badge), **Out**, or **Still in contention**.
   - "Data updated" in the visitor's local time.
2. **What she needs.** The chances panel's content:
   - "certain to qualify if she…" (her guaranteed route), or the no-route or no-events wording;
   - "Safe at N points";
   - "How she could qualify" and "How she could miss out".

   Each example has a **"Try this scenario"** link that opens the homepage with those picks loaded. It uses the existing `?s=` encoding. For Qualified and Out players this section is a single sentence.
3. **Results.** Her breakdown by category: counted and not-counted results, zero-pointers, and progress toward the event minimum. It uses the existing `ResultsBreakdown` with no picks applied.
4. **Schedule.** One line per remaining event:
   - her current round, alive or out, at an event under way;
   - "Entered" for upcoming events whose entry list includes her.

   Events with no entry list yet aren't listed. If there's nothing to show: "No remaining events entered".
5. **Links:**
   - "← Full standings", to `/`;
   - "Explore scenarios for her", to `/?player=<id>`. This opens the homepage's By player tab with her selected (see Homepage changes).

### Homepage changes

- **The expanded results row** gets a "Player Profile" link to `/players/<id>/`.
- **`?player=<id>` on the homepage** opens the scenario editor on the By player tab with that player selected. It's ignored if the id isn't tracked. It combines with `?s=`.
- **Prerendering:** the homepage's static HTML now contains the full rendered page, including the standings table. Any work that has to happen in the browser (the Q search in a worker, picks from the URL) runs after the page has loaded, as it does now.

## Chances computed at build time

Building the site runs `playerOutlook` for every tracked player and embeds each result in that player's page. Qualified and Out players take no time; on today's data, open players take about 1–5 seconds each.
- The player page shows the embedded outlook immediately and never recomputes it in the browser.
- The homepage's By player panel keeps computing in its worker as now. Its data is the same, but it isn't worth sending every player's outlook to every homepage visitor.

The build fails if any outlook throws, the same as any other build error, so a bad deploy can't ship.

## Search

- **Each player page has its own:**
  - `<title>`: "<Name>: Race to the WTA Finals 2026 chances";
  - meta description: built from the status and the route, e.g. "Iga Swiatek is #10 in the Race to the WTA Finals with 3,799 points. She's certain to qualify if she wins Wuhan, Ningbo and Tokyo.";
  - canonical URL;
  - Open Graph and Twitter tags (reusing the site image).
- **The sitemap** lists `/` and every player page, dated from `data/meta.json`.
- **Unknown paths** still return the 404 page.

## Structure

- **One render function per page,** usable both on the server and in the browser:
  - `src/pages/HomePage.tsx`, the current `App`;
  - `src/pages/PlayerPage.tsx`, new.
- **Browser entry points** take over the server-rendered HTML:
  - `src/entry-home.tsx`, replacing `main.tsx`;
  - `src/entry-player.tsx`.

  The player entry reads its player id and outlook from a JSON `<script>` in the page.
- **A prerender step** (`scripts/prerender.ts`) runs after `vite build`. It:
  - renders each page with `react-dom/server`, using a server build of the page modules;
  - writes `dist/index.html` and `dist/players/<id>/index.html`, from HTML templates that carry the built asset tags;
  - writes `dist/sitemap.xml`. This replaces the current Vite sitemap plugin.
- **`index.html` stays the homepage template.** A second template, `player.html`, is added as a Vite build input, so its script and style tags are built and hashed.
- **CI and the automatic updater** run the same `npm run build`, so every data update re-renders every page.

## Error handling

- **A player id not in the data:** no page is built, so `/players/<id>` returns the site 404.
- **A player who stops being tracked:** that can't happen, since tracking only grows.
- **Missing or failing JavaScript:** the static HTML already shows everything on a player page. On the homepage, the static table shows the standings with no picks applied.
- **A broken hydration:** the server HTML and the first client render must match. The data is the same, and the only time-dependent value is the "Data updated" text. It renders in UTC on the server, then switches to local time after hydration (inside an effect), to avoid a mismatch.
- **Other browser-only state** follows the same rule. The first render matches the server; the browser-only value is applied right after:
  - **Shared picks (`?s=`) and `?player=`:** the server renders with no picks, and the page applies the URL's picks just after loading. A shared link briefly shows the current standings, then the scenario.
  - **The remembered "Hide eliminated players" choice:** the server renders the default (hidden); the stored choice is applied after loading.
  - **The worker-computed Q badges:** these already arrive after loading, as now.
  - **Server-safe code:** nothing reads `window`, `localStorage` or `navigator` during render.

## Testing

- **`PlayerPage` component tests** with the synthetic fixtures:
  - a qualified player (one-line chances, Q badge);
  - an Out player;
  - an open player (route, safe-at, both examples with "Try this scenario" links carrying the right `?s=` value);
  - the schedule (current round at an event under way, "Entered" for an upcoming event).
- **Homepage:**
  - the "Player Profile" link in the expanded row;
  - `?player=<id>` selects her in the By player tab, and an unknown id is ignored.
- **Prerender** (a test that runs the render functions on the fixture season):
  - every page's HTML contains its title, description and key text;
  - the homepage HTML contains the standings rows.
- **Build check:** after `npm run build` in CI, `dist/players/<id>/index.html` exists for every tracked player and `sitemap.xml` lists them all.
- **End-to-end:**
  - open a player page and follow "Try this scenario", and the homepage shows those picks;
  - follow "Player Profile" from the table and land on the right page.

## Out of scope

- A scenario builder on the player page.
- Pages for untracked players.
- Head-to-head or historical data.
- Percentages, which are sub-project 4.
