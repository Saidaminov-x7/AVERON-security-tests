import { expect, test } from '@playwright/test';
const storeUrl = process.env.AVERON_STOREFRONT_URL;
const adminUrl = process.env.AVERON_ADMIN_URL;
const fittingRoomGlb = process.env.AVERON_FITTING_ROOM_GLB;
const fittingRoomFixtureUrl = process.env.AVERON_FITTING_ROOM_FIXTURE_URL;
const fittingRoomStoreFixtureUrl = process.env.AVERON_FITTING_ROOM_STORE_FIXTURE_URL;
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
  const filters = page.getByRole('complementary');
  const initial = await toggle.getAttribute('aria-expanded');
  expect(['true', 'false']).toContain(initial);
  await expect(filters).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', initial === 'true' ? 'false' : 'true');
  await expect(filters).toBeHidden();
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', initial!);
  await expect(filters).toBeVisible();
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

test('fitting room rotates, adds/removes a layer, and recalculates the outfit total', async ({ page }, info) => {
  test.skip(!fittingRoomStoreFixtureUrl, 'Set AVERON_FITTING_ROOM_STORE_FIXTURE_URL to an isolated storefront containing the fitting-room test product.');
  const fixtureOrigin = new URL(fittingRoomStoreFixtureUrl!).origin;
  test.skip(!['127.0.0.1', 'localhost'].includes(new URL(fixtureOrigin).hostname), 'Fitting-room fixture-product flows run only against loopback storefront fixtures.');
  await page.goto(new URL('/ru/catalog/fixture-product-review', fittingRoomStoreFixtureUrl!).toString());
  await expect(page.getByRole('heading', { name: 'GLB review fixture shirt' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Примерить' }).click();

  const dialog = page.getByRole('dialog', { name: 'Виртуальная примерочная' });
  const outfit = dialog.getByRole('region', { name: 'Мой образ' });
  await expect(dialog).toBeVisible();
  await expect(outfit.getByText('GLB review fixture shirt')).toBeVisible({ timeout: 10000 });
  const viewer = dialog.getByRole('region', { name: 'Виртуальная примерочная' });
  const canvas = viewer.locator('canvas');
  const fallback = viewer.getByRole('status').filter({ hasText: /3D-просмотр недоступен|3D viewing is unavailable/i });
  const rotateRight = dialog.getByRole('button', { name: 'Повернуть вправо' });
  const loading = viewer.getByRole('status').filter({ hasText: /Загружаем 3D-просмотр|Loading 3D viewer|3D model yuklanmoqda|Загружаем модель|Loading model/i });
  await expect.poll(async () => await rotateRight.count() > 0 || await fallback.count() > 0 || await viewer.getByRole('alert').count() > 0 || await loading.count() > 0, { timeout: 20000 }).toBe(true);
  if (await loading.count()) await expect(loading).toBeHidden({ timeout: 20000 });
  if (await canvas.count()) await expect(canvas).toBeVisible();
  const webglViewerReady = await rotateRight.count() > 0;
  if (webglViewerReady) await expect(viewer.getByRole('alert')).toHaveCount(0);
  else {
    if (await fallback.count()) await expect(fallback).toBeVisible();
    else await expect(viewer.getByRole('alert')).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Вид спереди' })).toHaveCount(0);
  }
  const total = outfit.locator('strong');
  await expect(total).toHaveText('180 000 сум');
  await dialog.screenshot({ path: info.outputPath(info.project.name + '-fitting-room-dialog.png'), animations: 'disabled' });
  if (webglViewerReady) {
    const rotateLeft = dialog.getByRole('button', { name: 'Повернуть влево' });
    for (let step = 0; step < 8; step += 1) await rotateRight.click();
    await expect(dialog.getByRole('status', { name: '60°' })).toBeVisible();
    for (let step = 0; step < 14; step += 1) await rotateLeft.click();
    await expect(dialog.getByRole('status', { name: '-60°' })).toBeVisible();
    await dialog.getByRole('button', { name: 'Вид спереди' }).click();
    await expect(dialog.getByRole('status', { name: '0°' })).toBeVisible();
    if (!info.project.name.includes('mobile')) {
      const bounds = await canvas.boundingBox();
      expect(bounds).not.toBeNull();
      await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
      await page.mouse.down();
      await page.mouse.move(bounds!.x + bounds!.width / 2 + 60, bounds!.y + bounds!.height / 2, { steps: 4 });
      await page.mouse.up();
      await expect.poll(async () => Number.parseInt((await dialog.getByRole('status').first().innerText()).replace('°', ''), 10))
        .toBeGreaterThan(0);
      await dialog.getByRole('button', { name: 'Вид спереди' }).click();
      await expect(dialog.getByRole('status', { name: '0°' })).toBeVisible();
    }
  } else {
    await expect(viewer.getByRole('button', { name: 'Повернуть вправо' })).toHaveCount(0);
    await expect(viewer.getByRole('button', { name: 'Вид спереди' })).toHaveCount(0);
  }
  if (info.project.name.includes('mobile') && webglViewerReady && await canvas.count()) {
    const bounds = await canvas.boundingBox();
    expect(bounds).not.toBeNull();
    const touchX = Math.round(bounds!.x + bounds!.width / 2);
    const touchY = Math.round(bounds!.y + bounds!.height / 2);
    const cdp = await page.context().newCDPSession(page);
    const touch = (x: number, y: number) => ({ x, y, id: 7, radiusX: 2, radiusY: 2, force: 1 });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(touchX, touchY)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(touchX + 60, touchY)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => {
      const rotation = await dialog.getByRole('status').first().getAttribute('aria-label');
      return Number.parseInt(rotation ?? '0', 10);
    }).toBeGreaterThan(0);
    await dialog.getByRole('button', { name: 'Вид спереди' }).click();
    await expect(dialog.getByRole('status', { name: '0°' })).toBeVisible();

    const scrollContainer = dialog.locator(':scope > div').first();
    const scrollBefore = await scrollContainer.evaluate((element) => element.scrollTop);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touch(touchX, touchY)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touch(touchX, touchY - 100)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => scrollContainer.evaluate((element) => element.scrollTop)).toBeGreaterThan(scrollBefore);
    await expect(dialog.getByRole('status', { name: '0°' })).toBeVisible();
    await cdp.detach();
  }
  await dialog.getByRole('button', { name: 'Добавить · Верхняя одежда' }).click();
  await expect(total).toHaveText('360 000 сум');
  await dialog.getByRole('button', { name: 'Убрать: Fixture blue jacket' }).click();
  await expect(total).toHaveText('180 000 сум');
  const frontControl = viewer.getByRole('button', { name: 'Вид спереди' });
  await expect.poll(async () => await frontControl.count() > 0 || await fallback.count() > 0, { timeout: 20000 }).toBe(true);
  if (await frontControl.count()) await expect(frontControl).toBeVisible();
  else await expect(fallback).toBeVisible();
  await checkOverflow(page);
  await page.screenshot({ path: info.outputPath(info.project.name + '-fitting-room.png'), fullPage: true, animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Закрыть примерочную' }).click();
  await expect(dialog).toBeHidden();
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

test('admin fitting-room GLB upload enters review and can be approved', async ({ page }, info) => {
  test.skip(!adminUrl || !fittingRoomGlb || !fittingRoomFixtureUrl, 'Set isolated local admin, fixture, and GLB paths to run this test.');
  const fixture = new URL(fittingRoomFixtureUrl!);
  test.skip(!['127.0.0.1', 'localhost'].includes(fixture.hostname), 'Fitting-room mutations are allowed only against loopback fixtures.');
  const adminOrigin = new URL(adminUrl!).origin;
  test.skip(!['127.0.0.1', 'localhost'].includes(new URL(adminOrigin).hostname), 'Fitting-room browser writes are allowed only against loopback admin builds.');
  await page.goto(new URL('/login', adminUrl!).toString());
  await page.locator('form input[type="email"]').fill('admin@averon.local');
  const password = page.locator('form input[type="password"]');
  await password.fill('fixture-only-not-a-real-credential');
  const loginResponse = page.waitForResponse((response) => response.url().endsWith('/auth/login') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Войти в панель' }).click();
  expect((await loginResponse).status()).toBe(200);
  await page.goto(new URL('/products/edit/fixture-review-shirt', adminUrl!).toString());
  await expect(page.getByRole('heading', { name: /products|товары/i })).toBeVisible();
  if (info.project.name.includes('mobile')) {
    const menu = page.getByRole('button', { name: /open navigation menu|открыть боковое меню/i }).first();
    if (await menu.count()) await menu.click();
  }
  const fittingRoomStep = page.getByRole('button', { name: /fitting room|примерочная/i });
  if (info.project.name.includes('mobile')) {
    await expect(page.getByRole('dialog', { name: /mobile navigation/i })).toBeVisible();
    await page.getByRole('dialog', { name: /mobile navigation/i }).getByRole('button', { name: /close|закрыть/i }).click();
  }
  await fittingRoomStep.click();
  await expect(page.getByRole('heading', { name: /3D-модель для примерочной|virtual fitting room model/i })).toBeVisible();
  const file = page.locator('input[type="file"][accept*=".glb"]');
  await expect(file).toBeVisible();
  const uploadRequest = page.waitForRequest((request) => request.url().includes('/api/v1/admin/products/fixture-review-shirt/fitting-room/assets') && request.method() === 'POST');
  const uploadResponse = page.waitForResponse((response) => response.url().includes('/api/v1/admin/products/fixture-review-shirt/fitting-room/assets') && response.request().method() === 'POST');
  await file.setInputFiles(fittingRoomGlb!);
  await page.getByRole('button', { name: /upload model|загрузить модель/i }).click();
  expect((await uploadResponse).status()).toBe(201);
  const sentRequest = await uploadRequest;
  expect(sentRequest.headers()['content-type']).toMatch(/^multipart\/form-data; boundary=/);
  const asset = page.locator('article').filter({ hasText: 'Local upload fixture accepted for workflow testing' });
  await expect(asset.getByText(/needs review|нужна проверка/i)).toBeVisible();
  await expect(asset.getByRole('button', { name: /approve|одобрить/i })).toBeVisible();
  const approveResponse = page.waitForResponse((response) => response.url().includes('/api/v1/admin/fitting-room/assets/fixture-glb-uploaded/review') && response.request().method() === 'POST');
  await asset.getByRole('button', { name: /approve|одобрить/i }).click();
  expect((await approveResponse).status()).toBe(200);
  await expect(asset.getByText(/approved|одобрено/i)).toBeVisible();
  const result = await page.request.get(new URL('/__fixture/requests', fittingRoomFixtureUrl!).toString());
  expect(result.ok()).toBeTruthy();
  const recorded = await result.json();
  expect(recorded.requests).toEqual(expect.arrayContaining([
    expect.objectContaining({ method: 'POST', path: '/api/v1/admin/products/fixture-review-shirt/fitting-room/assets', bytes: expect.any(Number), layer: 'BASE_TOP', variantId: null }),
    expect.objectContaining({ method: 'POST', path: '/api/v1/admin/fitting-room/assets/fixture-glb-uploaded/review', body: expect.objectContaining({ action: 'approve' }) }),
  ]));
  expect(recorded.requests.find((request: { path?: string }) => request.path === '/api/v1/admin/products/fixture-review-shirt/fitting-room/assets')?.bytes).toBeGreaterThan(100);
  await checkOverflow(page);
  await page.screenshot({ path: info.outputPath(info.project.name + '-admin-fitting-review.png'), fullPage: true, animations: 'disabled' });
});

test('admin fitting-room upload shows a backend GLB validation error without creating an asset', async ({ page }, info) => {
  test.skip(!adminUrl || !fittingRoomGlb || !fittingRoomFixtureUrl, 'Set isolated local admin, fixture, and GLB paths to run this test.');
  const fixture = new URL(fittingRoomFixtureUrl!);
  test.skip(!['127.0.0.1', 'localhost'].includes(fixture.hostname), 'Fitting-room mutations are allowed only against loopback fixtures.');
  const adminOrigin = new URL(adminUrl!).origin;
  test.skip(!['127.0.0.1', 'localhost'].includes(new URL(adminOrigin).hostname), 'Fitting-room browser writes are allowed only against loopback admin builds.');
  await page.goto(new URL('/login', adminUrl!).toString());
  await page.locator('form input[type="email"]').fill('admin@averon.local');
  await page.locator('form input[type="password"]').fill('fixture-only-not-a-real-credential');
  const loginResponse = page.waitForResponse((response) => response.url().endsWith('/auth/login') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Войти в панель' }).click();
  expect((await loginResponse).status()).toBe(200);
  await page.goto(new URL('/products/edit/fixture-review-shirt', adminUrl!).toString());
  await expect(page.getByRole('heading', { name: /products|товары/i })).toBeVisible();
  if (info.project.name.includes('mobile')) {
    const menu = page.getByRole('button', { name: /open navigation menu|открыть боковое меню/i }).first();
    if (await menu.count()) await menu.click();
    await page.getByRole('dialog', { name: /mobile navigation/i }).getByRole('button', { name: /close|закрыть/i }).click();
  }
  await page.getByRole('button', { name: /fitting room|примерочная/i }).click();
  const file = page.locator('input[type="file"][accept*=".glb"]');
  await expect(file).toBeVisible();
  const existingAssets = await page.locator('article').filter({ hasText: 'Local upload fixture accepted for workflow testing' }).count();
  await file.setInputFiles(fittingRoomGlb!);
  await page.route('**/api/v1/admin/products/fixture-review-shirt/fitting-room/assets**', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'GLB_EXTERNAL_RESOURCE_FORBIDDEN' }) });
  });
  const uploadResponse = page.waitForResponse((response) => response.url().includes('/api/v1/admin/products/fixture-review-shirt/fitting-room/assets') && response.request().method() === 'POST');
  await page.getByRole('button', { name: /upload model|загрузить модель/i }).click();
  expect((await uploadResponse).status()).toBe(400);
  await expect(page.getByRole('alert').getByText('GLB_EXTERNAL_RESOURCE_FORBIDDEN')).toBeVisible();
  await expect(page.locator('article').filter({ hasText: 'Local upload fixture accepted for workflow testing' })).toHaveCount(existingAssets);
  await checkOverflow(page);
});
