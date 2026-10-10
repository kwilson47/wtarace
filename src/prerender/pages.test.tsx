import { describe, expect, it } from 'vitest';
import { season } from '../test/fixtures';
import { homeHtml, playerHtml, playersIndexHtml, sitemapXml, tournamentHtml, tournamentsIndexHtml } from './pages';

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

  it('embeds the chances in the homepage and renders the column', () => {
    const html = homeHtml(HOME.replace('</body>', '<!--data--></body>'), season, { ana: 1, bea: 0.42, cat: 0 });
    expect(html).toContain('<script id="page-data" type="application/json">{"chances":{"ana":1,"bea":0.42,"cat":0}}</script>');
    expect(html).toContain('>Chance</th>');
  });

  it('refuses a template without the markers', () => {
    expect(() => homeHtml('<html></html>', season)).toThrow(/markers/);
  });

  it('lists the homepage and every player page in the sitemap', () => {
    const xml = sitemapXml(season);
    expect(xml).toContain('<loc>https://finalsrace.win/</loc>');
    expect(xml).toContain('<loc>https://finalsrace.win/tournaments/</loc>');
    expect(xml).toContain('<loc>https://finalsrace.win/players/</loc>');
    for (const p of season.players) expect(xml).toContain(`<loc>https://finalsrace.win/players/${p.id}/</loc>`);
    expect(xml).toContain('<lastmod>2026-10-07</lastmod>');
  });

  it('writes a tournament page with its own title, description and embedded draw', () => {
    const html = tournamentHtml(PLAYER, season, 'next', null);
    expect(html).toContain('<title>Next Open 2026: draw and results</title>');
    expect(html).toContain('<link rel="canonical" href="https://finalsrace.win/tournaments/next/" />');
    expect(html).toContain('<script id="page-data" type="application/json">{"tournamentId":"next","draw":null}</script>');
    expect(html).toContain('The draw hasn&#x27;t been made yet.');
  });

  it('lists tournament pages in the sitemap', () => {
    expect(sitemapXml(season)).toContain('<loc>https://finalsrace.win/tournaments/next/</loc>');
  });

  it('writes the tournaments and players index pages with their own titles and embedded data', () => {
    const t = tournamentsIndexHtml(PLAYER, season, { slam: { champion: 'Ana Alpha', round: null, drawOut: false } });
    expect(t).toContain('<title>Tournaments: 2026 Race to the WTA Finals</title>');
    expect(t).toContain('<link rel="canonical" href="https://finalsrace.win/tournaments/" />');
    expect(t).toContain('"page":"tournaments"');
    expect(t).toContain('Champion: Ana Alpha');
    const p = playersIndexHtml(PLAYER, season);
    expect(p).toContain('<title>Players: 2026 Race to the WTA Finals</title>');
    expect(p).toContain('<link rel="canonical" href="https://finalsrace.win/players/" />');
    expect(p).toContain('<script id="page-data" type="application/json">{"page":"players"}</script>');
  });
});
