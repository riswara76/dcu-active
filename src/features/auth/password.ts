// Password policy mirrored from Supabase Auth (FR-AUTH-07). The server is the authority; this is UX only.
export const PASSWORD_RULES = [
  { id: 'length', label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { id: 'upper', label: 'An uppercase letter (A–Z)', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'A lowercase letter (a–z)', test: (p: string) => /[a-z]/.test(p) },
  { id: 'digit', label: 'A number (0–9)', test: (p: string) => /\d/.test(p) },
  { id: 'symbol', label: 'A symbol (e.g. ! @ # $)', test: (p: string) => /[^A-Za-z0-9]/.test(p) },
] as const;

export function passwordMeetsPolicy(p: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(p));
}

export function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim());
}

/**
 * Sign-in address. On staging/UAT builds only (VITE_TEST_LOGIN_DOMAIN set), a short test username such as
 * "Admin1" is expanded to "admin1@<test domain>". Without that setting (production) the input is used as typed.
 */
export function loginAddress(input: string, testDomain: string | null | undefined): string {
  const value = input.trim().toLowerCase();
  return testDomain && /^[a-z0-9._-]+$/.test(value) ? `${value}@${testDomain}` : value;
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at < 0 ? '' : email.slice(at + 1).trim().toLowerCase();
}
