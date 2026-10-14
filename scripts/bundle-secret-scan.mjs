// TEST-35 / TR-SEC-01: fail if the production bundle contains privileged Supabase credentials.
// Usage: node scripts/bundle-secret-scan.mjs [distDir]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const dist = process.argv[2] ?? 'dist';
const TEXT = new Set(['.js', '.mjs', '.css', '.html', '.json', '.webmanifest', '.map', '.txt']);
const findings = [];

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (TEXT.has(extname(p)) || name === '_headers' || name === '_redirects') yield p;
  }
}

function jwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

let scanned = 0;
for (const file of files(dist)) {
  scanned++;
  const text = readFileSync(file, 'utf8');
  if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(text)) findings.push(`${file}: Supabase secret key (sb_secret_…)`);
  if (/service_role/.test(text)) findings.push(`${file}: contains "service_role"`);
  for (const m of text.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    const role = jwtRole(m[0]);
    if (role !== 'anon') findings.push(`${file}: JWT with role "${role}"`);
  }
}

if (findings.length) {
  console.error(`Bundle secret scan FAILED (${findings.length} finding(s)):\n- ${findings.join('\n- ')}`);
  process.exit(1);
}
console.log(`Bundle secret scan passed: ${scanned} files in ${dist}, no privileged keys found.`);
