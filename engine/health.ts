// Per-source health (ENG-08). A recent engine run never implies every source is fresh.
import type { SourceHealth } from '../shared/contracts.ts';
import { toIso } from './normalize.ts';
import type { Source } from './registry.ts';
import { staleAfterMinutes } from './scheduler.ts';

export type Outcome =
  | { kind: 'ok'; etag: string | null; lastModified: string | null }
  | { kind: 'not-modified' }
  | { kind: 'error'; code: string }
  | { kind: 'not-due' }
  | { kind: 'unpublishable' };

const MIN = 60_000;

export function isStale(h: Pick<SourceHealth, 'lastSuccessAt' | 'staleAfterMinutes'>, now: number): boolean {
  return !h.lastSuccessAt || now - Date.parse(h.lastSuccessAt) > h.staleAfterMinutes * MIN;
}

export function emptyHealth(s: Source): SourceHealth {
  return {
    id: s.id,
    state: 'disabled',
    lastAttemptAt: null,
    lastSuccessAt: null,
    consecutiveFailures: 0,
    etag: null,
    lastModified: null,
    staleAfterMinutes: staleAfterMinutes(s),
    errorCode: null,
  };
}

/** The next health record for a source after this run's outcome. */
export function nextHealth(s: Source, prev: SourceHealth | undefined, outcome: Outcome, now: number): SourceHealth {
  const base: SourceHealth = { ...(prev ?? emptyHealth(s)), id: s.id, staleAfterMinutes: staleAfterMinutes(s) };
  const at = toIso(now);
  const withState = (h: SourceHealth): SourceHealth => ({ ...h, state: h.state === 'ok' && isStale(h, now) ? 'stale' : h.state });

  switch (outcome.kind) {
    case 'unpublishable':
      return { ...base, state: 'disabled', consecutiveFailures: 0, etag: null, lastModified: null, errorCode: null };
    case 'not-due':
      return withState({ ...base, state: base.state === 'disabled' ? 'ok' : base.state === 'stale' ? 'ok' : base.state });
    case 'ok':
      return { ...base, state: 'ok', lastAttemptAt: at, lastSuccessAt: at, consecutiveFailures: 0, etag: outcome.etag, lastModified: outcome.lastModified, errorCode: null };
    case 'not-modified':
      return { ...base, state: 'ok', lastAttemptAt: at, lastSuccessAt: at, consecutiveFailures: 0, errorCode: null };
    case 'error':
      return { ...base, state: 'failing', lastAttemptAt: at, consecutiveFailures: base.consecutiveFailures + 1, errorCode: outcome.code };
  }
}
