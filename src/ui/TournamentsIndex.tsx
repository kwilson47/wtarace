import type { Season, Tournament } from '../data/schema';
import type { TournamentFact } from '../draws/facts';
import { categoryLabel, formatDates } from './format';
import { SiteNav } from './SiteNav';
import { UpdatedTime } from './UpdatedTime';

const month = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const NONE: TournamentFact = { champion: null, round: null, drawOut: false };

/** Every event in the race: live now, upcoming, and completed by month (newest first), each linking to its page. */
export function TournamentsIndex({ season, facts }: { season: Season; facts: Record<string, TournamentFact> }) {
  const events = season.tournaments.filter((t) => !t.id.startsWith('zp-')); // zero-pointer placeholders aren't events
  const byStart = (a: Tournament, b: Tournament) => a.startDate.localeCompare(b.startDate);
  const live = events.filter((t) => t.status === 'in-progress').sort(byStart);
  const upcoming = events.filter((t) => t.status === 'upcoming').sort(byStart);
  const completed = events.filter((t) => t.status === 'completed').sort((a, b) => byStart(b, a));
  const months = [...new Set(completed.map((t) => t.startDate.slice(0, 7)))];
  const name = (t: Tournament) => (t.startDate.slice(0, 4) === String(season.rules.season) ? t.name : `${t.name} ${t.startDate.slice(0, 4)}`);
  const item = (t: Tournament, extra: string | null) => (
    <li key={t.id}>
      <a href={`/tournaments/${t.id}/`}>{name(t)}</a>
      {` · ${categoryLabel(t.category)} · ${formatDates(t)}${extra ? ` · ${extra}` : ''}`}
    </li>
  );
  const fact = (t: Tournament) => facts[t.id] ?? NONE;
  return (
    <div className="app list-page">
      <SiteNav current="tournaments" />
      <header className="header">
        <h1>{`Tournaments: ${season.rules.season} race`}</h1>
        <p className="intro">Every event that counts toward the race, with its draw and results.</p>
        <UpdatedTime iso={season.meta.lastUpdated} />
      </header>
      <main>
        {live.length > 0 && (
          <section aria-label="Live now">
            <h2>Live now</h2>
            <ul className="event-list">{live.map((t) => item(t, fact(t).round ? `Now: ${fact(t).round}` : null))}</ul>
          </section>
        )}
        {upcoming.length > 0 && (
          <section aria-label="Upcoming">
            <h2>Upcoming</h2>
            <ul className="event-list">{upcoming.map((t) => item(t, fact(t).drawOut ? 'Draw out' : null))}</ul>
          </section>
        )}
        <section aria-label="Completed">
          <h2>Completed</h2>
          {months.map((m) => (
            <div key={m}>
              <h3>{month.format(new Date(`${m}-01T00:00:00Z`))}</h3>
              <ul className="event-list">
                {completed.filter((t) => t.startDate.startsWith(m)).map((t) => item(t, fact(t).champion ? `Champion: ${fact(t).champion}` : null))}
              </ul>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
