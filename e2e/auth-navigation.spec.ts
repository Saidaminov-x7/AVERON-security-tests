import { expect, test, type Page } from '@playwright/test';

const storefrontUrl = process.env.AVERON_STOREFRONT_URL;
const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

function requireLoopbackStorefront() {
  test.skip(!storefrontUrl, 'Set AVERON_STOREFRONT_URL to an isolated local storefront.');
  const target = new URL(storefrontUrl!);
  test.skip(!loopbackHosts.has(target.hostname), 'Auth navigation tests only open a loopback storefront.');
  return target;
}

async function blockNonLoopbackRequests(page: Page) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || url.protocol === 'blob:' || loopbackHosts.has(url.hostname)) {
      await route.continue();
      return;
    }
    await route.abort('blockedbyclient');
  });
}

test('auth back restores the useful localized route and query after internal navigation and reload', async ({ page }) => {
  const storefront = requireLoopbackStorefront();
  await blockNonLoopbackRequests(page);
  const source = '/ru/catalog?category=shoes&page=2';
  await page.goto(new URL(source, storefront).toString());
  await expect(page.getByRole('heading', { name: /^товары(?:\s+\(\d+\))?$/i })).toBeVisible();

  await page.goto(new URL('/ru/login', storefront).toString());
  await page.reload();
  const back = page.getByRole('button', { name: /назад|back/i });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(new URL(source, storefront).toString());
  await expect(page.locator('body')).not.toContainText(/Internal Server Error/i);
});

test('direct auth entry ignores an external stored referrer and uses the same-locale safe fallback', async ({ page }) => {
  const storefront = requireLoopbackStorefront();
  await blockNonLoopbackRequests(page);
  await page.addInitScript(() => {
    sessionStorage.setItem('averon_prev_page', 'https://attacker.invalid/ru/catalog?category=shoes');
    sessionStorage.setItem('ijara_curr_page', 'https://attacker.invalid/ru/catalog?category=shoes');
  });

  await page.goto(new URL('/uz/login?returnTo=https%3A%2F%2Fattacker.invalid%2F', storefront).toString(), {
    referer: 'https://attacker.invalid/ru/catalog',
  });
  await expect(page.getByRole('heading', { name: /kirish|sign in|вход/i })).toBeVisible();
  await page.getByRole('button', { name: /orqaga|назад|back|bosh sahifa/i }).click();
  await expect(page).toHaveURL(new URL('/uz', storefront).toString());
  await expect(page.locator('body')).not.toContainText(/Internal Server Error/i);
});

test('registration rejects a foreign phone country code and recovers after a valid +998 paste', async ({ page }) => {
  const storefront = requireLoopbackStorefront();
  await blockNonLoopbackRequests(page);
  const phoneRequests: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/auth\/register\/phone\//.test(new URL(request.url()).pathname)) {
      phoneRequests.push(request.url());
    }
  });

  await page.goto(new URL('/ru/register', storefront).toString());
  const phone = page.getByRole('textbox', { name: 'Номер телефона' });
  await expect(phone).toBeVisible();

  await phone.fill('+998 90 123 45 67');
  await expect(phone).toHaveValue('+998 90 123 45 67');

  await phone.fill('+1 202 555 0147');
  await expect(phone).toHaveValue('+998 90 123 45 67');
  await expect(phone).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert').filter({ hasText: 'Номера других стран не поддерживаются' })).toBeVisible();

  await phone.fill('+998 91 234 56 78');
  await expect(phone).toHaveValue('+998 91 234 56 78');
  await expect(phone).not.toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert').filter({ hasText: 'Номера других стран не поддерживаются' })).toHaveCount(0);
  expect(phoneRequests).toEqual([]);
});

test('safe purchase return survives password recovery and unsafe targets are dropped', async ({ page }) => {
  const storefront = requireLoopbackStorefront();
  await blockNonLoopbackRequests(page);
  const returnTo = '/ru/catalog/item-1?color=red';
  const loginUrl = new URL('/ru/login', storefront);
  loginUrl.searchParams.set('returnTo', returnTo);

  await page.goto(loginUrl.toString());
  const forgotLink = page.locator('a[href*="/forgot-password"]');
  const registerLink = page.locator('a[href*="/register"]');
  await expect(forgotLink).toHaveAttribute('href', new RegExp(`^/ru/forgot-password\\?returnTo=${encodeURIComponent(returnTo)}`));
  await expect(registerLink).toHaveAttribute('href', new RegExp(`^/ru/register\\?returnTo=${encodeURIComponent(returnTo)}`));
  await forgotLink.click();
  await expect(page).toHaveURL(new RegExp(`/ru/forgot-password\\?returnTo=${encodeURIComponent(returnTo)}`));

  const resetUrl = new URL('/ru/reset-password', storefront);
  resetUrl.searchParams.set('token', 'loopback-test-token');
  resetUrl.searchParams.set('returnTo', returnTo);
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || url.protocol === 'blob:' || loopbackHosts.has(url.hostname)) {
      if (route.request().method() === 'POST' && url.pathname.endsWith('/auth/reset-password')) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
        return;
      }
      await route.continue();
      return;
    }
    await route.abort('blockedbyclient');
  });
  await page.goto(resetUrl.toString());
  await page.locator('input[name="password"]').fill('SafeTestPassword123!');
  await page.locator('input[name="confirmPassword"]').fill('SafeTestPassword123!');
  await page.locator('form button[type="submit"]').click();
  const continueToLogin = page.getByRole('button', { name: /sign in|войти/i });
  await expect(continueToLogin).toBeVisible();
  await continueToLogin.click();
  await expect(page).toHaveURL(loginUrl.toString());

  const unsafeLogin = new URL('/ru/login', storefront);
  unsafeLogin.searchParams.set('returnTo', 'https://attacker.invalid/ru/catalog');
  await page.goto(unsafeLogin.toString());
  await expect(page.locator('a[href*="/forgot-password"]')).toHaveAttribute('href', '/ru/forgot-password');
  await expect(page.locator('a[href*="/register"]')).toHaveAttribute('href', '/ru/register');
});
