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
