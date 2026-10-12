import { expect, test, type Page } from '@playwright/test';

const adminUrl = process.env.AVERON_ADMIN_URL;
const fixtureUrl = process.env.AVERON_FITTING_ROOM_FIXTURE_URL;
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

function requireLoopbackTargets() {
  test.skip(!adminUrl || !fixtureUrl, 'Set local admin and test-fixture URLs to run product wizard E2E.');
  const admin = new URL(adminUrl!);
  const fixture = new URL(fixtureUrl!);
  test.skip(!loopbackHosts.has(admin.hostname) || !loopbackHosts.has(fixture.hostname), 'Product wizard fixture authentication is allowed only on loopback.');
  return { admin, fixture };
}

async function allowOnlyLocalTargets(page: Page, origins: Set<string>) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || origins.has(url.origin)) {
      await route.continue();
      return;
    }
    await route.abort('blockedbyclient');
  });
}

test('product editor next-step navigation never saves before the explicit final submit', async ({ page }) => {
  const { admin, fixture } = requireLoopbackTargets();
  await allowOnlyLocalTargets(page, new Set([admin.origin, fixture.origin]));
  await page.addInitScript(() => localStorage.setItem('i18nextLng', 'ru'));
  await page.goto(new URL('/login', admin).toString());
  await page.locator('form input[type="email"]').fill('admin@averon.local');
  await page.locator('form input[type="password"]').fill('fixture-only-not-a-real-credential');

  const loginResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === fixture.origin && url.pathname.endsWith('/auth/login') && response.request().method() === 'POST';
  });
  await page.getByRole('button', { name: /Войти в панель|sign in/i }).click();
  expect((await loginResponse).status()).toBe(200);
  await page.goto(new URL('/products', admin).toString());
  await expect(page.getByRole('heading', { name: 'Каталог AVERON' })).toBeVisible();

  const productWrites: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === fixture.origin && url.pathname.includes('/admin/products') && request.method() !== 'GET' && request.method() !== 'OPTIONS') {
      productWrites.push(`${request.method()} ${url.pathname}`);
    }
  });

  await page.getByRole('button', { name: 'Редактирование товара' }).first().click();
  await expect(page).toHaveURL(/\/products\/edit\/[^/]+$/);
  await expect(page.getByText(/Шаг\s+1\s+из\s+6/)).toBeVisible();

  for (let step = 2; step <= 6; step += 1) {
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
    await expect(page.getByText(new RegExp(`Шаг\\s+${step}\\s+из\\s+6`))).toBeVisible();
  }

  const explicitSubmit = page.getByRole('button', { name: 'Сохранить изменения', exact: true });
  await expect(explicitSubmit).toHaveAttribute('type', 'submit');
  expect(productWrites).toEqual([]);

  await page.getByRole('button', { name: 'Отмена', exact: true }).click();
  await expect(page).toHaveURL(new URL('/products', admin).toString());
  expect(productWrites).toEqual([]);
});
