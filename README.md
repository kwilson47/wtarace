# Race to the WTA Finals 2026 — projector

A static site showing the 2026 Race to the WTA Finals (singles). Fans can project the final top 8 by picking results for the remaining tournaments. Scenarios are shared by URL.

Design: `docs/superpowers/specs/2026-10-07-wta-finals-race-design.md`

## Develop

```bash
nvm use            # Node 24
npm install
npm run dev
npm test           # unit + component tests
npm run test:e2e   # Playwright, against the built site: run `npm run build` first
```

`npm run dev` serves the homepage, each player's season page at `/players/<player id>/` and each tournament page at `/tournaments/<tournament id>/`, the same addresses as the built site. `npm run preview` serves the last `npm run build` exactly as it deploys. `npm run build` prerenders the real pages into `dist/` via `scripts/prerender.ts`: the homepage, and `players/<id>/index.html` for every tracked player. Each player page shows her season from `data/matches/<id>.json`: record, splits, and every tournament round by round.

## Updating the data

**Automatic (normal case).** The `Update data` workflow (`.github/workflows/update.yml`) runs every hour. It reads the official WTA feeds and refreshes:
- race totals;
- every tracked player's match results (`data/matches/`) and every tracked event's draw (`data/draws/`); see `data/SOURCES.md`;
- live rounds, draw sizes, draw positions and byes at events under way;
- entry lists;
- crediting finished events once the WTA posts their points;
- new players entering the race top 40.

If every official total still reproduces and all checks pass, it commits (as `github-actions[bot]`, with one line per change) and deploys.

- Run it now: GitHub → Actions → Update data → Run workflow (or `gh workflow run update.yml`).
- Try it locally without writing anything: `npm run update -- --dry-run`.
- If it can't reconcile something, it publishes nothing and opens a `data-update` issue explaining why. A typical case is a new player with an unexplained zero-pointer. Fix the data by hand as below, with sources in `data/SOURCES.md`, and push. The issue closes itself after the next successful run.
- It never changes stored results at completed events, zero-pointers, `qualified` flags or rules (other than `trackedPlayerCount`, which only grows).

**By hand (judgement calls, or when the updater is blocked):**

1. Edit `data/*.json`: results, `live` status, `officialRaceTotal`, `qualified`, and `meta.json` → `lastUpdated` (UTC).
   - In-progress event: keep a `results` entry with the points the official race currently credits (which may be 0 until the WTA posts them; projections automatically credit the live round's points until then), and a `live` entry (`alive` + current round, or `eliminated` + round lost). Refresh the points once the WTA posts them; the projection keeps whichever is higher.
   - When an event finishes: set its `status` to `completed` and remove the `live` entries for it.
   - When a draw comes out: fill that tournament's `byes` with tracked player ids.
   - When an upcoming event's entry list is published or changes: set its `entries` to the tracked player ids on it (main draw or qualifying), from `https://api.wtatennis.com/tennis/tournaments/{id}/{year}/players`. An empty list means none of them entered; leave the field out until a list is published. It only affects how the scenario editor orders and tags players.
   - While an event is in progress: set its `drawSize` and give each alive tracked player's `live` entry a `drawPosition`, both from the draw order in `https://api.wtatennis.com/tennis/tournaments/{id}/{year}/players` (1-based). The qualification check uses them to know who can meet whom; without them it is more cautious and may show Q later.
2. `npm run validate`. It must print `Data OK`. It also checks the match and draw files. Never change an `officialRaceTotal` to make it pass. A mismatch means a data or rules error.
3. Commit and push. CI runs every check and deploys only if they all pass. A failing push leaves the live site unchanged.

Data rules to keep in mind:
- Tournament `name`s are short, the way the WTA lists events: the city for most events (`Wuhan`, `Toronto`), and the usual short names for the Slams (`Australian Open`, `French Open`, `Wimbledon`, `US Open`).
- Tournament categories are `GS`, `WTA1000C` (combined), `WTA1000` (WTA-only), `WTA500`, `WTA250`, `WTA125` and `ITF`. The counting groups, tiebreakers and qualification rules live in `data/rules.json`.
- Zero-pointers: store only those the WTA counts. Where the official event count shows a zero-pointer whose event isn't published, use a labelled placeholder tournament (`zp-<category>-<n>`) and document it per player in `data/SOURCES.md`.
- `results` must list every WTA 1000 and 500 event a player played, because the 8-event Finals minimum is computed from them. Set `eventMinimumWaived` only on a WTA-announced long-term-injury exemption.

Rule values and their sources are recorded in `data/SOURCES.md`.

## Search and link previews

`index.html` holds the page title, description, canonical URL and link-preview tags. At build time its static intro is replaced by the prerendered homepage. Each player page gets its own title ("<Name>: 2026 season results"), description (her record and titles), canonical URL and link-preview tags. `public/` holds `robots.txt`, the favicon and `og.png`, the link-preview image. Regenerate the image with `node scripts/og-image.mjs` after editing `scripts/og-image.html`. `scripts/prerender.ts` writes `sitemap.xml` (the homepage and every player page, dated from `data/meta.json`), and gives each player page its own title, description (her standing and what she needs), canonical URL and link-preview tags. `public/_headers` keeps the `pages.dev` copies out of search results.

## Deployment setup (one-time)

1. In Cloudflare, create a Pages project named `wta-race` (Direct Upload).
2. Create an API token with the "Cloudflare Pages: Edit" permission.
3. In the GitHub repo settings → Secrets → Actions, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
