import { expect, test } from '@playwright/test';
import { withData } from './helpers.ts';

// M0 exit criterion (spec 7.1): every page of the multipage build loads cleanly.
const pages = [
  { path: '/', heading: 'Desi Desktop' },
  { path: '/help/', heading: 'Help' },
  { path: '/about/', heading: 'About & Sources' },
  { path: '/privacy/', heading: 'Privacy' },
  { path: '/404.html', heading: 'Page not found' },
];

for (const { path, heading } of pages) {
  test(`M0 skeleton: ${path} builds, loads and logs no errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await withData(page);

    const res = await page.goto(path);
    expect(res?.ok()).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
    expect(errors).toEqual([]);
  });
}
