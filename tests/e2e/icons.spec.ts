import { expect, test } from '@playwright/test';

test.describe('D42 FR-12 logo, favicon and manifest', () => {
  test('D42 FR-12 every page links the favicon, touch icon and manifest, and they load', async ({ page, request }) => {
    for (const path of ['/', '/about/', '/help/', '/privacy/', '/404.html']) {
      await page.goto(path);
      for (const sel of ['link[rel="icon"][type="image/svg+xml"]', 'link[rel="icon"][sizes="32x32"]', 'link[rel="apple-touch-icon"]', 'link[rel="manifest"]']) {
        const href = await page.locator(sel).getAttribute('href');
        expect(href, `${path} ${sel}`).toBeTruthy();
        expect((await request.get(href ?? '')).status(), `${path} ${href}`).toBe(200);
      }
      await expect(page.locator('.wordmark .logo')).toHaveAttribute('aria-hidden', 'true');
      await expect(page.locator('.wordmark')).toHaveAccessibleName('Desi Desktop');
    }
  });

  test('D42 FR-12 the manifest names the site and lists 192 and 512 px icons that load', async ({ request }) => {
    const m = (await (await request.get('/manifest.webmanifest')).json()) as { name: string; icons: { src: string; sizes: string }[] };
    expect(m.name).toBe('Desi Desktop');
    expect(m.icons.map((i) => i.sizes)).toEqual(['192x192', '512x512']);
    for (const i of m.icons) expect((await request.get(`/${i.src}`)).status()).toBe(200);
  });
});
