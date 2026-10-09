# Qualification chances: design

Approved in conversation on 2026-10-09. This is the fourth sub-project on the roadmap, after automatic updates, player pages and tournament pages.

## Goal

Show each tracked player's chance of qualifying for the WTA Finals as a percentage. It comes from simulating the rest of the season many times, using ratings built from this season's results. The numbers refresh with every hourly data update.

## Decisions (from the user)

- **Who wins a simulated match:** a rating built from each player's results (Elo), not the WTA ranking or a coin flip.
- **Who plays which event:** the published entry lists, as already stored in `tournaments.json` (`entries`). A player not on a list doesn't play that event. No withdrawal chance and no guessed extra entries.
- **Display:** a fixed column, from real results only. The visitor's picks don't change it.
- **Fields at events without a draw:** approach C, the hybrid. Tracked entrants go into a random draw of the real size, and the other lines are generic field players.

## Ratings

- **Who is rated:** every tracked player, and every opponent they met in the race year, keyed by WTA id. The data is `data/matches/<id>.json`.
- **Starting value:** from the player's WTA ranking at her first match in the data (the opponent's `rank`, or the player's own ranking on her match records). The prior is `1500 + 400 · (1 − log₂(rank) / log₂(200))`, clamped to ranks 1–500. That's about 1,900 at rank 1 and 1,500 at rank 200. A player with no known ranking starts at the field value for the level of her first match (see below).
- **Updates:** matches are replayed in date order, using the start date of each event and then the round. A match between two tracked players appears in both files but counts once. Each match uses the standard Elo update with `K = 250 / (n + 5)^0.4`, where `n` is the player's matches so far.
  - Walkovers are skipped.
  - Retirements count as a win for the winner.
  - Qualifying matches and team-event matches count.
  - Players with no match in the data keep their starting value.
- **Surface:** one all-surface rating. Every remaining event is on hard courts.
- **Win chance:** `P(A beats B) = 1 / (1 + 10^((R_B − R_A) / 400))`.
- **Calibration check:** a test predicts each race-year match from the ratings as they stood before it. It reports the Brier score and checks that it beats a 50/50 baseline. The plan records the figure.
- **Known limit:** an untracked player's rating rests only on her matches against the tracked 40.

## Field players

- **Pool:** for each level (WTA 1000, 500, 250), the final ratings of every untracked opponent whom tracked players met in main draws at that level in the race year.
- **Sampling:** a field player's rating is a uniform draw from that pool. If a level has fewer than 20 pool entries, the pools for all three levels are combined.
- **Unrated players:** the field value for a level is the pool median. It's used for unrated players in real draws.

## Simulation

Each run plays out every event not yet completed.

1. **Events with a draw in `data/draws/`** (live, or upcoming once the draw is out): start from `buildBracket(draw)` and its actual results. Only the undecided matches are simulated. Byes, played results, walkovers and retirements stand.
2. **Events without a draw:**
   - **Size:** the bracket has `2^⌈log₂ n⌉` lines, where `n` is the draw size from the points table (e.g. 56 → 64 lines, 8 byes).
   - **Seeds:** the seed count is 16 for draws over 32 players and 8 otherwise. The tracked entrants, ordered by their latest WTA ranking from their match files, take seed places in order. Byes go to the top seeds.
   - **Seed positions:**
     - seed 1 at the top line, seed 2 at the bottom;
     - seeds 3–4 at random to the remaining half-ends;
     - seeds 5–8 at random to the remaining quarter-ends;
     - seeds 9–16 at random to the remaining eighth-ends.
   - **Everyone else:** remaining tracked entrants, then field players, fill the empty lines at random.
3. **Matches:** each is decided by the win chance. Ratings don't change during a run.
4. **Scoring:**
   - Every tracked player at a simulated event gets a scenario pick: the round code she finished in, the champion's code for the winner.
   - The existing `projectStandings` decides who qualifies, including tiebreakers, the Grand Slam champion place and the event minimum.
   - **Her chance** is the share of runs in which `projectedQualifier !== null`.
5. **Runs and seed:** 10,000 runs with a seeded PRNG (mulberry32, fixed seed), so the same data gives the same numbers. The error is under one percentage point. The target is under about 15 seconds of build time; if a full run is slower, the run count drops and the plan records the change.

## Display

- **Exact results win:** clinched players show **Q** and eliminated players show **—**, from the existing clinch and elimination checks. Everyone else shows a whole-number percentage, with simulated values above 99.5% shown as **>99%** and below 0.5% as **<1%**.
- **Desktop:** a **"Chance"** column after Max. Its header tooltip: "Chance to qualify, from 10,000 simulated finishes to the season using real results only. Your picks don't change it."
- **Expanded row (all widths):** "Chance to qualify: 87%" at the top, above the outlook panel. Phones see the chance only here.
- **Footnote under the table:** "Chances come from simulating the remaining events with ratings built from this season's results."
- **Missing chances:** if the chances are missing (simulation failed), the column, line and footnote are left out.

## Data flow and structure

- **`src/sim/`** holds pure modules, each with tests:
  - `ratings.ts`: priors, replay, win chance, calibration helper;
  - `field.ts`: field pools and sampling;
  - `drawSim.ts`: a draw for events without one, and bracket simulation for both kinds of event;
  - `chances.ts`: `simulateChances(season, matches, draws, { runs, seed }) → Record<playerId, number>`.
- **`scripts/prerender.ts`** loads match files and draws, runs `simulateChances`, and embeds `chances` in the homepage's data. It times the run and logs it. A thrown error logs a warning and the chances are left out.
- **Dev server:** the homepage computes chances in the browser with 1,000 runs, from the dev-only data imports.
- **Homepage hydration:** the chances are part of the embedded data, so the first render matches the prerendered HTML.

## Error handling

- **No entry list for an upcoming event:** no tracked player plays it.
- **A draw that `buildBracket` can't read:** the event is simulated as if it had no draw.
- **A tracked player with no match file:** she's rated from the field value of the level of her first counted result, falling back to the WTA 500 field.
- **A tracked player with no known WTA ranking:** in seeding, she goes after the ranked ones.

## Testing

- **Ratings:**
  - starting values from rank;
  - replay order, and shared matches counted once;
  - K decay;
  - walkovers skipped and retirements counted;
  - the win-chance formula;
  - on real data, the Brier score beats 50/50.
- **Field:** pools per level, the fallback to combined pools, and the median.
- **Draws:** 56, 28 and 32 sizes with the right byes; seed positions; top seeds get the byes; deterministic for a given seed.
- **Simulator,** on a small hand-made season with a fixed seed:
  - a much higher-rated player wins more often;
  - a player with no events left gets the same answer every run;
  - two tracked players in one draw never both get the champion's code;
  - played results in a real draw are never re-decided.
- **Real data:** a full run finishes within the budget; every value is between 0 and 1; clinched players are above 99% and eliminated players are 0%.
- **UI:**
  - formatting (Q, —, >99%, <1%, 87%);
  - the column on desktop and the expanded-row line;
  - leaving it all out when there are no chances;
  - hydration with chances embedded.
- **End-to-end:** the built homepage shows the Chance column, and an expanded row shows the line.

## Out of scope

- Chances that follow the visitor's picks (a possible later addition).
- Surface-specific ratings.
- Withdrawal chances and guessed entries.
- Simulating qualifying draws.
- Chances on player or tournament pages.
