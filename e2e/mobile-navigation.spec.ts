import { expect, test } from '@playwright/test';

const storefrontUrl = process.env.AVERON_STOREFRONT_URL;
const localStorefront = (() => {
  if (!storefrontUrl) return false;
  try {
    return ['127.0.0.1', 'localhost'].includes(new URL(storefrontUrl).hostname);
  } catch {
    return false;
  }
})();

const responsiveSizes = [
  { width: 320, height: 568, theme: 'dark' as const },
  { width: 360, height: 640, theme: 'light' as const },
  { width: 390, height: 844, theme: 'dark' as const },
  { width: 414, height: 896, theme: 'light' as const },
  { width: 768, height: 1024, theme: 'dark' as const },
  { width: 1023, height: 768, theme: 'light' as const },
];

test('mobile navigation keeps routes and actions reachable across narrow viewports', async ({ page }, info) => {
  test.skip(!localStorefront, 'This suite is local-only to prevent external API requests or production side effects.');

  // The menu does not require remote data. Keep all third-party/API traffic out of this browser run.
  await page.route('https://**/*', (route) => route.abort());

  for (const viewport of responsiveSizes) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ colorScheme: viewport.theme });
    await page.goto(new URL('/ru', storefrontUrl!).toString());

    const menuTrigger = page.getByRole('button', { name: /^меню$|^menu$/i });
    await expect(menuTrigger).toBeVisible();
    await menuTrigger.click();

    const dialog = page.getByRole('dialog', { name: /меню|menu/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('searchbox')).toBeVisible();
    await expect(dialog.getByRole('region', { name: /магазины мира|shop by country/i }).getByRole('link')).toHaveCount(4);
    await expect(dialog.getByRole('navigation').getByRole('link').first()).toBeVisible();
    await expect(dialog.getByRole('link', { name: /войти|log in|sign in/i })).toBeVisible();
    await expect(dialog.getByRole('link', { name: /регистрация|register/i })).toBeVisible();
    await expect(dialog.getByRole('button', { name: /language|язык/i })).toBeVisible();
    const themeToggle = dialog.getByRole('button', { name: /theme|тема/i });
    await expect(themeToggle).toBeVisible();
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    const targetDark = viewport.theme === 'dark';
    if (isDark !== targetDark) {
      await dialog.getByRole('button', { name: targetDark ? /dark theme/i : /light theme/i }).click();
    }
    await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(targetDark);

    const geometry = await dialog.evaluate((element) => {
      const panel = element.getBoundingClientRect();
      const foreground = getComputedStyle(element).color.match(/[\d.]+/g)?.map(Number) ?? [];
      const background = getComputedStyle(element).backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
      const luminance = ([r, g, b]: number[]) => {
        const linear = [r, g, b].map((value) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
      };
      const contrast = (foreground.length >= 3 && background.length >= 3)
        ? (Math.max(luminance(foreground), luminance(background)) + 0.05)
          / (Math.min(luminance(foreground), luminance(background)) + 0.05)
        : 0;
      const documentWidth = document.documentElement.scrollWidth;
      const viewportWidth = document.documentElement.clientWidth;
      const center = element.children[1] as HTMLElement;
      const footer = element.lastElementChild as HTMLElement;
      return {
        left: panel.left,
        width: panel.width,
        right: panel.right,
        rightInset: getComputedStyle(element).right,
        contrast,
        documentWidth,
        viewportWidth,
        innerWidth: window.innerWidth,
        centerScrollHeight: center.scrollHeight,
        centerClientHeight: center.clientHeight,
        footerTop: footer.getBoundingClientRect().top,
        footerBottom: footer.getBoundingClientRect().bottom,
        viewportHeight: window.innerHeight,
        accountActionHeight: element.querySelector('a[href$="/register"]')?.getBoundingClientRect().height ?? 0,
      };
    });

    expect(geometry.left).toBeGreaterThan(0);
    expect(Math.abs(geometry.innerWidth - viewport.width)).toBeLessThanOrEqual(2);
    expect(geometry.width).toBeLessThanOrEqual(Math.min(geometry.innerWidth * 0.92, 400) + 1);
    expect(geometry.rightInset).toBe('0px');
    expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth + 1);
    expect(geometry.contrast).toBeGreaterThanOrEqual(4.5);
    expect(geometry.accountActionHeight).toBeGreaterThanOrEqual(44);
    expect(geometry.footerTop).toBeGreaterThanOrEqual(0);
    expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.viewportHeight + 1);
    await expect(page.locator('body')).toHaveCSS('overflow', 'hidden');

    if (viewport.width === 360) {
      expect(geometry.centerScrollHeight).toBeGreaterThan(geometry.centerClientHeight);
      await dialog.locator(':scope > div').nth(1).evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(dialog.getByRole('link', { name: /регистрация|register/i })).toBeVisible();
      await expect(dialog.getByRole('link', { name: /поддержка|support/i })).toBeVisible();
    }

    if (viewport.width === 390 && viewport.theme === 'dark') {
      await page.screenshot({
        path: info.outputPath(`${info.project.name}-mobile-navigation-dark-390x844.png`),
        animations: 'disabled',
      });
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(menuTrigger).toBeFocused();
    await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
  }

  await page.setViewportSize({ width: 1023, height: 768 });
  await page.goto(new URL('/ru', storefrontUrl!).toString());
  const menuTrigger = page.getByRole('button', { name: /^меню$|^menu$/i });
  await menuTrigger.click();
  const dialog = page.getByRole('dialog', { name: /меню|menu/i });
  await expect(dialog).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(dialog).toBeHidden();
  await expect(menuTrigger).toBeHidden();
  await expect(page.locator('header nav')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow', 'hidden');
});

