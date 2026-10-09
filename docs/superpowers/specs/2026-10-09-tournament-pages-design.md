# Tournament pages: design

Approved in conversation on 2026-10-09. This is the third of four sub-projects; the last is qualification percentages. It's delivered in two phases, each with its own plan:
1. tournament pages with every draw, read-only;
2. the bracket picker.

## Goal

Every tracked WTA event gets a page at `finalsrace.win/tournaments/<tournament id>/`. The page shows:
- the event and its draw;
- what it means for the race;
- for live and upcoming events (phase 2), a bracket picker that feeds the site's shared scenario.

## Decisions (from the user)

- **Scope:** all 51 tracked race-year events. Expanding to every ranked player and every event is for 2027.
- **Draw layout:**
  - **Completed events:** the full bracket, so visitors can see the whole tournament. It scrolls sideways on narrow screens.
  - **Live events, and upcoming events once the draw is out:** a quarterfinals-onward bracket, with collapsible lists for earlier rounds. This is where picking happens.
- **Picks:** one shared scenario. Bracket picks join the homepage scenario.
- **Player page links:** tournament headings on player pages link to the tournament page, when it's a tracked event.

## Pages

### `/tournaments/<id>/`, e.g. `/tournaments/beijing-2026/`

1. **Header:**
   - name, level, surface (indoor or outdoor) and dates;
   - status: Completed, In progress or Upcoming;
   - draw size;
   - for completed events, "Champion: X · Runner-up: Y";
   - "← Full standings".
2. **Our players at this event.** One row per tracked player who entered or played. Each row shows her result or current round, and the race points it's worth, linked to her player page. Before the draw is made, this lists the tracked players on the entry list.
3. **Draw:**
   - **Completed:** the full bracket, one column per round from the first round to the champion. Each match shows both players (flag, name, seed or entry tag), with the winner marked and the score. On phones the bracket scrolls sideways, and the round headers stay visible.
   - **In progress, or upcoming with the draw out:**
     - a bracket from the quarterfinals to the final, which fits a phone;
     - below it, one collapsible list per earlier round (latest first, all collapsed except the current round), showing each match's players and the score or "vs";
     - undecided matches are shown as such.
   - **Upcoming without a draw:** "The draw hasn't been made yet." The tracked entrants are listed in section 2.
4. **Links:**
   - players link to their pages;
   - phase 2: "See the standings with these picks" goes to the homepage with the same scenario.

### Links into tournament pages

- **Player pages:** each tournament heading links to `/tournaments/<id>/` when the match records' `tournamentId` and `year` match a tracked tournament's `wtaId` and year.
- **Homepage:** the scenario editor's By tournament tab gets a "Tournament page →" link for the selected event.
- **Sitemap:** lists every tournament page.
- **Dev server:** serves `/tournaments/<id>/` as it already does for `/players/<id>/`.

## Data: `data/draws/<tournament id>.json`

Published fact, like match data. It's never checked against totals and never blocks an update.

```
{
  drawSize: number,          // players in the main draw (byes not counted)
  players: [                 // draw order, from the event's players feed (LS)
    { wtaId, name, country (ISO or null), seed (number or null), entry (Q/WC/LL/SE/PR/Alt or null) }
  ],
  matches: [                 // main-draw singles, from the event's matches feed
    { round: number,         // 1, 2, … from the first round
      a: wtaId | null, b: wtaId | null,
      winner: wtaId | null,  // null until played
      score: string,         // winner-first, as published; '' if unplayed or a walkover
      outcome: 'played' | 'retired' | 'walkover' | 'scheduled' }
  ]
}
```

