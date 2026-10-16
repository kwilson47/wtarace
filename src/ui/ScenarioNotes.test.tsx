import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { parseScenarioNotes } from '../data/scenarioNotes';
import { ScenarioNotes } from './ScenarioNotes';

describe('ScenarioNotes', () => {
  it('shows the title, each scenario and the date it was checked', () => {
    const notes = parseScenarioNotes({ title: 'Clinching and elimination scenarios: Wuhan SF', asOf: '2026-10-16', items: ['None'] });
    render(<ScenarioNotes notes={notes} />);
    const box = screen.getByRole('region', { name: 'Clinching and elimination scenarios: Wuhan SF' });
    expect(within(box).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['None']);
    expect(box).toHaveTextContent('As of Oct 16');
  });

  it('shows nothing when there are no scenarios', () => {
    const { container } = render(<ScenarioNotes notes={parseScenarioNotes({ title: 'Wuhan SF', asOf: '2026-10-16', items: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('rejects a malformed file', () => {
    expect(() => parseScenarioNotes({ title: '', asOf: 'Oct 16', items: 'None' })).toThrow();
  });
});
