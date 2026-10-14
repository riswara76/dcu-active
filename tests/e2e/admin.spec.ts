// Administration in the UI: TEST-22, 24, 25, 32 (admin pages), 48 (admin at 390 px), 53, 54
import { expect, test } from '@playwright/test';
import { apiBook, db, login, newUser, resetData, seriousA11yViolations, wibDate } from './helpers';

const ADMIN = 'admin.one@danamon.co.id';

test.beforeAll(async () => { await resetData(); });
test.afterAll(async () => { await resetData(); });

test('TEST-24 regular users cannot open the admin area @smoke', async ({ page }) => {
  const email = await newUser('notadmin');
  await login(page, email);
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: "This page doesn't exist" })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin' })).toHaveCount(0);
});

test('TEST-22 block with conflicts: review, confirm, bookings cancelled and owners notified @smoke', async ({ page }) => {
  const owner = await newUser('blockowner');
  const date = await wibDate(4);
  const booking = await apiBook(owner, 'TENNIS', 'TENNIS', date, '10:00', 60);
  await login(page, ADMIN);
  await page.goto('/admin/blocks');
  await page.getByLabel('Facility').selectOption({ label: 'Tennis Court' });
  await page.getByLabel('Start date').fill(date);
  await page.getByLabel('Start time (WIB)').selectOption('09:00');
  await page.getByLabel('End time (WIB)').selectOption('12:00');
  await page.getByLabel(/^Reason/).fill('Court resurfacing (E2E)');
  await page.getByRole('button', { name: 'Check impact' }).click();
  await expect(page.getByText('This block overlaps 1 booking(s).', { exact: false })).toBeVisible();
  await expect(page.getByText(booking.booking_ref).filter({ visible: true }).first()).toBeVisible();
  const create = page.getByRole('button', { name: 'Create block' });
  await expect(create).toBeDisabled();
  await page.getByLabel(/I understand these 1 booking/).check();
  await create.click();
  await expect(page.getByText('Block created').first()).toBeVisible();
  const { rows } = await db.query(`select status::text, cancel_source::text from app.bookings where id = $1`, [booking.id]);
  expect(rows[0]).toEqual({ status: 'ADMIN_CANCELLED', cancel_source: 'BLOCK' });
  const n = await db.query(`select count(*)::int n from app.notifications where booking_id = $1 and type = 'ADMIN_CANCELLED'`, [booking.id]);
  expect(n.rows[0].n).toBe(1);
  await expect(page.getByText('Court resurfacing (E2E)').filter({ visible: true }).first()).toBeVisible();
});

test('TEST-54 change the cancellation cutoff with a reason; it is audited', async ({ page }) => {
  await login(page, ADMIN);
  await page.goto('/admin/settings');
  await page.getByLabel(/Cancellation allowed until/).fill('45');
  await page.getByRole('button', { name: 'Save changes…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Save these changes?' });
  await expect(dialog.getByText('30 → 45')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByText('Please enter a reason (at least 5 characters).')).toBeVisible();
  await dialog.getByLabel('Reason').fill('Longer notice for cancellations');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Settings saved').first()).toBeVisible();
  const s = await db.query(`select value from app.app_settings where key = 'user_cancel_cutoff_minutes'`);
  expect(s.rows[0].value).toBe(45);
  const a = await db.query(`select reason from app.audit_logs where action = 'SETTING_UPDATE' order by id desc limit 1`);
  expect(a.rows[0].reason).toBe('Longer notice for cancellations');
});

test('TEST-53 add and remove an allowed email domain', async ({ page }) => {
  const domain = `e2e-${Date.now()}.co.id`;
  await login(page, ADMIN);
  await page.goto('/admin/settings');
  await page.getByRole('tab', { name: 'Email domains' }).click();
  await page.getByLabel('New domain').fill(domain);
  await page.getByRole('button', { name: 'Add domain…' }).click();
  await page.getByRole('dialog').getByLabel('Reason').fill('New partner company (E2E)');
  await page.getByRole('dialog').getByRole('button', { name: 'Add domain' }).click();
  await expect(page.getByText('Domain added').first()).toBeVisible();
  await expect(page.getByText(`@${domain}`).filter({ visible: true }).first()).toBeVisible();
  const hook = await db.query(`select private.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'x@' || $1::text))) r`, [domain]);
  expect(hook.rows[0].r).toEqual({});

  const row = page.locator('tr, li').filter({ hasText: `@${domain}` }).filter({ visible: true }).first();
  await row.getByRole('button', { name: 'Remove' }).click();
  await page.getByRole('dialog').getByLabel('Reason').fill('Partnership ended (E2E)');
  await page.getByRole('dialog').getByRole('button', { name: 'Remove domain' }).click();
  await expect(page.getByText('Domain removed').first()).toBeVisible();
  const hook2 = await db.query(`select private.hook_before_user_created(jsonb_build_object('user', jsonb_build_object('email', 'x@' || $1::text))) r`, [domain]);
  expect(hook2.rows[0].r.error.message).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
});

test('TEST-25 a user deactivated by an admin is shown "Account disabled" in their open session', async ({ page, browser }) => {
  const email = await newUser('deact');
  await apiBook(email, 'FOOSBALL', 'FOOSBALL', await wibDate(5), '19:00');
  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  await login(userPage, email);

  await login(page, ADMIN);
  await page.goto('/admin/users');
  await page.getByLabel('Search').fill(email);
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('link', { name: /e2e\.deact/i }).first().click();
  await page.getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByRole('dialog').getByText(/Foosball/)).toBeVisible(); // upcoming booking listed
  await page.getByRole('dialog').getByLabel('Reason').fill('Left the company (E2E)');
  await page.getByRole('dialog').getByRole('button', { name: 'Deactivate' }).click();
  await expect(page.getByText('User deactivated').first()).toBeVisible();

  await userPage.goto('/facilities/TENNIS');
  await expect(userPage.getByRole('heading', { name: 'Your account has been disabled' })).toBeVisible();
  await userContext.close();
  await db.query(`update app.profiles set is_active = true, deactivated_at = null, deactivated_by = null, deactivation_reason = null where email = $1`, [email]);
});

test('TEST-32/48 admin pages: accessible and usable at 390 px', async ({ page }) => {
  await login(page, ADMIN);
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/admin', '/admin/bookings', '/admin/blocks', '/admin/users', '/admin/settings', '/admin/audit']) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0);
      if (width === 1280) expect(await seriousA11yViolations(page), path).toEqual([]);
    }
  }
});
