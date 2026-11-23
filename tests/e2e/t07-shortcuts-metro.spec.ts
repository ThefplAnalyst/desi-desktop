import { expect, test } from '@playwright/test';
import { openCustomize, seedPrefs, tile, withData } from './helpers.ts';

test.describe('T-07 FR-09 shortcuts', () => {
  test.beforeEach(async ({ page }) => {
    await withData(page);
  });

  test('T-07 FR-09 add, rename, reorder and remove a shortcut; it survives reload', async ({ page }) => {
    await page.goto('/');
    const dialog = await openCustomize(page);
    await dialog.getByLabel('Name', { exact: true }).fill('Example');
    await dialog.getByLabel('Web address').fill('example.org');
    await dialog.getByRole('button', { name: 'Add shortcut' }).click();
    await expect(dialog.getByRole('status')).toHaveText('Added Example.');
    await expect(dialog.getByRole('textbox', { name: 'Name for example.org' })).toHaveValue('Example');

    await dialog.getByRole('textbox', { name: 'Name for example.org' }).fill('Renamed');
    await dialog.getByRole('textbox', { name: 'Name for example.org' }).press('Tab');
    await dialog.getByRole('button', { name: 'Move Renamed up' }).click();
    await page.reload();
    const links = tile(page, 'shortcuts').locator('.row-title');
    await expect(links).toHaveText(['Gmail', 'WhatsApp Web', 'LinkedIn', 'GitHub', 'Renamed']);
    await expect(tile(page, 'shortcuts').locator('a.row-link').nth(4)).toHaveAttribute('href', 'https://example.org/');

    const again = await openCustomize(page);
    await again.getByRole('button', { name: 'Remove Renamed' }).click();
    await expect(tile(page, 'shortcuts')).not.toContainText('Renamed');
  });

  test('T-07 FR-09 only https (or http with a warning) is accepted', async ({ page }) => {
    await page.goto('/');
    const dialog = await openCustomize(page);
    const addr = dialog.getByLabel('Web address');
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.org']) {
      await addr.fill(bad);
      await dialog.getByRole('button', { name: 'Add shortcut' }).click();
      await expect(dialog.getByRole('status')).toHaveText('Only web addresses starting with https:// can be added.');
    }
    await addr.fill('http://example.org');
    await dialog.getByRole('button', { name: 'Add shortcut' }).click();
    await expect(dialog.getByRole('status')).toContainText('Warning: this address uses http://');
  });

  test('T-07 FR-09 the limit is 12 shortcuts', async ({ page }) => {
    const twelve = Array.from({ length: 12 }, (_, i) => ({ id: `x${i}`, title: `Site ${i}`, url: `https://example${i}.org/` }));
    await seedPrefs(page, { version: 1, shortcuts: twelve });
    await page.goto('/');
    const dialog = await openCustomize(page);
    await expect(dialog.getByText('You can have up to 12 shortcuts.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Add shortcut' })).toBeDisabled();
  });
});

test.describe('T-07 FR-10 metro area', () => {
  test('T-07 FR-10 metro choice drives weather and Near Me; no location prompt', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { geoCalls: number }).geoCalls = 0;
      const count = () => {
        (window as unknown as { geoCalls: number }).geoCalls++;
      };
      navigator.geolocation.getCurrentPosition = count;
      navigator.geolocation.watchPosition = () => {
        count();
        return 0;
      };
    });
    await withData(page);
    await page.goto('/');
    const weather = tile(page, 'time-weather');
    await expect(weather).toContainText('Choose your area in Customize to see the weather.');
    await expect(weather.locator('.clock')).toHaveCount(6);

    const dialog = await openCustomize(page);
    await dialog.getByLabel('Your area').selectOption('austin');
    await dialog.getByRole('switch', { name: 'Show Desi Near Me' }).check();
    await dialog.getByRole('button', { name: 'Done' }).click();

    await expect(weather.locator('.row').first()).toContainText('This afternoon: Sample forecast (dev fixture)');
    await expect(weather.locator('.tile-foot')).toContainText('Austin forecast: National Weather Service · issued 1 h ago');
    const near = tile(page, 'near-me');
    await expect(near.getByRole('link', { name: /Indian grocery/ })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/Indian+grocery+Austin%2C+TX',
    );
    expect(await page.evaluate(() => (window as unknown as { geoCalls: number }).geoCalls)).toBe(0);
  });
});
