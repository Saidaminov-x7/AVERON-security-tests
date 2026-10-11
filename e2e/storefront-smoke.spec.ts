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

test('home keeps every product shelf and its View all link when all fixture feeds are empty', async ({ page }, testInfo) => {
  test.skip(!storefrontUrl?.startsWith('http://127.0.0.1:'), 'Empty-shelf acceptance runs only against an explicit loopback storefront and fixture.');
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || url.protocol === 'blob:' || ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      await route.continue();
      return;
    }
    await route.abort('blockedbyclient');
  });

  const serverErrors: string[] = [];
  const browserErrors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on('pageerror', (error) => browserErrors.push(error.stack || error.message));
  await page.goto(new URL('/ru', storefrontUrl!).toString());
  expect(browserErrors).toEqual([]);

  const categorySection = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Выберите категорию', exact: true }) });
  const categoryGrid = categorySection.locator('div.grid.gap-3');
  const categoryGeometry = await categoryGrid.evaluate((element) => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
    firstImageHeight: element.querySelector<HTMLElement>('a > div')?.getBoundingClientRect().height ?? 0,
  }));
  expect(categoryGeometry.columns).toBe(testInfo.project.name === 'mobile-chromium' ? 2 : 4);
  if (testInfo.project.name === 'mobile-chromium') expect(categoryGeometry.firstImageHeight).toBeLessThan(250);

  const shelves = [
    { title: 'Новинки', href: '/ru/catalog?sort=newest' },
    { title: 'Скидки', href: '/ru/catalog?saleOnly=true' },
    { title: 'Популярное', href: '/ru/catalog?sort=popular' },
  ];
  for (const item of shelves) {
    const heading = page.getByRole('heading', { name: item.title, exact: true });
    await expect(heading).toBeVisible();
    const shelf = page.locator('section').filter({ has: heading });
    await expect(shelf.getByRole('status')).toHaveText('В этой подборке пока нет товаров.');
    await expect(shelf.getByRole('link', { name: 'Смотреть все' })).toHaveAttribute('href', item.href);
  }

  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(serverErrors).toEqual([]);
  const captureTag = (process.env.AVERON_UI_RUN_TAG ?? 'local').replace(/[^a-z0-9-]/gi, '-');
  await page.screenshot({ path: testInfo.outputPath(`home-empty-shelves-${captureTag}.png`), fullPage: true, animations: 'disabled' });
  const saleShelf = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Скидки', exact: true }) });
  await saleShelf.getByRole('link', { name: 'Смотреть все' }).click();
  await expect(page).toHaveURL(new URL('/ru/catalog?saleOnly=true', storefrontUrl!).toString());
  await expect(page.getByRole('main').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Internal Server Error/i);
  expect(browserErrors).toEqual([]);
});

test('local desktop catalog uses four columns when filters are hidden', async ({ page }, testInfo) => {
  test.skip(!storefrontUrl?.startsWith('http://127.0.0.1:'), 'Grid interaction acceptance runs only against a loopback storefront fixture.');
  await page.setViewportSize({ width: 1278, height: 900 });
  const storefrontOrigin = new URL(storefrontUrl!).origin;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || url.origin === storefrontOrigin || url.origin === 'http://127.0.0.1:4100') {
      await route.continue();
      return;
    }
    await route.abort('blockedbyclient');
  });

  const serverErrors: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(new URL('/ru/catalog', storefrontUrl!).toString());
  await expect(page.getByRole('heading', { name: /товары \(4\)|products \(4\)|mahsulotlar \(4\)/i })).toBeVisible();
  await expect(page.locator('.catalog-product-grid a')).toHaveCount(4);

  const filterToggle = page.getByRole('button', { name: /скрыть фильтры|hide filters|filtrlarni yashirish/i });
  await expect(filterToggle).toHaveAttribute('aria-expanded', 'true');
  await filterToggle.click();
  await expect(page.getByRole('button', { name: /показать фильтры|show filters|filtrlarni ko['’‘]rsatish/i })).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => page.locator('.catalog-product-grid').evaluate((grid) =>
    getComputedStyle(grid).gridTemplateColumns.split(' ').length,
  )).toBe(4);
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
    font: getComputedStyle(document.body).fontFamily,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(dimensions.font).toContain('Inter');
  expect(serverErrors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('catalog-hidden-filters-four-columns-1278x900.png'), fullPage: true, animations: 'disabled' });
});

