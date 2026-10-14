// Captures the User Manual screenshots from the LOCAL app (npm run dev + local Supabase with seed data).
// Usage: node scripts/capture-manual-screens.mjs   → docs/user-manual/img/*.png
// Uses the local seed accounts only (supabase/seed.sql). Clears local bookings, blocks and notifications first.
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import pg from 'pg';

const BASE = 'http://localhost:5173';
const OUT = new URL('../docs/user-manual/img/', import.meta.url);
const PASSWORD = 'DcuLocal#2026'; // local seed value only
mkdirSync(OUT, { recursive: true });

const env = Object.fromEntries(execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  .split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)="?(.*?)"?$/)).filter(Boolean).map((m) => [m[1], m[2]]));
if (!/127\.0\.0\.1|localhost/.test(env.DB_URL)) throw new Error('Local stack only');
const db = new pg.Client({ connectionString: env.DB_URL });
await db.connect();
await db.query('delete from app.notifications; delete from app.bookings; delete from app.facility_blocks;');

/** WIB date + n days, as YYYY-MM-DD and as the app's date-strip label ("Thu 15 Oct 2026"). */
function wib(n) {
  const d = new Date(Date.now() + 7 * 3600e3 + n * 86400e3);
  const iso = d.toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(d).replace(',', '');
  return { iso, label };
}

const browser = await chromium.launch();
const shot = async (page, name, opts = {}) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, OUT)), ...opts });
  console.log('saved', name);
};

async function login(page, email) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('heading', { level: 1, name: /^Hi/ }).waitFor();
}

async function book(page, code, day, time, minutes, activity) {
  await page.goto(`${BASE}/facilities/${code}`);
  if (activity) await page.getByRole('radio', { name: activity }).click();
  await page.getByRole('group', { name: 'Date' }).getByRole('button', { name: new RegExp(day.label) }).click();
  await page.getByRole('button', { name: `${time} WIB, Available` }).click();
  if (minutes) await page.getByRole('radio', { name: `${minutes} min` }).click();
}

// ---- User journey (phone) ---------------------------------------------------------------------------------
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-GB' });
let page = await phone.newPage();
await page.goto(`${BASE}/login`);
await shot(page, '01-login');
await page.goto(`${BASE}/register`);
await shot(page, '02-register');
await page.goto(`${BASE}/forgot-password`);
await shot(page, '03-forgot-password');

await login(page, 'user.a@danamon.co.id');
await shot(page, '04-home-empty');
await page.goto(`${BASE}/facilities`);
await shot(page, '05-facilities');

const tomorrow = wib(1);
const later = wib(2);
await book(page, 'FOOTBALL', tomorrow, '10:00', 90);
await shot(page, '06-football-90min');
await page.getByRole('button', { name: 'Review booking' }).click();
await page.getByRole('dialog', { name: 'Review your booking' }).waitFor();
await shot(page, '07-review');
await page.getByRole('button', { name: 'Confirm booking' }).click();
await page.getByRole('heading', { name: "You're booked!" }).waitFor();
await shot(page, '08-confirmed');

await book(page, 'COURT', later, '17:00', 60, 'Futsal');
await shot(page, '09-court-activity');
await page.getByRole('button', { name: 'Review booking' }).click();
await page.getByRole('button', { name: 'Confirm booking' }).click();
await page.getByRole('heading', { name: "You're booked!" }).waitFor();

await page.goto(`${BASE}/facilities/TABLE_TENNIS`);
await page.getByRole('group', { name: 'Date' }).getByRole('button', { name: new RegExp(tomorrow.label) }).click();
await shot(page, '10-table-tennis-pooled');

await page.goto(`${BASE}/`);
await shot(page, '11-home-upcoming');
await page.goto(`${BASE}/bookings`);
await shot(page, '12-my-bookings');
await page.getByRole('link', { name: 'Details' }).first().click();
await page.waitForLoadState('networkidle');
await shot(page, '13-booking-detail');
await page.goto(`${BASE}/bookings`);
await page.getByRole('button', { name: 'Cancel', exact: true }).first().click();
await page.getByRole('alertdialog').or(page.getByRole('dialog')).first().waitFor();
await shot(page, '14-cancel-dialog');
await page.getByRole('button', { name: 'Keep booking' }).click();

await page.goto(`${BASE}/profile`);
await shot(page, '15-profile');
await page.goto(`${BASE}/profile/notifications`);
await shot(page, '16-notifications');
await page.goto(`${BASE}/help`);
await shot(page, '17-help');
await phone.close();

// ---- Admin (desktop) --------------------------------------------------------------------------------------
const desk = await browser.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1.5, locale: 'en-GB' });
page = await desk.newPage();
await login(page, 'admin.one@danamon.co.id');
for (const [name, path] of [['20-admin-dashboard', '/admin'], ['21-admin-bookings', '/admin/bookings'],
  ['22-admin-blocks', '/admin/blocks'], ['23-admin-users', '/admin/users'], ['25-admin-settings', '/admin/settings'],
  ['26-admin-audit', '/admin/audit']]) {
  await page.goto(`${BASE}${path}`);
  await page.getByRole('heading', { level: 1 }).first().waitFor();
  await page.waitForLoadState('networkidle');
  await shot(page, name, { fullPage: true });
}
await page.goto(`${BASE}/admin/users`);
await page.getByRole('link', { name: 'Rina Danamon' }).first().click();
await page.waitForLoadState('networkidle');
await shot(page, '24-admin-user-detail', { fullPage: true });

await browser.close();
await db.query('delete from app.notifications; delete from app.bookings; delete from app.facility_blocks;');
await db.end();