- **Bracket structure.** Built from the draw order. The bracket has `2^⌈log2(drawSize)⌉` slots. Walking the draw order, a player with no first-round match while the first round exists has a bye, and takes a whole first-round pair; everyone else takes one slot. Later rounds pair the previous round's slots. This was checked against Toronto 2026: 96 players, seeds' byes at positions 1 and 6, and first-round pairs (2,3), (4,5), (8,9).
- **Round numbering.** Letter rounds in the feed map to numbers (`Q` is the quarterfinal round's number, then `S`, then `F`), using the event's points table.
- **Updater (`scripts/update.ts`):**
  - writes the draw file for every event that isn't completed, whenever its feeds change;
  - writes completed events once, if the file is missing;
  - refreshes an event finally in the run that credits it.

  A failed fetch keeps the previous file, with a note.
- **First fill:** the updater, run once, fetches all 51 events.
- **Validation:** `npm run validate` schema-checks the draw files.

## Phase 2: the bracket picker (separate plan)

Agreed in conversation on 2026-10-09.

### Where picking happens

On live events, and on upcoming events whose draw is out. Completed events stay read-only.

### Picking

- **Clicking a player** in an undecided match makes her the winner:
  - her pick becomes the next round;
  - her opponent's pick becomes this round (out here).

  Clicking the current winner again clears both picks.
- **Played matches are fixed.**
- **A match still waiting on an earlier result** shows "—" until that's decided. This applies to an actual result or a pick.
- **The earlier-round lists are pickable** for rounds that aren't fully played.
- **Picking a winner keeps any deeper pick she already has.** The loser is set to "out here", which clears whatever later picks depended on her.
- **A conflict** is two entrants both picked past the same match, e.g. from homepage picks. The match is outlined and neither advances.

### One scenario

- **Tracked players** use their ids (`iga-swiatek.wuhan-2026.SF`).
- **Untracked players** use `w<wtaId>` (`w317964.wuhan-2026.F`), in the existing `?s=` format. The race engine and the homepage editor ignore keys that aren't tracked player ids.
- **Reconciliation** keeps a `w<digits>` key when its tournament exists, isn't completed, and the round is in that event's points table. The homepage has no draws loaded, so draw membership isn't checked; the bracket simply ignores keys for players not in the draw.
- **Homepage picks** for tracked players appear in the bracket.

### The race impact panel

Beside the bracket on desktop, below it on phones. It shows:
- the race top 10 under the current scenario: rank, name (linked), projected points with the change from today, rank movement, and the qualifiers highlighted, with the cutoff line and the Grand Slam champion badge;
- "Full standings with these picks →", to the homepage with the same `?s=` (or `/` when there are no picks);
- **Share these picks**, which copies the link;
- **Clear picks for this event**, which removes every key for this tournament.

The page reads and writes `?s=` with the same `useScenario` as the homepage, so its links are shareable.

## Structure (phase 1)

- **`src/draws/`:**
  - `drawSchema.ts` (types and schema);
  - `bracket.ts`, which builds the bracket and finds the champion and runner-up;
  - tests.
- **`src/update/draws.ts`:** turns a feed into a draw file, plus the updater stage. Read and write helpers go in `writeData.ts`.
- **`src/ui/TournamentPage.tsx`,** with `Bracket`, `RoundList` and `OurPlayers`. Plus `tournament.html` and `entry-tournament.tsx`.
- **Prerender:** builds one tournament page per tracked event, embedding its draw. Its sitemap and dev routing are extended as above.
- **`PlayerPage` link:** tournament headings become links.

## Testing (phase 1)

- **Bracket building:**
  - byes (Toronto-style 96 draws, 56, 48 and 28 draws, and a 32 draw without byes);
  - later rounds pairing;
  - finding the champion and runner-up;
  - an in-progress draw with scheduled matches.
- **Feed to draw file:**
  - sides and winners, including retirement and walkover codes;
  - scores;
  - letter round ids;
  - a failed feed keeps the previous file.
- **`TournamentPage`:**
  - completed (full bracket, champion line);
  - in progress (QF bracket plus round lists, undecided matches);
  - upcoming without a draw;
  - our players' rows and links.
- **Hydration** for a tournament page, and **prerender** title, description and sitemap.
- **End-to-end:**
  - from a player page's tournament heading to the tournament page;
  - from a tournament page's player to her page;
  - the homepage editor's link.

## Out of scope

- Untracked events (WTA 125, ITF, team events).
- Qualifying draws.
- Doubles.
- Head-to-head.
- Untracked players' own pages.
