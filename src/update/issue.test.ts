import { describe, expect, it } from 'vitest';
import { keyOf, problemsKey, renderIssue } from './issue';

describe('data-update issue', () => {
  it('lists the problems and carries a key that changes only when they change', () => {
    const body = renderIssue(['A total is off.'], '2026-10-09T14:17:00Z');
    expect(body).toContain('- A total is off.');
    expect(body).toContain('2026-10-09T14:17:00Z');
    expect(keyOf(body)).toBe(problemsKey(['A total is off.']));
    expect(problemsKey(['A total is off.'])).not.toBe(problemsKey(['Something else.']));
  });
});
