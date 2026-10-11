import { expect, test, type Page } from '@playwright/test';

const adminUrl = process.env.AVERON_ADMIN_URL;
const fixtureUrl = process.env.AVERON_FITTING_ROOM_FIXTURE_URL;

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

function requireLoopbackTargets() {
  test.skip(!adminUrl || !fixtureUrl, 'Set local admin and test-fixture URLs to run sidebar E2E.');

  const admin = new URL(adminUrl!);
  const fixture = new URL(fixtureUrl!);
  test.skip(!loopbackHosts.has(admin.hostname) || !loopbackHosts.has(fixture.hostname), 'Sidebar fixture authentication is allowed only on loopback.');

  return { admin, fixture };
}

async function routeOnlyToLocalTargets(page: Page, origins: Set<string>) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol === 'data:' || origins.has(url.origin)) {
      await route.continue();
      return;
    }
    await route.abort('blockedbyclient');
  });
}

async function signInToFixture(page: Page, admin: URL, fixture: URL) {
  const allowedOrigins = new Set([admin.origin, fixture.origin]);
  await routeOnlyToLocalTargets(page, allowedOrigins);
  await page.addInitScript(() => {
    if (!localStorage.getItem('i18nextLng')) localStorage.setItem('i18nextLng', 'ru');
  });
  await page.goto(new URL('/login', admin).toString());

  await page.locator('form input[type="email"]').fill('admin@averon.local');
  await page.locator('form input[type="password"]').fill('fixture-only-not-a-real-credential');

  const loginResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.origin === fixture.origin && url.pathname.endsWith('/auth/login') && response.request().method() === 'POST';
  });
  await page.getByRole('button', { name: /войти в панель|sign in/i }).click();
  expect((await loginResponse).status()).toBe(200);

  await page.goto(new URL('/products', admin).toString());
  await expect(page.locator('main')).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1);
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (color: string) => {
    const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    if (!channels || channels.length !== 3) throw new Error(`Unexpected computed color: ${color}`);
    const [r, g, b] = channels.map((channel) => {
      const value = channel / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('admin sidebar collapse persists and active item stays readable in dark theme across locales', async ({ page }, info) => {
  const { admin, fixture } = requireLoopbackTargets();
  test.skip(info.project.name.includes('mobile'), 'Desktop sidebar collapse is checked in the desktop Chromium project.');

  await signInToFixture(page, admin, fixture);
  const sidebar = page.locator('.admin-sidebar');
  const wrapper = page.locator('#admin-mobile-navigation');
  const toggle = page.locator('[data-action-id="admin.sidebar.toggle-collapse"]');
  const navigation = page.locator('.admin-sidebar-nav');

  await expect(toggle).toHaveAttribute('aria-label', 'Свернуть меню');
  await expect(navigation.getByRole('link')).toHaveCount(18);
  const initialWidth = await wrapper.evaluate((element) => element.getBoundingClientRect().width);
  expect(initialWidth).toBeGreaterThanOrEqual(220);
  expect(initialWidth).toBeLessThanOrEqual(360);

  const resize = page.locator('[data-action-id="admin.sidebar.resize"]');
  await resize.focus();
  await page.keyboard.press('Home');
  await expect(resize).toHaveAttribute('aria-valuenow', '220');
  await page.keyboard.press('End');
  await expect(resize).toHaveAttribute('aria-valuenow', '360');
  await page.keyboard.press('Home');
  await expect(sidebar).toHaveCSS('width', '220px');
  const resizeBounds = await resize.boundingBox();
  expect(resizeBounds).not.toBeNull();
  await page.mouse.move(resizeBounds!.x + resizeBounds!.width / 2, resizeBounds!.y + 120);
  await page.mouse.down();
  await page.mouse.move(360, resizeBounds!.y + 120, { steps: 4 });
  await page.mouse.up();
  await expect(resize).toHaveAttribute('aria-valuenow', '360');
  await expect(sidebar).toHaveCSS('width', '360px');
  await expect(wrapper).toHaveCSS('width', '360px');
  await expectNoHorizontalOverflow(page);

  await page.locator('[data-action-id="admin.theme.toggle"]:visible').click();
  await expect.poll(() => page.locator('html').evaluate((element) => element.classList.contains('dark'))).toBe(true);

  const activeLink = navigation.locator('a.is-active');
  await expect(activeLink).toBeVisible();
  await expect.poll(async () => {
    const colors = await activeLink.evaluate((element) => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }));
    return contrastRatio(colors.foreground, colors.background);
  }).toBeGreaterThanOrEqual(4.5);
  await page.screenshot({ path: info.outputPath('admin-sidebar-dark-active.png'), fullPage: true, animations: 'disabled' });

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveAttribute('aria-label', 'Развернуть меню');
  await expect(sidebar).toHaveCSS('width', '76px');
  await expect(wrapper).toHaveCSS('width', '76px');
  await expect(sidebar.getByRole('img', { name: 'Админ-панель AVERON' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Выйти' })).toBeVisible();
  await expect(navigation.getByRole('link')).toHaveCount(18);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: info.outputPath('admin-sidebar-collapsed.png'), fullPage: true, animations: 'disabled' });

  await page.reload();
  await expect(page.locator('[data-action-id="admin.sidebar.toggle-collapse"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.admin-sidebar')).toHaveCSS('width', '76px');
  await page.locator('[data-action-id="admin.sidebar.toggle-collapse"]').click();
  await expect(page.locator('.admin-sidebar')).toHaveCSS('width', '360px');

  const expectedLabels = {
    ru: { collapse: 'Свернуть меню', expand: 'Развернуть меню', resize: 'Изменить ширину меню' },
    uz: { collapse: "Menyuni yig'ish", expand: 'Menyuni ochish', resize: "Yon menyu kengligini o'zgartirish" },
    en: { collapse: 'Collapse sidebar', expand: 'Expand sidebar', resize: 'Resize sidebar' },
  };

  for (const [locale, labels] of Object.entries(expectedLabels)) {
    await page.locator('button:has([data-action-id="admin.header.language-indicator"])').click();
    await page.locator(`[data-action-id="admin.header.select-language.${locale}"]`).click();
    await page.reload();
    const localeToggle = page.locator('[data-action-id="admin.sidebar.toggle-collapse"]');
    await expect(localeToggle).toHaveAttribute('aria-label', labels.collapse);
    await expect(page.locator('[data-action-id="admin.sidebar.resize"]')).toHaveAttribute('aria-label', labels.resize);
    await localeToggle.click();
    await expect(localeToggle).toHaveAttribute('aria-label', labels.expand);
    await localeToggle.click();
  }
});

test('mobile admin drawer opens, closes by button and Escape, and keeps the page in bounds', async ({ page }, info) => {
  const { admin, fixture } = requireLoopbackTargets();
  test.skip(!info.project.name.includes('mobile'), 'Mobile drawer is checked in the mobile Chromium project.');

  await signInToFixture(page, admin, fixture);
  const drawer = page.locator('#admin-mobile-navigation');
  const openButton = page.locator('[data-action-id="admin.sidebar.toggle-mobile-navigation"]');
  await expect(openButton).toHaveAttribute('aria-expanded', 'false');
  await expect(drawer).toHaveAttribute('data-open', 'false');
  await expect(drawer).toBeHidden();

  for (const viewport of [{ width: 320, height: 568 }, { width: 360, height: 640 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await openButton.click();
    await expect(openButton).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer).toHaveAttribute('data-open', 'true');
    await expect(drawer).toBeVisible();
    const expectedDrawerWidth = Math.min(viewport.width * 0.92, 400);
    const expectedDrawerLeft = viewport.width - expectedDrawerWidth;
    await expect.poll(async () => (await drawer.boundingBox())?.x ?? Number.POSITIVE_INFINITY)
      .toBeCloseTo(expectedDrawerLeft, 0);
    const drawerBounds = await drawer.boundingBox();
    expect(drawerBounds).not.toBeNull();
    expect(drawerBounds!.x).toBeCloseTo(expectedDrawerLeft, 0);
    expect(drawerBounds!.x + drawerBounds!.width).toBeCloseTo(viewport.width, 0);
    expect(drawerBounds!.width).toBeCloseTo(expectedDrawerWidth, 0);
    const drawerSurface = await drawer.locator('.admin-sidebar').evaluate((element) => getComputedStyle(element).backgroundColor);
    const themeSurface = await page.locator('html').evaluate((element) => getComputedStyle(element).getPropertyValue('--color-surface').trim());
    const surfaceProbe = await page.evaluate((surface) => {
      const probe = document.createElement('span');
      probe.style.backgroundColor = surface;
      document.body.append(probe);
      const color = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return color;
    }, themeSurface);
    expect(drawerSurface).toBe(surfaceProbe);
    const fixedFooterBounds = await drawer.locator('[data-admin-drawer-footer]').boundingBox();
    expect(fixedFooterBounds).not.toBeNull();
    expect(fixedFooterBounds!.y + fixedFooterBounds!.height).toBeCloseTo(viewport.height, 0);
    const navigation = drawer.locator('.admin-sidebar-nav');
    await expect.poll(() => navigation.evaluate((nav) => nav.scrollHeight > nav.clientHeight
      && getComputedStyle(nav).overflowY === 'auto')).toBe(true);
    const lastNavigationLink = navigation.locator('a').last();
    await lastNavigationLink.scrollIntoViewIfNeeded();
    await expect(lastNavigationLink).toBeInViewport();
    const lastLinkBounds = await lastNavigationLink.boundingBox();
    const navigationBounds = await navigation.boundingBox();
    expect(lastLinkBounds).not.toBeNull();
    expect(navigationBounds).not.toBeNull();
    expect(lastLinkBounds!.y).toBeGreaterThanOrEqual(navigationBounds!.y);
    expect(lastLinkBounds!.y + lastLinkBounds!.height).toBeLessThanOrEqual(navigationBounds!.y + navigationBounds!.height);
    await navigation.evaluate((nav) => nav.scrollTo({ top: 0, behavior: 'instant' }));

    const activeLink = drawer.locator('a.is-active');
    await expect(activeLink).toBeVisible();
    const activeColors = await activeLink.evaluate((element) => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
      surfaceSoft: (() => {
        const probe = document.createElement('span');
        probe.style.backgroundColor = 'var(--color-surface-soft)';
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      })(),
    }));
    expect(activeColors.background).toBe(activeColors.surfaceSoft);
    expect(contrastRatio(activeColors.foreground, activeColors.background)).toBeGreaterThanOrEqual(4.5);

    const languageTrigger = drawer.locator('button[aria-haspopup="menu"]');
    await languageTrigger.click();
    const languageMenu = page.getByRole('menu');
    await expect(languageMenu).toBeVisible();
    const languageItems = languageMenu.getByRole('menuitemradio');
    await expect(languageItems.nth(0)).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(languageItems.nth(1)).toBeFocused();
    await page.keyboard.press('End');
    await expect(languageItems.nth(2)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(languageItems.nth(0)).toBeFocused();
    const menuBounds = await languageMenu.boundingBox();
    const triggerBounds = await languageTrigger.boundingBox();
    expect(menuBounds).not.toBeNull();
    expect(triggerBounds).not.toBeNull();
    expect(menuBounds!.y).toBeGreaterThanOrEqual(0);
    expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(viewport.height);
    const drawerFooterBounds = await drawer.locator('[data-admin-drawer-footer]').boundingBox();
    expect(drawerFooterBounds).not.toBeNull();
    // The language menu is portalled outside the drawer and must stop above
    // its fixed account footer, not merely above the viewport edge.
    const availableBelow = Math.min(viewport.height, drawerFooterBounds!.y)
      - triggerBounds!.y - triggerBounds!.height - 14;
    const spaceAbove = triggerBounds!.y - 14;
    if (menuBounds!.height > availableBelow && spaceAbove > availableBelow) {
      expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(triggerBounds!.y);
    } else {
      expect(menuBounds!.y).toBeGreaterThanOrEqual(triggerBounds!.y + triggerBounds!.height);
    }
    await expect(languageMenu.locator('img')).toHaveCount(3);
    const languageFlags = await languageMenu.locator('img').evaluateAll((flags) => flags.map((flag) => ({
      locale: flag.getAttribute('alt'),
      source: flag.getAttribute('src'),
      loaded: (flag as HTMLImageElement).complete && (flag as HTMLImageElement).naturalWidth > 0,
    })));
    expect(languageFlags.map((flag) => flag.locale)).toEqual(['Русский', 'Oʻzbekcha', 'English']);
    expect(languageFlags.map((flag) => flag.source)).toEqual(['/flags/ru.svg', '/flags/uz.svg', '/flags/en.svg']);
    expect(languageFlags.every((flag) => flag.loaded)).toBe(true);
    await page.keyboard.press('Shift+Tab');
    await expect(languageTrigger).toBeFocused();
    await expect(languageMenu).toBeHidden();
    await languageTrigger.click();
    await expect(languageMenu).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(drawer.locator('[data-action-id="admin.theme.toggle"]')).toBeFocused();
    await expect(languageMenu).toBeHidden();
    await languageTrigger.click();
    await expect(languageMenu).toBeVisible();
    await languageMenu.locator('[data-action-id="admin.sidebar.language.ru"]').click();
    await expect(languageTrigger).toContainText('Русский');
    await languageTrigger.click();
    await expect(languageMenu).toBeVisible();
    await languageMenu.locator('[data-action-id="admin.sidebar.language.uz"]').click();
    await expect(languageTrigger).toContainText('Oʻzbekcha');
    await languageTrigger.click();
    await expect(languageMenu).toBeVisible();
    await languageMenu.locator('[data-action-id="admin.sidebar.language.en"]').click();
    await expect(languageTrigger).toContainText('English');
    await languageTrigger.click();
    await expect(languageMenu.locator('[data-action-id="admin.sidebar.language.en"]')).toHaveAttribute('role', 'menuitemradio');
    await expect(languageMenu.locator('[data-action-id="admin.sidebar.language.en"]')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');
    await expect(languageMenu).toBeHidden();
    await page.screenshot({ path: info.outputPath(`admin-sidebar-mobile-${viewport.width}x${viewport.height}-light.png`), fullPage: true, animations: 'disabled' });

    const themeToggle = drawer.locator('[data-action-id="admin.theme.toggle"]');
    await themeToggle.click();
    await expect.poll(() => page.locator('html').evaluate((element) => element.classList.contains('dark'))).toBe(true);
    const darkColors = await activeLink.evaluate((element) => ({
      foreground: getComputedStyle(element).color,
      background: getComputedStyle(element).backgroundColor,
    }));
    expect(contrastRatio(darkColors.foreground, darkColors.background)).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: info.outputPath(`admin-sidebar-mobile-${viewport.width}x${viewport.height}-dark.png`), fullPage: true, animations: 'disabled' });
    await themeToggle.click();
    await expect.poll(() => page.locator('html').evaluate((element) => element.classList.contains('dark'))).toBe(false);

    await page.keyboard.press('Escape');
    await expect(drawer).toHaveAttribute('data-open', 'false');
    await expect(drawer).toBeHidden();
    await expectNoHorizontalOverflow(page);
  }

  await openButton.click();
  await expect(drawer).toBeVisible();
  await drawer.locator('[data-action-id="admin.sidebar.close-mobile-navigation"]').click();
  await expect(drawer).toHaveAttribute('data-open', 'false');
});
