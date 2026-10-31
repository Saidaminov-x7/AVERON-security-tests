import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';

const storefrontUrl = process.env.AVERON_STOREFRONT_URL;
const product = {
  id: 'local-product-1', slug: 'local-product-1', name: { en: 'Local jacket', ru: 'Локальная куртка', uz: 'Mahalliy kurtka' }, title: 'Local jacket',
  salePriceUzs: 120000, priceUzs: 120000, currency: 'UZS', status: 'PUBLISHED',
  images: [], variants: [{ id: 'local-variant-1', size: 'M', color: 'Black', stock: 4, available: true, salePriceUzs: 120000 }],
};

let fixtureServer: Server;
let sharingEnabled = false;
let failShareEnable = false;
let failOutfitSave = false;

test.beforeAll(async () => {
  test.skip(!storefrontUrl?.startsWith('http://127.0.0.1:'), 'These flows run only against an explicit loopback storefront.');
  fixtureServer = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
      const method = request.method ?? 'GET';
      response.setHeader('content-type', 'application/json');
      const send = (status: number, body: unknown) => { response.statusCode = status; response.end(JSON.stringify(body)); };
      if (path === '/site-settings/public') return send(200, {});
      if (path === '/auth/me') return send(200, { id: 'local-e2e-customer', name: 'Local E2E Customer', role: 'CUSTOMER' });
      if (path === '/api/v1/capabilities') return send(200, {});
      if (path === '/api/v1/cart') return send(200, { items: [], subtotalUzs: '0.00', currency: 'UZS' });
      if (path === '/api/v1/outfits' && method === 'GET') return send(200, []);
      if (path === '/api/v1/outfits' && method === 'POST') {
        if (failOutfitSave) return send(503, { message: 'fixture failure' });
        return send(201, { id: 'local-outfit-1', name: 'Weekend', items: [{ productId: product.id, variantId: 'local-variant-1' }] });
      }
      if (path === '/api/v1/outfits/local-outfit-1' && method === 'PATCH') return send(200, { id: 'local-outfit-1', name: 'Weekend', items: [{ productId: product.id, variantId: 'local-variant-1' }] });
      if (path === '/api/v1/outfits/local-outfit-1/cart' && method === 'POST') return send(200, { addedProductIds: [product.id], rejectedItems: [], message: 'Outfit added to cart.' });
      if (path === '/api/v1/products/jacket') return send(404, { code: 'NOT_FOUND' });
      if (path.startsWith('/api/v1/products/')) return send(200, product);
      if (path === '/api/v1/products') return send(200, { items: [product], total: 1, page: 1, limit: 12 });
      if (path === '/api/v1/wishlist' && method === 'GET') return send(200, { items: [], sharingEnabled, sharePath: sharingEnabled ? '/wishlist/shared/local-share-token' : null });
      if (path === '/api/v1/wishlist/sharing' && method === 'POST') {
        if (failShareEnable) return send(503, { message: 'fixture failure' });
        sharingEnabled = true;
        return send(200, { enabled: true, sharePath: '/wishlist/shared/local-share-token' });
      }
      if (path === '/api/v1/wishlist/sharing' && method === 'DELETE') {
        sharingEnabled = false;
        response.statusCode = 204;
        return response.end();
      }
      return send(404, { code: 'NOT_FOUND' });
    });
  });
  await new Promise<void>((resolve) => fixtureServer.listen(8080, '127.0.0.1', resolve));
});

test.afterAll(async () => {
  if (fixtureServer?.listening) await new Promise<void>((resolve, reject) => fixtureServer.close((error) => error ? reject(error) : resolve()));
});

async function guardExternalRequests(page: import('@playwright/test').Page) {
  const origin = new URL(storefrontUrl!).origin;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || url.origin === origin) return route.continue();
    return route.abort('blockedbyclient');
  });
}

async function authenticate(page: import('@playwright/test').Page) {
  await page.goto(new URL('/en/', storefrontUrl!).toString());
  await page.getByRole('main').first().waitFor();
}

test.describe('local outfit builder and wishlist sharing', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!storefrontUrl?.startsWith('http://127.0.0.1:'), 'These flows run only against an explicit loopback storefront.');
    sharingEnabled = false;
    failShareEnable = false;
    failOutfitSave = false;
    await guardExternalRequests(page);
  });

  test('searches, saves and adds an outfit to cart; reports save failure', async ({ page }) => {
    await authenticate(page);
    failOutfitSave = true;

    await page.goto(new URL('/en/outfits', storefrontUrl!).toString());
    await page.getByRole('heading', { name: 'Outfit builder' }).waitFor();
    await page.getByLabel('Find a product by name, SKU, or link').fill('jacket');
    await page.locator('#outfit-product-search').locator('xpath=following-sibling::button').click();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByLabel('Outfit name').fill('Weekend');
    await page.getByRole('button', { name: 'Save outfit' }).click();
    await expect(page.getByRole('status')).toHaveText('Could not complete the action. Try again.');

    failOutfitSave = false;
    await page.getByRole('button', { name: 'Save outfit' }).click();
    await expect(page.getByRole('status')).toHaveText('Save changes');
    await page.getByRole('button', { name: 'Add outfit to cart' }).click();
    await expect(page.getByRole('status')).toHaveText('Outfit added to cart.');
  });

  test('enables, copies, and revokes wishlist sharing, including clipboard failure', async ({ page }) => {
    await authenticate(page);
    failShareEnable = true;
    await page.addInitScript(() => {
      const clipboard = { writeText: async (text: string) => {
        (window as Window & { __clipboardWrites?: string[] }).__clipboardWrites ??= [];
        (window as Window & { __clipboardWrites?: string[] }).__clipboardWrites!.push(text);
        if ((window as Window & { __clipboardFails?: boolean }).__clipboardFails) throw new Error('clipboard denied');
      } };
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard });
    });
    await page.goto(new URL('/en/favorites', storefrontUrl!).toString());
    await page.getByRole('button', { name: 'Enable link sharing' }).click();
    await expect(page.getByRole('status')).toHaveText('Could not update sharing settings.');
    failShareEnable = false;
    await page.getByRole('button', { name: 'Enable link sharing' }).click();
    await expect(page.getByRole('button', { name: 'Copy share link' })).toBeVisible();
    await page.getByRole('button', { name: 'Copy share link' }).click();
    await expect(page.getByRole('status')).toHaveText('Link copied.');
    expect(await page.evaluate(() => (window as Window & { __clipboardWrites?: string[] }).__clipboardWrites)).toEqual([
      `${new URL(storefrontUrl!).origin}/en/wishlist/shared/local-share-token`,
    ]);
    await page.evaluate(() => { (window as Window & { __clipboardFails?: boolean }).__clipboardFails = true; });
    await page.getByRole('button', { name: 'Copy share link' }).click();
    await expect(page.getByRole('status')).toHaveText('Could not update sharing settings.');
    await page.getByRole('button', { name: 'Disable sharing' }).click();
    await expect(page.getByRole('button', { name: 'Enable link sharing' })).toBeVisible();
  });
});
