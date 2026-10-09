// Prerenders the built site: the homepage, one page per tracked player (with her chances worked out
// now), and the sitemap. Runs after `vite build`; reads the built HTML templates from dist/.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { season } from '../src/data/season';
import { playerOutlook } from '../src/engine/outlook';
import { projectStandings } from '../src/engine/standings';
import { homeHtml, playerHtml, sitemapXml } from '../src/prerender/pages';

const dist = new URL('../dist/', import.meta.url).pathname;
const started = Date.now();
const homeTemplate = readFileSync(`${dist}index.html`, 'utf8');
const playerTemplate = readFileSync(`${dist}player.html`, 'utf8');
writeFileSync(`${dist}index.html`, homeHtml(homeTemplate, season));

const ranks = new Map(projectStandings(season.players, {}, season.tournaments, season.rules).map((r) => [r.playerId, r.currentRank]));
for (const p of season.players) {
  const outlook = playerOutlook(p.id, season.players, season.tournaments, season.rules);
  mkdirSync(`${dist}players/${p.id}`, { recursive: true });
  writeFileSync(`${dist}players/${p.id}/index.html`, playerHtml(playerTemplate, season, p.id, outlook, ranks.get(p.id)!));
}
rmSync(`${dist}player.html`); // the template itself is not a page
writeFileSync(`${dist}sitemap.xml`, sitemapXml(season));
console.log(`Prerendered the homepage and ${season.players.length} player pages in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
