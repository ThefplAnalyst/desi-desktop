// Scheduling (spec 5.3) and the injectable clock every engine module uses (ENG-12: tests inject time).
import type { SourceHealth } from '../shared/contracts.ts';
import type { Source } from './registry.ts';

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** A clock frozen at `start` whose sleep() just advances time. For tests and dry runs. */
export function fakeClock(start: number): Clock & { slept: number[] } {
  let t = start;
  const slept: number[] = [];
  return {
    slept,
    now: () => t,
    sleep: async (ms) => {
      slept.push(ms);
      t += ms;
    },
  };
}

const MIN = 60_000;

/** Fresh until 3× the source's interval since last success (decision D16). */
export const staleAfterMinutes = (s: Source) => s.minIntervalMinutes * 3;

/** Due when now ≥ lastAttemptAt + minIntervalMinutes; `force` (owner's manual run) ignores intervals. */
export function isDue(s: Source, health: SourceHealth | undefined, now: number, force = false): boolean {
  if (force || !health?.lastAttemptAt) return true;
  return now >= Date.parse(health.lastAttemptAt) + s.minIntervalMinutes * MIN;
}
