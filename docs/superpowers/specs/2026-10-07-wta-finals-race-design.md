# WTA Finals Race Projector — Design

**Date:** 2026-10-07
**Status:** Approved in brainstorming; awaiting written-spec review

## 1. Purpose and audience

A public website for tennis fans that shows the 2026 Race to the WTA Finals (singles) and lets visitors project how the race will finish by entering hypothetical results for the remaining tournaments. The focus is the top 8 — the qualifying places.

**Success criteria**

- Current standings shown on the site always match the official WTA race totals for every tracked player.
- Projected totals follow the WTA's real counting rules (capped best-of results, mandatory events, in-progress points replaced rather than added), so fans can't catch the numbers out.
- A fan can build a scenario either per tournament or per player, see the projected top 8 update instantly, and share the exact scenario by link.
- Keeping the data current is a quick, hand-edited JSON change that can't deploy if it's wrong.

**Season scope:** 2026 only. Season-specific values live in data/config, so the app can be reworked for the 2027 race in the offseason without restructuring.

## 2. Decisions made

| Decision | Choice |
|---|---|
| Audience | Public fan site |
| Data source | Curated JSON files in the repo, updated by hand (no scraping, no paid API) |
| Projection accuracy | Full WTA counting rules, using per-tournament results per player |
| Result entry | Pick a round per contender per event (no bracket/draw entry) |
| Editing views | Both "by tournament" and "by player", over one shared scenario |
| In-progress events | Live status tracked (eliminated / alive at round X); data updated about daily during events |
| Accounts | None |
| Sharing | Scenario encoded in the URL |
| Architecture | Static site; all logic runs in the browser |

## 3. Architecture

- **Stack:** Vite + React + TypeScript. Zod for data schema validation. Vitest for unit/component tests, Playwright for one end-to-end flow.
- **Hosting:** Static build deployed to Cloudflare Pages or Netlify (free tier) from a GitHub repo. GitHub Actions runs tests and data validation on every push; deployment only happens when they pass.
- **No backend.** Data JSON is bundled into the build at build time.

### Units

| Unit | Responsibility | Depends on |
|---|---|---|
| `data/*.json` | Season data and rules config | — |
| `src/data/schema.ts` | Zod schemas + typed loaders for the data files | data files |
| `src/engine/` | Pure functions: counting, scenario application, standings, sanity checks, tiebreaks | schema types only |
| `src/scenario/` | Scenario state, URL encode/decode, reconciliation of stale picks | engine types |
| `src/ui/` | React components: header, standings table, scenario editor tabs | engine, scenario |
| `scripts/validate.ts` | Schema check + official-total cross-check; used by `npm run validate`, CI, and the build | schema, engine |

The engine has no React or browser dependencies, so it can be tested in isolation and reused by the validation script.

## 4. Data model

All files live in `data/`.

### `rules.json`
- `season`: 2026
- `maxCountedResults`: maximum number of results counted toward the race total
- `mandatoryCategories` / mandatory-event rules: which results always count (Grand Slams, mandatory WTA 1000s)
- `pointsTables`: points per round, keyed by category and draw type (for example, a 96-draw WTA 1000 vs a 56-draw WTA 1000; 500s; 250s)
- `byeRule`: how a player with a first-round bye who loses her first match is scored
- `tiebreakers`: ordered list of tiebreak criteria
- `trackedPlayerCount`: how many players from the top of the race are tracked (default 25)

Every rule value (cap, mandatory set, bye rule, tiebreakers, points tables) **must be verified against the official 2026 WTA Rulebook during implementation** before the data is populated. None are filled in from memory.

### `tournaments.json`
Each event has: `id`, `name`, `category`, `drawType` (keys into `pointsTables`), `startDate`, `endDate`, `status` (`completed` | `in-progress` | `upcoming`). The WTA Finals itself is excluded from the editable events.

### `players.json`
Each tracked player has:
- `id`, `name`, `country` (ISO code, for the flag)
- `officialRaceTotal`: the race total as published by the WTA
- `results[]`: `{ tournamentId, round, points }` for each 2026 result, including zero-pointers for missed mandatory events
- `live[]`: for in-progress events, `{ tournamentId, state: "alive" | "eliminated", round }`
- `qualified`: boolean, set by hand when the WTA officially announces a qualification

### `meta.json`
- `lastUpdated`: ISO timestamp shown on the site

### Accuracy safeguard
`scripts/validate.ts` runs locally (`npm run validate`), in CI, and as part of the build. It:
1. Validates every file against the Zod schemas, including referential checks: each result references a real tournament, and each round is valid for that event's draw type.
2. Recomputes each player's race total with `countRace` and checks that it equals `officialRaceTotal`.

