import { expect, test } from '@playwright/test';

const storefrontUrl = process.env.AVERON_STOREFRONT_URL;
const adminUrl = process.env.AVERON_ADMIN_URL;

test.beforeAll(() => {
  if (process.env.CI && (!storefrontUrl || !adminUrl)) {
    throw new Error('Live browser verification is blocked: set both AVERON_STOREFRONT_URL and AVERON_ADMIN_URL.');
  }
});

test('localized storefront routes render without horizontal overflow', async ({ page }) => {
  test.skip(!storefrontUrl, 'AVERON_STOREFRONT_URL is not configured; hosted E2E is not live-verified');
  for (const locale of ['ru', 'uz', 'en']) {
    await page.goto(new URL(`/${locale}`, storefrontUrl).toString());
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByRole('main').first()).toBeVisible();
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
  }
});

test('storefront catalog route renders', async ({ page }) => {
  test.skip(!storefrontUrl, 'AVERON_STOREFRONT_URL is not configured; hosted E2E is not live-verified');
  await page.goto(new URL('/ru/catalog', storefrontUrl).toString());
  await expect(page.locator('body')).toBeVisible();
  await expect(page.getByRole('main').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Internal Server Error/i);
});

test('admin login surface renders without protected dashboard data', async ({ page }) => {
  test.skip(!adminUrl, 'AVERON_ADMIN_URL is not configured; hosted E2E is not live-verified');
  await page.goto(adminUrl!);
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('form')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Internal Server Error/i);
});
