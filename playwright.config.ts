import { defineConfig } from '@playwright/test';

const storefrontUrl = process.env.AVERON_STOREFRONT_URL;
const storefrontHost = storefrontUrl ? new URL(storefrontUrl).hostname : '';
const isLoopbackStorefront = storefrontHost === 'localhost'
  || storefrontHost === '::1'
  || /^127(?:\.\d{1,3}){3}$/.test(storefrontHost);
const adminUrl = process.env.AVERON_ADMIN_URL;
const adminHost = adminUrl ? new URL(adminUrl).hostname : '';
const isLoopbackAdmin = adminHost === 'localhost'
  || adminHost === '::1'
  || /^127(?:\.\d{1,3}){3}$/.test(adminHost);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Next dev 16.3.x can race while parallel routes write its prerender
  // manifest, returning a transient 500. Keep local storefront smoke serial;
  // hosted acceptance remains parallel because it does not use that dev cache.
  // Local admin tests share one mutable fixture server and browser-auth state.
  // Running them concurrently makes route smoke checks race those fixtures.
  workers: isLoopbackStorefront || isLoopbackAdmin ? 1 : undefined,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: 'reports/generated/playwright', open: 'never' }]],
  use: { baseURL: process.env.AVERON_STOREFRONT_URL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-chromium', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
  outputDir: 'reports/generated/playwright-results',
});
