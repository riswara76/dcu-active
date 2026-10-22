import { randomUUID } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { anonClient, createUsers, db, LOCAL_PASSWORD, MAILPIT_URL, signIn, wibDate } from '../integration/env';

export { createUsers, db, LOCAL_PASSWORD, signIn, wibDate };

/** Signs in through the UI and waits for Home. */
export async function login(page: Page, email: string, password = LOCAL_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Hi/ })).toBeVisible();
}

/** Creates one confirmed user (through the Auth admin API, so the domain hook applies) and returns its email. */
export async function newUser(prefix: string, domain = 'danamon.co.id'): Promise<string> {
  const [email] = await createUsers(`e2e.${prefix}`, 1, domain);
  return email;
}

/** Books via the API as the given user (for test setup). */
export async function apiBook(email: string, facility: string, activity: string, date: string, time: string, duration = 30) {
  const client = await signIn(email);
  const { data, error } = await client.rpc('create_booking', {
    p_facility_code: facility, p_activity_code: activity, p_date: date, p_start_time: time,
    p_duration_minutes: duration, p_idempotency_key: randomUUID(),
  });
  if (error) throw new Error(`apiBook ${facility} ${date} ${time}: ${error.message}`);
  return data as { id: string; booking_ref: string; resource_name: string };
}

/** The 6-digit code (and link token) from the latest email to `email` in the local mail catcher. */
export async function latestEmail(email: string): Promise<{ code: string; tokenHash: string | null }> {
  for (let i = 0; i < 30; i++) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const id = res.ok ? (await res.json()).messages?.[0]?.ID : undefined;
    if (id) {
      const msg = await (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)).json();
      const body = `${msg.Text ?? ''} ${msg.HTML ?? ''}`;
      const code = body.match(/\b(\d{6})\b/)?.[1];
      const tokenHash = body.match(/token_hash=([A-Za-z0-9_-]+)/)?.[1] ?? null;
      if (code) return { code, tokenHash };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no email for ${email}`);
}

/** "2026-10-16" → "Fri 16 Oct 2026" (same format as the app's date strip labels). */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d, 12))).replace(',', '');
}

/** Opens a facility, chooses the date (and activity) in the UI. */
export async function openFacility(page: Page, code: string, date: string, activity?: string) {
  await page.goto(`/facilities/${code}`);
  if (activity) await page.getByRole('radio', { name: activity }).click();
  await page.getByRole('group', { name: 'Date' }).getByRole('button', { name: new RegExp(dateLabel(date)) }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`Time \\(WIB\\) · ${dateLabel(date)}`) })).toBeVisible();
}

export async function seriousA11yViolations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  return result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

export async function resetData() {
  await db.query('delete from app.notifications');
  await db.query('delete from app.class_enrolments');
  await db.query('delete from app.class_sessions');
  await db.query('delete from app.classes');
  await db.query('delete from app.bookings');
  await db.query('delete from app.facility_blocks');
  // Restore default settings (tests may change them through the admin UI).
  await db.query(`
    update app.app_settings s set value = d.v::jsonb
    from (values ('booking_horizon_days', '7'), ('max_active_bookings', '2'), ('max_bookings_per_facility_per_day', '1'),
                 ('checkin_open_before_minutes', '15'), ('checkin_close_after_minutes', '15'),
                 ('user_cancel_cutoff_minutes', '30'), ('max_active_class_enrolments', '2')) as d(k, v)
    where s.key = d.k and s.value <> d.v::jsonb`);
  await db.query(`delete from app.allowed_email_domains where domain like 'e2e-%'`);
}

export { anonClient };
