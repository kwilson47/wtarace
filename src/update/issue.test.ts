import { describe, expect, it } from 'vitest';
import { keyOf, problemsKey, renderIssue, reportAfterChecks } from './issue';

describe('data-update issue', () => {
  it('lists the problems and carries a key that changes only when they change', () => {
    const body = renderIssue(['A total is off.'], '2026-10-09T14:17:00Z');
    expect(body).toContain('- A total is off.');
    expect(body).toContain('2026-10-09T14:17:00Z');
    expect(keyOf(body)).toBe(problemsKey(['A total is off.']));
    expect(problemsKey(['A total is off.'])).not.toBe(problemsKey(['Something else.']));
  });
});

describe('reportAfterChecks', () => {
  const changed = { status: 'changed', at: '2026-11-01T12:07:00Z', problems: [] };

  it('turns a run whose checks failed into a blocked report, with wording that stays the same each hour', () => {
    const report = reportAfterChecks(changed, 'failure');
    expect(report.status).toBe('blocked');
    expect(report.at).toBe(changed.at);
    expect(report.problems).toHaveLength(1);
    expect(problemsKey(report.problems)).toBe(problemsKey(reportAfterChecks({ ...changed, at: 'later' }, 'failure').problems));
  });

  it('leaves the report alone when the checks passed or never ran', () => {
    expect(reportAfterChecks(changed, 'success')).toEqual(changed);
    const blocked = { status: 'blocked', at: changed.at, problems: ['a data problem'] };
    expect(reportAfterChecks(blocked, 'skipped')).toEqual(blocked);
    expect(reportAfterChecks(changed, undefined)).toEqual(changed);
  });
});
