// Opens, updates or closes the single `data-update` issue from an update report (scripts/update.ts --out).
// Usage: tsx scripts/issue.ts update-result.json   (needs GITHUB_TOKEN and GITHUB_REPOSITORY)
import { readFileSync } from 'node:fs';
import { ISSUE_LABEL, ISSUE_TITLE, keyOf, problemsKey, renderIssue } from '../src/update/issue';

const report = JSON.parse(readFileSync(process.argv[2]!, 'utf8')) as { status: string; at: string; problems: string[] };
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

if (!repo || !token) {
  console.log('No GitHub token; issue left alone.');
} else {
  const [issue] = await api<{ number: number; body: string | null }[]>(`/issues?state=open&labels=${ISSUE_LABEL}`);
  if (report.status === 'blocked') {
    const body = renderIssue(report.problems, report.at);
    if (!issue) {
      await api('/issues', 'POST', { title: ISSUE_TITLE, body, labels: [ISSUE_LABEL] });
    } else {
      const isNew = keyOf(issue.body ?? '') !== problemsKey(report.problems);
      await api(`/issues/${issue.number}`, 'PATCH', { body });
      if (isNew) await api(`/issues/${issue.number}/comments`, 'POST', { body: `The problems changed:\n\n${report.problems.map((p) => `- ${p}`).join('\n')}` });
    }
  } else if (issue && (report.status === 'changed' || report.status === 'unchanged')) {
    await api(`/issues/${issue.number}/comments`, 'POST', { body: `Resolved: the update at ${report.at} succeeded.` });
    await api(`/issues/${issue.number}`, 'PATCH', { state: 'closed' });
  }
}
