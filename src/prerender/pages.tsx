import { renderToString } from 'react-dom/server';
import type { Season } from '../data/schema';
import type { MatchRecord } from '../season/matchSchema';
import { seasonSummary, type SeasonSummary } from '../season/seasonSummary';
import { App } from '../ui/App';
import { buildBracket, finalists } from '../draws/bracket';
import type { DrawFile } from '../draws/drawSchema';
import { categoryLabel } from '../ui/format';
import { PlayerPage } from '../ui/PlayerPage';
import { TournamentPage } from '../ui/TournamentPage';

export const SITE = 'https://finalsrace.win';
const START = '<!--app-start-->';
const END = '<!--app-end-->';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Puts the rendered app between the template's markers and flags the root for hydration. */
function fillRoot(template: string, app: string): string {
  const start = template.indexOf(START);
  const end = template.indexOf(END);
  if (start < 0 || end < start) throw new Error('The page template is missing the <!--app-start--> / <!--app-end--> markers.');
  return (template.slice(0, start) + app + template.slice(end + END.length)).replace('<div id="root">', '<div id="root" data-ssr="">');
}

export function homeHtml(template: string, season: Season): string {
  return fillRoot(template, renderToString(<App season={season} />));
}

/** "Iga Swiatek's 2026 season: 48–15, 2 titles (Toronto, Doha), 3 finals. Every match, round by round." */
export function seasonDescription(name: string, year: number, summary: SeasonSummary | null): string {
  if (!summary) return `${name}'s ${year} season, match by match.`;
  const parts = [`${summary.wins}–${summary.losses}`];
  if (summary.titles.length) parts.push(`${summary.titles.length} title${summary.titles.length === 1 ? '' : 's'} (${summary.titles.join(', ')})`);
  if (summary.finals) parts.push(`${summary.finals} final${summary.finals === 1 ? '' : 's'}`);
  return `${name}'s ${year} season: ${parts.join(', ')}. Every match, round by round.`;
}

/** Head tags shared by player and tournament pages. */
function headTags(title: string, description: string, url: string, type: string): string {
  return [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="${type}" />`,
    '<meta property="og:site_name" content="Finals Race" />',
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:image" content="${SITE}/og.png" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${escapeHtml(title)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
  ].join('\n    ');
}

/** Fills a page template: the rendered app, the head tags and the embedded page data. */
function fillPage(template: string, app: string, head: string, data: unknown): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  // Function replacements, so a "$" in the data can't be read as a replacement pattern.
  return fillRoot(template, app)
    .replace('<!--head-->', () => head)
    .replace('<!--data-->', () => `<script id="page-data" type="application/json">${json}</script>`);
}

export function playerHtml(template: string, season: Season, playerId: string, matches: MatchRecord[] | null): string {
  const player = season.players.find((p) => p.id === playerId)!;
  const title = `${player.name}: ${season.rules.season} season results`;
  const summary = matches ? seasonSummary(matches, season.meta.lastUpdated.slice(0, 10)) : null;
  const description = seasonDescription(player.name, season.rules.season, summary);
  return fillPage(
    template,
    renderToString(<PlayerPage season={season} playerId={playerId} matches={matches} />),
    headTags(title, description, `${SITE}/players/${playerId}/`, 'profile'),
    { playerId, matches },
  );
}

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Iga Swiatek won Toronto 2026 (WTA 1000), beating Elena Rybakina 6-2 6-3 in the final. Full draw and results." */
export function tournamentDescription(season: Season, tournamentId: string, draw: DrawFile | null): string {
  const t = season.tournaments.find((x) => x.id === tournamentId)!;
  const name = `${t.name} ${t.startDate.slice(0, 4)}`;
  const level = categoryLabel(t.category);
  const bracket = draw ? buildBracket(draw) : null;
  const final = bracket ? finalists(bracket) : null;
  const who = (id: number | null) => draw?.players.find((p) => p.wtaId === id)?.name;
  if (t.status === 'completed' && final?.champion != null && who(final.champion)) {
    return `${who(final.champion)} won ${name} (${level}), beating ${who(final.runnerUp) ?? 'her opponent'}${final.score ? ` ${final.score}` : ''} in the final. Full draw and results.`;
  }
  if (t.status === 'completed') return `${name} (${level}): results and our players.`;
  if (t.status === 'in-progress') return `${name} (${level}) is under way. The draw, results and where our players stand.`;
  return `${name} (${level}) starts ${day.format(new Date(`${t.startDate}T00:00:00Z`))}. Draw and entry list.`;
}

export function tournamentHtml(template: string, season: Season, tournamentId: string, draw: DrawFile | null): string {
  const t = season.tournaments.find((x) => x.id === tournamentId)!;
  return fillPage(
    template,
    renderToString(<TournamentPage season={season} tournamentId={tournamentId} draw={draw} />),
    headTags(`${t.name} ${t.startDate.slice(0, 4)}: draw and results`, tournamentDescription(season, tournamentId, draw), `${SITE}/tournaments/${tournamentId}/`, 'website'),
    { tournamentId, draw },
  );
}

export function sitemapXml(season: Season): string {
  const lastmod = season.meta.lastUpdated.slice(0, 10);
  const urls = ['/', ...season.players.map((p) => `/players/${p.id}/`), ...season.tournaments.filter((t) => !t.id.startsWith('zp-')).map((t) => `/tournaments/${t.id}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${SITE}${u}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n  </url>`).join('\n')}
</urlset>
`;
}
