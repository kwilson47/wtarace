// Prerenders the built site: the homepage, one season page per tracked player (with her matches
// embedded), and the sitemap. Runs after `vite build`; reads the built HTML templates from dist/.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { season } from '../src/data/season';
import { homeHtml, playerHtml, sitemapXml, tournamentHtml } from '../src/prerender/pages';
import { readDrawFiles, readMatchFiles } from '../src/update/writeData';

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
const tournamentTemplate = readFileSync(`${dist}tournament.html`, 'utf8');
const draws = readDrawFiles(new URL('../data/', import.meta.url).pathname);
const tracked = season.tournaments.filter((t) => !t.id.startsWith('zp-')); // placeholders aren't events
for (const t of tracked) {
  mkdirSync(`${dist}tournaments/${t.id}`, { recursive: true });
  writeFileSync(`${dist}tournaments/${t.id}/index.html`, tournamentHtml(tournamentTemplate, season, t.id, draws[t.id] ?? null));
}
rmSync(`${dist}player.html`); // the templates themselves are not pages
rmSync(`${dist}tournament.html`);
writeFileSync(`${dist}sitemap.xml`, sitemapXml(season));
console.log(`Prerendered the homepage, ${season.players.length} player pages and ${tracked.length} tournament pages in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
