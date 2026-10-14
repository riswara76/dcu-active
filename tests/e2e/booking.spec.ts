// Booking journeys: TEST-05, 08, 09, 17, 18, FR-BKG-04 (slot taken during review), TEST-27 (device timezone)
import { expect, test } from '@playwright/test';
import { apiBook, db, login, newUser, openFacility, resetData, wibDate } from './helpers';

test.beforeAll(async () => { await resetData(); });
test.afterAll(async () => { await resetData(); });

test('TEST-05 book Tennis for 60 minutes in five taps @smoke', async ({ page }) => {
  const email = await newUser('tennis');
  const date = await wibDate(2);
  await login(page, email);
  await openFacility(page, 'TENNIS', date);
  await page.getByRole('button', { name: '10:00 WIB, Available' }).click();
  await page.getByRole('radio', { name: '60 min' }).click();
  await page.getByRole('button', { name: 'Review booking' }).click();
  const sheet = page.getByRole('dialog', { name: 'Review your booking' });
  await expect(sheet.getByText('10:00–11:00 WIB')).toBeVisible();
  await expect(sheet.getByText('Check in 09:45–10:15 WIB', { exact: false })).toBeVisible();
  await expect(sheet.getByText('You can cancel until 09:30 WIB.')).toBeVisible();
  await sheet.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByRole('heading', { name: "You're booked!" })).toBeVisible();
  const { rows } = await db.query(`select b.duration_minutes, b.status from app.bookings b join app.profiles p on p.id = b.user_id where p.email = $1`, [email]);
  expect(rows).toEqual([{ duration_minutes: 60, status: 'CONFIRMED' }]);
});

test('TEST-08 the shared court shows as booked for Futsal when Basketball is booked', async ({ page }) => {
  const other = await newUser('basket');
  const me = await newUser('futsal');
  const date = await wibDate(3);
  await apiBook(other, 'COURT', 'BASKETBALL', date, '16:00', 60);
  await login(page, me);
  await openFacility(page, 'COURT', date, 'Futsal');
  await expect(page.getByRole('button', { name: '16:00 WIB, Booked' })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('button', { name: '16:30 WIB, Booked' })).toBeVisible();
  await expect(page.getByRole('button', { name: '17:00 WIB, Available' })).toBeVisible();
});

test('TEST-09 Air Hockey shows remaining tables and tells the owner which table was allocated', async ({ page }) => {
  const other = await newUser('ah1');
  const me = await newUser('ah2');
  const date = await wibDate(3);
  await apiBook(other, 'AIR_HOCKEY', 'AIR_HOCKEY', date, '12:00');
  await login(page, me);
  await openFacility(page, 'AIR_HOCKEY', date);
  await page.getByRole('button', { name: '12:00 WIB, 1 left' }).click();
  await page.getByRole('button', { name: 'Review booking' }).click();
  await page.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.getByRole('heading', { name: "You're booked!" })).toBeVisible();
  await expect(page.getByText('Air Hockey · Air Hockey Table 2')).toBeVisible();
});

test('FR-BKG-04 a slot taken while reviewing is refused with a clear message @smoke', async ({ page }) => {
  const rival = await newUser('rival');
  const me = await newUser('slow');
  const date = await wibDate(4);
  await login(page, me);
  await openFacility(page, 'TABLE_TENNIS', date);
  await page.getByRole('button', { name: '08:00 WIB, Available' }).click();
  await page.getByRole('button', { name: 'Review booking' }).click();
  await expect(page.getByRole('dialog', { name: 'Review your booking' })).toBeVisible();
  await apiBook(rival, 'TABLE_TENNIS', 'TABLE_TENNIS', date, '08:00'); // someone else is faster
  const confirm = page.getByRole('button', { name: 'Confirm booking' });
  // Either the live update has already disabled Confirm (preferred), or the server refuses the click.
  await confirm.click({ timeout: 2_000 }).catch(() => {});
  await expect(page.getByText(/That time (was just booked|is no longer available)/).first()).toBeVisible();
  const { rows } = await db.query(`select count(*)::int n from app.bookings b join app.profiles p on p.id = b.user_id where p.email = $1`, [me]);
  expect(rows[0].n).toBe(0);
});

test('TEST-17 cancel from My bookings releases the slot', async ({ page }) => {
  const email = await newUser('cancel');
  const date = await wibDate(5);
  await apiBook(email, 'FOOTBALL', 'FOOTBALL', date, '07:00', 90);
  await login(page, email);
  await page.goto('/bookings');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel booking' }).click();
  await expect(page.getByText('No upcoming bookings.')).toBeVisible();
  await openFacility(page, 'FOOTBALL', date);
  await expect(page.getByRole('button', { name: '07:00 WIB, Available' })).toBeVisible();
});

test('TEST-18 check in from the Home banner while the window is open', async ({ page }) => {
  // Make the check-in window wide enough that the next half-hour slot today is inside it.
  const { rows } = await db.query(`select to_char((now() at time zone 'Asia/Jakarta')::date, 'YYYY-MM-DD') d,
     to_char(date_trunc('hour', now() at time zone 'Asia/Jakarta') + case when extract(minute from now() at time zone 'Asia/Jakarta') < 30
       then interval '30 minutes' else interval '60 minutes' end, 'HH24:MI') t`);
  const { d, t } = rows[0];
  test.skip(t < '06:00' || t > '20:30', `outside operating hours (next slot ${t} WIB)`);
  await db.query(`update app.app_settings set value = '60' where key = 'checkin_open_before_minutes'`);
  try {
    const email = await newUser('checkin');
    await apiBook(email, 'TABLE_TENNIS', 'TABLE_TENNIS', d, t);
    await login(page, email);
    const banner = page.getByRole('region', { name: 'Check-in' });
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'Check in now' }).click();
    await expect(page.getByText("You're checked in").first()).toBeVisible();
  } finally {
    await db.query(`update app.app_settings set value = '15' where key = 'checkin_open_before_minutes'`);
  }
});

test.describe('TEST-27 device in another timezone', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('times and "today" are shown in WIB', async ({ page }) => {
    const email = await newUser('tz');
    const today = await wibDate(0);
    const date = await wibDate(2);
    await login(page, email);
    await page.goto('/facilities/TENNIS');
    const todayChip = page.getByRole('group', { name: 'Date' }).getByRole('button', { name: /^Today/ });
    await expect(todayChip).toHaveAccessibleName(new RegExp(`Today, .*${Number(today.slice(8))} `));
    await openFacility(page, 'TENNIS', date);
    await expect(page.getByRole('button', { name: /^06:00 WIB/ })).toBeVisible();   // first slot = 06:00 WIB, not New York time
    await page.getByRole('button', { name: '06:00 WIB, Available' }).click();
    await page.getByRole('button', { name: 'Review booking' }).click();
    await page.getByRole('button', { name: 'Confirm booking' }).click();
    await expect(page.getByRole('heading', { name: "You're booked!" })).toBeVisible();
    await expect(page.getByText('06:00–06:30 WIB').first()).toBeVisible();
    const { rows } = await db.query(`select to_char(b.start_at at time zone 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI') s
      from app.bookings b join app.profiles p on p.id = b.user_id where p.email = $1`, [email]);
    expect(rows[0].s).toBe(`${date} 06:00`); // stored at the correct instant
  });
});
