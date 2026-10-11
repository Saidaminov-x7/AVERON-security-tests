import { expect, test } from '@playwright/test';

const storefrontUrl = process.env.AVERON_STOREFRONT_URL;
const isLoopbackStorefront = Boolean(storefrontUrl && /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(new URL(storefrontUrl).origin));

test('local product details keep readable article, localized options, care information and compact purchase layout', async ({ page }, testInfo) => {
  test.skip(!isLoopbackStorefront, 'Product detail acceptance runs only against the explicitly configured loopback storefront fixture.');

  const serverErrors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
  });

  await page.goto(new URL('/ru/catalog/fixture-product-review', storefrontUrl!).toString());
  await expect(page.getByRole('heading', { name: 'GLB review fixture shirt' })).toBeVisible();
  await expect(page).toHaveURL(/\/ru\/catalog\/AVR-000000000000001$/);
  await expect(page.locator('header a').first()).toHaveText('AVERON');
  await expect(page.getByText(/\u0410\u0440\u0442\u0438\u043a\u0443\u043b: AVR-000000000000001/)).toBeVisible();
  await expect(page.getByText(/\u0425\u043b\u043e\u043f\u043e\u043a 100%/)).toBeVisible();
  await expect(page.getByText(/\u041c\u0430\u0448\u0438\u043d\u043d\u0430\u044f \u0441\u0442\u0438\u0440\u043a\u0430, \u043d\u0435 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u0442\u044c \u0441\u0443\u0448\u0438\u043b\u044c\u043d\u0443\u044e \u043c\u0430\u0448\u0438\u043d\u0443/)).toBeVisible();

  const options = page.getByRole('group', { name: '\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0432\u0430\u0440\u0438\u0430\u043d\u0442' });
  await expect(options.getByRole('group', { name: '\u0420\u0430\u0437\u043c\u0435\u0440' })).toBeVisible();
  await expect(options.getByRole('group', { name: '\u0426\u0432\u0435\u0442' })).toBeVisible();
  const darkBlue = page.getByRole('button', { name: /\u0426\u0432\u0435\u0442: \u0442\u0451\u043c\u043d\u043e-\u0441\u0438\u043d\u0438\u0439/ });
  await expect(darkBlue).toHaveAttribute('aria-pressed', 'false');
  await expect(options.getByRole('button', { name: /^Размер: M,/ })).toHaveAttribute('aria-pressed', 'false');
  await darkBlue.click();
  await expect(options.getByRole('group', { name: /\u0426\u0432\u0435\u0442.*\u0442\u0451\u043c\u043d\u043e-\u0441\u0438\u043d\u0438\u0439/ })).toBeVisible();
  await expect(darkBlue).toHaveAttribute('aria-pressed', 'true');
  await expect(darkBlue).toHaveClass(/ring-2/);
  await expect(darkBlue.locator('span.sr-only')).toHaveText('dark blue');
  await expect(darkBlue).toHaveCSS('background-color', 'rgb(0, 0, 128)');
  const medium = options.getByRole('button', { name: /^Размер: M,/ });
  await expect(medium).toHaveAttribute('aria-pressed', 'false');
  await medium.click();
  await expect(medium).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('\u0412 \u043d\u0430\u043b\u0438\u0447\u0438\u0438', { exact: true })).toBeVisible();
  await expect(page.getByText(/\u0426\u0432\u0435\u0442:.*\u0420\u0430\u0437\u043c\u0435\u0440:/)).toHaveCount(0);

  const quantity = page.getByRole('group', { name: '\u041a\u043e\u043b\u0438\u0447\u0435\u0441\u0442\u0432\u043e' });
  const purchaseAction = page.getByRole('button', { name: '\u0412 \u043a\u043e\u0440\u0437\u0438\u043d\u0443' });
  await expect(quantity).toBeVisible();
  await expect(purchaseAction).toBeVisible();
  await expect(purchaseAction).toBeEnabled();
  const [quantityBox, actionBox, dimensions] = await Promise.all([
    quantity.boundingBox(),
    purchaseAction.boundingBox(),
    page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth })),
  ]);
  expect(quantityBox).not.toBeNull();
  expect(actionBox).not.toBeNull();
  expect(Math.min(quantityBox!.y + quantityBox!.height, actionBox!.y + actionBox!.height) - Math.max(quantityBox!.y, actionBox!.y)).toBeGreaterThan(0);
  expect(actionBox!.x).toBeGreaterThanOrEqual(quantityBox!.x + quantityBox!.width - 1);
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width + 1);

  if (!testInfo.project.name.includes('mobile')) {
    const galleryBox = await page.getByRole('region', { name: '\u0424\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u0438 \u0442\u043e\u0432\u0430\u0440\u0430' }).boundingBox();
    const purchaseBox = await page.getByRole('region', { name: '\u041f\u0430\u0440\u0430\u043c\u0435\u0442\u0440\u044b \u0438 \u043f\u043e\u043a\u0443\u043f\u043a\u0430' }).boundingBox();
    expect(galleryBox).not.toBeNull();
    expect(purchaseBox).not.toBeNull();
    expect(purchaseBox!.x - (galleryBox!.x + galleryBox!.width)).toBeLessThanOrEqual(40);
  }

  const footer = page.locator('footer');
  await expect(footer).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(footer).toHaveCSS('color', 'rgb(17, 17, 17)');
  await page.screenshot({ path: testInfo.outputPath(`product-detail-${testInfo.project.name}.png`), fullPage: true, animations: 'disabled' });

  await purchaseAction.click();
  await expect(page.getByRole('heading', { name: /\u0412\u043e\u0439\u0434\u0438\u0442\u0435, \u0447\u0442\u043e\u0431\u044b \u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c/ })).toBeVisible();
  const register = page.getByRole('dialog').getByRole('link', { name: '\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f' });
  const registerUrl = new URL(await register.getAttribute('href')!, storefrontUrl!);
  expect(registerUrl.pathname).toBe('/ru/register');
  const returnTo = registerUrl.searchParams.get('returnTo')!;
  expect(new URL(returnTo, storefrontUrl!).searchParams.get('addToCart')).toBe('1');
  expect(new URL(returnTo, storefrontUrl!).searchParams.get('cartVariant')).toBe('fixture-variant-m');
  expect(new URL(returnTo, storefrontUrl!).searchParams.get('cartQuantity')).toBe('1');
  await register.click();
  await expect(page).toHaveURL(/\/ru\/register\?returnTo=/);
  await expect(page.getByRole('heading', { name: /\u0420\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f/ })).toBeVisible();
  const pendingPurchase = await page.evaluate(() => JSON.parse(sessionStorage.getItem('averon:pending-cart-intent') ?? 'null'));
  expect(pendingPurchase).toEqual({ productId: 'fixture-product-review', destination: returnTo });
  expect(serverErrors).toEqual([]);
});
