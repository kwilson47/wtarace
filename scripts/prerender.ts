// Prerenders the built site: the homepage, one season page per tracked player (with her matches
// embedded), and the sitemap. Runs after `vite build`; reads the built HTML templates from dist/.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { season } from '../src/data/season';
import { homeHtml, playerHtml, sitemapXml } from '../src/prerender/pages';
import { readMatchFiles } from '../src/update/writeData';

const dist = new URL('../dist/', import.meta.url).pathname;
const started = Date.now();
const homeTemplate = readFileSync(`${dist}index.html`, 'utf8');
const playerTemplate = readFileSync(`${dist}player.html`, 'utf8');
writeFileSync(`${dist}index.html`, homeHtml(homeTemplate, season));

const matches = readMatchFiles(new URL('../data/', import.meta.url).pathname);
for (const p of season.players) {
  mkdirSync(`${dist}players/${p.id}`, { recursive: true });
  writeFileSync(`${dist}players/${p.id}/index.html`, playerHtml(playerTemplate, season, p.id, matches[p.id] ?? null));
}
rmSync(`${dist}player.html`); // the template itself is not a page
writeFileSync(`${dist}sitemap.xml`, sitemapXml(season));
console.log(`Prerendered the homepage and ${season.players.length} player pages in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
