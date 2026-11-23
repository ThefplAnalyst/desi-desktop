import { expect, test, type Page, type Request } from '@playwright/test';
import { withData } from './helpers.ts';

async function stubGoogle(page: Page): Promise<Request[]> {
  const requests: Request[] = [];
  await page.context().route('https://www.google.com/**', (route) => {
    requests.push(route.request());
    return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Google stub</title><p>stub</p>' });
  });
  return requests;
}

test.describe('T-01 FR-01 search', () => {
  test('T-01 FR-01 search box is the focused element on desktop load', async ({ page }) => {
    await withData(page);
    await page.goto('/');
    await expect(page.getByRole('searchbox', { name: 'Search Google' })).toBeFocused();
  });

  test('T-01 FR-01 "India visa & OCI" is sent as one trimmed, encoded q in the same tab; Back works', async ({ page }) => {
    const requests = await stubGoogle(page);
    await withData(page);
    await page.goto('/');
    await page.getByRole('searchbox', { name: 'Search Google' }).fill('  India visa & OCI  ');
    await page.keyboard.press('Enter');
    await page.waitForURL(/google\.com\/search/);

    const url = new URL(page.url());
    expect(url.searchParams.getAll('q')).toEqual(['India visa & OCI']);
    expect(url.search).toContain('q=India+visa+%26+OCI');
    expect(requests).toHaveLength(1);
    expect(page.context().pages()).toHaveLength(1);

    await page.goBack();
    await expect(page.getByRole('searchbox', { name: 'Search Google' })).toBeVisible();
    await expect(page.locator('#grid article').first()).toBeVisible();
  });

  test('T-01 FR-01 blank or whitespace-only input does nothing', async ({ page }) => {
    const requests = await stubGoogle(page);
    await withData(page);
    await page.goto('/');
    const box = page.getByRole('searchbox', { name: 'Search Google' });
    for (const value of ['', '    ']) {
      await box.fill(value);
      await box.press('Enter');
    }
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await page.waitForTimeout(300);
    expect(requests).toHaveLength(0);
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });
    test('T-01 FR-01 search works with JavaScript disabled', async ({ page }) => {
      await stubGoogle(page);
      await page.goto('/');
      await page.getByRole('searchbox', { name: 'Search Google' }).fill('cricket schedule');
      await page.keyboard.press('Enter');
      await page.waitForURL(/google\.com\/search/);
      expect(new URL(page.url()).searchParams.getAll('q')).toEqual(['cricket schedule']);
    });
  });
});
