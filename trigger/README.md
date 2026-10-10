# Hourly update trigger

GitHub runs scheduled workflows on a best-effort basis, and on 2026-10-09/10 it started the hourly
`Update data` workflow only every 4–6 hours. This Cloudflare Worker starts that workflow at 7 minutes past
every hour through GitHub's API, the same thing as pressing "Run workflow". GitHub's own schedule
(`.github/workflows/update.yml`, at :37) stays on as a backup. Two runs in one hour are harmless: they queue
behind each other, and a run with nothing new changes nothing.

## Setup (once)

1. **Create a GitHub token that can only start workflows on this repository.**
   GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token:
   - Name: `finalsrace hourly update`
   - Expiration: the longest offered (note the date: the trigger stops when it expires)
   - Repository access: **Only select repositories** → `kwilson47/wtarace`
   - Permissions → Repository permissions → **Actions: Read and write**. Nothing else.

   Copy the token.
2. **Deploy the Worker** from this folder. Wrangler asks you to log in to Cloudflare the first time:

   ```bash
   cd trigger
   npx wrangler deploy
   npx wrangler secret put GITHUB_TOKEN   # paste the token when asked
   ```
3. **Check it:** after the next :07, the repository's Actions tab shows an `Update data` run started by
   `workflow_dispatch`. In Cloudflare, Workers & Pages → `finalsrace-hourly-update` → Logs shows each run; a
   failure there includes GitHub's answer (for example 401 when the token has expired).

## When the token expires

Create a new one the same way and run `npx wrangler secret put GITHUB_TOKEN` again.
