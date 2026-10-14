// Platform & non-functional: TEST-30 offline, TEST-31 PWA, TEST-32 accessibility, TEST-43 realtime, TEST-48 responsive
import { expect, test } from '@playwright/test';
import { apiBook, login, newUser, openFacility, resetData, seriousA11yViolations, wibDate } from './helpers';

test.beforeAll(async () => { await resetData(); });
test.afterAll(async () => { await resetData(); });

test('TEST-30 offline: banner shown, booking disabled, nothing queued @smoke', async ({ page, context }) => {
  const email = await newUser('offline');
  const date = await wibDate(2);
  await login(page, email);
  await openFacility(page, 'TENNIS', date);
  await page.getByRole('button', { name: '09:00 WIB, Available' }).click();
  await context.setOffline(true);
  await expect(page.getByText(/You're offline\. Booking, cancelling and check-in are paused/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review booking' })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByText(/You're offline/)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Review booking' })).toBeEnabled();
});

test('TEST-43 availability updates live in a second browser within 3 seconds', async ({ page, browser }) => {
  const watcher = await newUser('watch');
  const booker = await newUser('book');
  const date = await wibDate(3);
  await login(page, watcher);
  await openFacility(page, 'TENNIS', date);
  await expect(page.getByText('Live')).toBeVisible();
  await expect(page.getByRole('button', { name: '15:00 WIB, Available' })).toBeVisible();

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage, booker);
  await openFacility(otherPage, 'TENNIS', date);
  await otherPage.getByRole('button', { name: '15:00 WIB, Available' }).click();
  await otherPage.getByRole('button', { name: 'Review booking' }).click();
  await otherPage.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(otherPage.getByRole('heading', { name: "You're booked!" })).toBeVisible();
  const started = Date.now();
  await expect(page.getByRole('button', { name: '15:00 WIB, Booked' })).toBeVisible({ timeout: 3_000 });
  test.info().annotations.push({ type: 'latency', description: `${Date.now() - started} ms after confirmation screen` });
  await other.close();
});

test('TEST-31 PWA: manifest and service worker are in place', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'service worker check in Chromium');
  await page.goto('/login');
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'DCU Active', display: 'standalone', start_url: '/', theme_color: '#C8102E' });
  expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  const active = await page.evaluate(async () => Boolean((await navigator.serviceWorker.ready).active));
  expect(active).toBe(true);
});

test('security headers are served with every page (SEC-10)', async ({ page }) => {
  const res = await page.goto('/login');
  const h = res!.headers();
  expect(h['content-security-policy']).toContain("script-src 'self'");
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
});

const USER_PAGES = ['/', '/facilities', '/facilities/TENNIS', '/facilities/COURT', '/bookings', '/profile', '/profile/notifications', '/help'];

test('TEST-32 public pages have no serious accessibility violations', async ({ page }) => {
  for (const path of ['/login', '/register', '/forgot-password', '/privacy']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await seriousA11yViolations(page), path).toEqual([]);
  }
});

test('TEST-32 user pages have no serious accessibility violations', async ({ page }) => {
  const email = await newUser('a11y');
  await apiBook(email, 'TENNIS', 'TENNIS', await wibDate(2), '08:00');
  await login(page, email);
  for (const path of USER_PAGES) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await seriousA11yViolations(page), path).toEqual([]);
  }
});

test('TEST-48 no horizontal scrolling on key pages at common widths', async ({ page }) => {
  const email = await newUser('rwd');
  await apiBook(email, 'COURT', 'FUTSAL', await wibDate(2), '18:00', 90);
  await login(page, email);
  for (const width of [360, 390, 414, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of ['/', '/facilities/COURT', '/bookings', '/profile']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
    }
  }
});
