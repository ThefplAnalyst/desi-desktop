// Owner alerts through GitHub Issues (spec 5.4 step 13, 7.5; T-18). Planning is pure; syncing uses an
// injected fetch. Issue text carries source ids, error codes and times only — never bodies, URLs
// with keys or tokens (ENG-13).
import type { SourceHealth } from '../shared/contracts.ts';
import type { Fetch } from './deploy.ts';
import type { Source } from './registry.ts';

const HOUR = 3600_000;
const MIN = 60_000;
export const ALERT_AFTER_HOURS = 3;
export const SOURCE_PREFIX = 'Source failing: ';
export const DEPLOY_PREFIX = 'Deploy failed: ';

/** How long a source has been failing, estimated from its health (the first failed attempt was due one interval after the last success). */
export function failingForMs(h: SourceHealth, source: Pick<Source, 'minIntervalMinutes'>, now: number): number {
  if (h.state !== 'failing' || h.consecutiveFailures === 0) return 0;
  const interval = source.minIntervalMinutes * MIN;
  const byCount = (h.consecutiveFailures - 1) * interval;
  if (!h.lastSuccessAt) return byCount;
  return Math.max(byCount, now - Date.parse(h.lastSuccessAt) - interval);
}

export interface Issue {
  number: number;
  title: string;
}

export type AlertAction =
  | { kind: 'open'; title: string; body: string }
  | { kind: 'update'; number: number; body: string }
  | { kind: 'close'; number: number; comment: string };

const sourceBody = (h: SourceHealth, now: number) =>
  [
    `The engine has not been able to refresh **${h.id}** for at least ${ALERT_AFTER_HOURS} hours.`,
    '',
    `- Error code: \`${h.errorCode ?? 'unknown'}\``,
    `- Consecutive failures: ${h.consecutiveFailures}`,
    `- Last success: ${h.lastSuccessAt ?? 'never'}`,
    `- Checked: ${new Date(now).toISOString()}`,
    '',
    'Visitors still see its last rows while they are fresh, then the tile shows its fallback links. Nothing to do unless this stays open for days: see docs/RUNBOOK.md, "A source is failing".',
    '',
    'This issue closes itself when the source recovers.',
  ].join('\n');

/**
 * Which Issues to open, update or close for source health. A source that is failing for at least
 * 3 hours gets one Issue; a source that recovers (or is switched off) gets its Issue closed.
 */
export function planSourceAlerts(health: SourceHealth[], registry: Pick<Source, 'id' | 'minIntervalMinutes'>[], open: Issue[], now: number): AlertAction[] {
  const actions: AlertAction[] = [];
  const byId = new Map(registry.map((s) => [s.id, s]));
  const openByTitle = new Map(open.filter((i) => i.title.startsWith(SOURCE_PREFIX)).map((i) => [i.title, i]));
  const alerting = new Set<string>();
  for (const h of health) {
    const source = byId.get(h.id);
    if (!source || failingForMs(h, source, now) < ALERT_AFTER_HOURS * HOUR) continue;
    const title = `${SOURCE_PREFIX}${h.id}`;
    alerting.add(title);
    const existing = openByTitle.get(title);
    actions.push(existing ? { kind: 'update', number: existing.number, body: sourceBody(h, now) } : { kind: 'open', title, body: sourceBody(h, now) });
  }
  for (const [title, issue] of openByTitle) {
    if (alerting.has(title)) continue;
    const h = health.find((x) => `${SOURCE_PREFIX}${x.id}` === title);
    // Keep the Issue open while the source is still failing but under the threshold again (estimate wobble).
    if (h?.state === 'failing') continue;
    actions.push({ kind: 'close', number: issue.number, comment: `Recovered: ${h ? `state is "${h.state}"` : 'source no longer in the registry'} at ${new Date(now).toISOString()}.` });
  }
  return actions;
}

/** Deploy failures: one Issue per target, closed by the next successful deploy. */
export function planDeployAlert(target: string, failed: { problems: string[]; rolledBack: boolean } | null, open: Issue[], now: number): AlertAction[] {
  const title = `${DEPLOY_PREFIX}${target}`;
  const existing = open.find((i) => i.title === title);
  if (!failed) return existing ? [{ kind: 'close', number: existing.number, comment: `A deploy to ${target} passed the smoke test at ${new Date(now).toISOString()}.` }] : [];
  const body = [
    `A deploy to **${target}** failed its smoke test at ${new Date(now).toISOString()}.`,
    '',
    failed.rolledBack ? 'The site was rolled back to the previous version automatically.' : 'There was no previous version to roll back to.',
    '',
    'Failing checks:',
    ...failed.problems.slice(0, 20).map((p) => `- ${p}`),
    '',
    'See docs/RUNBOOK.md, "A deploy failed". This issue closes itself after the next good deploy.',
  ].join('\n');
  return [existing ? { kind: 'update', number: existing.number, body } : { kind: 'open', title, body }];
}

/** Minimal GitHub Issues client (REST). `repo` is "owner/name". */
export function githubIssues(repo: string, token: string, fetchFn: Fetch & ((url: string, init?: RequestInit) => Promise<Response>)) {
  const api = async (path: string, method = 'GET', body?: unknown) => {
    const res = await fetchFn(`https://api.github.com/repos/${repo}${path}`, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'desi-desktop-refresh' },
    });
    if (!res.ok) throw new Error(`GitHub API ${method} ${path.split('?')[0]}: HTTP ${res.status}`);
    return res.status === 204 ? null : ((await res.json()) as unknown);
  };
  return {
    async listOpen(): Promise<Issue[]> {
      const list = (await api('/issues?state=open&per_page=100')) as { number: number; title: string; pull_request?: unknown }[];
      return list.filter((i) => !i.pull_request).map((i) => ({ number: i.number, title: i.title }));
    },
    async apply(actions: AlertAction[]): Promise<void> {
      for (const a of actions) {
        if (a.kind === 'open') await api('/issues', 'POST', { title: a.title, body: a.body });
        else if (a.kind === 'update') await api(`/issues/${a.number}`, 'PATCH', { body: a.body });
        else {
          await api(`/issues/${a.number}/comments`, 'POST', { body: a.comment });
          await api(`/issues/${a.number}`, 'PATCH', { state: 'closed', state_reason: 'completed' });
        }
      }
    },
  };
}
