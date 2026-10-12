import { expect, test } from '@playwright/test';

const storefrontUrl = process.env.AVERON_STOREFRONT_URL;
const loopbackStorefront = (() => {
  if (!storefrontUrl) return false;
  try {
    return ['127.0.0.1', 'localhost'].includes(new URL(storefrontUrl).hostname);
  } catch {
    return false;
  }
})();

test('authenticated body profile drives a localized product size recommendation', async ({ page }, testInfo) => {
  test.skip(!loopbackStorefront, 'Controlled authentication and recommendation responses are local-only.');
  await page.route('https://**/*', (route) => route.abort());

  let capabilitiesIntercepted = false;
  let recommendationRequests = 0;
  let recommendationAuthorization: string | undefined;
  await page.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.endsWith('/api/v1/capabilities')) {
      capabilitiesIntercepted = true;
      return route.fulfill({ status: 200, json: { smsVerification: true } });
    }
    if (path.endsWith('/auth/login/phone/request-code')) {
      return route.fulfill({ status: 200, json: { ok: true, expiresIn: 300 } });
    }
    if (path.endsWith('/auth/login/phone/verify-code')) {
      return route.fulfill({ status: 200, json: {
        accessToken: 'local-only-size-e2e-token',
        user: {
          id: 'local-only-size-e2e-customer',
          name: 'Local Size Customer',
          phone: '+998 90 123 45 67',
          role: 'CUSTOMER',
          heightCm: 174,
          weightKg: 67,
        },
      } });
    }
    if (path.endsWith('/products/fixture-product-review')) {
      recommendationRequests += 1;
      recommendationAuthorization = request.headers().authorization;
      return route.fulfill({ status: 200, json: {
        sizeRecommendation: { size: 'M', confidence: 'low', fit: 'regular' },
      } });
    }
    return route.continue();
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL('/ru/login?returnTo=%2Fru%2Fcatalog%2Ffixture-product-review', storefrontUrl!).toString());
  const phone = page.getByRole('textbox', { name: /номер телефона/i });
  await phone.fill('+998 ');
  await phone.pressSequentially('901234567');
  await page.getByLabel(/пароль/i).fill('local-only-fixture-password');
  await expect.poll(() => capabilitiesIntercepted).toBe(true);
  await page.getByRole('button', { name: /продолжить/i }).click();
  await page.getByLabel(/код из sms/i).fill('123456');
  await page.getByRole('button', { name: /подтвердить и войти/i }).click();

  // The storefront resolves the local fixture slug to its public article URL
  // during SSR; login return should preserve the product, not the alias.
  await expect(page).toHaveURL(/\/ru\/catalog\/AVR-000000000000001$/);
  await expect(page.getByRole('heading', { name: 'GLB review fixture shirt' })).toBeVisible();
  await expect.poll(() => recommendationRequests).toBe(1);
  await expect(page.getByText('Рекомендуемый размер: M')).toBeVisible();
  await expect(page.getByText('Ориентировочная рекомендация')).toBeVisible();
  expect(recommendationRequests).toBe(1);
  expect(recommendationAuthorization).toBe('Bearer local-only-size-e2e-token');
  await page.screenshot({ path: testInfo.outputPath('size-recommendation-product.png'), fullPage: true, animations: 'disabled' });
});

test('customer can save validated height and weight from the profile', async ({ page }, testInfo) => {
  test.skip(!loopbackStorefront, 'Controlled authentication and profile persistence are local-only.');
  await page.route('https://**/*', (route) => route.abort());

  let capabilitiesIntercepted = false;
  let savedProfile: { heightCm: number; weightKg: number } | null = null;
  await page.route('**/*', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/api/v1/capabilities')) {
      capabilitiesIntercepted = true;
      return route.fulfill({ status: 200, json: { smsVerification: true } });
    }
    if (path.endsWith('/auth/login/phone/request-code')) {
      return route.fulfill({ status: 200, json: { ok: true, expiresIn: 300 } });
    }
    if (path.endsWith('/auth/login/phone/verify-code')) {
      return route.fulfill({ status: 200, json: {
        accessToken: 'local-only-body-profile-token',
        user: { id: 'local-only-body-profile-customer', name: 'Local Profile Customer', phone: '+998 90 123 45 67', role: 'CUSTOMER', heightCm: 174, weightKg: 67 },
      } });
    }
    if (path.endsWith('/auth/me/body-profile') && request.method() === 'PATCH') {
      savedProfile = request.postDataJSON() as { heightCm: number; weightKg: number };
      return route.fulfill({ status: 200, json: savedProfile });
    }
    return route.continue();
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL('/ru/login?returnTo=%2Fru%2Fprofile', storefrontUrl!).toString());
  const phone = page.getByRole('textbox', { name: /номер телефона/i });
  await phone.fill('+998 ');
  await phone.pressSequentially('901234567');
  await page.getByLabel(/пароль/i).fill('local-only-fixture-password');
  await expect.poll(() => capabilitiesIntercepted).toBe(true);
  await page.getByRole('button', { name: /продолжить/i }).click();
  await page.getByLabel(/код из sms/i).fill('123456');
  await page.getByRole('button', { name: /подтвердить и войти/i }).click();

  await expect(page).toHaveURL(/\/ru\/profile$/);
  const height = page.getByLabel(/рост, см/i);
  const weight = page.getByLabel(/вес, кг/i);
  await expect(height).toHaveValue('174');
  await expect(weight).toHaveValue('67');
  await height.fill('176');
  await weight.fill('72');
  await page.getByRole('button', { name: /сохранить параметры/i }).click();
  await expect(page.getByRole('status')).toContainText('Сохранено');
  expect(savedProfile).toEqual({ heightCm: 176, weightKg: 72 });
  await expect(height).toHaveValue('176');
  await expect(weight).toHaveValue('72');
  await page.screenshot({ path: testInfo.outputPath('body-profile-saved.png'), fullPage: true, animations: 'disabled' });
});
