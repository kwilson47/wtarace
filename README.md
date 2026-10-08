# Race to the WTA Finals 2026 — projector

A static site showing the 2026 Race to the WTA Finals (singles). Fans can project the final top 8 by picking results for the remaining tournaments. Scenarios are shared by URL.

Design: `docs/superpowers/specs/2026-10-07-wta-finals-race-design.md`

## Develop

```bash
nvm use            # Node 24
npm install
npm run dev
npm test           # unit + component tests
npm run test:e2e   # Playwright
```

## Updating the data (about daily during events)

1. Edit `data/*.json`: results, `live` status, `officialRaceTotal`, `qualified`, and `meta.json` → `lastUpdated` (UTC).
   - In-progress event: keep a `results` entry with the points the official race currently credits (which may be 0 until the WTA posts them; projections automatically credit the live round's points until then), and a `live` entry (`alive` + current round, or `eliminated` + round lost). Refresh the points once the WTA posts them; the projection keeps whichever is higher.
   - When an event finishes: set its `status` to `completed` and remove the `live` entries for it.
   - When a draw comes out: fill that tournament's `byes` with tracked player ids.
   - When an upcoming event's entry list is published or changes: set its `entries` to the tracked player ids on it (main draw or qualifying), from `https://api.wtatennis.com/tennis/tournaments/{id}/{year}/players`. An empty list means none of them entered; leave the field out until a list is published. It only affects how the scenario editor orders and tags players.
   - While an event is in progress: set its `drawSize` and give each alive tracked player's `live` entry a `drawPosition`, both from the draw order in `https://api.wtatennis.com/tennis/tournaments/{id}/{year}/players` (1-based). The qualification check uses them to know who can meet whom; without them it is more cautious and may show Q later.
2. `npm run validate`. It must print `Data OK`. Never change an `officialRaceTotal` to make it pass. A mismatch means a data or rules error.
3. Commit and push. CI runs every check and deploys only if they all pass. A failing push leaves the live site unchanged.

Data rules to keep in mind:
- Tournament `name`s are short, the way the WTA lists events: the city for most events (`Wuhan`, `Toronto`), and the usual short names for the Slams (`Australian Open`, `French Open`, `Wimbledon`, `US Open`).
- Tournament categories are `GS`, `WTA1000C` (combined), `WTA1000` (WTA-only), `WTA500`, `WTA250`, `WTA125` and `ITF`. The counting groups, tiebreakers and qualification rules live in `data/rules.json`.
- Zero-pointers: store only those the WTA counts. Where the official event count shows a zero-pointer whose event isn't published, use a labelled placeholder tournament (`zp-<category>-<n>`) and document it per player in `data/SOURCES.md`.
- `results` must list every WTA 1000 and 500 event a player played, because the 8-event Finals minimum is computed from them. Set `eventMinimumWaived` only on a WTA-announced long-term-injury exemption.

Rule values and their sources are recorded in `data/SOURCES.md`.

## Deployment setup (one-time)

1. In Cloudflare, create a Pages project named `wta-race` (Direct Upload).
2. Create an API token with the "Cloudflare Pages: Edit" permission.
3. In the GitHub repo settings → Secrets → Actions, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
