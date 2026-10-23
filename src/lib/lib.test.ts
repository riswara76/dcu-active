import { describe, expect, it } from 'vitest';
import { addDays, addMinutesToTime, bookableDates, formatDate, formatTimeWib, halfHourTimes, relativeDayLabel, wibDateOf, wibInstant } from './time';
import { safeNext } from './safe-redirect';
import { ApiError, authError, errorMessage } from './errors';
import { emailDomain, isEmail, loginAddress, passwordMeetsPolicy } from '../features/auth/password';

describe('time (TEST-27: device timezone is America/New_York in this suite)', () => {
  it('runs with a non-Jakarta device timezone', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/New_York');
  });
  it('formats instants in WIB regardless of the device timezone', () => {
    expect(formatTimeWib('2026-10-15T10:00:00Z')).toBe('17:00');
    expect(formatTimeWib('2026-10-15T23:30:00Z')).toBe('06:30');
    expect(wibDateOf('2026-10-15T23:30:00Z')).toBe('2026-10-16');
  });
  it('formats business dates without shifting the day', () => {
    expect(formatDate('2026-10-15')).toBe('Thu 15 Oct 2026');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('builds the 8-day booking horizon', () => {
    const d = bookableDates('2026-10-14', 7);
    expect(d).toHaveLength(8);
    expect(d[0]).toBe('2026-10-14');
    expect(d[7]).toBe('2026-10-21');
  });
  it('labels today and tomorrow', () => {
    expect(relativeDayLabel('2026-10-14', '2026-10-14')).toBe('Today');
    expect(relativeDayLabel('2026-10-15', '2026-10-14')).toBe('Tomorrow');
    expect(relativeDayLabel('2026-10-16', '2026-10-14')).toBeNull();
  });
  it('handles WIB instants and slot arithmetic', () => {
    expect(new Date(wibInstant('2026-10-15', '06:00')).toISOString()).toBe('2026-10-14T23:00:00.000Z');
    expect(addMinutesToTime('20:30', 30)).toBe('21:00');
    expect(addMinutesToTime('18:00', -30)).toBe('17:30');
    const t = halfHourTimes('06:00', '21:00');
    expect(t).toHaveLength(30);
    expect(t.at(-1)).toBe('20:30');
  });
});

describe('safeNext (TEST-50: open redirect protection)', () => {
  it.each([
    'https://evil.example', '//evil.example', '/\\evil.example', '%2F%2Fevil.example', 'javascript:alert(1)',
    '/admin/../../evil', '/unknown', '/%0a/x', 'http:/evil',
  ])('rejects %s', (raw) => {
    expect(safeNext(raw)).toBe('/');
  });
  it.each([
    ['/bookings', '/bookings'], ['/facilities/TENNIS', '/facilities/TENNIS'], ['%2Fprofile', '/profile'],
    ['/admin/users', '/admin/users'], [null, '/'],
  ])('accepts %s', (raw, expected) => {
    expect(safeNext(raw)).toBe(expected);
  });
});

describe('errors (SEC-14/15: no raw technical text)', () => {
  it('maps business codes with details', () => {
    expect(errorMessage(new ApiError('BOOKING_LIMIT_REACHED', { limit: 2 }))).toContain('2 upcoming bookings');
    expect(errorMessage(new ApiError('BOOKING_NOT_CANCELLABLE', { cutoff_minutes: 30 }))).toBe(
      'Bookings can be cancelled up to 30 minutes before the start time.');
    expect(errorMessage(new ApiError('CHECKIN_TOO_EARLY', { opens_wib: '17:45' }))).toBe('Check-in opens at 17:45 WIB.');
  });
  it('never shows unknown error text', () => {
    expect(errorMessage(new Error('duplicate key value violates unique constraint "x"'))).toBe('Something went wrong.');
    expect(errorMessage(new ApiError('INTERNAL_ERROR', {}, 'AB12'))).toBe('Something went wrong. Reference: AB12');
  });
  it('maps Supabase Auth errors', () => {
    expect(authError({ message: 'Hook error: EMAIL_DOMAIN_NOT_ALLOWED' }).code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
    expect(authError({ code: 'weak_password' }).code).toBe('WEAK_PASSWORD');
    expect(authError({ code: 'invalid_credentials' }).code).toBe('INVALID_CREDENTIALS');
    expect(authError({ code: 'otp_expired' }).code).toBe('INVALID_CODE');
    expect(authError({ status: 429 }).code).toBe('RATE_LIMITED');
  });
});

describe('password and email helpers (FR-AUTH-07, FR-AUTH-12 UX)', () => {
  it('mirrors the server password policy', () => {
    expect(passwordMeetsPolicy('Strong#Pass2026')).toBe(true);
    for (const weak of ['password1', 'PASSWORD#1', 'password#1', 'Password1', 'Pa#1']) expect(passwordMeetsPolicy(weak)).toBe(false);
  });
  it('extracts the email domain', () => {
    expect(emailDomain('Rina@Danamon.co.id')).toBe('danamon.co.id');
    expect(isEmail('rina@danamon.co.id')).toBe(true);
    expect(isEmail('rina@danamon')).toBe(false);
  });
});

describe('loginAddress (staging test usernames)', () => {
  it('expands a short username only when a test domain is configured', () => {
    expect(loginAddress(' Admin1 ', 'dcu-active.test')).toBe('admin1@dcu-active.test');
    expect(loginAddress('User2', 'dcu-active.test')).toBe('user2@dcu-active.test');
    expect(loginAddress('Rina@Danamon.co.id', 'dcu-active.test')).toBe('rina@danamon.co.id');
    expect(loginAddress('Admin1', null)).toBe('admin1');
    expect(loginAddress('Admin1', undefined)).toBe('admin1');
  });
});
