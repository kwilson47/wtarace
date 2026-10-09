import { ZERO_POINTER_ROUND } from '../data/schema';
import type { Breakdown, BreakdownEntry } from '../engine/breakdown';
import { categoryLabel, formatPoints } from './format';

/** Event and round, then points, then notes. Placeholder zero-pointer events (`zp-…`) already say so in their name. */
function Entry({ e }: { e: BreakdownEntry }) {
  const round = e.round !== ZERO_POINTER_ROUND ? e.round : e.tournamentId.startsWith('zp-') ? '' : 'zero-pointer';
  const notes = [e.source === 'pick' ? 'your pick' : e.source === 'live' ? 'in progress' : null, e.counted ? null : 'not counted'].filter(Boolean);
  return (
    <>
      {`${e.tournamentName}${round ? ` ${round}` : ''} `}
      <span className="pts">{formatPoints(e.points)}</span>
      {notes.length ? ` (${notes.join(', ')})` : ''}
    </>
  );
}

/** A player's results grouped by event type, marking which count toward her total. */
export function ResultsBreakdown({ name, breakdown, profileHref }: { name: string; breakdown: Breakdown; profileHref?: string }) {
  const groups = new Map<string, BreakdownEntry[]>();
  for (const e of breakdown.entries) {
    const label = categoryLabel(e.category);
    groups.set(label, [...(groups.get(label) ?? []), e]);
  }
  const { minEvents } = breakdown;
  return (
    <section className="breakdown" aria-label={`${name}'s results`}>
      <dl>
        {[...groups].map(([label, entries]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              <ul>
                {entries.map((e) => (
                  <li key={e.tournamentId} className={[e.counted ? '' : 'dropped', e.source === 'result' ? '' : `from-${e.source}`].join(' ').trim() || undefined}>
                    <Entry e={e} />
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
      {profileHref && <p className="profile-link"><a href={profileHref}>Player Profile</a></p>}
      <p className="note">
        {`Counting ${breakdown.countedResults} of ${breakdown.maxCountedResults} results`}
        {minEvents &&
          (minEvents.waived
            ? ' · Event minimum waived'
            : ` · Events toward the ${minEvents.required}-event minimum: ${minEvents.played}`)}
      </p>
    </section>
  );
}
