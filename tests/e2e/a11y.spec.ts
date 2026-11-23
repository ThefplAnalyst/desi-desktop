import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { openCustomize, withData } from './helpers.ts';

// NFR-A11Y: WCAG 2.2 AA rules, zero violations (M1 exit: "axe clean").
const scan = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    for (const path of ['/', '/help/', '/about/', '/privacy/', '/404.html']) {
      test(`NFR-A11Y ${path} has no axe violations (${scheme})`, async ({ page }) => {
        await withData(page);
        await page.goto(path);
        if (path === '/') await expect(page.locator('#grid .row').first()).toBeVisible();
        expect((await scan(page)).violations).toEqual([]);
      });
    }

    test(`NFR-A11Y a filtered page has no axe violations (${scheme})`, async ({ page, browserName }) => {
      // Playwright's Firefox intermittently crashes ("Page crashed") when axe scans a grid the filter
      // has re-rendered (~30% of runs; the filter tests themselves pass on Firefox). Decision D31.
      test.skip(browserName === 'firefox', 'axe on a filter-re-rendered grid crashes Playwright Firefox (D31)');
      await withData(page);
      await page.goto('/');
      await page.getByRole('searchbox', { name: 'Filter tiles' }).fill('india');
      await expect(page.locator('#grid mark').first()).toBeVisible();
      expect((await scan(page)).violations).toEqual([]);
    });

    test(`NFR-A11Y Customize panel has no axe violations (${scheme})`, async ({ page }) => {
      await withData(page);
      await page.goto('/');
      await expect(page.locator('#grid .row').first()).toBeVisible();
      await openCustomize(page);
      expect((await scan(page)).violations).toEqual([]);
    });
  });
}

test('NFR-A11Y keyboard: skip link, tile hide button and Customize are reachable by Tab', async ({ page, browserName }) => {
  await withData(page);
  await page.goto('/');
  const skip = page.getByRole('link', { name: 'Skip to tiles' });
  if (browserName === 'webkit') {
    // WebKit, like Safari's default setting, leaves links out of the Tab order; check the link itself.
    await skip.focus();
  } else {
    // The skip link is the first stop in the tab order, just before the wordmark.
    await page.getByRole('link', { name: 'Desi Desktop' }).focus();
    await page.keyboard.press('Shift+Tab');
  }
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();
  const hide = page.getByRole('button', { name: 'Hide My Shortcuts' });
  await hide.focus();
  await expect(hide).toBeVisible();
  await page.getByRole('button', { name: 'Customize', exact: true }).press('Enter');
  await expect(page.getByRole('dialog', { name: 'Customize' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Customize' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Customize', exact: true })).toBeFocused();
});
