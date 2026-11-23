import { expect, test } from '@playwright/test';
import { seedPrefs, tile, tileIds, withData } from './helpers.ts';

const DEFAULT = ['shortcuts', 'india-news', 'us-news', 'cricket', 'visa', 'currency', 'south-asia', 'time-weather', 'festivals'];

test.describe('T-06 FR-08 preferences', () => {
  test.beforeEach(async ({ page }) => {
    await withData(page);
  });

  for (const [name, stored] of [
    ['corrupt', '{"version":1,"tiles":['],
    ['future-version', JSON.stringify({ version: 9, tiles: ['cricket'] })],
    ['wrong-type', JSON.stringify(['not', 'prefs'])],
  ] as const) {
    test(`T-06 FR-08 ${name} preferences load the defaults`, async ({ page }) => {
      await seedPrefs(page, stored);
      await page.goto('/');
      await expect(tile(page, 'festivals')).toBeVisible();
      expect(await tileIds(page)).toEqual(DEFAULT);
      await expect(page.getByText('Changes are saved for this visit.')).toBeHidden();
    });
  }

  test('T-06 FR-08 blocked storage: defaults load, changes work for the visit, note is shown', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('Storage is blocked', 'SecurityError');
        },
      });
    });
    await page.goto('/');
    expect(await tileIds(page)).toEqual(DEFAULT);
    await tile(page, 'cricket').hover();
    await page.getByRole('button', { name: 'Hide Cricket' }).click();
    await expect(tile(page, 'cricket')).toHaveCount(0);
    await expect(page.getByText('Changes are saved for this visit.')).toBeVisible();
  });

  test('T-06 FR-08 no cookies are set', async ({ page, context }) => {
    await page.goto('/');
    await tile(page, 'cricket').hover();
    await page.getByRole('button', { name: 'Hide Cricket' }).click();
    expect(await context.cookies()).toEqual([]);
  });
});
