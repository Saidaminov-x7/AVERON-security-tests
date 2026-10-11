import { expect, test, type Page } from '@playwright/test';

const adminUrl = process.env.AVERON_ADMIN_URL;
const fixtureUrl = process.env.AVERON_FITTING_ROOM_FIXTURE_URL;
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
type ReviewFixtureImport = {
  id: string;
  originalTitle: string;
  source: 'SOURCE_1688';
  sourceUrl: string;
  sourcePriceCny: string;
  suggestedPriceUzs: string;
  expectedProfitUzs: string;
  status: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
  sourceMetadata: { provider: string; deduplicationKey: string };
  normalizedPayload: {
    schemaVersion: number;
    provider: string;
    country: string;
    sourceDescription: string;
    sourceImages: string[];
    sourceCategory: string;
    sourcePriceCurrency: string;
    sourceAttributes: Record<string, string>;
    variants: Array<{ color: string; size: string }>;
    sizes: string[];
    fetchedAt: string;
    rawMetadata: Record<string, unknown>;
  };
  createdAt: string;
  updatedAt: string;
  product?: { id: string; status: 'PUBLISHED' | 'DRAFT' };
  rejectionReason?: string;
  reviewedAt?: string;
  reviewedById?: string;
};

async function authenticateFixtureAdmin(page: Page) {
  test.skip(!adminUrl || !fixtureUrl, 'Set local admin and fixture URLs to run authenticated admin route smoke.');
  const admin = new URL(adminUrl!);
  const fixture = new URL(fixtureUrl!);
  test.skip(!loopbackHosts.has(admin.hostname) || !loopbackHosts.has(fixture.hostname), 'Admin route smoke permits fixture authentication only on loopback.');

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || url.origin === admin.origin || url.origin === fixture.origin) {
      await route.continue();
      return;
    }
    await route.abort('blockedbyclient');
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem('i18nextLng')) localStorage.setItem('i18nextLng', 'ru');
  });
  await page.goto(new URL('/login', admin).toString());
  await expect(page.locator('form input[type="email"]')).toBeVisible();
  await page.locator('form input[type="email"]').fill('admin@averon.local');
  await page.locator('form input[type="password"]').fill('fixture-only-not-a-real-credential');

  const loginResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === fixture.origin && url.pathname.endsWith('/auth/login') && response.request().method() === 'POST';
  });
  await page.getByRole('button', { name: /войти в панель|sign in/i }).click();
  expect((await loginResponse).status()).toBe(200);
  return admin;
}