test('drawer keyboard trap, locale switch, and search preserve expected behavior', async ({ page }) => {
  test.skip(!localStorefront, 'This suite is local-only to prevent external API requests or production side effects.');
  await page.route('https://**/*', (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL('/ru', storefrontUrl!).toString());

  const menuTrigger = page.getByRole('button', { name: /^меню$|^menu$/i });
  await menuTrigger.click();
  const dialog = page.getByRole('dialog', { name: /меню|menu/i });
  const firstLink = dialog.getByRole('link', { name: 'AVERON' });
  await firstLink.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('link', { name: /регистрация|register/i })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(firstLink).toBeFocused();

  await dialog.getByRole('button', { name: /language: ru|язык: ru/i }).click();
  const localeOptions = page.getByRole('menuitemradio');
  await expect(localeOptions).toHaveCount(3);
  await localeOptions.nth(1).click();
  await expect(page).toHaveURL(/\/uz(?:\/)?$/);
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: /^меню$|^menu$|^menyu$/i }).click();
  const uzDialog = page.getByRole('dialog', { name: /menu|menyu|меню/i });
  await uzDialog.getByRole('searchbox').fill('kurta');
  await uzDialog.getByRole('searchbox').press('Enter');
  await expect(page).toHaveURL(/\/uz\/catalog\?q=kurta$/);
  await expect(uzDialog).toBeHidden();
});

test('market, primary-navigation, and utility links navigate and dismiss the drawer', async ({ page }) => {
  test.skip(!localStorefront, 'This suite is local-only to prevent external API requests or production side effects.');
  await page.route('https://**/*', (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(new URL('/ru', storefrontUrl!).toString());

  const trigger = page.getByRole('button', { name: /^меню$|^menu$/i });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: /меню|menu/i });
  await dialog.getByRole('link', { name: 'Из США' }).click();
  await expect(page).toHaveURL(/\/ru\/catalog\?country=US$/);
  await expect(dialog).toBeHidden();

  await page.goto(new URL('/ru', storefrontUrl!).toString());
  await page.getByRole('button', { name: /^меню$|^menu$/i }).click();
  const secondDialog = page.getByRole('dialog', { name: /меню|menu/i });
  await secondDialog.getByRole('navigation').getByRole('link', { name: 'Товары' }).click();
  await expect(page).toHaveURL(/\/ru\/catalog$/);
  await expect(secondDialog).toBeHidden();

  await page.goto(new URL('/ru', storefrontUrl!).toString());
  await page.getByRole('button', { name: /^меню$|^menu$/i }).click();
  const thirdDialog = page.getByRole('dialog', { name: /меню|menu/i });
  await thirdDialog.getByRole('link', { name: 'Избранное' }).click();
  await expect(page).toHaveURL(/\/ru\/login\?returnTo=%2Fru%2Ffavorites$/);
  await expect(thirdDialog).toBeHidden();
});