test('local storefront product gallery zooms, changes image and restores focus on close', async ({ page }, testInfo) => {
  test.skip(!storefrontUrl?.startsWith('http://127.0.0.1:'), 'Gallery fixture acceptance runs only against an explicit loopback storefront');
  await page.goto(new URL('/ru/catalog/fixture-product-review', storefrontUrl!).toString());
  await expect(page.getByRole('heading', { name: 'GLB review fixture shirt' })).toBeVisible();

  const opener = page.getByRole('button', { name: 'Открыть фото на весь экран' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: 'Фотографии товара' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Закрыть просмотр фото' })).toBeFocused();
  await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

  await dialog.getByRole('button', { name: 'Увеличить фото' }).click();
  await expect(dialog).toContainText('150%');
  await page.screenshot({ path: testInfo.outputPath('storefront-product-gallery-zoom.png') });
  await dialog.getByRole('button', { name: 'Следующее фото' }).click();
  await expect(dialog).toContainText(/2\s*\/\s*2/);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  await expect(opener).toBeFocused();
});

test('local login keeps the Uzbek phone prefix and explains that SMS is unavailable', async ({ page }) => {
  test.skip(!storefrontUrl?.startsWith('http://127.0.0.1:'), 'Auth fixture acceptance runs only against an explicit loopback storefront');
  await page.goto(new URL('/ru/login', storefrontUrl!).toString());
  await expect(page.getByRole('status')).toContainText('Подтверждение по SMS сейчас недоступно. Попробуйте позже.');

  const phone = page.getByRole('textbox', { name: 'Номер телефона' });
  await phone.fill('');
  await expect(phone).toHaveValue('+998 ');
  await phone.fill('+998 90 123 45 67');
  await expect(phone).toHaveValue('+998 90 123 45 67');
  await expect(page.getByRole('button', { name: 'SMS недоступны' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Забыли пароль?' })).toBeVisible();
});

test('local login exposes OTP error and lets the customer correct credentials without sending SMS', async ({ page }, testInfo) => {
  test.skip(!storefrontUrl?.startsWith('http://127.0.0.1:'), 'Controlled auth adapter runs only against an explicit loopback storefront');
  let capabilitiesIntercepted = false;
  let verificationAttempts = 0;
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.includes('/api/v1/capabilities')) {
      capabilitiesIntercepted = true;
      return route.fulfill({ status: 200, json: { smsVerification: true } });
    }
    if (url.endsWith('/auth/login/phone/request-code')) return route.fulfill({ status: 200, json: { ok: true, expiresIn: 300 } });
    if (url.endsWith('/auth/login/phone/verify-code')) {
      verificationAttempts += 1;
      if (verificationAttempts === 1) {
        return route.fulfill({ status: 401, json: { code: 'INVALID_OTP', message: 'Invalid verification code.' } });
      }
      return route.fulfill({
        status: 200,
        json: {
          accessToken: 'local-only-e2e-access-token',
          user: { id: 'local-only-e2e-customer', name: 'Local E2E Customer', phone: '+998 90 123 45 67', role: 'CUSTOMER' },
        },
      });
    }
    return route.continue();
  });
  await page.goto(new URL('/ru/login?returnTo=%2Fru%2Fcatalog%3Fcategory%3Dshoes%26page%3D2', storefrontUrl!).toString());
  const phone = page.getByRole('textbox', { name: 'Номер телефона' });
  await phone.fill('+998 ');
  await phone.pressSequentially('901234567');
  await page.getByLabel('Пароль').fill('local-only-fixture-password');
  await expect.poll(() => capabilitiesIntercepted).toBe(true);
  await expect(phone).toHaveValue('+998 90 123 45 67');
  const continueButton = page.getByRole('button', { name: 'Продолжить' });
  await expect(continueButton).toBeEnabled();
  await continueButton.click();
  await expect(page.getByLabel('Код из SMS')).toBeVisible();

  await page.getByLabel('Код из SMS').fill('111111');
  await page.getByRole('button', { name: 'Подтвердить и войти' }).click();
  await expect(page.getByText('Не удалось подтвердить данные. Проверьте номер и пароль')).toBeVisible();
  await page.getByRole('button', { name: 'Изменить данные' }).click();
  await expect(page.getByRole('textbox', { name: 'Номер телефона' })).toBeVisible();
  await expect(page.getByLabel('Пароль')).toHaveValue('local-only-fixture-password');
  await continueButton.click();
  await page.getByLabel('Код из SMS').fill('222222');
  await page.getByRole('button', { name: 'Подтвердить и войти' }).click();
  await expect(page).toHaveURL(/\/ru\/catalog\?category=shoes&page=2$/);
  await expect(page.getByRole('main').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('safe-return-after-otp.png'), fullPage: true, animations: 'disabled' });
});

test('local registration verifies the canonical phone and creates a customer only after OTP', async ({ page }) => {
  test.skip(!storefrontUrl?.startsWith('http://127.0.0.1:'), 'Registration acceptance uses only an explicit loopback storefront and controlled API adapter');
  const storefrontOrigin = new URL(storefrontUrl!).origin;
  const registrationRequests: Array<Record<string, unknown>> = [];
  const verificationRequests: Array<Record<string, unknown>> = [];
  let registrationVerified = false;
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 500) browserErrors.push(`${response.status()} ${response.url()}`); });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (url.origin === storefrontOrigin && !path.startsWith('/api/backend/')) return route.continue();
    if (path.includes('/api/v1/capabilities')) return route.fulfill({ status: 200, json: { smsVerification: true } });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, json: registrationVerified
      ? { id: 'local-only-e2e-new-customer', name: 'Local Registration Customer', phone: '+998 90 123 45 67', role: 'CUSTOMER' }
      : null });
    if (path.endsWith('/auth/register/phone/request-code')) {
      registrationRequests.push(request.postDataJSON() as Record<string, unknown>);
      return route.fulfill({ status: 200, json: { ok: true, expiresIn: 300 } });
    }
    if (path.endsWith('/auth/register/phone/verify-code')) {
      verificationRequests.push(request.postDataJSON() as Record<string, unknown>);
      registrationVerified = true;
      return route.fulfill({ status: 201, json: {
        accessToken: 'local-only-e2e-registration-token',
        user: { id: 'local-only-e2e-new-customer', name: 'Local Registration Customer', phone: '+998 90 123 45 67', role: 'CUSTOMER' },
      } });
    }
    if (path.endsWith('/auth/sessions') || path.endsWith('/ai-chat/sessions') || path.endsWith('/api/v1/orders/me')) {
      return route.fulfill({ status: 200, json: [] });
    }
    if (path.endsWith('/api/v1/cart')) return route.fulfill({ status: 200, json: { items: [], subtotalUzs: '0.00', currency: 'UZS' } });
    if (path.startsWith('/api/backend/')) return route.fulfill({ status: 200, json: {} });
    return route.abort('blockedbyclient');
  });

  await page.goto(new URL('/ru/register', storefrontUrl!).toString());
  await page.getByLabel('Имя').fill('Local Registration Customer');
  await page.getByLabel('Номер телефона').fill('+998 90 123 45 67');
  await page.locator('input[type="password"]').nth(0).fill('local-only-fixture-password');
  await page.getByLabel('Повторите пароль').fill('mismatched-local-password');
  await page.getByRole('button', { name: 'Получить код' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Пароли не совпадают.' })).toBeVisible();
  expect(registrationRequests).toHaveLength(0);
  await page.getByLabel('Повторите пароль').fill('local-only-fixture-password');
  await page.getByRole('button', { name: 'Получить код' }).click();
  await expect(page.getByLabel('Код из SMS')).toBeVisible();
  await expect.poll(() => registrationRequests.length).toBe(1);
  expect(registrationRequests[0]).toMatchObject({
    name: 'Local Registration Customer', phone: '+998901234567', password: 'local-only-fixture-password',
  });

  await page.getByLabel('Код из SMS').fill('135790');
  await page.getByRole('button', { name: 'Подтвердить регистрацию' }).click();
  await expect(page).toHaveURL(/\/ru\/profile$/);
  await expect.poll(() => verificationRequests.length).toBe(1);
  expect(verificationRequests[0]).toEqual({ phone: '+998901234567', code: '135790' });
  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Local Registration Customer' })).toBeVisible();
});

