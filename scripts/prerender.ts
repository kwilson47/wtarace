// Prerenders the built site: the homepage, one season page per tracked player (with her matches
// embedded), and the sitemap. Runs after `vite build`; reads the built HTML templates from dist/.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { season } from '../src/data/season';
import { homeHtml, playerHtml, sitemapXml, tournamentHtml } from '../src/prerender/pages';
import { FULL_RUNS, SEED, simulateChances } from '../src/sim/chances';
import { readDrawFiles, readMatchFiles } from '../src/update/writeData';

const dist = new URL('../dist/', import.meta.url).pathname;
const started = Date.now();
const homeTemplate = readFileSync(`${dist}index.html`, 'utf8');
const playerTemplate = readFileSync(`${dist}player.html`, 'utf8');
const dataDir = new URL('../data/', import.meta.url).pathname;
const matches = readMatchFiles(dataDir);
const draws = readDrawFiles(dataDir);
let chances: Record<string, number> | null = null;
const simStarted = Date.now();
try {
  chances = simulateChances(season, matches, draws, { runs: FULL_RUNS, seed: SEED });
  console.log(`Simulated ${FULL_RUNS.toLocaleString('en-US')} season finishes in ${((Date.now() - simStarted) / 1000).toFixed(1)}s.`);
} catch (error) {
  console.warn(`Chances left out: the simulation failed (${error instanceof Error ? error.message : String(error)}).`);
}
writeFileSync(`${dist}index.html`, homeHtml(homeTemplate, season, chances));

for (const p of season.players) {
  mkdirSync(`${dist}players/${p.id}`, { recursive: true });
  writeFileSync(`${dist}players/${p.id}/index.html`, playerHtml(playerTemplate, season, p.id, matches[p.id] ?? null));
}
const tournamentTemplate = readFileSync(`${dist}tournament.html`, 'utf8');
const tracked = season.tournaments.filter((t) => !t.id.startsWith('zp-')); // placeholders aren't events
for (const t of tracked) {
  mkdirSync(`${dist}tournaments/${t.id}`, { recursive: true });
  writeFileSync(`${dist}tournaments/${t.id}/index.html`, tournamentHtml(tournamentTemplate, season, t.id, draws[t.id] ?? null));
}
rmSync(`${dist}player.html`); // the templates themselves are not pages
rmSync(`${dist}tournament.html`);
writeFileSync(`${dist}sitemap.xml`, sitemapXml(season));
console.log(`Prerendered the homepage, ${season.players.length} player pages and ${tracked.length} tournament pages in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
