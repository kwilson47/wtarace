// Starts the "Update data" GitHub workflow every hour. GitHub's own schedule is best-effort and skipped most
// hours on 2026-10-09/10, so this Cloudflare Worker's cron trigger does the reliable start; GitHub's schedule
// stays on as a backup. See trigger/README.md for setup.

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(startUpdate(env));
  },
  // No public endpoint: the Worker only runs on its schedule.
  async fetch() {
    return new Response('Not found', { status: 404 });
  },
};

async function startUpdate(env) {
  const response = await fetch(`https://api.github.com/repos/${env.REPO}/actions/workflows/update.yml/dispatches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.GITHUB_TOKEN}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'finalsrace-hourly-update',
      'x-github-api-version': '2022-11-28',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  // 204 = started. Anything else shows up in the Worker's logs (Cloudflare dashboard → Workers → Logs).
  if (response.status !== 204) throw new Error(`GitHub answered ${response.status}: ${await response.text()}`);
}
