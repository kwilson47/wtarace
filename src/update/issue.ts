export const ISSUE_LABEL = 'data-update';
export const ISSUE_TITLE = 'Automatic data update is blocked';

/** A short stable fingerprint of a problem list, so repeated identical failures don't add comments. */
export function problemsKey(problems: string[]): string {
  let hash = 0;
  for (const ch of problems.join('\n')) hash = (hash * 31 + ch.codePointAt(0)!) | 0;
  return (hash >>> 0).toString(16);
}

export const keyOf = (body: string) => /<!-- problems:([0-9a-f]+) -->/.exec(body)?.[1];

export function renderIssue(problems: string[], at: string): string {
  return [
    `<!-- problems:${problemsKey(problems)} -->`,
    `The hourly data update at ${at} stopped without publishing anything, because:`,
    '',
    ...problems.map((p) => `- ${p}`),
    '',
    'Fix the data by hand, with sources as described in `data/SOURCES.md`, and push. The next run carries on from there, and this issue closes itself once an update succeeds.',
  ].join('\n');
}

export interface UpdateReport {
  status: string;
  at: string;
  problems: string[];
}

/**
 * The report as the issue should see it, once the checks before committing have run. If they failed, nothing was
 * published, so the run counts as blocked. The wording has no run link or time, so hourly repeats don't add comments.
 */
export function reportAfterChecks(report: UpdateReport, checkOutcome: string | undefined): UpdateReport {
  if (checkOutcome !== 'failure') return report;
  return {
    ...report,
    status: 'blocked',
    problems: ['The new data loaded, but the checks before committing failed (type check, tests, build or browser tests), so nothing was published. The latest failed "Update data" run in GitHub Actions has the details.'],
  };
}
