// Classes (CR-03): TEST-56/57 admin creates classes, TEST-58/60 users join and leave, accessibility.
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { apiBook, dateLabel, db, login, newUser, resetData, seriousA11yViolations, signIn, wibDate } from './helpers';

const ADMIN = 'admin.one@danamon.co.id';

test.beforeAll(async () => { await resetData(); });
test.afterAll(async () => { await resetData(); });

/** Creates a separate-room class with one session through the admin API (test setup). */
async function apiRoomClass(title: string, date: string, capacity: number) {
  const admin = await signIn(ADMIN);
  const { data, error } = await admin.rpc('admin_create_class', {
    p_title: title, p_description: 'Gentle stretching for all levels.', p_instructor: 'Maya', p_facility_code: null,
    p_location_text: 'Studio, 2nd floor', p_capacity: capacity,
    p_schedule: { start_date: date, start_time: '18:00', duration_minutes: 60, repeat_weekdays: [], until_date: null },
  });
  if (error) throw new Error(`admin_create_class: ${error.message}`);
  return (data as { session_ids: string[] }).session_ids[0];
}

test('TEST-57 admin creates a class at a facility: conflicts confirmed, slots closed for users @smoke', async ({ page }) => {
  const owner = await newUser('classowner');
  const date = await wibDate(3);
  const booking = await apiBook(owner, 'TENNIS', 'TENNIS', date, '10:00', 60);
  const title = `Tennis Clinic ${randomUUID().slice(0, 4)}`;

  await login(page, ADMIN);
  await page.goto('/admin/classes/new');
  await page.getByLabel('Class name').fill(title);
  await page.getByLabel('Capacity (places per session)').fill('8');
  await page.getByLabel(/^Existing facility/).check();
  await page.getByLabel('Facility', { exact: true }).selectOption({ label: 'Tennis Court' });
  await page.getByLabel('First session date').fill(date);
  await page.getByLabel('Start time').selectOption('09:30');
  await page.getByLabel('Duration').selectOption('90');
  await page.getByRole('button', { name: 'Check schedule' }).click();
  await expect(page.getByText('1 booking(s) overlap', { exact: false })).toBeVisible();
  const create = page.getByRole('button', { name: 'Create class' });
  await expect(create).toBeDisabled();
  await page.getByLabel(/I understand these 1 booking/).check();
  await create.click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  const { rows } = await db.query(`select status::text, cancel_source::text from app.bookings where id = $1`, [booking.id]);
  expect(rows[0]).toEqual({ status: 'ADMIN_CANCELLED', cancel_source: 'BLOCK' });

  const user = await newUser('classviewer');
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await login(page, user);
  await page.goto(`/facilities/TENNIS`);
  await page.getByRole('group', { name: 'Date' }).getByRole('button', { name: new RegExp(dateLabel(date)) }).click();
  await expect(page.getByRole('button', { name: `10:00 WIB, Unavailable – Class: ${title}` })).toBeVisible();
});

test('TEST-58 a user joins a class, the place is counted, and can leave it again @smoke', async ({ page }) => {
  const date = await wibDate(2);
  const title = `Yoga ${randomUUID().slice(0, 4)}`;
  await apiRoomClass(title, date, 2);
  const email = await newUser('yogi');
  await login(page, email);
  await page.goto('/classes');
  const card = page.getByRole('article').filter({ hasText: title });
  await expect(card.getByText('2 of 2 left')).toBeVisible();
  await card.getByRole('button', { name: 'Join class' }).click();
  const dialog = page.getByRole('alertdialog').or(page.getByRole('dialog'));
  await dialog.getByRole('button', { name: 'Join class' }).click();
  await expect(card.getByText("You're in this class", { exact: false })).toBeVisible();
  await expect(card.getByText('1 of 2 left')).toBeVisible();
  expect(await seriousA11yViolations(page)).toEqual([]);

  await page.getByRole('tab', { name: 'My classes' }).click();
  const mine = page.getByRole('article').filter({ hasText: title });
  await mine.getByRole('button', { name: 'Leave class' }).click();
  await page.getByRole('button', { name: 'Leave class' }).last().click();
  await expect(page.getByText('You left the class').first()).toBeVisible();
  const { rows } = await db.query(
    `select e.status::text from app.class_enrolments e join app.profiles p on p.id = e.user_id where p.email = $1`, [email]);
  expect(rows).toEqual([{ status: 'CANCELLED' }]);
});

test('TEST-58 a full class cannot be joined', async ({ page }) => {
  const date = await wibDate(2);
  const title = `Pilates ${randomUUID().slice(0, 4)}`;
  const session = await apiRoomClass(title, date, 1);
  const first = await newUser('pilates1');
  const client = await signIn(first);
  const { error } = await client.rpc('enrol_class_session', { p_session_id: session, p_idempotency_key: randomUUID() });
  expect(error).toBeNull();

  await login(page, await newUser('pilates2'));
  await page.goto('/classes');
  const card = page.getByRole('article').filter({ hasText: title });
  await expect(card.getByText('Full', { exact: true })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Class full' })).toBeDisabled();
});

test('admin class pages have no serious accessibility violations', async ({ page }) => {
  const date = await wibDate(5);
  const title = `Zumba ${randomUUID().slice(0, 4)}`;
  await apiRoomClass(title, date, 10);
  await login(page, ADMIN);
  await page.goto('/admin/classes');
  await page.getByRole('link', { name: title }).filter({ visible: true }).first().click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  expect(await seriousA11yViolations(page)).toEqual([]);
  await page.goto('/admin/classes/new');
  await expect(page.getByRole('heading', { name: 'New class' })).toBeVisible();
  expect(await seriousA11yViolations(page)).toEqual([]);
});
