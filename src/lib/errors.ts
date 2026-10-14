// Business error codes → plain-English messages (API-RPC-SPECIFICATION §2, UX copy deck §9).
// Raw database or network error text is never shown to users (SEC-14/15).

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly details: Record<string, unknown> = {},
    public readonly reference?: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

const SUPPORT = (import.meta.env.VITE_SUPPORT_CONTACT as string | undefined) ?? 'DCU';

type Formatter = (d: Record<string, unknown>) => string;

const MESSAGES: Record<string, string | Formatter> = {
  NOT_AUTHENTICATED: 'Please sign in to continue.',
  EMAIL_NOT_VERIFIED: 'Please verify your email first.',
  ACCOUNT_DISABLED: `Your account has been disabled. Please contact ${SUPPORT}.`,
  FORBIDDEN: "You don't have permission to do that.",
  VALIDATION_ERROR: 'Please check the highlighted fields.',
  SYSTEM_BUSY: 'The system is busy. Please try again.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  FACILITY_NOT_FOUND: "That facility isn't available.",
  ACTIVITY_INVALID: "That activity isn't available for this facility.",
  BOOKING_WINDOW_EXCEEDED: (d) => `You can book from today up to ${d.horizon_days ?? 7} days ahead.`,
  SLOT_MISALIGNED: 'Please choose a start time on the hour or half hour.',
  OUTSIDE_OPERATING_HOURS: 'Bookings must be between 06:00 and 21:00 WIB.',
  SLOT_IN_PAST: 'That time has already started. Please choose a later time.',
  INVALID_DURATION: "That duration isn't available for this facility.",
  BOOKING_LIMIT_REACHED: (d) =>
    `You already have ${d.limit ?? 2} upcoming bookings. Cancel one or wait until one has finished.`,
  FACILITY_DAILY_LIMIT_REACHED: 'You already have a booking for this facility on that day.',
  SLOT_UNAVAILABLE: 'Sorry — that time was just booked or is unavailable. Please choose another time.',
  BOOKING_NOT_FOUND: 'Booking not found.',
  BOOKING_NOT_CANCELLABLE: (d) =>
    d.cutoff_minutes != null
      ? `Bookings can be cancelled up to ${d.cutoff_minutes} minutes before the start time.`
      : 'This booking can no longer be cancelled.',
  CHECKIN_TOO_EARLY: (d) => (d.opens_wib ? `Check-in opens at ${d.opens_wib} WIB.` : 'Check-in is not open yet.'),
  CHECKIN_WINDOW_CLOSED: 'The check-in window has closed.',
  CHECKIN_NOT_ALLOWED: "Check-in isn't available for this booking.",
  ADMIN_BLOCK_CONFLICT: 'This block overlaps existing bookings. Review and confirm to cancel them.',
  BLOCK_CONFLICTS_CHANGED: 'Bookings changed while you were reviewing. The list has been refreshed.',
  BLOCK_NOT_FOUND: 'Block not found.',
  USER_NOT_FOUND: 'User not found.',
  DOMAIN_NOT_FOUND: 'Domain not found.',
  LAST_ADMIN_PROTECTED: 'At least one active administrator is required.',
  SELF_MODIFICATION_NOT_ALLOWED: "You can't change your own admin role or status.",
  EMAIL_DOMAIN_NOT_ALLOWED: 'Please register with your company email.',
  DOMAIN_ALREADY_EXISTS: 'That domain is already allowed.',
  LAST_DOMAIN_PROTECTED: 'At least one allowed email domain is required.',
  REASON_REQUIRED: 'Please enter a reason (at least 5 characters).',
  SETTING_READ_ONLY: 'This setting cannot be changed.',
  OFFLINE: "You're offline. Please reconnect and try again.",
  NETWORK_ERROR: "We couldn't reach the server. Please check your connection and try again.",
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  WEAK_PASSWORD: 'Choose a stronger password (see the rules below).',
  INVALID_CODE: 'That code is invalid or has expired. Request a new one.',
  INTERNAL_ERROR: 'Something went wrong.',
};

export const KNOWN_CODES = new Set(Object.keys(MESSAGES));

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const m = MESSAGES[error.code] ?? MESSAGES.INTERNAL_ERROR;
    const text = typeof m === 'function' ? m(error.details) : m;
    return error.code === 'INTERNAL_ERROR' && error.reference ? `${text} Reference: ${error.reference}` : text;
  }
  return MESSAGES.INTERNAL_ERROR as string;
}

export function newReference(): string {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

/** Maps a Supabase Auth error to a business code (messages above). */
export function authError(error: { message?: string; code?: string; status?: number } | null): ApiError {
  const msg = error?.message ?? '';
  const code = error?.code ?? '';
  if (msg.includes('EMAIL_DOMAIN_NOT_ALLOWED')) return new ApiError('EMAIL_DOMAIN_NOT_ALLOWED');
  if (code === 'weak_password') return new ApiError('WEAK_PASSWORD');
  if (code === 'invalid_credentials') return new ApiError('INVALID_CREDENTIALS');
  if (code === 'email_not_confirmed') return new ApiError('EMAIL_NOT_VERIFIED');
  if (code === 'otp_expired' || code === 'invalid_otp' || /token.*(expired|invalid)/i.test(msg)) return new ApiError('INVALID_CODE');
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error?.status === 429) {
    return new ApiError('RATE_LIMITED');
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return new ApiError('OFFLINE');
  const ref = newReference();
  console.error(`[auth ${ref}]`, code || error?.status);
  return new ApiError('INTERNAL_ERROR', {}, ref);
}
