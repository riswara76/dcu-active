// Authentication journeys: TEST-01, 02, 03, 49, 50, 52 (UI level)
import { expect, test } from '@playwright/test';
import { db, latestEmail, login, newUser } from './helpers';

const STRONG = 'Strong#Pass2026';

test('TEST-01 register with a company email, verify with the 6-digit code, land on Home @smoke', async ({ page }) => {
  const email = `e2e.reg.${Date.now()}@homecredit.co.id`;
  await page.goto('/register');
  await expect(page.getByText(/@adira\.co\.id · @danamon\.co\.id · @homecredit\.co\.id/)).toBeVisible();
  await page.getByLabel('Full name').fill('Citra Test');
  await page.getByLabel('Company email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(STRONG);
  await page.getByLabel('Confirm password').fill(STRONG);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const { code } = await latestEmail(email);
  await page.getByLabel('Verification code').fill(code); // completes the code → submits automatically
  await expect(page.getByRole('heading', { level: 1, name: 'Hi, Citra' })).toBeVisible();
});

test('TEST-52 other email domains are refused on the registration screen', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Company email').fill('someone@gmail.com');
  await expect(page.getByText("@gmail.com can't register. Use your company email.")).toBeVisible();
  await page.getByLabel('Full name').fill('Gmail User');
  await page.getByLabel('Password', { exact: true }).fill(STRONG);
  await page.getByLabel('Confirm password').fill(STRONG);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/register$/); // nothing submitted
});

test('TEST-02 sign in and sign out; sign-out lands on a clean login page (K-01) @smoke', async ({ page }) => {
  const email = await newUser('login');
  await login(page, email);
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/bookings');
  await expect(page).toHaveURL(/\/login\?next=%2Fbookings$/);
});

test('TEST-02 wrong password shows a generic message', async ({ page }) => {
  const email = await newUser('wrongpw');
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Wrong#Pass2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
});

test('TEST-03 reset password with the emailed code', async ({ page }) => {
  const email = await newUser('reset');
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset code' }).click();
  await page.getByRole('link', { name: 'Enter the code' }).click();
  const { code } = await latestEmail(email);
  await page.getByLabel('Reset code').fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('New password', { exact: true }).fill('Newer#Pass2026');
  await page.getByLabel('Confirm new password').fill('Newer#Pass2026');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /^Hi/ })).toBeVisible();
  await page.goto('/profile');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await login(page, email, 'Newer#Pass2026');
});

test('TEST-49 opening the email link does not verify until "Confirm my email" is clicked', async ({ page }) => {
  const email = `e2e.link.${Date.now()}@adira.co.id`;
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Link Tester');
  await page.getByLabel('Company email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(STRONG);
  await page.getByLabel('Confirm password').fill(STRONG);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  const { tokenHash } = await latestEmail(email);
  expect(tokenHash).toBeTruthy();

  const verified = async () =>
    (await db.query('select email_confirmed_at is not null as v from auth.users where email = $1', [email])).rows[0].v;
  // A scanner fetching the link (plain HTTP GET, then even rendering the page) must not verify the account.
  const res = await page.request.get(`/auth/confirm?token_hash=${tokenHash}&type=email`);
  expect(res.ok()).toBe(true);
  await page.goto(`/auth/confirm?token_hash=${tokenHash}&type=email`);
  await expect(page.getByRole('button', { name: 'Confirm my email' })).toBeVisible();
  expect(await verified()).toBe(false);
  await page.getByRole('button', { name: 'Confirm my email' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hi, Link' })).toBeVisible();
  expect(await verified()).toBe(true);
});

test('TEST-50 a malicious "next" parameter never leaves the app', async ({ page }) => {
  const email = await newUser('redirect');
  await page.goto('/login?next=https%3A%2F%2Fevil.example%2Fsteal');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('DcuLocal#2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('http://localhost:4173/');
});
