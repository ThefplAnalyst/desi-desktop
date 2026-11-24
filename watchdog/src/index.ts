// Watchdog Worker (spec 4.1, 6.8; T-19). Cron only, no routes. Hourly it asks GitHub whether the
// refresh workflow is enabled and ran in the last 2 hours; if not, it re-enables it and dispatches a
// run. It reads no site content and stores nothing.

export interface Env {
  /** Fine-grained token: this repository only, Actions read and write. Stored as a Worker secret. */
  GH_TOKEN: string;
  /** "owner/name" */
  GH_REPO: string;
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export const WORKFLOW = 'refresh.yml';
export const SILENT_AFTER_MINUTES = 120;

export type WatchdogResult =
  | { action: 'none'; ageMinutes: number }
  | { action: 'dispatched'; reenabled: boolean; ageMinutes: number | null }
  | { action: 'error'; detail: string };

export async function checkRefresh(env: Env, fetchFn: Fetch, now: number): Promise<WatchdogResult> {
  if (!env.GH_TOKEN || !/^[\w.-]+\/[\w.-]+$/.test(env.GH_REPO ?? '')) return { action: 'error', detail: 'GH_TOKEN or GH_REPO not configured' };
  const gh = (path: string, method = 'GET', body?: unknown) =>
    fetchFn(`https://api.github.com/repos/${env.GH_REPO}/actions/workflows/${WORKFLOW}${path}`, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
      headers: {
        Authorization: `Bearer ${env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'desi-desktop-watchdog',
      },
    });

  let state: string | undefined;
  let last: string | undefined;
  try {
    const wf = await gh('');
    if (!wf.ok) return { action: 'error', detail: `workflow lookup: HTTP ${wf.status}` };
    state = ((await wf.json()) as { state?: string }).state;
    const runs = await gh('/runs?per_page=1');
    if (!runs.ok) return { action: 'error', detail: `runs lookup: HTTP ${runs.status}` };
    last = ((await runs.json()) as { workflow_runs?: { created_at?: string }[] }).workflow_runs?.[0]?.created_at;
  } catch {
    return { action: 'error', detail: 'GitHub API unreachable' };
  }

  const ageMinutes = last ? Math.round((now - Date.parse(last)) / 60_000) : null;
  if (state === 'active' && ageMinutes !== null && ageMinutes < SILENT_AFTER_MINUTES) return { action: 'none', ageMinutes };

  let reenabled = false;
  if (state !== 'active') {
    const r = await gh('/enable', 'PUT');
    if (!r.ok) return { action: 'error', detail: `enable: HTTP ${r.status}` };
    reenabled = true;
  }
  const d = await gh('/dispatches', 'POST', { ref: 'main' });
  if (!d.ok) return { action: 'error', detail: `dispatch: HTTP ${d.status}` };
  return { action: 'dispatched', reenabled, ageMinutes };
}

export default {
  async scheduled(_event: unknown, env: Env): Promise<void> {
    const result = await checkRefresh(env, fetch, Date.now());
    // Logged to Workers observability only: an action and a number, never the token.
    console.log(JSON.stringify(result));
    // A failing watchdog throws, so the cron invocation shows as failed in the Cloudflare dashboard.
    if (result.action === 'error') throw new Error(`watchdog: ${result.detail}`);
  },
};
