import { expect, test } from '@playwright/test';
import { openCustomize, tile, withData } from './helpers.ts';

test.describe('T-08 FR-11 FR-13 FR-14', () => {
  test('T-08 FR-11 the first-visit tip appears once per browser', async ({ page }) => {
    await withData(page);
    await page.goto('/');
    const tip = page.locator('#tip');
    await expect(tip).toBeVisible();
    await tip.getByRole('button', { name: 'Dismiss' }).click();
    await expect(tip).toBeHidden();
    await page.reload();
    await expect(page.locator('#grid article').first()).toBeVisible();
    await expect(tip).toBeHidden();
  });

  for (const width of [320, 768, 1280]) {
    test(`T-08 FR-11 Help is reachable from the top bar at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await withData(page);
      await page.goto('/');
      await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Help' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
      for (const section of ['Add, hide and move tiles', 'Filter tiles', 'Where your settings are saved', 'Open Desi Desktop when your browser starts']) {
        await expect(page.getByRole('heading', { name: section })).toBeVisible();
      }
      for (const browser of ['Chrome', 'Edge', 'Safari (Mac)', 'Firefox', 'iPhone and iPad', 'Android']) {
        await expect(page.getByRole('heading', { name: browser, exact: true })).toBeVisible();
      }
    });
  }

  test('T-08 FR-13 About & Sources is linked from the footer and lists the enabled sources', async ({ page }) => {
    await withData(page);
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: 'About & Sources' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Sources' })).toBeVisible();
    // M1 has no source registry yet, so the generated list says so (unit tests cover a full registry).
    await expect(page.getByText('No sources are switched on yet.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Privacy' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Contact' })).toBeVisible();
  });

  test('T-08 FR-14 with /data/* blocked the page still works', async ({ page }) => {
    await withData(page, { block: true });
    await page.goto('/');
    await expect(tile(page, 'india-news')).toContainText('Nothing to show right now');
    await expect(tile(page, 'shortcuts').getByRole('link', { name: /Gmail/ })).toBeVisible();
    await expect(page.locator('#grid article')).toHaveCount(9);

    await page.getByRole('searchbox', { name: 'Filter tiles' }).fill('gmail');
    await expect(page.locator('#grid article')).toHaveCount(1);
    await page.getByRole('searchbox', { name: 'Filter tiles' }).press('Escape');

    const dialog = await openCustomize(page);
    await dialog.getByRole('button', { name: 'Move Cricket up' }).click();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.locator('#grid article').nth(2)).toHaveAttribute('data-tile', 'cricket');
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });
    test('T-08 FR-11 Help and About work without JavaScript', async ({ page }) => {
      await page.goto('/help/');
      await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
      await page.goto('/about/');
      await expect(page.getByRole('heading', { level: 2, name: 'Sources' })).toBeVisible();
    });
  });
});
