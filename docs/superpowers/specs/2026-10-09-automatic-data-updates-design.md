# Automatic data updates: design

Approved in conversation on 2026-10-09. This is the first of four sub-projects. The others are player pages, tournament pages with a bracket picker, and qualification percentages. Each gets its own spec.

## Goal

Keep finalsrace.win current without anyone asking for an update.

A scheduled job reads the official WTA feeds and refreshes the data. If every check passes, it publishes. Anything that needs judgement stops the update and asks a human through a GitHub issue.

The site's core promise must not weaken: every official race total is reproduced exactly, and Q/Out are never wrong.

## Decisions (from the user)

- **Publish automatically** when every check passes. There is no pull request to approve.
- **New top-40 players are added automatically** when their whole season reproduces their official total and event count exactly. Otherwise the update stops and opens an issue. Publishing with an untracked player inside the top 40 is not allowed, because the Q/Out bound assumes everyone untracked is at or below the lowest tracked player.
- **Show the update time in the visitor's own time zone**, not UTC.

## Behaviour

### Schedule and trigger

- `.github/workflows/update.yml` runs hourly at minute 17, and can be started manually (`workflow_dispatch`).
- A run that changes nothing commits nothing.
- The workflow shares a concurrency group with the deploy, so two runs never publish at once.

### What one run does

1. **Fetch** a snapshot of the feeds (see Feeds). If any request fails, or returns something that isn't the expected JSON, the run ends without changes. The next hour retries. There's no issue for a transient outage.
2. **Update** the season in memory. This is a pure function, `updateSeason(season, snapshot) → { season, changes, problems }`.
3. **Check:**
   - `problems` is empty;
   - the validator passes: schema valid and every official total reproduced;
   - the sanity checks pass.

   If any check fails, nothing is written. The run opens or updates the `data-update` issue and stops.
4. **Write** the data files, keeping their existing formatting. Set `meta.lastUpdated`.
5. **Run the same checks as CI:** typecheck, unit tests, validate, build, e2e.
6. **Commit and deploy.**
   - The commit message lists the changes, one line each, e.g. `Beijing SF: Mertens d. Zheng — Mertens alive in F`.
   - The commit author is `github-actions[bot]`.
   - The run then deploys the same way CI does. A commit pushed with the workflow token doesn't trigger CI, so the deploy is called from the update workflow. To share the steps, `ci.yml` becomes reusable through `workflow_call`, taking the ref to check out.
   - If the push is rejected because `main` moved, the run ends quietly and the next hour starts from the new `main`.
7. **Close the `data-update` issue**, if one is open, with a comment that the update succeeded.

### What the updater may change

| Data | Change |
|---|---|
| `players[].officialRaceTotal` | Set from the race ranking feed. |
| `tournaments[].status` | `upcoming` → `in-progress` once the draw has started; `in-progress` → `completed` once the WTA has credited the event (see Crediting a finished event). |
| `tournaments[].drawSize`, `byes`, `entries` | `drawSize` and `byes` come from the published draw. `entries` come from the entry list, subject to the sanity checks. |
| `players[].live` | Current round, `alive`/`eliminated` and `drawPosition` at in-progress events. Removed once an event is completed. |
| `players[].results` at in-progress or newly completed events | Round reached; points 0 until the event is credited, then the published race points. |
| New players | Added automatically (see New players). |
| `meta.lastUpdated` | The time of the run that made changes. |

### What it never changes

- Stored results at events that were already completed.
- Zero-pointers, including the placeholders.
- `qualified` flags, which need an official announcement.
- `eventMinimumWaived`.
- `rules.json`.

If the feeds disagree with any of these, for example a stored total no longer reproduces, the run stops with a problem. It never edits them to fit.

### Crediting a finished event

The WTA posts race points some time after an event ends. Until then, the official totals don't include it.

For an event whose final has been played, the updater builds two candidates:
- **Credited:** each tracked player's round and her published race points (`points_champ`) from her match feed, with status `completed` and `live` entries removed.
- **Not yet credited:** the same rounds with 0 points, status still `in-progress`, and every player's `live` entry showing her final state. The champion is `alive` at `W`.

It keeps whichever candidate reproduces every official total. If neither does, that's a problem. This handles the gap between the final and the race update without any date assumptions.

### New players

Every tracked player stays tracked, so `trackedPlayerCount` becomes the number of tracked players and only grows.

For each player ranked 1–40 in the race feed who isn't tracked yet:
- Her results are built from her match feed, using the conventions already in `data/SOURCES.md`:
  - rounds;
  - `Q`/`Q1`…;
  - lucky losers;
  - published race points;
  - United Cup codes by points;
  - no WTA 125 or ITF events;
  - the race year boundaries.