test('actual admin routes mount without browser errors or document overflow on the local SUPER_ADMIN fixture', async ({ page }, info) => {
  test.setTimeout(180_000);
  const admin = await authenticateFixtureAdmin(page);

  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  await page.route('**/api/v1/admin/integration-diagnostics', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
  });

  const routes = [
    '/',
    '/products',
    '/products/new',
    '/products/edit/fixture-review-shirt',
    '/categories',
    '/imports',
    '/orders',
    '/reviews',
    '/finance',
    '/commerce/promo-codes',
    '/media',
    '/users',
    '/users/fixture-admin',
    '/audit-log',
    '/visual-search/audit',
    '/notifications',
    '/analytics',
    '/error-logs',
    '/profile',
    '/settings',
    '/settings/general',
    '/settings/staff',
    '/system/health',
    '/system/integrations',
    '/__route-audit-not-found__',
  ];

  for (const routePath of routes) {
    console.log(`[admin-route-smoke] ${routePath}`);
    const expectedPath = routePath === '/settings' ? '/settings/general' : routePath;
    const response = await page.goto(new URL(routePath, admin).toString(), { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `${routePath} document response`).toBeLessThan(500);
    await expect(page.locator('main'), `${routePath} should mount a main content region`).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('status', { name: 'Loading page' }), `${routePath} lazy route should finish loading`).toBeHidden({ timeout: 20000 });
    await expect(page.getByRole('main').last(), `${routePath} should render page content or a visible recoverable state`).toContainText(/\S/, { timeout: 20000 });
    await expect(page.locator('body'), `${routePath} should not show a server error`).not.toContainText(/Internal Server Error/i);
    if (routePath === '/') {
      await expect(page.locator('main')).not.toContainText('Backend AVERON недоступен. Проверьте соединение.');
    }
    if (routePath === '/reviews') {
      await expect(page.getByRole('main').last()).toContainText(/отзывов|reviews|sharhlar/i);
    }
    if (routePath === '/commerce/promo-codes') {
      await expect(page.getByRole('main').last()).toContainText(/промокод|promo code|promokod/i);
    }
    if (routePath === '/system/integrations') {
      await expect(page.getByRole('status')).toContainText('Для интеграций пока нет диагностических данных.');
      await expect(page.locator('main ul')).toHaveCount(0);
    }
    await expect(page).toHaveURL(new URL(expectedPath, admin).toString());

    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(dimensions.scroll, `${routePath} document overflow`).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(pageErrors, `${routePath} uncaught browser exceptions`).toEqual([]);
    expect(serverErrors, `${routePath} HTTP 5xx responses`).toEqual([]);

    if (['/products', '/products/new', '/settings/general', '/settings/staff'].includes(routePath)) {
      await page.screenshot({
        path: info.outputPath(`admin-route-${routePath.replaceAll('/', '-') || 'home'}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    }
  }

  if (info.project.name === 'desktop-chromium') {
    await page.setViewportSize({ width: 768, height: 1024 });
    for (const routePath of routes) {
      console.log(`[admin-route-smoke:tablet] ${routePath}`);
      const expectedPath = routePath === '/settings' ? '/settings/general' : routePath;
      const response = await page.goto(new URL(routePath, admin).toString(), { waitUntil: 'domcontentloaded' });
      expect(response?.status(), `${routePath} tablet document response`).toBeLessThan(500);
      await expect(page.getByRole('status', { name: 'Loading page' })).toBeHidden({ timeout: 20000 });
      await expect(page.getByRole('main').last()).toContainText(/\S/, { timeout: 20000 });
      await expect(page.locator('body')).not.toContainText(/Internal Server Error/i);
      await expect(page).toHaveURL(new URL(expectedPath, admin).toString());

      const dimensions = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(dimensions.scroll, `${routePath} tablet document overflow`).toBeLessThanOrEqual(dimensions.viewport + 1);
      expect(pageErrors, `${routePath} tablet uncaught browser exceptions`).toEqual([]);
      expect(serverErrors, `${routePath} tablet HTTP 5xx responses`).toEqual([]);
    }
  }
});

test('integration diagnostics clearly explain an empty backend response', async ({ page }, info) => {
  const admin = await authenticateFixtureAdmin(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/api/v1/admin/integration-diagnostics', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '[]',
  }));

  const response = await page.goto(new URL('/system/integrations', admin).toString(), { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.getByRole('status')).toContainText('Для интеграций пока нет диагностических данных.');
  await expect(page.locator('main ul')).toHaveCount(0);

  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1);
  expect(pageErrors).toEqual([]);
  await page.screenshot({ path: info.outputPath('integration-diagnostics-empty-state.png'), fullPage: true });
});

test('authenticated admin can read a security incident notification and open the audit log', async ({ page }) => {
  test.setTimeout(60_000);
  const admin = await authenticateFixtureAdmin(page);
  let readRequests = 0;
  await page.route(/\/admin\/notifications(?:\/security-incident-fixture\/read)?(?:\?.*)?$/, async (route) => {
    const requestUrl = new URL(route.request().url());
    if (requestUrl.pathname.endsWith('/security-incident-fixture/read') && route.request().method() === 'PATCH') {
      readRequests += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'security-incident-fixture', isRead: true }),
      });
      return;
    }
    if (requestUrl.pathname.endsWith('/admin/notifications') && route.request().method() === 'GET') {
      await route.fulfill({
      status: 200,
      contentType: 'application/json',
        body: JSON.stringify({
          unreadCount: 1,
          items: [{
            id: 'security-incident-fixture',
            type: 'SECURITY_INCIDENT',
            title: 'Repeated authorization denials',
            message: 'Authenticated account a1b2c3d4e5f6 received repeated access denials.',
            link: '/audit-log',
            isRead: false,
            targetAdminId: null,
            createdAt: '2026-10-10T10:00:00.000Z',
          }],
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto(new URL('/notifications', admin).toString());
  const incident = page.getByRole('button', { name: /Repeated authorization denials/ });
  await expect(incident).toBeVisible();
  await expect(incident).toContainText('a1b2c3d4e5f6');
  const readRequest = page.waitForRequest((request) => request.method() === 'PATCH'
    && new URL(request.url()).pathname.endsWith('/admin/notifications/security-incident-fixture/read'));
  await incident.click();
  await readRequest;
  await expect(page).toHaveURL(new URL('/audit-log', admin).toString());
  expect(readRequests).toBe(1);
});

test('admin product cards adapt to desktop and mobile widths without horizontal overflow', async ({ page }) => {
  const admin = await authenticateFixtureAdmin(page);
  await page.route('**/api/v1/admin/products**', async (route) => {
    const response = await route.fetch();
    const payload = await response.json() as { items: Array<Record<string, unknown>>; pagination: Record<string, unknown> };
    const base = payload.items[0];
    const cards = Array.from({ length: 5 }, (_, index) => ({
      ...base,
      id: `fixture-grid-product-${index + 1}`,
      slug: `fixture-grid-product-${index + 1}`,
      translations: { ru: { title: `Карточка сетки ${index + 1}` }, uz: { title: `Grid card ${index + 1}` }, en: { title: `Grid card ${index + 1}` } },
    }));
    await route.fulfill({ response, body: JSON.stringify({ ...payload, items: cards, pagination: { ...payload.pagination, total: cards.length } }) });
  });
  await page.goto(new URL('/products', admin).toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('status', { name: 'Loading page' })).toBeHidden({ timeout: 20_000 });
  await expect(page.locator('article')).toHaveCount(5, { timeout: 10_000 });

  const layout = await page.locator('main .grid').filter({ has: page.locator('article') }).evaluate((grid) => {
    const card = grid.querySelector('article');
    if (!card) throw new Error('Expected at least one product card');
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean);
    const cardWidth = card.getBoundingClientRect().width;
    return {
      columns: columns.length,
      cardWidth,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  });

  expect(layout.documentWidth, 'catalog should not overflow horizontally').toBeLessThanOrEqual(layout.viewportWidth + 1);
  if (page.viewportSize()!.width <= 639) {
    expect(layout.columns, 'mobile catalog should use a single card column').toBe(1);
    expect(layout.cardWidth).toBeLessThanOrEqual(layout.viewportWidth);
    const headerLayout = await page.getByRole('heading', { name: /Каталог AVERON|Catalog AVERON/i }).evaluate((heading) => {
      const button = heading.parentElement?.parentElement?.querySelector('button');
      if (!button) throw new Error('Expected the add-product action beside the catalog title');
      return {
        titleFits: heading.scrollWidth <= heading.clientWidth + 1,
        titleBottom: heading.getBoundingClientRect().bottom,
        buttonTop: button.getBoundingClientRect().top,
      };
    });
    expect(headerLayout.titleFits, 'mobile catalog title should not be ellipsized').toBe(true);
    expect(headerLayout.buttonTop, 'mobile add action should move below the title').toBeGreaterThanOrEqual(headerLayout.titleBottom);
  } else {
    expect(layout.columns, 'desktop cards should fill the available grid tracks').toBeGreaterThanOrEqual(2);
    expect(layout.cardWidth, 'a desktop card must not stretch across the entire content area').toBeLessThan(500);
  }
});

test('promo-code create action renders and persists in the local authenticated fixture', async ({ page }) => {
  test.setTimeout(60_000);
  const admin = await authenticateFixtureAdmin(page);
  const fixture = new URL(fixtureUrl!);
  const promoCode = `ROUTE-${Date.now()}`;
  await page.goto(new URL('/commerce/promo-codes', admin).toString(), { waitUntil: 'domcontentloaded' });
  const promoMain = page.getByRole('main').last();
  await expect(page.getByRole('status', { name: 'Loading page' })).toBeHidden({ timeout: 20_000 });
  await expect(promoMain).toContainText(/промокод|promo code|promokod/i, { timeout: 10_000 });
  await promoMain.getByRole('button', { name: /промокод|promo code|promokod/i }).click();
  await expect(promoMain.locator('form')).toBeVisible();
  const formWidth = await promoMain.locator('form').evaluate((form) => form.getBoundingClientRect().width);
  expect(formWidth).toBeGreaterThan(0);
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1);
  await page.locator('form input[required]').first().fill(promoCode);

  const createResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === fixture.origin && url.pathname === '/api/v1/admin/commerce/promo-codes' && response.request().method() === 'POST';
  });
  await promoMain.locator('form').getByRole('button', { name: /промокод|promo code|promokod/i }).click();
  expect((await createResponse).status()).toBe(201);
  const createdCode = promoMain.getByText(promoCode, { exact: true });
  await expect(createdCode).toHaveCount(1, { timeout: 10_000 });
  await expect(createdCode).toBeVisible();
  const recorded = await page.evaluate(async (fixtureOrigin) => {
    const response = await fetch(`${fixtureOrigin}/__fixture/requests`);
    return response.json();
  }, fixture.origin) as { requests: Array<{ method: string; path: string; body?: { code?: string } }> };
  expect(recorded.requests).toContainEqual(expect.objectContaining({
    method: 'POST', path: '/api/v1/admin/commerce/promo-codes', body: expect.objectContaining({ code: promoCode }),
  }));
});

test('manual product wizard writes once, only after final confirmation, and sends the canonical payload', async ({ page }, info) => {
  test.setTimeout(90_000);
  const admin = await authenticateFixtureAdmin(page);
  const fixture = new URL(fixtureUrl!);
  const marker = `FINAL-SAVE-${Date.now()}`;
  let createdProductId: string | null = null;
  const interceptedCreateRequests: Array<{ key: string | undefined; body: string | undefined }> = [];
  let failFirstCreate = true;
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(`${fixture.origin}/api/v1/admin/products`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    interceptedCreateRequests.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postData(),
    });
    if (failFirstCreate) {
      failFirstCreate = false;
      await route.fulfill({
        status: 503,
        headers: {
          'access-control-allow-origin': admin.origin,
          'access-control-allow-credentials': 'true',
          'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message: 'Controlled transient fixture failure', requestId: 'fixture-retry-001' }),
      });
      return;
    }
    await route.continue();
  });

  try {
    await page.goto(new URL('/products/new', admin).toString(), { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/фотографии, затем загрузите GLB-модель/i)).toBeVisible();
    await page.getByRole('button', { name: 'Страна', exact: true }).click();
    await page.getByRole('option', { name: 'Китай', exact: true }).click();

    await page.getByRole('textbox', { name: 'Название', exact: true }).fill(`${marker} рубашка`);
    await page.getByRole('tab').nth(1).click();
    await page.getByRole('textbox', { name: 'Название', exact: true }).fill(`${marker} ko‘ylak`);
    await page.getByRole('tab').nth(2).click();
    await page.getByRole('textbox', { name: 'Название', exact: true }).fill(`${marker} shirt`);

    const nextStep = page.getByRole('button', { name: 'Далее', exact: true });
    await nextStep.click();
    await expect(page.getByText('Шаг 2 из 6', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Цена продажи', exact: true }).fill('180000');
    await nextStep.click();
    await expect(page.getByText('Шаг 3 из 6', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Размеры товара', exact: true }).fill('M');
    await nextStep.click();
    await expect(page.getByText('Шаг 4 из 6', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    await expect(page.getByText('Шаг 3 из 6', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Размеры товара', exact: true })).toHaveValue('M');
    await nextStep.click();
    await expect(page.getByText('Шаг 4 из 6', { exact: true })).toBeVisible();
    await page.locator('input[type="file"][accept*="image/png"]').setInputFiles({
      name: 'fixture-product.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=', 'base64'),
    });
    await expect(page.getByText(/Фотографии: 1 \/ 15/)).toBeVisible();
    await nextStep.click();
    await expect(page.getByText('Шаг 5 из 6', { exact: true })).toBeVisible();
    await expect(page.getByText('Сначала сохраните товар, затем добавьте 3D-модель.')).toBeVisible();
    await page.getByRole('button', { name: 'Назад', exact: true }).click();
    await expect(page.getByText('Шаг 4 из 6', { exact: true })).toBeVisible();
    await expect(page.getByText(/Фотографии: 1 \/ 15/)).toBeVisible();
    await nextStep.click();
    await expect(page.getByText('Шаг 5 из 6', { exact: true })).toBeVisible();
    await nextStep.click();
    await expect(page.getByText('Шаг 6 из 6', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Не удалось загрузить статус публикации в Telegram' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Создать товар', exact: true })).toBeVisible();

    const prematureWrites = await page.evaluate(async ({ fixtureOrigin, markerValue }) => {
      const response = await fetch(`${fixtureOrigin}/__fixture/requests`);
      const data = await response.json();
      return data.requests.filter((request: { method: string; path: string; body?: string }) =>
        request.method === 'POST' && request.path === '/api/v1/admin/products' && request.body?.includes(markerValue),
      ).length;
    }, { fixtureOrigin: fixture.origin, markerValue: marker });
    expect(prematureWrites, 'No product create request may occur while navigating wizard steps').toBe(0);

    await page.getByRole('button', { name: 'Создать товар', exact: true }).dblclick();
    await expect(page.getByRole('alert')).toContainText('fixture-retry-001');
    await page.screenshot({ path: info.outputPath(`${info.project.name}-wizard-retry-error.png`), fullPage: true });
    expect(interceptedCreateRequests).toHaveLength(1);
    const firstAttemptKey = interceptedCreateRequests[0].key;
    expect(firstAttemptKey).toMatch(/^[0-9a-f-]{36}$/i);

    const createResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === fixture.origin && url.pathname === '/api/v1/admin/products' && response.request().method() === 'POST';
    });
    await page.getByRole('button', { name: 'Создать товар', exact: true }).dblclick();
    const createResponse = await createResponsePromise;
    expect(createResponse.status()).toBe(201);
    expect(createResponse.request().headers()['idempotency-key']).toBe(firstAttemptKey);
    await expect.poll(() => interceptedCreateRequests.length).toBe(2);
    const created = await createResponse.json() as { id: string; country: string; title: string; titleUz: string; titleEn: string; salePriceUzs: number; images: Array<{ mediaId: string }> };
    createdProductId = created.id;
    expect(created).toMatchObject({
      country: 'CN',
      title: `${marker} рубашка`,
      titleUz: `${marker} ko‘ylak`,
      titleEn: `${marker} shirt`,
      salePriceUzs: 180000,
    });
    expect(created.images).toEqual([{
      mediaId: 'fixture-media-1',
      coverCrop: { x: 50, y: 50, zoom: 1, orientation: 'portrait' },
    }]);

    const recorded = await page.evaluate(async ({ fixtureOrigin, markerValue }) => {
      const response = await fetch(`${fixtureOrigin}/__fixture/requests`);
      const data = await response.json();
      return data.requests.filter((request: { method: string; path: string; body?: string; key?: string }) =>
        request.method === 'POST' && request.path === '/api/v1/admin/products' && request.body?.includes(markerValue),
      );
    }, { fixtureOrigin: fixture.origin, markerValue: marker }) as Array<{ key: string; body: string }>;
    expect(recorded).toHaveLength(1);
    expect(recorded[0].key).toBe(createResponse.request().headers()['idempotency-key']);
    expect(interceptedCreateRequests.map(({ key }) => key)).toEqual([firstAttemptKey, firstAttemptKey]);
    expect(pageErrors).toEqual([]);
  } finally {
    if (createdProductId) {
      const cleanup = await page.request.delete(new URL(`/__fixture/products/${encodeURIComponent(createdProductId)}`, fixture).toString());
      expect(cleanup.status()).toBe(200);
    }
  }
});

test('cancelling a partially filled manual product wizard creates no product', async ({ page }, info) => {
  test.setTimeout(90_000);
  const admin = await authenticateFixtureAdmin(page);
  const fixture = new URL(fixtureUrl!);
  const marker = `CANCELLED-${Date.now()}`;

  await page.goto(new URL('/products/new', admin).toString(), { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('textbox', { name: 'Название', exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'Название', exact: true }).fill(`${marker} не сохранять`);
  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page).toHaveURL(new URL('/products', admin).toString());
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath(`${info.project.name}-wizard-cancel.png`), fullPage: true });

  const createRequests = await page.evaluate(async ({ fixtureOrigin, markerValue }) => {
    const response = await fetch(`${fixtureOrigin}/__fixture/requests`);
    const data = await response.json();
    return data.requests.filter((request: { method: string; path: string; body?: string }) =>
      request.method === 'POST' && request.path === '/api/v1/admin/products' && request.body?.includes(markerValue),
    );
  }, { fixtureOrigin: fixture.origin, markerValue: marker });
  expect(createRequests).toHaveLength(0);
});

test('parser imports require a reviewed human decision before becoming approved or rejected', async ({ page }, info) => {
  test.setTimeout(90_000);
  const admin = await authenticateFixtureAdmin(page);
  const fixture = new URL(fixtureUrl!);
  const runId = `review-${info.project.name}-${Date.now()}`;
  const fixtureImports = new Map<string, ReviewFixtureImport>();
  const reviewActions: Array<{ id: string; action: 'approve' | 'reject'; body: Record<string, unknown> }> = [];
  for (const action of ['approve', 'reject'] as const) {
    const id = `fixture-import-${runId}-${action}`;
    fixtureImports.set(id, {
      id,
      originalTitle: `Fixture import ${runId} ${action}`,
      source: 'SOURCE_1688',
      sourceUrl: 'https://detail.1688.com/offer/fixture-123.html',
      sourcePriceCny: '42', suggestedPriceUzs: '180000', expectedProfitUzs: '75000',
      status: 'PENDING_REVIEW',
      sourceMetadata: { provider: 'SOURCE_1688', deduplicationKey: `SOURCE_1688:${runId}-${action}` },
      normalizedPayload: {
        schemaVersion: 1, provider: 'SOURCE_1688', country: 'CN',
        sourceDescription: 'Run-scoped parser fixture.', sourceImages: [],
        sourceCategory: 'Outerwear', sourcePriceCurrency: 'CNY',
        sourceAttributes: { material: 'cotton' }, variants: [{ color: 'Blue', size: 'M' }], sizes: ['M'],
        fetchedAt: new Date().toISOString(), rawMetadata: {},
      },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
  }
  const fixtureIds = [...fixtureImports.keys()];

  try {
    await page.route(`${fixture.origin}/api/v1/admin/imports**`, async (route) => {
      const url = new URL(route.request().url());
      const headers = {
        'access-control-allow-origin': admin.origin,
        'access-control-allow-credentials': 'true',
        'access-control-allow-headers': 'Authorization, Content-Type',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      };
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers });
        return;
      }
      if (route.request().method() === 'GET' && url.pathname === '/api/v1/admin/imports') {
        const status = url.searchParams.get('status');
        const query = url.searchParams.get('q')?.toLowerCase();
        const rows = [...fixtureImports.values()].filter((item) => (!status || item.status === status) && (!query || `${item.id} ${item.originalTitle}`.toLowerCase().includes(query)));
        const pageNumber = Math.max(1, Number(url.searchParams.get('page')) || 1);
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
        await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify({ items: rows.slice((pageNumber - 1) * limit, pageNumber * limit), pagination: { page: pageNumber, limit, total: rows.length, pages: Math.ceil(rows.length / limit) } }) });
        return;
      }
      const match = url.pathname.match(/^\/api\/v1\/admin\/imports\/([^/]+)\/(approve|reject)$/);
      if (route.request().method() === 'POST' && match) {
        const id = decodeURIComponent(match[1]);
        const action = match[2] === 'approve' ? 'approve' : 'reject';
        const item = fixtureImports.get(id);
        const body = route.request().postDataJSON() as Record<string, unknown>;
        if (!item) {
          await route.fulfill({ status: 404, headers, contentType: 'application/json', body: JSON.stringify({ code: 'IMPORT_NOT_FOUND' }) });
          return;
        }
        if (item.status !== 'PENDING_REVIEW') {
          await route.fulfill({ status: 409, headers, contentType: 'application/json', body: JSON.stringify({ code: 'IMPORT_NOT_PENDING_REVIEW' }) });
          return;
        }
        if (action === 'approve') {
          item.status = 'APPROVED';
          item.product = { id: `fixture-product-from-${id}`, status: body.publish === true ? 'PUBLISHED' : 'DRAFT' };
        } else {
          item.status = 'REJECTED';
          item.rejectionReason = typeof body.reason === 'string' ? body.reason.trim() : '';
        }
        item.reviewedAt = new Date().toISOString();
        item.reviewedById = 'fixture-admin';
        reviewActions.push({ id, action, body });
        const result = action === 'approve' ? item.product : item;
        await route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(result) });
        return;
      }
      await route.continue();
    });

    await page.goto(new URL('/imports', admin).toString(), { waitUntil: 'domcontentloaded' });
    const approveRow = page.locator('article').filter({ hasText: `${runId} approve` });
    const rejectRow = page.locator('article').filter({ hasText: `${runId} reject` });
    await expect(approveRow).toBeVisible();
    await expect(rejectRow).toBeVisible();

    await approveRow.getByRole('button', { name: 'Детали', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Снимок источника' })).toBeVisible();
    await expect(page.getByText('Run-scoped parser fixture.')).toBeVisible();
    await page.getByRole('button', { name: /закрыть|close/i }).click();

    await approveRow.getByRole('button', { name: 'Одобрить', exact: true }).click();
    const approvalDialog = page.getByRole('dialog');
    await expect(approvalDialog).toBeVisible();
    const approveAsDraft = approvalDialog.getByRole('button', { name: /Одобрить.*черновик/i });
    await expect(approveAsDraft).toBeDisabled();
    await approvalDialog.getByRole('textbox', { name: 'Цена продажи (UZS)' }).fill('180000');
    await approvalDialog.getByRole('group', { name: 'ru' }).getByRole('textbox', { name: 'Название' }).fill(`Товар ${runId}`);
    await approvalDialog.getByRole('group', { name: 'uz' }).getByRole('textbox', { name: 'Название' }).fill(`Mahsulot ${runId}`);
    await approvalDialog.getByRole('group', { name: 'en' }).getByRole('textbox', { name: 'Название' }).fill(`Product ${runId}`);
    await expect(approveAsDraft).toBeEnabled();
    await approveAsDraft.click();
    await expect(approvalDialog).toBeHidden();
    const approvedAction = reviewActions.find(({ action }) => action === 'approve');
    expect(approvedAction?.id).toBe(fixtureIds[0]);
    expect(approvedAction?.body).toMatchObject({
      salePriceUzs: 180000,
      country: 'CN',
      publish: false,
      translations: {
        ru: { title: `Товар ${runId}` },
        uz: { title: `Mahsulot ${runId}` },
        en: { title: `Product ${runId}` },
      },
    });
    expect(fixtureImports.get(fixtureIds[0])).toMatchObject({ status: 'APPROVED', product: { status: 'DRAFT' } });
    await expect(approveRow).toHaveCount(0);
    await page.getByRole('tab', { name: 'Одобрены' }).click();
    await expect(page.locator('article').filter({ hasText: `${runId} approve` })).toContainText('Одобрены');

    await page.getByRole('tab', { name: 'Ожидают проверки' }).click();
    await expect(rejectRow).toBeVisible();
    await rejectRow.getByRole('button', { name: 'Отклонить', exact: true }).click();
    const rejectionDialog = page.getByRole('dialog');
    const rejectButton = rejectionDialog.getByRole('button', { name: 'Отклонить', exact: true });
    await expect(rejectButton).toBeDisabled();
    await rejectionDialog.getByRole('textbox', { name: 'Причина отклонения' }).fill('Duplicate source listing');
    await expect(rejectButton).toBeEnabled();
    await rejectButton.click();
    await expect(rejectionDialog).toBeHidden();
    const rejectedAction = reviewActions.find(({ action }) => action === 'reject');
    expect(rejectedAction).toMatchObject({ id: fixtureIds[1], body: { reason: 'Duplicate source listing' } });
    expect(fixtureImports.get(fixtureIds[1])).toMatchObject({ status: 'REJECTED', rejectionReason: 'Duplicate source listing' });
    await page.getByRole('tab', { name: 'Отклонены' }).click();
    await expect(page.locator('article').filter({ hasText: `${runId} reject` })).toContainText('Duplicate source listing');
    expect(reviewActions).toHaveLength(2);
  } finally {
    fixtureImports.clear();
  }
});
