// Test environment for integration/concurrency tests against the LOCAL Supabase stack only.
import { execSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';

/** Shared password of the local seed accounts (supabase/seed.sql). Local test value only. */
export const LOCAL_PASSWORD = 'DcuLocal#2026';

function readLocalStatus(): Record<string, string> {
  const out = execSync('npx supabase status -o env', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const env: Record<string, string> = {};
  for (const line of out.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const status = readLocalStatus();
export const API_URL = status.API_URL;
export const PUBLIC_KEY = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
export const SERVICE_KEY = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
export const DB_URL = status.DB_URL;
export const MAILPIT_URL = status.INBUCKET_URL ?? status.MAILPIT_URL ?? 'http://127.0.0.1:54324';

if (!API_URL || !PUBLIC_KEY || !SERVICE_KEY || !DB_URL) {
  throw new Error('Local Supabase is not running. Start it with `npm run db:start`.');
}
if (!/127\.0\.0\.1|localhost/.test(API_URL) || !/127\.0\.0\.1|localhost/.test(DB_URL)) {
  throw new Error('Integration tests must only run against the local stack.');
}

export const db = new pg.Pool({ connectionString: DB_URL, max: 5 });

export const serviceClient = createClient(API_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export function anonClient(): SupabaseClient<any, 'api'> {
  return createClient(API_URL, PUBLIC_KEY, {
    db: { schema: 'api' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function signIn(email: string, password = LOCAL_PASSWORD): Promise<SupabaseClient<any, 'api'>> {
  const client = anonClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

/** Creates confirmed users through the Auth admin API (the domain hook still applies). */
export async function createUsers(prefix: string, count: number, domain = 'danamon.co.id'): Promise<string[]> {
  const emails: string[] = [];
  for (let i = 0; i < count; i++) {
    const email = `${prefix}.${i}.${Date.now()}@${domain}`.toLowerCase();
    const { error } = await serviceClient.auth.admin.createUser({
      email, password: LOCAL_PASSWORD, email_confirm: true, user_metadata: { full_name: `${prefix} ${i}` },
    });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    emails.push(email);
  }
  return emails;
}

export type RpcResult = { ok: true; data: any } | { ok: false; code: string };

export async function rpc(client: SupabaseClient<any, 'api'>, fn: string, args: Record<string, unknown> = {}): Promise<RpcResult> {
  const { data, error } = await client.rpc(fn, args);
  if (error) return { ok: false, code: error.message };
  return { ok: true, data };
}

/** WIB calendar date (YYYY-MM-DD) for today + offset days, computed from the database clock. */
export async function wibDate(offsetDays: number): Promise<string> {
  const { rows } = await db.query(
    `select to_char((now() at time zone 'Asia/Jakarta')::date + $1::int, 'YYYY-MM-DD') as d`, [offsetDays]);
  return rows[0].d;
}

/** Removes all bookings, blocks and notifications (local test database only). */
export async function resetBookings(): Promise<void> {
  await db.query('delete from app.notifications');
  await db.query('delete from app.bookings');
  await db.query('delete from app.facility_blocks');
}

export async function overlapCount(): Promise<number> {
  const { rows } = await db.query(`
    select count(*)::int as n from app.bookings a join app.bookings b
      on a.resource_id = b.resource_id and a.id < b.id and a.time_range && b.time_range
     and a.status in ('CONFIRMED','CHECKED_IN','COMPLETED') and b.status in ('CONFIRMED','CHECKED_IN','COMPLETED')`);
  return rows[0].n;
}

export const SLOTS = Array.from({ length: 30 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});
