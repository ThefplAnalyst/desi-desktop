import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

/** Fixture clock: the sample bundle was generated at 12:00 UTC, so this makes it 25 minutes old. */
export const NOW = new Date('2026-11-20T12:25:00Z');
export const PREFS_KEY = 'desiDesktop:prefs:v1';

type Json = Record<string, unknown>;
const read = (name: string): Json => JSON.parse(readFileSync(`tests/fixtures/${name}.sample.json`, 'utf8')) as Json;

export interface DataOptions {
  /** Edit the content bundle before it is served. */
  content?: (c: Json) => Json;
  /** Abort every /data/* request (FR-14). */
  block?: boolean;
  /** Install a fake clock (timers too) instead of only fixing Date.now. */
  installClock?: boolean;
}

/** Serves the development fixtures as /data/* and fixes the clock. Never touches a real publisher. */
export async function withData(page: Page, opts: DataOptions = {}): Promise<void> {
  if (opts.installClock) await page.clock.install({ time: NOW });
  else await page.clock.setFixedTime(NOW);

  if (opts.block) {
    await page.route('**/data/**', (r) => r.abort());
    return;
  }
  const files: Record<string, Json> = {
    content: opts.content ? opts.content(read('content')) : read('content'),
    health: read('health'),
    sources: read('sources'),
  };
  await page.route('**/data/*.json', (route) => {
    const name = new URL(route.request().url()).pathname.replace('/data/', '').replace('.json', '');
    const body = files[name];
    return body ? route.fulfill({ json: body }) : route.fulfill({ status: 404, body: '' });
  });
}

/** Seeds preferences once per test (survives reloads without overwriting later changes). */
export async function seedPrefs(page: Page, prefs: unknown): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem('dd-seeded')) {
        localStorage.setItem(key as string, value as string);
        sessionStorage.setItem('dd-seeded', '1');
      }
    },
    [PREFS_KEY, typeof prefs === 'string' ? prefs : JSON.stringify(prefs)],
  );
}

export const tile = (page: Page, id: string) => page.locator(`article[data-tile="${id}"]`);
export const tileIds = (page: Page) => page.locator('#grid article[data-tile]').evaluateAll((els) => els.map((e) => e.getAttribute('data-tile')));

export async function openCustomize(page: Page) {
  await page.getByRole('button', { name: 'Customize', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Customize' });
  await dialog.waitFor();
  // Let the 240 ms slide-in finish, so checks (e.g. axe contrast) see the panel at full opacity.
  await dialog.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  return dialog;
}
