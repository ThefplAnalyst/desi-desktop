import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { tile, withData } from './helpers.ts';

// D43: a publisher whose terms require a credit link (BBC: "BBC News, bbc.co.uk/news", text and
// hyperlink in a prominent place nearby) gets that link in the tile footer.
test('D43 FR-03 a source with a required credit shows it as a link in the tile footer', async ({ page }) => {
  await withData(page);
  const sources = JSON.parse(readFileSync('tests/fixtures/sources.sample.json', 'utf8')) as { sources: { id: string; credit?: unknown }[] };
  for (const s of sources.sources) if (s.id === 'pib') s.credit = { text: 'From Example News, example.org/news', url: 'https://example.org/news' };
  await page.route('**/data/sources.json', (r) => r.fulfill({ json: sources }));
  await page.goto('/');
  const link = tile(page, 'india-news').locator('footer').getByRole('link', { name: 'From Example News, example.org/news' });
  await expect(link).toHaveAttribute('href', 'https://example.org/news');
  // Sources without a credit keep plain text.
  await expect(tile(page, 'us-news').locator('footer a')).toHaveCount(0);
});