Any failure fails the build, so the previously deployed site stays live.

## 5. Rules engine (`src/engine/`)

### `countRace(results, rules) → { total, counted[], dropped[] }`
Results from mandatory events always count. The remaining slots, up to `maxCountedResults`, are filled with the best non-mandatory results. The same function powers both validation and projection.

### `applyScenario(player, picks, tournaments, rules) → Result[]`
Turns a player's picks into hypothetical results, then the caller reruns `countRace`.
- **Upcoming event, round picked:** adds a result worth that round's points.
- **In-progress event, round picked:** *replaces* the points already earned at that event. A player alive in the QF who is picked to win gets winner's points, not QF + winner.
- **In-progress event, no pick:** the player keeps her currently earned points. If she is alive, that is her current-round points.
- **"Not playing":** no result is added.
- **Zero-pointers:** projections never add new zero-pointers for skipped mandatory events, because penalties depend on WTA rulings (injury exemptions and so on). The UI states this assumption.
- **Byes:** a seeded player's first-match loss is scored per `rules.byeRule`.

### `projectStandings(players, scenario, tournaments, rules) → Row[]`
Each row has `currentRank`, `currentTotal`, `projectedTotal`, `delta`, `projectedRank`, `rankChange`, and `qualified`. Ties are broken by `rules.tiebreakers`.

### `checkScenario(scenario, players, tournaments) → Warning[]`
- **Round capacity per event:** at most 1 winner, 1 finalist, 2 semifinalists, 4 quarterfinalists, 8 in the R16, and so on, counting picks and live-alive players combined. Note that "Finalist" means lost in the final, so a single finalist is allowed.
- **Same-week conflict:** a player picked for two events whose dates overlap.
- **Live-status conflict:** a pick below the round an alive player has already reached, or any pick for an eliminated player. The UI prevents these; the check catches them when they arrive via URL.

**Known limitation:** without draw data the engine cannot catch two contenders picked to meet before the rounds picked for both. The UI notes this.

**Not computed:** mathematical clinching or elimination. Only the official `qualified` flag is shown.

## 6. UI (`src/ui/`)

The page is a single, mobile-first view.

**Header:** title, "Data updated <timestamp>", a Share button (copies the URL) and a Reset button (clears all picks).

**Standings table:**
- Columns: rank, player with flag, current points, projected points, +/- points, rank-change arrow.
- A visible cutoff line after #8; ranks 9–10 are lightly shaded as alternates; a qualified badge where flagged.
- With no picks, projected equals current, so the table is the plain current race.
- On narrow screens, current and projected points merge into one column ("4,210 → 4,860").

**Scenario editor:** two tabs over one shared scenario.
- **By tournament:** select a remaining event (in-progress events are marked LIVE), then set a dropdown per tracked player.
- **By player:** select a player, then set a dropdown per remaining event.
- **Dropdown options:** Not playing, then rounds from first round to Winner, trimmed to the event's draw type. For in-progress events, options start at the player's current round; eliminated players show a locked "Out in <round>".
- Inline warnings from `checkScenario` appear next to the affected dropdowns.
- Short footnotes cover the zero-pointer assumption and the draw-conflict limitation.

## 7. Scenario state and sharing (`src/scenario/`)

- Scenario = map of `(playerId, tournamentId) → pick`.
- Picks are encoded compactly in the URL (query string or hash), and the URL updates on every change, so refreshing keeps the picks and shared links reproduce the scenario exactly.
- **Reconciliation on load:** picks referencing unknown players or events, or picks that are no longer possible under current live status, are dropped. The remaining picks load, and a dismissible notice lists what was ignored.

## 8. Update workflow

1. Edit `data/*.json`: results, live status, official totals, the qualified flag, and `meta.lastUpdated`.
2. Run `npm run validate` locally.
3. Commit and push. CI runs tests and validation, and a passing build deploys automatically.

This happens about daily while events are in progress and after each event completes.

## 9. Testing

- **Engine unit tests (Vitest):** counting with cap and replacement, mandatory results always counting, zero-pointers, in-progress replacement vs addition, bye scoring, tiebreaks, every `checkScenario` warning type.
- **Real-data check:** `validate` asserts that the engine reproduces every tracked player's official total.
- **Scenario tests:** URL encode/decode round-trip and reconciliation of stale picks.
- **UI:** a few component tests (dropdown trimming, locked eliminated players, cutoff line).
- **E2E (Playwright):** make picks → standings update → copy share link → open link → same scenario restored.

## 10. Out of scope (v1)

Doubles; the 2027 race; bracket/draw entry; mathematical clinching; user accounts; automated scraping or a data API; an admin UI.
