# Race history charts: design

Approved in conversation on 2026-10-11.

## Goal

Show how the race has unfolded week by week:
- **a comparison chart** of chosen players' race points (or positions) over the season;
- **a chart on each player page** with her line against the qualifying bar.

The data comes from the WTA's own weekly race lists, so nothing is calculated.

## Decisions (from the user)

- **Default view:** points, with a toggle to race position.
- **Placement:** a page at `/race-history/`, linked as "Race over time →" from the standings (homepage), not a nav item. The nav stays Standings · Tournaments · Players · Feedback.
- **Player pages** get a chart limited to that player.

## Data

### Source

The race ranking feed accepts a date: `players/ranked?…&metric=CHAMPSINGLES&at=<YYYY-MM-DD>`. It returns the race list as published on or before that date. Each row has a `rankedAt` date, the `ranking` and the `points`; `tournamentsPlayed` is 0 in historical rows and isn't used.
- **Publication dates:** the WTA publishes a new list most Mondays, but not during two-week events (Indian Wells, Miami, Madrid, Rome, the Slams, Beijing). Every distinct `rankedAt` is one point in the history.
- **The 2026 race starts** with the first list after the 2025 race closed. The 2025 race froze on 2025-10-27, and the first 2026 list appears in November 2025.
- **Paging:** 100 rows a page, until a short page.

### `data/race-history.json`

```json
{
  "dates": ["2025-12-01", "…", "2026-09-28"],
  "players": { "<player id>": [[rank, points] | null, …] },
  "eighth": [points, …]
}
```

- `dates` are the distinct `rankedAt` dates, in order.
- **`players`:** one entry per tracked player, aligned with `dates`. `null` means she wasn't on that week's list (no race points yet).
- **`eighth`:** the 8th-place points each week, shown as the qualifying bar on player pages. It's the official list's 8th row, so it isn't adjusted for the Grand Slam champion place or the event minimum. The chart labels it "8th place".
- **What it is:** published fact, with a schema check (lengths match `dates`, ranks are positive, points aren't negative). Like match and draw files, it never blocks an update.

### Keeping it current

- **Backfill:** a one-off `scripts/backfill-race-history.ts` steps through every Monday from 2025-11-03 to today. It fetches each date's full list, keeps each new `rankedAt` once, and writes the file. Feeds are cached.
- **Hourly updater:** a new stage. The run already fetches the current race list. When that list's `rankedAt` is newer than the last stored date, it fetches the remaining pages and appends the week. Its commit line reads "Race history: week of <date> added".
- **New tracked players:** when the updater adds a player, it fills her past weeks from the stored dates. That's one request per stored date, paged until she's found or the list ends. If that fails, her history stays `null` and the run notes it.

## Pages

### `/race-history/`, "Race over time"

- **Chart:** an SVG line chart, drawn by our own code (no charting library), prerendered and hydrated like the other pages. Dates run along the x-axis.
  - **Points view (default):** race points on the y-axis, with a dashed "8th place" line.
  - **Position view:** race position with 1 at the top, the y-axis running from 1 to the lowest position among the chosen players. A band shades positions 1–8.
- **Players:** chosen with a list of checkboxes and a search box. The default is the current top 10 by official total. Up to **10** players can be shown at once; at the limit, the other checkboxes are disabled with a short note.
- **Colours:** a fixed palette of 10 colours, readable in light and dark mode. Each line's name label sits at its right end, and the legend doubles as the player list.
- **Tooltips:** hovering, or tapping on a phone, a date shows each chosen player's position and points that week, in a small panel.
- **Persistence:** the choice of players and view is kept in the URL (`?p=id1,id2&view=rank`), so a chart can be shared, and read after hydration like `?s=`.
- **Phones:** the chart fills the width (16px gutters) and stays readable at 360px, with labels thinned to avoid overlap.
- **Link:** "Race over time →" above the standings table on the homepage.

### Player page

- A "Race over time" section after the season summary: her points line, the dashed 8th-place line, and a tooltip with the date, her position and points.
- A link: "Compare with others →" opens `/race-history/?p=<her id>`.
- Shown only when she has history; otherwise the section is left out.

### Search

`/race-history/` gets a title, description and canonical URL, and is added to the sitemap.

## Structure

- `src/history/historySchema.ts`: the file's type and schema check.
- `src/update/history.ts`:
  - `appendWeek(history, raceRows, trackedIds)` and `fillPlayer(history, playerId, rowsByDate)`, both pure;
  - the updater stage that uses them.
- `scripts/backfill-race-history.ts`.
- `src/ui/RaceChart.tsx`: the SVG chart. It takes series, dates, the view and an optional reference line, and is pure render plus local hover state.
- `src/ui/RaceHistoryPage.tsx`: the comparison page.
- `src/ui/PlayerPage.tsx`: the new section.
- **Wiring:** the prerender, a template and entry for `/race-history/`, a dev-server route and the sitemap. Validation is added to `npm run validate`.

## Error handling

- **No history file:** `/race-history/` says "Race history isn't available yet", and player pages leave the section out.
- **A chosen id that isn't tracked** (from a shared link): it's dropped silently, and if none are left the page falls back to the default top 10.
- **A failed feed while updating:** the stored history is kept, with a note. It never blocks.

## Testing

- **History stage:**
  - appends only a new `rankedAt`;
  - aligns players to the dates, with `null` where she's absent;
  - records the 8th-place points;
  - fills a newly tracked player;
  - keeps the file when the feed fails.
- **Schema:** mismatched lengths and bad values are rejected.
- **RaceChart:**
  - points and position scales;
  - a line breaks across `null` weeks;
  - the reference line;
  - the tooltip content for a date;
  - labels at the line ends.
- **Comparison page:**
  - the default top 10;
  - the 10-player cap;
  - the search;
  - the view toggle;
  - URL state restored after hydration;
  - unknown ids dropped.
- **Player page:** the section appears with history and is left out without it.
- **Hydration** for both pages.
- **End-to-end:** from the standings link to `/race-history/`, add a player, switch to position view, and reload with the URL.

## Out of scope

- Live (unofficial) points between published lists.
- Players we don't track.
- Seasons before 2026 (the off-season year picker).
- The 52-week WTA ranking.
