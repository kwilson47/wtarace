# Player season pages: design

Approved in conversation on 2026-10-09. This replaces the race-focused player pages in `2026-10-09-player-pages-design.md`, which the user turned down as too similar to the homepage.

## Goal

A page per tracked player, at `finalsrace.win/players/<id>/`, that shows her whole season in the style of the WTA's own player pages:
- a season summary;
- every tournament she played, with each match round by round.

The pages are built as HTML at deploy time, so search engines can index them.

## Decisions (from the user)

- **Every match the WTA feed has is included,** clearly labelled: WTA events, WTA 125s, ITF events, qualifying, and team events (United Cup, Billie Jean King Cup).
- **The season is the race year:** events from the week of 27 October 2025 to the end of the 2026 race (Tokyo and Guangzhou). A year picker for earlier seasons can come in 2027.
- **Ranking points are shown,** as on the WTA's pages.
- **What's reused from the `player-pages` branch:**
  - building pages at deploy time;
  - the fixes that let pages load cleanly after being built;
  - the "Player Profile" link from the table's expanded row;
  - `?player=`;
  - the sitemap.

  The race-focused page content ("what she needs", the race results breakdown and the schedule) and its helper code are removed.

## Pages

### `/players/<id>/`, one per tracked player

1. **Header**
   - Flag, name, and "2026 season".
   - Record, e.g. **48–15**. Titles, with their names, and finals reached.
   - Her race position, e.g. "Race #10", linking to the standings (`/`).
   - "Data updated" in the visitor's local time.
2. **Season summary**
   - **Win–loss by surface:** Hard, Clay, Grass. Separately, **Indoor**, covering any match at an indoor event.
   - **Win–loss by level:** Grand Slam, WTA 1000, WTA 500, WTA 250, WTA 125, ITF, Team events.
   - **Top-10 wins:** wins over opponents ranked 1–10 at the time of the match, from the feed's ranking.
   - Rows with no matches are left out.
3. **Tournaments, newest first.** Each block shows:
   - name, level, surface (with "indoor" where it applies) and dates;
   - her result, either the round reached or "Winner", with the ranking points earned. An event still under way shows "In progress" and no points.
   - her matches in round order, latest first. Each match shows:
     - the round: R128 … F, or "Qualifying R1/R2/R3/Q";
     - W or L;
     - the opponent, with flag and seed or entry type (Q, WC, LL);
     - the score as published.

     Retirements and walkovers are marked ("ret." / "w/o").
4. **Note:** "The season follows the Race to the WTA Finals year, so it starts with events in late October 2025."
5. **Links:**
   - **Opponents** who are tracked players link to their pages.
   - **"← Full standings"** goes back to the homepage.
   - **"Explore scenarios for her"** opens the homepage builder via `?player=`.

### Search

- Each page has the title "<Name>: 2026 season results" and a description built from her record, titles and best result. For example: "Iga Swiatek's 2026 season: 48–15, 2 titles (Toronto, Doha), 3 finals. Every match, round by round."
- The canonical URL, link-preview tags and sitemap work as on the branch.

## Data

### `data/matches/<player id>.json`

A list of the player's race-year singles matches as the WTA publishes them. Only the fields the page needs are kept:
- tournament id, year, name and level;
- surface and whether the event is indoors;
- start and end dates;
- the qualifying or main-draw flag;
- the round;
- the opponent: WTA id, name, country, seed and entry type, and ranking at the time;
- her own ranking at the time;
- winner, score, and a retirement or walkover marker;
- ranking points for the event.

Matches are sorted by tournament start date, then round.

- **What it is:** a plain record of published facts. It isn't validated against official totals and involves no judgement, so these files never block an update.
- **How it's validated:** a schema check covers the field types and that every file belongs to a tracked player.
- **How it's kept fresh:** the hourly updater, `scripts/update.ts`, fetches every tracked player's match feed (`players/<wtaId>/matches?…&type=S`, paged if needed). It rewrites her file when the race-year matches differ.
  - If one player's feed fails, her previous file is kept and the run notes it. A failure doesn't stop the rest of the update.
  - A player newly added by the updater gets her file in the same run.
  - Its commit message lists matches added, e.g. "Matches: Mertens d. Zheng (Beijing SF)", or else one line per player with the number of new matches.
- **First fill:** the same updater code, run once to create the files for all 40 players.

### Derived season data

A pure function, `seasonSummary(matches, …)`, works out from the file:
- the record;
- surface, indoor and level splits;
- titles and finals;
- top-10 wins;
- the per-tournament blocks, each with its result and points.

The page uses only that function and the player's file.

## Structure

- **Removed from the branch:**
  - `PlayerPage`'s race content;
  - `playerSummary.ts` (race summary sentence);
  - the `PlayerOutlook` link and heading props;
  - the race-specific bits of the prerender.
- **`src/season/`:** `matchSchema` (data types), `seasonSummary.ts` and its tests.
- **`src/update/matches.ts`:** turns a feed into match records, plus the stage that writes `data/matches/`. Wired into `scripts/update.ts`.
- **`src/ui/PlayerPage.tsx`:** rewritten for the season view, with `SeasonSummary` and `TournamentBlock` components.
- **Build-time prerender:** reads `data/matches/*.json` and builds one page per tracked player. The match files are read at build time only and embedded in each page as JSON. They are not bundled into the homepage's JavaScript, which keeps the homepage light.

## Error handling

- **A tracked player whose match file is missing** (e.g. before the first fill): her page shows the header, plus "Match results aren't available yet."
- **An opponent with no country or seed:** shown without them.
- **An unknown level or surface:** shown as published, and counted under "Other" in the splits.
- **Points missing for an event:** the result is shown without points.

## Testing

- **`seasonSummary`,** using synthetic match fixtures:
  - record and splits, including indoor;
  - titles and finals;
  - top-10 wins;
  - qualifying shown under its tournament;
  - retirements and walkovers;
  - an event still in progress;
  - team events.
- **Feed → match records:** sides, winner, score, and the retirement and walkover markers. Uses snapshot fixtures of real responses.
- **The updater stage:**
  - writes changed files only;
  - keeps a player's file when her feed fails, with a note;
  - creates a file for a new player.
- **`PlayerPage`:**
  - header record and titles;
  - summary rows;
  - a tournament block with its matches and links to tracked opponents;
  - the missing-file state.
- **Hydration:** a player page hydrates cleanly, extending the branch's hydration tests.
- **Prerender:** the page title, description and embedded data. The sitemap lists every player.
- **End-to-end:** from the table to a Player Profile, which shows her tournaments, and from there to an opponent's page.

## Out of scope

- Earlier seasons and a year picker (2027).
- Doubles.
- Head-to-head pages.
- Player bios and photos.
- Ranking history charts.
