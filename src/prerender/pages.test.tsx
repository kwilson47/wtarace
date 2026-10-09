import { describe, expect, it } from 'vitest';
import { season } from '../test/fixtures';
import { homeHtml, playerHtml, sitemapXml } from './pages';

const HOME = '<html><head><title>T</title></head><body><div id="root"><!--app-start-->static<!--app-end--></div></body></html>';
const PLAYER = '<html><head><!--head--></head><body><div id="root"><!--app-start--><!--app-end--></div><!--data--></body></html>';

describe('prerendered pages', () => {
  it('writes the homepage standings into the HTML and marks it for hydration', () => {
    const html = homeHtml(HOME, season);
    expect(html).toContain('<div id="root" data-ssr="">');
    expect(html).toContain('Ana Alpha');
    expect(html).not.toContain('static');
    expect(html).not.toContain('<!--app-start-->');
  });

  it('writes a player page with its own title, description, canonical URL and embedded matches', () => {
    const html = playerHtml(PLAYER, season, 'ana', []);
    expect(html).toContain('<title>Ana Alpha: 2026 season results</title>');
    expect(html).toContain('<meta name="description" content="Ana Alpha&#39;s 2026 season: 0–0. Every match, round by round." />');
    expect(html).toContain('<link rel="canonical" href="https://finalsrace.win/players/ana/" />');
    expect(html).toContain('<script id="page-data" type="application/json">{"playerId":"ana","matches":[]}</script>');
  });

  it('refuses a template without the markers', () => {
    expect(() => homeHtml('<html></html>', season)).toThrow(/markers/);
  });

  it('lists the homepage and every player page in the sitemap', () => {
    const xml = sitemapXml(season);
    expect(xml).toContain('<loc>https://finalsrace.win/</loc>');
    for (const p of season.players) expect(xml).toContain(`<loc>https://finalsrace.win/players/${p.id}/</loc>`);
    expect(xml).toContain('<lastmod>2026-10-07</lastmod>');
  });
});