test('guest purchase resumes after registration and adds the selected product to cart once', async ({ page }, testInfo) => {
  test.skip(!storefrontUrl?.startsWith('http://127.0.0.1:'), 'Purchase continuation uses only an explicit loopback storefront and controlled API adapter');
  const storefrontOrigin = new URL(storefrontUrl!).origin;
  const registrationRequests: Array<Record<string, unknown>> = [];
  const verificationRequests: Array<Record<string, unknown>> = [];
  const cartAddRequests: Array<Record<string, unknown>> = [];
  let registrationVerified = false;
  const customer = {
    id: 'local-only-purchase-customer', name: 'Local Purchase Customer',
    phone: '+998 90 123 45 67', role: 'CUSTOMER',
  };
  const cart = {
    items: [{
      id: 'local-only-purchase-line', productId: 'fixture-product-review', variantId: 'fixture-variant-m',
      title: 'GLB review fixture shirt', imageUrl: null,
      variant: { color: 'Blue', size: 'M', sku: 'LOCAL-E2E-M' },
      quantity: 2, stock: 5, available: true, unitPriceUzs: '180000.00', lineTotalUzs: '360000.00',
    }],
    subtotalUzs: '360000.00', currency: 'UZS' as const,
  };
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 500) browserErrors.push(`${response.status()} ${response.url()}`); });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (url.origin === storefrontOrigin && !path.startsWith('/api/backend/')) return route.continue();
    if (path.includes('/api/v1/capabilities')) return route.fulfill({ status: 200, json: { smsVerification: true } });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: registrationVerified ? 200 : 401, json: registrationVerified ? customer : { code: 'UNAUTHORIZED' } });
    if (path.endsWith('/auth/register/phone/request-code')) {
      registrationRequests.push(request.postDataJSON() as Record<string, unknown>);
      return route.fulfill({ status: 200, json: { ok: true, expiresIn: 300 } });
    }
    if (path.endsWith('/auth/register/phone/verify-code')) {
      verificationRequests.push(request.postDataJSON() as Record<string, unknown>);
      registrationVerified = true;
      return route.fulfill({ status: 201, json: { accessToken: 'local-only-purchase-registration-token', user: customer } });
    }
    if (/\/api\/v1\/products\/[^/]+\/reviews$/.test(path)) return route.fulfill({ status: 200, json: {
      summary: { averageRating: null, reviewCount: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }, fitDistribution: { RUNS_SMALL: 0, TRUE_TO_SIZE: 0, RUNS_LARGE: 0 } },
      items: [], pagination: { page: 1, pages: 0 },
    } });
    if (/\/api\/v1\/products\/[^/]+\/reviews\/eligibility$/.test(path)) return route.fulfill({ status: 200, json: [] });
    if (path.endsWith('/api/v1/cart')) return route.fulfill({ status: 200, json: registrationVerified ? cart : { items: [], subtotalUzs: '0.00', currency: 'UZS' } });
    if (path.endsWith('/api/v1/cart/items') && request.method() === 'POST') {
      cartAddRequests.push(request.postDataJSON() as Record<string, unknown>);
      return route.fulfill({ status: 201, json: cart });
    }
    if (path.endsWith('/auth/sessions') || path.endsWith('/ai-chat/sessions') || path.endsWith('/api/v1/orders/me')) {
      return route.fulfill({ status: 200, json: [] });
    }
    if (path.startsWith('/api/backend/')) return route.fulfill({ status: 200, json: {} });
    return route.abort('blockedbyclient');
  });

  await page.goto(new URL('/ru/catalog/fixture-product-review', storefrontUrl!).toString());
  await expect(page.getByRole('heading', { name: 'GLB review fixture shirt' })).toBeVisible();
  const variantOptions = page.getByRole('group', { name: 'Выберите вариант' });
  await expect(variantOptions.getByRole('group', { name: 'Размер' })).toBeVisible();
  await expect(variantOptions.getByRole('group', { name: 'Цвет' })).toBeVisible();
  await expect(variantOptions.getByRole('button', { name: /^Размер: M,/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(variantOptions.getByRole('button', { name: /Цвет: тёмно-синий/ })).toHaveAttribute('aria-pressed', 'false');
  await variantOptions.getByRole('button', { name: /^Размер: M,/ }).click();
  await expect(variantOptions.getByRole('button', { name: /^Размер: M,/ })).toHaveAttribute('aria-pressed', 'true');
  await variantOptions.getByRole('button', { name: /Цвет: тёмно-синий/ }).click();
  await expect(variantOptions.getByRole('group', { name: 'Цвет: тёмно-синий' })).toBeVisible();
  await expect(variantOptions.getByRole('button', { name: /^Размер: M,/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /увеличить количество/i }).click();
  await expect(page.locator('output[aria-label="Количество: 2"]')).toBeVisible();
  await page.getByRole('button', { name: 'В корзину' }).click();
  const authDialog = page.getByRole('dialog');
  await expect(authDialog).toBeVisible();
  const registrationLink = authDialog.getByRole('link', { name: 'Регистрация' });
  const currentProductPath = new URL(page.url()).pathname;
  const productReturn = new URL(await registrationLink.getAttribute('href')!, storefrontUrl!).searchParams.get('returnTo');
  expect(productReturn).toBe(`${currentProductPath}?addToCart=1&cartVariant=fixture-variant-m&cartQuantity=2`);
  await registrationLink.click();
  await expect(page).toHaveURL(/\/ru\/register\?returnTo=/);

  await page.getByLabel('Имя').fill(customer.name);
  await page.getByLabel('Номер телефона').fill('+998 90 123 45 67');
  await page.locator('input[type="password"]').nth(0).fill('local-only-purchase-password');
  await page.getByLabel('Повторите пароль').fill('local-only-purchase-password');
  await page.getByRole('button', { name: 'Получить код' }).click();
  await expect(page.getByLabel('Код из SMS')).toBeVisible();
  await page.getByLabel('Код из SMS').fill('135790');
  await page.getByRole('button', { name: 'Подтвердить регистрацию' }).click();

  await expect(page).toHaveURL(new URL(productReturn!, storefrontUrl!).toString());
  await expect.poll(() => cartAddRequests.length).toBe(1);
  expect(registrationRequests).toHaveLength(1);
  expect(registrationRequests[0]).toMatchObject({ name: customer.name, phone: '+998 90 123 45 67' });
  expect(verificationRequests).toEqual([{ phone: '+998 90 123 45 67', code: '135790' }]);
  expect(cartAddRequests).toEqual([{ productId: 'fixture-product-review', variantId: 'fixture-variant-m', quantity: 2 }]);
  await page.waitForTimeout(500);
  expect(cartAddRequests).toHaveLength(1);
  await expect(page.getByRole('status').filter({ hasText: 'Добавлено в корзину' })).toBeVisible();
  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('purchase-resumed-after-registration.png'), fullPage: true });
});

