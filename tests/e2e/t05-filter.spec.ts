import { expect, test, type Page } from '@playwright/test';
import { tile, tileIds, withData } from './helpers.ts';

const filter = (page: Page) => page.getByRole('searchbox', { name: 'Filter tiles' });

test.describe('T-05 FR-07 filter', () => {
  test.beforeEach(async ({ page }) => {
    await withData(page);
    await page.goto('/');
    await expect(tile(page, 'india-news').locator('.row').first()).toBeVisible();
  });

  test('T-05 FR-07 "india visa" shows only rows containing both words and announces the count', async ({ page }) => {
    await filter(page).fill('india visa');
    await expect(page.locator('#filter-status')).toHaveText('1 item in 1 tile');
    expect(await tileIds(page)).toEqual(['india-news']);
    const rows = tile(page, 'india-news').locator('.row');
    await expect(rows).toHaveText([/Sample India visa notice/]);
    await expect(rows.locator('mark')).toHaveText(['India', 'visa']);
  });

  test('T-05 FR-07 filter ignores words split across rows or heading and row', async ({ page }) => {
    // "Sample row about India" and "Sample row about visa" are separate rows; "India Updates" is the heading.
    await filter(page).fill('about india visa');
    await expect(page.getByText('Nothing matches “about india visa”.')).toBeVisible();
    await filter(page).fill('updates visa');
    await expect(page.getByText('Nothing matches “updates visa”.')).toBeVisible();
  });

  test('T-05 FR-07 matches beyond row 5 are shown', async ({ page }) => {
    await filter(page).fill('diwali');
    await expect(tile(page, 'india-news').locator('.row')).toHaveText([/Diwali travel/, /Diwali lights/]);
  });

  test('T-05 FR-07 a title-only match shows "No matching items"', async ({ page }) => {
    await filter(page).fill('festivals');
    await expect(page.locator('#filter-status')).toHaveText('0 items in 1 tile');
    expect(await tileIds(page)).toEqual(['festivals']);
    await expect(tile(page, 'festivals')).toContainText('No matching items');
    await expect(tile(page, 'festivals').locator('h2 mark')).toHaveText('Festivals');
  });

  test('T-05 FR-07 NFKC and mixed case', async ({ page }) => {
    await filter(page).fill('ViSa FULLWIDTH');
    await expect(tile(page, 'india-news').locator('.row')).toHaveText([/fullwidth row/]);
  });

  test('T-05 FR-07 nothing matches shows one page-level empty state; Escape clears', async ({ page }) => {
    await filter(page).fill('zzzz');
    await expect(page.locator('.page-empty')).toHaveText('Nothing matches “zzzz”.');
    await expect(page.locator('#grid article')).toHaveCount(0);
    await filter(page).press('Escape');
    await expect(filter(page)).toHaveValue('');
    await expect(page.locator('#grid article')).toHaveCount(9);
  });
});
