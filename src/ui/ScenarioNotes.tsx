import type { ScenarioNotesData } from '../data/scenarioNotes';

const asOfLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** The hand-checked clinching and elimination scenarios for the round in play, above the standings. */
export function ScenarioNotes({ notes }: { notes: ScenarioNotesData }) {
  if (notes.items.length === 0) return null;
  return (
    <section className="scenario-notes" aria-labelledby="scenario-notes-title">
      <h2 id="scenario-notes-title">{notes.title}</h2>
      <ul>
        {notes.items.map((item) => <li key={item}>{item}</li>)}
      </ul>
      <p className="note">{`As of ${asOfLabel(notes.asOf)}`}</p>
    </section>
  );
}
