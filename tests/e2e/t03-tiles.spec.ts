import { expect, test } from '@playwright/test';
import { tile, withData } from './helpers.ts';

test.describe('T-03 FR-03 FR-04 NFR-HONEST tiles and freshness', () => {
  test('T-03 FR-03 fresh, partial, stale, links and empty tiles show their exact labels', async ({ page }) => {
    await withData(page, {
      content: (c) => {
        const tiles = c['tiles'] as Record<string, unknown>;
        delete tiles['currency'];
        return c;
      },
    });
    await page.goto('/');
    await expect(tile(page, 'india-news').locator('.tile-label')).toHaveText('Updated 25 min ago');
    await expect(tile(page, 'us-news').locator('.tile-label')).toHaveText('Updated 55 min ago · Some sources unavailable');
    await expect(tile(page, 'visa').locator('.tile-label')).toHaveText('May be out of date');
    await expect(tile(page, 'south-asia').locator('.tile-label')).toHaveText('Useful links — not a live feed');
    await expect(tile(page, 'currency').locator('.tile-label')).toHaveText('Nothing to show right now');
  });

  test('T-03 NFR-HONEST links tiles show no timestamps; live tiles show per-source age', async ({ page }) => {
    await withData(page);
    await page.goto('/');
    const links = tile(page, 'south-asia');
    await expect(links.locator('.row')).toHaveCount(5);
    await expect(links).not.toContainText(/ago|Updated/);
    await expect(links.locator('.tile-foot')).toHaveCount(0);
    await expect(tile(page, 'india-news').locator('.tile-foot')).toHaveText('PIB · Updated 25 min ago');
    await expect(tile(page, 'visa').locator('.tile-foot')).toContainText('USCIS · May be out of date');
    // NFR-HONEST: the only use of "live" is the honest "not a live feed" label.
    const text = (await page.locator('body').innerText()).replaceAll('not a live feed', '');
    expect(text).not.toMatch(/\blive\b/i);
  });

  test('T-03 FR-04 a fake clock makes data stale in the browser', async ({ page }) => {
    await withData(page, { installClock: true });
    await page.goto('/');
    const label = tile(page, 'india-news').locator('.tile-label');
    await expect(label).toHaveText('Updated 25 min ago');
    await page.clock.fastForward('02:00:00');
    await expect(label).toHaveText('May be out of date');
  });

  test('T-03 FR-04 expired rows vanish', async ({ page }) => {
    await withData(page);
    await page.goto('/');
    const cricket = tile(page, 'cricket');
    await expect(cricket.locator('.row').first()).toContainText('Sample fixture 1');
    await expect(cricket).not.toContainText('Sample expired fixture');
  });

  test('T-03 FR-03 five rows, Show more to ten, rows link to the original source', async ({ page }) => {
    await withData(page);
    await page.goto('/');
    const india = tile(page, 'india-news');
    await expect(india.locator('.row')).toHaveCount(5);
    // Keyboard use: focus stays on the toggle after the tile re-renders.
    const more = india.getByRole('button', { name: 'Show more' });
    await more.focus();
    await more.press('Enter');
    await expect(india.locator('.row')).toHaveCount(10);
    await expect(india.getByRole('button', { name: 'Show less' })).toBeFocused();
    const first = india.locator('.row a').first();
    await expect(first).toHaveAttribute('href', /^https:\/\/example\.org\/pib\//);
    await expect(first).toHaveAttribute('rel', 'noopener noreferrer');
  });

  test('T-03 FR-03 grey skeletons show while data loads', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-20T12:25:00Z'));
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    await page.route('**/data/**', async (route) => {
      await gate;
      await route.fulfill({ status: 404, body: '' });
    });
    await page.goto('/');
    await expect(tile(page, 'india-news').locator('.skeleton')).toBeVisible();
    release();
    await expect(tile(page, 'india-news').locator('.tile-label')).toHaveText('Nothing to show right now');
  });
});
