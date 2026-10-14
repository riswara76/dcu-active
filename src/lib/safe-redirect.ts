// Open-redirect protection (SEC-11, TR-AUTH-09): only same-origin, relative, known app paths are accepted.

const ALLOWED = [
  /^\/$/,
  /^\/facilities(\/[A-Z_]{3,30})?$/,
  /^\/bookings(\/[0-9a-f-]{36})?$/,
  /^\/profile(\/(notifications|password))?$/,
  /^\/help$/,
  /^\/admin(\/(bookings|blocks|users|settings|audit|users\/[0-9a-f-]{36}))?$/,
];

export function safeNext(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  // Reject anything that could leave the origin: schemes, protocol-relative, backslashes, control chars.
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || [...value].some((c) => c.charCodeAt(0) < 32)) {
    return fallback;
  }
  const [path, query = ''] = value.split('?');
  if (!ALLOWED.some((re) => re.test(path))) return fallback;
  return query && /^[\w=&%.-]*$/.test(query) ? `${path}?${query}` : path;
}
