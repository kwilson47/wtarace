# Expected zero-pointers: design

Approved in conversation on 2026-10-12.

## Goal

When a WTA 1000 or Grand Slam is under way, a tracked player who was committed to it but isn't playing will get a zero-pointer once the WTA credits the event. That is almost certain. So:
1. **Projections** (the Projected column, the chances simulation and her breakdown) include it now, marked as expected.
2. **When the WTA credits the event,** the updater adds it to her results itself, if the official figures confirm it. Before this, every such case blocked the hourly update until it was added by hand, as Beijing's seven did on 2026-10-12.

## Decisions (from the user)

All four parts:
- the commitment test below;
- Long-Term Injury exemptions recorded in the data;
- expected zero-pointers in projections only;
- automatic zero-pointers when the event is credited.

The official Current column, Q (clinched) and Out (eliminated) keep using official results only, so Q and Out still never appear before they're true.

## Who is committed

The rule is §II.A (p.9): a player must play a WTA 1000 if she is accepted, or would have been, into the main draw as a direct acceptance at the entry deadline. Grand Slams work the same way through §VIII.A.4.a.i(a).

- **Entry deadline:** 4 weeks before the Monday of the event's first week (§III, p.25; the same for Grand Slams at 6 weeks).
- **Her ranking at the deadline:** the WTA singles ranking feed with a date (`players/ranked?…&metric=SINGLES&at=<deadline>`), paged until every tracked player is found or the list ends.
- **Direct-entry places:** the draw size minus the lines that aren't direct acceptances. That means players with an entry type (Q, WC, LL, SE, PR) and open qualifier lines.
- **Committed** means her ranking at the deadline is no worse than the number of direct-entry places.

**Validation:** on Beijing 2026 this predicts exactly the seven stored zero-pointers, plus Mboko and Baptiste. Those two are on a Long-Term Injury, below.

## Expected zero-pointer

A tracked player has an expected zero-pointer at an event when all of these hold:
- the event is a Grand Slam or WTA 1000 (combined or not; `GS`, `WTA1000C`, `WTA1000`);
- the event is in progress, or finished but not yet credited, and its draw is known;
- she's committed (above);
- she's not in the main draw;
- she has no result there;
- she's not exempt.

**Exempt:**
- a Long-Term Injury covering the event, for WTA 1000s only (Grand Slam zero-pointers still count, §VIII.A.4.a.ii(c));
- the under-17 and 17-year-old age rules. No tracked player is affected, so no data is kept for this; it's listed so the rule is complete.

## Data

- **`players.json`:** an optional `longTermInjury: { from: "YYYY-MM-DD", to?: "YYYY-MM-DD" }` per player, with the source in `data/SOURCES.md`. It's set for **Mboko** (from about 2026-06-10, T-USO and her table note) and **Baptiste** (from Roland Garros 2026, TT-BAPTISTE).
- **`tournaments.json`:** an optional `commitment: { deadline: "YYYY-MM-DD", committed: string[] }` per WTA 1000 or Grand Slam. It lists the tracked players who were committed. The updater fills it once, when the event's draw is first known; the field records the evidence. Events already completed don't get it.

## Engine

- **`expectedZeroPointers(season)`** returns a list of `{ playerId, tournamentId }`, using the rules above with the stored `commitment` and the draws' presence data. The data needs one more piece for this: whether she's in the draw, which is her `live` entry at that event. A tracked player in the draw has a live state, and one not in it has none.
- **Projections:** `projectStandings` treats each expected zero-pointer as a result `{ round: 'ZP', points: 0 }`, flagged as expected. This flows into Projected, the rank change, the chances simulation and the breakdown. The breakdown shows it as "Wuhan · zero-pointer (expected)".
- **Unchanged:** the Current column, the clinch check, the elimination check and the outlook search.

## Updater

1. **When a WTA 1000 or Grand Slam's draw is first known** (in progress or upcoming with a draw): if the event has no `commitment` yet, fetch the ranking list at its deadline and store `commitment`. A failed fetch adds a note and retries the next run; it never blocks.
2. **Crediting** (`creditFinished`): when trying to credit an event, add `{ tournamentId, round: 'ZP', points: 0 }` for each player with an expected zero-pointer there, but only for those whose official event count (`tournamentsPlayed` in the race feed) is one higher than her stored count. The stored count is her completed results plus zero-pointers, excluding events still in progress. Then the existing all-or-nothing check runs: every total must reproduce.
   - **If it doesn't,** nothing is credited and the run stops for a human, as now.
   - **Each automatic zero-pointer** is listed in the commit message: "Beijing: zero-pointer for Jessica Pegula (committed, #3 at the 2026-08-31 deadline; withdrew)".
3. **SOURCES.md** notes the rule once. Automatic zero-pointers cite the WTA's own event count and ranking at the deadline, so they need no hand-written source.

## Testing

- **The commitment test:**
  - the deadline date;
  - the number of direct-entry places from a draw with Q, WC and LL lines and open lines;
  - a ranking at or below the cut is committed, one above it isn't.
- **Expected zero-pointers:**
  - a committed player not in the draw gets one;
  - a player in the draw, in qualifying, or with a result there gets none;
  - Long-Term Injury exempts a WTA 1000 but not a Grand Slam;
  - only GS and WTA 1000 events count.
- **Projections:**
  - Andreeva's case: 19 results, so the expected zero-pointer pushes out a result;
  - Current and Q/Out are unchanged;
  - the breakdown labels it "expected".
- **Crediting:**
  - Beijing-like: zero-pointers are added automatically when counts rise by one;
  - a player whose count didn't rise gets none;
  - a mismatch still blocks.
- **Real data:** Beijing's prediction matches the stored zero-pointers. For Wuhan, the expected set is listed in the plan.

## Out of scope

- WTA 500 commitment shortfalls (not tied to one event).
- Players we don't track.
- Changing the official Current column.
