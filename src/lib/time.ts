// Time helpers. Business time is always WIB (Asia/Jakarta) regardless of the device timezone (BR-19, TEST-27).
// Date-only values ("YYYY-MM-DD") are business dates and are formatted without any timezone shifting.

export const TIMEZONE = 'Asia/Jakarta';

function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)); // noon UTC: safe from day boundaries when formatted in UTC
}

/** "2026-10-15" → "Thu 15 Oct 2026" */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(parseDate(date)).replace(',', '');
}

/** "2026-10-15" → { weekday: "Thu", day: "15", month: "Oct" } */
export function dateParts(date: string): { weekday: string; day: string; month: string } {
  const d = parseDate(date);
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { ...o, timeZone: 'UTC' }).format(d);
  return { weekday: f({ weekday: 'short' }), day: f({ day: 'numeric' }), month: f({ month: 'short' }) };
}

export function addDays(date: string, days: number): string {
  const d = parseDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Bookable dates: today … today + horizon (inclusive) from the server's WIB "today". */
export function bookableDates(todayWib: string, horizonDays: number): string[] {
  return Array.from({ length: horizonDays + 1 }, (_, i) => addDays(todayWib, i));
}

/** ISO instant → "HH:MM" in WIB */
export function formatTimeWib(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIMEZONE }).format(new Date(iso));
}

/** ISO instant → "15 Oct 2026, 17:51 WIB" */
export function formatDateTimeWib(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TIMEZONE }).format(d);
  return `${date}, ${formatTimeWib(iso)} WIB`;
}

/** ISO instant → WIB calendar date "YYYY-MM-DD" */
export function wibDateOf(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: TIMEZONE }).format(new Date(iso));
}

/** WIB date + "HH:MM" → ISO instant with +07:00 offset (Asia/Jakarta has no DST). */
export function wibInstant(date: string, time: string): string {
  return `${date}T${time}:00+07:00`;
}

export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function relativeDayLabel(date: string, todayWib: string): string | null {
  if (date === todayWib) return 'Today';
  if (date === addDays(todayWib, 1)) return 'Tomorrow';
  return null;
}

/** Half-hour times between open and close (start times only), e.g. 06:00 … 20:30 */
export function halfHourTimes(open = '06:00', close = '21:00'): string[] {
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  const out: string[] = [];
  for (let t = oh * 60 + om; t < ch * 60 + cm; t += 30) {
    out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
  }
  return out;
}