test('product detail survives an invalid reviews API success response', async ({ page }, testInfo) => {
  test.skip(!storefrontUrl?.startsWith('http://127.0.0.1:'), 'Malformed API response regression runs only against a loopback storefront and product fixture');
  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 500) browserErrors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/api/backend/api/v1/products/*/reviews*', (route) => route.fulfill({ status: 200, json: { summary: { reviewCount: 0 } } }));

  await page.goto(new URL('/ru/catalog/fixture-product-review', storefrontUrl!).toString());
  await expect(page.getByRole('heading', { name: 'GLB review fixture shirt' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'В корзину' })).toBeVisible();
  await expect(page.locator('#reviews').getByRole('heading', { name: 'Отзывы о товаре' })).toBeVisible();
  await expect(page.locator('#reviews').getByRole('alert')).toBeVisible();
  expect(browserErrors, browserErrors.join('\n')).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('product-reviews-invalid-response.png'), fullPage: true });
});

test('local password reset validates the SMS code before changing credentials', async ({ page }) => {
  test.skip(!storefrontUrl?.startsWith('http://127.0.0.1:'), 'Password reset acceptance uses only an explicit loopback storefront and controlled API adapter');
  const storefrontOrigin = new URL(storefrontUrl!).origin;
  const resetRequests: Array<Record<string, unknown>> = [];
  const verificationRequests: Array<Record<string, unknown>> = [];

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (url.origin === storefrontOrigin && !path.startsWith('/api/backend/')) return route.continue();
    if (path.includes('/api/v1/capabilities')) return route.fulfill({ status: 200, json: { smsVerification: true } });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 200, json: null });
    if (path.endsWith('/auth/password/phone/request-code')) {
      resetRequests.push(request.postDataJSON() as Record<string, unknown>);
      return route.fulfill({ status: 200, json: { ok: true, expiresIn: 300 } });
    }
    if (path.endsWith('/auth/password/phone/verify-code')) {
      verificationRequests.push(request.postDataJSON() as Record<string, unknown>);
      return route.fulfill({ status: 200, json: { ok: true } });
    }
    return route.abort('blockedbyclient');
  });

  await page.goto(new URL('/ru/forgot-password', storefrontUrl!).toString());
  await page.getByLabel('Номер телефона').fill('+998 90 123 45 67');
  await page.getByRole('button', { name: 'Получить код' }).click();
  await expect(page.getByLabel('Код из SMS')).toBeVisible();
  await expect.poll(() => resetRequests.length).toBe(1);
  expect(resetRequests[0]).toEqual({ phone: '+998901234567' });

  await page.getByLabel('Код из SMS').fill('864209');
  await page.getByLabel('Новый пароль').fill('new-local-only-password');
  await page.getByLabel('Повторите пароль').fill('mismatched-new-password');
  await page.getByRole('button', { name: 'Сменить пароль' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Пароли не совпадают.' })).toBeVisible();
  expect(verificationRequests).toHaveLength(0);
  await page.getByLabel('Повторите пароль').fill('new-local-only-password');
  await page.getByRole('button', { name: 'Сменить пароль' }).click();
  await expect(page.getByRole('heading', { name: 'Пароль изменён. Все старые сессии завершены.' })).toBeVisible();
  expect(verificationRequests).toEqual([{
    phone: '+998901234567', code: '864209', password: 'new-local-only-password',
  }]);
});

test('local authenticated checkout revalidates the cart and submits one idempotent order request', async ({ page }) => {
  test.skip(!storefrontUrl?.startsWith('http://127.0.0.1:'), 'Checkout acceptance uses only an explicit loopback storefront and controlled API adapter');

  const storefrontOrigin = new URL(storefrontUrl!).origin;
  const checkoutRequests: Array<{ body: Record<string, unknown>; idempotencyKey: string | undefined }> = [];
  const cart = {
    items: [{
      id: 'local-e2e-cart-line', productId: 'local-e2e-product', variantId: 'local-e2e-variant',
      title: 'Local checkout fixture shirt', imageUrl: null,
      variant: { color: 'Black', size: 'M', sku: 'LOCAL-E2E-M' },
      quantity: 1, stock: 2, available: true, unitPriceUzs: '120000.00', lineTotalUzs: '120000.00',
    }],
    subtotalUzs: '120000.00', currency: 'UZS' as const,
  };
  const order = {
    id: 'local-e2e-order-id', orderNumber: 'LOCAL-E2E-ORDER-0001', status: 'PENDING', currency: 'UZS' as const,
    subtotal: '120000.00', discount: '0.00', deliveryCost: '0.00', totalRevenue: '120000.00',
    contact: { name: 'Local Checkout Customer', phone: '+998 90 123 45 67' },
    deliveryAddress: { city: 'Tashkent', address: 'Amir Temur street 1' },
    items: [{ title: 'Local checkout fixture shirt', quantity: 1, unitPrice: '120000.00', totalPrice: '120000.00' }],
    createdAt: '2026-10-09T10:00:00.000Z',
  };

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (url.origin === storefrontOrigin && !path.startsWith('/api/backend/')) return route.continue();
    if (path.includes('/api/v1/capabilities')) return route.fulfill({ status: 200, json: { smsVerification: true } });
    if (path.endsWith('/auth/me')) return route.fulfill({ status: 401, json: { code: 'UNAUTHORIZED' } });
    if (path.endsWith('/auth/login/phone/request-code')) return route.fulfill({ status: 200, json: { ok: true, expiresIn: 300 } });
    if (path.endsWith('/auth/login/phone/verify-code')) {
      return route.fulfill({ status: 200, json: {
        accessToken: 'local-only-e2e-access-token',
        user: { id: 'local-only-e2e-customer', name: 'Local Checkout Customer', phone: '+998 90 123 45 67', role: 'CUSTOMER' },
      } });
    }
    if (path.endsWith('/api/v1/cart') && request.method() === 'GET') return route.fulfill({ status: 200, json: cart });
    if (path.endsWith('/api/v1/checkout') && request.method() === 'POST') {
      checkoutRequests.push({
        body: request.postDataJSON() as Record<string, unknown>,
        idempotencyKey: request.headers()['idempotency-key'],
      });
      if (checkoutRequests.length === 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return route.fulfill({ status: 503, json: { code: 'SERVICE_UNAVAILABLE' } });
      }
      return route.fulfill({ status: 201, json: order });
    }
    if (path.includes('/api/v1/orders/me/')) return route.fulfill({ status: 200, json: order });
    // No unexpected API call may escape this isolated test adapter.
    return route.abort('blockedbyclient');
  });

  await page.goto(new URL('/ru/checkout', storefrontUrl!).toString());
  await expect(page).toHaveURL(/\/ru\/login\?returnTo=%2Fru%2Fcheckout$/);
  await page.getByRole('textbox', { name: 'Номер телефона' }).fill('+998 90 123 45 67');
  await page.getByLabel('Пароль').fill('local-only-fixture-password');
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByLabel('Код из SMS')).toBeVisible();
  await page.getByLabel('Код из SMS').fill('246810');
  await page.getByRole('button', { name: 'Подтвердить и войти' }).click();

  await expect(page).toHaveURL(/\/ru\/checkout$/);
  await expect(page.getByRole('heading', { name: 'Оформление заказа' })).toBeVisible();
  const orderSummary = page.getByRole('list', { name: 'Товары в заказе' });
  await expect(orderSummary).toContainText('Local checkout fixture shirt');
  await expect(orderSummary).toContainText('Black · M');
  await expect(orderSummary).toContainText('× 1');
  await page.getByLabel('Имя и фамилия').fill('Local Checkout Customer');
  await page.getByLabel('Телефон').fill('+998 90 123 45 67');
  await page.getByLabel('Город').fill('Tashkent');
  await page.getByLabel('Улица, дом').fill('Amir Temur street 1');
  const submitOrder = page.getByRole('button', { name: 'Подтвердить заказ' });
  await submitOrder.dblclick();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось оформить заказ.' }))
    .toContainText('Не удалось оформить заказ. Проверьте данные и попробуйте ещё раз.');
  await expect.poll(() => checkoutRequests.length).toBe(1);
  await submitOrder.click();

  await expect(page).toHaveURL(/\/ru\/checkout\/success\/LOCAL-E2E-ORDER-0001$/);
  await expect.poll(() => checkoutRequests.length).toBe(2);
  expect(checkoutRequests[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
  expect(checkoutRequests[1].idempotencyKey).toBe(checkoutRequests[0].idempotencyKey);
  expect(checkoutRequests[1].body).toEqual(checkoutRequests[0].body);
  expect(checkoutRequests[0].body).toMatchObject({
    contact: { name: 'Local Checkout Customer', phone: '+998 90 123 45 67' },
    deliveryAddress: { city: 'Tashkent', address: 'Amir Temur street 1' },
  });
  expect(checkoutRequests[0].body).not.toHaveProperty('total');
  expect(checkoutRequests[0].body).not.toHaveProperty('subtotal');
  expect(checkoutRequests[0].body).not.toHaveProperty('items');
});

test('admin login surface renders without protected dashboard data', async ({ page }) => {
  test.skip(!adminUrl, 'AVERON_ADMIN_URL is not configured; hosted E2E is not live-verified');
  await page.goto(new URL('/login', adminUrl!).toString());
  await expect(page.locator('body')).toBeVisible();
  await expect(page.locator('form')).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/Internal Server Error/i);
});