- Completed WTA events missing from `tournaments.json` are added from the feed's tournament object: name shortened to the city, category, dates, and draw type by the existing draw-size rule.
- Her country is mapped IOC→ISO with the existing table. A code that isn't in the table is a problem.
- She's added only if both of these hold:
  - her total reproduces her official total;
  - her stored event count, excluding uncredited in-progress events, equals the official `tournamentsPlayed`.

  Otherwise the run stops. The issue shows the gap. It lists the zero-pointer attributions that would reproduce the total, as the brute-force check did for Bejlek and the others, and points to the evidence rules in `SOURCES.md`.

### Sanity checks

These guard against feed glitches. A failing check either keeps the old value and notes it in the commit, or stops the run.

- **Keep the old value and note it:** an entry list that comes back empty, or with less than half its previous tracked entrants, is treated as taken down. Today's Wuhan feed, which showed only the qualifying draw before the main draw was made, is the model case.
- **Stop the run:**
  - a tracked player missing from the race ranking feed;
  - an in-progress event whose draw is missing.

### The `data-update` issue

- There's at most one open issue, labelled `data-update`. GitHub notifies the repo owner.
- Its body is rewritten each time the run is blocked: the time, each problem in plain words, and for a new player the candidate attributions. Repeated identical failures don't add comments, so there's no hourly spam. A new kind of problem adds one comment.
- It closes automatically when a run succeeds.
- A human resolves it by fixing the data by hand, with sources, as today, and pushing. The next run carries on from there.

### Visitor's time zone

- The header shows `Data updated <local date and time with zone>`, e.g. `Data updated Oct 9, 9:03 AM EDT`.
- It uses the browser's locale and time zone, via `Intl.DateTimeFormat` with a short zone name. `formatUpdated(iso, timeZone?)` takes an optional zone, so tests can pin it.
- The year is shown only when it isn't the current year.

## Feeds

These are all public JSON from `api.wtatennis.com`, as already cited in `data/SOURCES.md`:
- **Race ranking:** `players/ranked?…metric=CHAMPSINGLES`, `pageSize` 60. It gives totals, `tournamentsPlayed` and the top 40.
- **Calendar:** `tournaments/?from=<race start>&to=<race end>`. It gives event ids, dates and status.
- **Per event:** `tournaments/{id}/{year}/players` and `/matches`, fetched for in-progress events, events whose draw is out, and upcoming events (entries).
- **Per player:** `players/{wtaId}/matches?…&type=S`, fetched for new players and when crediting a finished event.

The WTA tournament ids for our events are stored once in a small map in the updater, checked against the calendar feed by date and name. A remaining event that can't be matched is a problem.

## Structure

- **`src/update/feeds.ts`:** fetches a `FeedSnapshot`, the raw JSON keyed by feed. This is the only module that does network I/O.
- **`src/update/updateSeason.ts`:** the pure update. It's split into focused functions: totals, events and draws, entries, crediting, new players. It returns `{ season, changes, problems }`.
- **`src/update/writeData.ts`:** writes the data files with the existing formatting.
- **`scripts/update.ts`:** the CLI. It fetches, updates, checks and writes, then prints changes and problems as JSON for the workflow.
- **`scripts/issue.ts`:** opens, updates or closes the `data-update` issue through the GitHub REST API, using the workflow token.
- **`.github/workflows/update.yml`**, plus `ci.yml` made callable.

`data/SOURCES.md` gets one section describing the automation and its feeds. Per-run detail lives in the commit messages.

## Testing

- **Unit tests for `updateSeason`** run against saved feed snapshots, small fixtures based on real responses, covering:
  - a match result;
  - an event going live, with draw positions and byes;
  - a finished event not yet credited, then credited;
  - a published draw;
  - entry-list growth and an empty entry list (the old list is kept);
  - a new player who reproduces;
  - a new player with an unexplained missing event (a problem, with candidates);
  - a total that stops reproducing (a problem);
  - a stored completed result never being modified.
- **A writer test:** the files are unchanged when nothing changed.
- **`formatUpdated` tests** with pinned time zones.
- **A dry-run mode** (`scripts/update.ts --dry-run`), run against the live feeds before the first real deploy, printing the changes it would make.

## Out of scope

- Setting `qualified` from announcements.
- Zero-pointer attribution beyond listing the candidates.
- Notifications other than the GitHub issue.
- Deciding when the race year rolls over (2027).
