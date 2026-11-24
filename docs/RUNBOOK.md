# Desi Desktop — Runbook

How the site keeps itself running, and what to do in the rare cases it needs a person. Spec 7.5 lists what happens automatically and when the owner hears about it.

## How publishing works

- `.github/workflows/refresh.yml` runs every 30 minutes (GitHub may run it late). It is the **only** thing that deploys the site (decision D38).
- Each run does the following:
  1. Reads the live site's `/data/*` files and the engine's saved health.
  2. Fetches the approved sources that are due.
  3. Builds a new bundle.
  4. Deploys only when one of these is true:
     - visible content changed;
     - the code changed;
     - no deploy has happened yet today (heartbeat);
     - the run was started with **force**.
  5. Smoke-tests the live site after the deploy.
- A green merge to `main` asks `refresh.yml` to run straight away (`ci.yml`, job "Ask refresh to publish").
- The deploy switch is the `DEPLOY_TARGET` line near the top of `refresh.yml`: `none`, `staging` or `production`. It changes only after the owner approves the first deploy to that target.
- The watchdog Worker (`watchdog/`) checks every hour that `refresh.yml` is enabled and ran in the last 2 hours. If not, it re-enables the workflow and starts a run.

| Target | URL |
| --- | --- |
| Staging | https://desi-desktop-staging.manojperumalil.workers.dev |
| Production | https://desi-desktop.manojperumalil.workers.dev |

## Run a refresh by hand

GitHub → **Actions** → **Refresh** → **Run workflow**. Tick **force** to fetch every approved source now and deploy even if nothing changed. Rights are still enforced, so unapproved sources are never fetched.

Or from a terminal:

```
gh workflow run refresh.yml -R ThefplAnalyst/desi-desktop -f force=true
```

## Alerts (GitHub Issues)

The workflow opens Issues itself and closes them itself. Issue notifications reach the owner by email.

| Issue title | Means | Usually |
| --- | --- | --- |
| `Source failing: <id>` | A source has failed for 3+ hours. Its tile shows the last rows while they are fresh, then useful links. | Wait. Most publisher outages fix themselves, and the Issue closes on recovery. If it stays open for days, see below. |
| `Deploy failed: <target>` | A deploy failed its smoke test. The site was rolled back to the previous version. | Read the failing checks in the Issue and the run log. The next good deploy closes it. |

A workflow that **crashes** (for example, an invalid bundle) sends GitHub's "workflow failed" email instead. An invalid bundle is never deployed, so the live site stays as it was.

### A source is failing

1. Open the Issue and note the error code:
   - `http-403`: the publisher blocks us. Check whether they changed policy.
   - `http-404`: the feed moved.
   - `unexpected-json` / `malformed-xml`: the format changed.
2. Run `npm run content:probe -- --only <id>` locally. It checks the endpoint and saves counts only.
3. If the feed moved or changed, fix the adapter or the endpoint in a PR. If the publisher withdrew permission, follow "Rights revoked" below.

### A deploy failed

1. The site is already back on the previous version (the Issue says so).
2. Open the run log and look for **Smoke test** → the failing checks.
3. Fix the cause in a PR. After the merge, `refresh.yml` deploys and, if the smoke test passes, closes the Issue.
4. To roll back by hand: `npx wrangler rollback --env staging` (staging) or `npx wrangler rollback` (production). This needs a Cloudflare token in the environment.

## Rights revoked (purge, spec 5.8)

1. In `config/sources.json`, set the source to `"status": "revoked"` and `"enabled": false`. Merge the PR.
2. GitHub → Actions → Refresh → Run workflow with **force**. The new bundle contains no rows from that source.
3. If the rights holder asks, delete older Worker versions in the Cloudflare dashboard (Workers → desi-desktop → Deployments).
4. Open `<site>/data/content.json` and confirm that the source id no longer appears.

## Watchdog setup (one time, owner)

1. Create a fine-grained GitHub token: repository **desi-desktop** only. Permission: **Actions: Read and write**. Expiry: up to 1 year (note the date).
2. Deploy and add the secret. The token is typed at the prompt and never shown:
   ```
   npx wrangler deploy -c watchdog/wrangler.jsonc
   npx wrangler secret put GH_TOKEN -c watchdog/wrangler.jsonc
   ```
3. When the token expires, create a new one and repeat `secret put`.

## Owner routine

Most weeks: nothing. A few times a year:

- Answer Issues when they stay open.
- Review Dependabot PRs that did not merge themselves (anything other than patch updates of dev tools).
- Renew each approved source's terms review before its `reviewDueAt` (12 months).
- Renew the watchdog token before it expires.
