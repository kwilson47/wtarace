const LINKS = [
  { key: 'standings', href: '/', label: 'Standings' },
  { key: 'tournaments', href: '/tournaments/', label: 'Tournaments' },
  { key: 'players', href: '/players/', label: 'Players' },
] as const;

export type Section = (typeof LINKS)[number]['key'];

/** The site's sections, on every page. `current` is the section the page belongs to. */
export function SiteNav({ current }: { current?: Section }) {
  return (
    <nav className="site-nav" aria-label="Site">
      {LINKS.map((l) => (
        <a key={l.key} href={l.href} aria-current={l.key === current ? 'page' : undefined}>
          {l.label}
        </a>
      ))}
    </nav>
  );
}
