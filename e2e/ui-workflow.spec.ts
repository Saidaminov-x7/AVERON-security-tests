import { expect, test } from '@playwright/test';
const storeUrl = process.env.AVERON_STOREFRONT_URL;
const adminUrl = process.env.AVERON_ADMIN_URL;
async function checkOverflow(page: import('@playwright/test').Page) {
  const sizes = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, view: document.documentElement.clientWidth }));
  expect(sizes.page).toBeLessThanOrEqual(sizes.view + 1);
}
test('localized catalog viewport checks', async ({ page }, info) => {
  test.skip(!storeUrl);
  for (const lang of ['ru', 'uz', 'en']) {
    await page.goto(new URL('/' + lang + '/catalog', storeUrl!).toString());
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Internal Server Error/i);
    await checkOverflow(page);
    if (lang === 'ru') await page.screenshot({ path: info.outputPath(info.project.name + '-catalog-ru.png'), fullPage: true, animations: 'disabled' });
  }
});
test('desktop filter visibility toggle', async ({ page }, info) => {
  test.skip(!storeUrl);
  test.skip(info.project.name.includes('mobile'));
  await page.goto(new URL('/ru/catalog', storeUrl!).toString());
  const toggle = page.locator('button[aria-expanded]').filter({ hasText: /фильтр|filter|filtr/i }).first();
  const initial = await toggle.getAttribute('aria-expanded');
  expect(['true', 'false']).toContain(initial);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', initial === 'true' ? 'false' : 'true');
  await expect(page.locator('.catalog-product-grid')).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', initial!);
});
test('mobile filters can be collapsed and restored', async ({ page }, info) => {
  test.skip(!storeUrl);
  test.skip(!info.project.name.includes('mobile'));
  await page.goto(new URL('/ru/catalog', storeUrl!).toString());
  const toggle = page.locator('button[aria-expanded]').filter({ hasText: /фильтр|filter|filtr/i }).first();
  const initial = await toggle.getAttribute('aria-expanded');
  expect(['true', 'false']).toContain(initial);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', initial === 'true' ? 'false' : 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', initial!);
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
});
test('admin login page renders without authentication actions', async ({ page }, info) => {
  test.skip(!adminUrl);
  await page.goto(new URL('/login', adminUrl!).toString());
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Internal Server Error/i);
  await expect(page.locator('form input[type="email"]')).toBeVisible({ timeout: 10000 });
  await checkOverflow(page);
  await page.screenshot({ path: info.outputPath(info.project.name + '-admin-login.png'), fullPage: true, animations: 'disabled' });
});
