const LINKS = [
  { key: 'standings', href: '/', label: 'Standings' },
  { key: 'tournaments', href: '/tournaments/', label: 'Tournaments' },
  { key: 'players', href: '/players/', label: 'Players' },
] as const;

export type Section = (typeof LINKS)[number]['key'];

/** The feedback form (Tally, in the site owner's account); responses are emailed to the owner. */
export const FEEDBACK_URL = 'https://tally.so/r/Zj4zlV';

/** The site's sections and the feedback form, on every page. `current` is the section the page belongs to. */
export function SiteNav({ current }: { current?: Section }) {
  return (
    <nav className="site-nav" aria-label="Site">
      {LINKS.map((l) => (
        <a key={l.key} href={l.href} aria-current={l.key === current ? 'page' : undefined}>
          {l.label}
        </a>
      ))}
      <a className="feedback" href={FEEDBACK_URL} target="_blank" rel="noopener">
        Feedback<span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    </nav>
  );
}
