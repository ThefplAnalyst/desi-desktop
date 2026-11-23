import { expect, test } from '@playwright/test';
import { openCustomize, seedPrefs, tile, tileIds, withData } from './helpers.ts';

const DEFAULT = ['shortcuts', 'india-news', 'us-news', 'cricket', 'visa', 'currency', 'south-asia', 'time-weather', 'festivals'];

test.describe('T-04 FR-05 FR-06 customize', () => {
  test.beforeEach(async ({ page }) => {
    await withData(page);
  });

  test('T-04 FR-06 × hides a tile, it stays hidden after reload and can be re-added', async ({ page }) => {
    await page.goto('/');
    await tile(page, 'cricket').hover();
    await page.getByRole('button', { name: 'Hide Cricket' }).click();
    await expect(tile(page, 'cricket')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Hide Visa & Immigration' })).toBeFocused();
    await page.reload();
    await expect(tile(page, 'currency')).toBeVisible();
    await expect(tile(page, 'cricket')).toHaveCount(0);

    const dialog = await openCustomize(page);
    await dialog.getByRole('switch', { name: 'Show Cricket' }).check();
    await dialog.getByRole('button', { name: 'Done' }).click();
    expect((await tileIds(page)).at(-1)).toBe('cricket');
  });

  test('T-04 FR-05 move up and down keep focus, announce the position and survive reload', async ({ page }) => {
    await page.goto('/');
    const dialog = await openCustomize(page);
    const up = dialog.getByRole('button', { name: 'Move Cricket up' });
    await up.click();
    await expect(up).toBeFocused();
    await expect(page.locator('#announcer')).toHaveText('Cricket moved to position 3 of 9');
    await dialog.getByRole('button', { name: 'Move India News down' }).click();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByRole('button', { name: 'Customize', exact: true })).toBeFocused();

    const expected = ['shortcuts', 'cricket', 'india-news', 'us-news', 'visa', 'currency', 'south-asia', 'time-weather', 'festivals'];
    expect(await tileIds(page)).toEqual(expected);
    await page.reload();
    await expect(tile(page, 'cricket')).toBeVisible();
    expect(await tileIds(page)).toEqual(expected);
  });

  test('T-04 FR-05 first tile cannot move up; focus moves to the other arrow at the ends', async ({ page }) => {
    await page.goto('/');
    const dialog = await openCustomize(page);
    await expect(dialog.getByRole('button', { name: 'Move My Shortcuts up' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Move US News up' }).click();
    await dialog.getByRole('button', { name: 'Move US News up' }).click();
    await expect(dialog.getByRole('button', { name: 'Move US News down' })).toBeFocused();
    expect((await tileIds(page))[0]).toBe('us-news');
  });

  test('T-04 FR-05 drag to reorder (desktop)', async ({ page, browserName }) => {
    // Playwright crashes Firefox when dispatching synthetic drag events; drag is a desktop
    // progressive enhancement and keyboard reordering is covered on every browser.
    test.skip(browserName === 'firefox', 'Synthetic DragEvent dispatch crashes Playwright Firefox');
    await page.goto('/');
    const dialog = await openCustomize(page);
    // Real HTML5 drag events carrying a DataTransfer (a scripted mouse drag inside the scrolling panel is unreliable).
    const items = dialog.locator('ol[aria-label="Tiles on your page"] > li');
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    await items.filter({ hasText: 'Festivals & Holidays' }).dispatchEvent('dragstart', { dataTransfer });
    const target = items.filter({ hasText: 'India News' });
    await target.dispatchEvent('dragover', { dataTransfer });
    await target.dispatchEvent('drop', { dataTransfer });
    expect((await tileIds(page)).slice(0, 3)).toEqual(['shortcuts', 'festivals', 'india-news']);
  });

  test('T-04 FR-05 add a tile from the catalog, change columns, all survive reload', async ({ page }) => {
    await page.goto('/');
    const dialog = await openCustomize(page);
    await dialog.getByRole('switch', { name: 'Show Movies & OTT' }).check();
    await expect(dialog.getByRole('switch', { name: 'Show Movies & OTT' })).toBeFocused();
    await dialog.getByRole('radio', { name: '4 columns on wide screens' }).check();
    await page.reload();
    expect((await tileIds(page)).at(-1)).toBe('movies');
    await expect(page.locator('#grid')).toHaveClass(/cols-4/);
  });

  test('T-04 FR-05 Reset asks to confirm', async ({ page }) => {
    await seedPrefs(page, { version: 1, tiles: ['cricket', 'visa'], metroId: 'austin', columns: 4 });
    await page.goto('/');
    expect(await tileIds(page)).toEqual(['cricket', 'visa']);
    const dialog = await openCustomize(page);
    await dialog.getByRole('button', { name: 'Reset to defaults' }).click();
    await expect(dialog.getByText('Reset tiles, area, layout and shortcuts to the defaults?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    expect(await tileIds(page)).toEqual(['cricket', 'visa']);

    await dialog.getByRole('button', { name: 'Reset to defaults' }).click();
    await dialog.getByRole('button', { name: 'Reset', exact: true }).click();
    expect(await tileIds(page)).toEqual(DEFAULT);
    await page.reload();
    expect(await tileIds(page)).toEqual(DEFAULT);
  });

  test('T-04 FR-05 reordering is disabled while a filter is active', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Filter tiles' }).fill('india');
    await expect(page.locator('#filter-status')).not.toBeEmpty();
    const dialog = await openCustomize(page);
    await expect(dialog.getByText('Clear the filter to reorder tiles.')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Move Cricket up' })).toBeDisabled();
    await expect(dialog.locator('li[draggable="true"]')).toHaveCount(0);
  });

  test('T-04 FR-06 zero tiles shows an "Add tiles" prompt that opens Customize', async ({ page }) => {
    await seedPrefs(page, { version: 1, tiles: [] });
    await page.goto('/');
    await expect(page.getByText('Your page has no tiles.')).toBeVisible();
    await page.getByRole('button', { name: 'Add tiles' }).click();
    await expect(page.getByRole('dialog', { name: 'Customize' })).toBeVisible();
  });
});
