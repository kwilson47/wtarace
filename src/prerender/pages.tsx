import { renderToString } from 'react-dom/server';
import type { Season } from '../data/schema';
import type { Outlook } from '../engine/outlook';
import { App } from '../ui/App';
import { PlayerPage } from '../ui/PlayerPage';
import { playerSummary } from '../ui/playerSummary';

export const SITE = 'https://finalsrace.win';
const START = '<!--app-start-->';
const END = '<!--app-end-->';

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

export function playerHtml(template: string, season: Season, playerId: string, outlook: Outlook, rank: number): string {
  const player = season.players.find((p) => p.id === playerId)!;
  const title = `${player.name}: Race to the WTA Finals ${season.rules.season} chances`;
  const description = playerSummary(season, playerId, rank, outlook);
  const url = `${SITE}/players/${playerId}/`;
  const head = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    '<meta property="og:type" content="profile" />',
    '<meta property="og:site_name" content="Finals Race" />',
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:image" content="${SITE}/og.png" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    '<meta name="twitter:card" content="summary_large_image" />',
  ].join('\n    ');
  const data = JSON.stringify({ playerId, outlook }).replace(/</g, '\\u003c');
  return fillRoot(template, renderToString(<PlayerPage season={season} playerId={playerId} outlook={outlook} />))
    .replace('<!--head-->', head)
    .replace('<!--data-->', `<script id="page-data" type="application/json">${data}</script>`);
}

export function sitemapXml(season: Season): string {
  const lastmod = season.meta.lastUpdated.slice(0, 10);
  const urls = ['/', ...season.players.map((p) => `/players/${p.id}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>\n    <loc>${SITE}${u}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>daily</changefreq>\n  </url>`).join('\n')}
</urlset>
`;
}
