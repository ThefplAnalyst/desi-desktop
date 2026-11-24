import { expect, test, type Page } from '@playwright/test';
import { seedPrefs, withData } from './helpers.ts';

async function layout(page: Page) {
  await expect(page.locator('#grid article').first()).toBeVisible();
  return page.evaluate(() => {
    const boxes = [...document.querySelectorAll('#grid article')].map((el) => el.getBoundingClientRect());
    const lefts = [...new Set(boxes.map((b) => Math.round(b.left)))];
    const firstRowTop = Math.round(boxes[0]?.top ?? 0);
    const firstRow = boxes.filter((b) => Math.round(b.top) === firstRowTop).map((b) => Math.round(b.left));
    return {
      columns: lefts.length,
      firstRow,
      hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

const cases = [
  { width: 320, columns: 1 },
  { width: 768, columns: 2 },
  { width: 1024, columns: 3 },
  { width: 1280, columns: 4 },
  { width: 1440, columns: 4 },
];

test.describe('T-02 FR-02 responsive grid', () => {
  for (const { width, columns } of cases) {
    test(`T-02 FR-02 ${width} px shows ${columns} column(s), row by row, no horizontal scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await withData(page);
      await page.goto('/');
      const l = await layout(page);
      expect(l.columns).toBe(columns);
      expect(l.firstRow).toHaveLength(columns);
      expect([...l.firstRow].sort((a, b) => a - b)).toEqual(l.firstRow); // row-major: left to right
      expect(l.hScroll).toBe(false);
    });
  }

  test('T-02 FR-02 D40 the 3-column setting keeps 3 columns at 1440 px', async ({ page }) => {
    await seedPrefs(page, { version: 1, columns: 3 });
    await withData(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    expect((await layout(page)).columns).toBe(3);
  });

  test('T-02 FR-02 4-column setting applies at 1440 px but not at 1024 px', async ({ page }) => {
    await seedPrefs(page, { version: 1, columns: 4 });
    await withData(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    expect((await layout(page)).columns).toBe(4);
    await page.setViewportSize({ width: 1024, height: 900 });
    expect((await layout(page)).columns).toBe(3);
  });

  test.describe('200% zoom', () => {
    // A 1280 px window at 200% zoom lays out like 640 CSS px at device scale 2.
    test.use({ viewport: { width: 640, height: 800 }, deviceScaleFactor: 2 });
    test('T-02 FR-02 200% zoom: 2 columns, no horizontal scroll', async ({ page }) => {
      await withData(page);
      await page.goto('/');
      const l = await layout(page);
      expect(l.columns).toBe(2);
      expect(l.hScroll).toBe(false);
    });
  });
});
