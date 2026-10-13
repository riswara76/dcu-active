// API-level integration tests against the local stack:
// TEST-01, 03, 25, 34, 42, 43 (signal part), 51, 52 — exercising Supabase Auth, PostgREST exposure and Realtime.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anonClient, createUsers, db, LOCAL_PASSWORD, MAILPIT_URL, resetBookings, rpc, signIn, wibDate } from './env';

const STRONG = 'Strong#Pass2026';

async function latestCode(email: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    if (res.ok) {
      const body = await res.json();
      const id = body.messages?.[0]?.ID;
      if (id) {
        const msg = await (await fetch(`${MAILPIT_URL}/api/v1/message/${id}`)).json();
        const code = String(msg.Text ?? msg.HTML ?? '').match(/\b(\d{6})\b/)?.[1];
        if (code) return code;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no email with a 6-digit code for ${email}`);
}

beforeAll(async () => {
  await resetBookings();
});

afterAll(async () => {
  await resetBookings();
  await db.end();
});

describe('authentication', () => {
  it('TEST-52: sign-up is limited to allowed company domains (enforced by the Auth hook)', async () => {
    const c = anonClient();
    for (const email of [`x.${Date.now()}@gmail.com`, `x.${Date.now()}@branch.danamon.co.id`, `x.${Date.now()}@danamon.co.id.evil.com`]) {
      const { error } = await c.auth.signUp({ email, password: STRONG });
      expect(error, email).not.toBeNull();
      expect(error!.message).toContain('EMAIL_DOMAIN_NOT_ALLOWED');
    }
    const { data, error } = await c.auth.signUp({ email: `ok.${Date.now()}@ADIRA.co.id`, password: STRONG });
    expect(error).toBeNull();
    expect(data.user?.email_confirmed_at ?? null).toBeNull();
  });

  it('TEST-51: weak passwords are rejected by the Auth server', async () => {
    const { error } = await anonClient().auth.signUp({ email: `weak.${Date.now()}@danamon.co.id`, password: 'password1' });
    expect(error).not.toBeNull();
    expect(error!.code ?? error!.message).toMatch(/weak_password|password/i);
  });

  it('TEST-01: register → 6-digit code by email → verified session', async () => {
    const email = `verify.${Date.now()}@homecredit.co.id`;
    const c = anonClient();
    const { error } = await c.auth.signUp({ email, password: STRONG, options: { data: { full_name: 'Verify Me' } } });
    expect(error).toBeNull();
    await expect(c.auth.signInWithPassword({ email, password: STRONG })).resolves.toMatchObject({ error: expect.anything() });
    const token = await latestCode(email);
    const verified = await c.auth.verifyOtp({ email, token, type: 'email' });
    expect(verified.error).toBeNull();
    const profile = await rpc(c, 'get_my_profile');
    expect(profile.ok && profile.data).toMatchObject({ email, full_name: 'Verify Me', role: 'USER', email_verified: true });
  });

  it('TEST-03: password reset by code, old password stops working', async () => {
    const [email] = await createUsers('reset', 1, 'danamon.co.id');
    const c = anonClient();
    expect((await c.auth.resetPasswordForEmail(email)).error).toBeNull();
    const token = await latestCode(email);
    expect((await c.auth.verifyOtp({ email, token, type: 'recovery' })).error).toBeNull();
    expect((await c.auth.updateUser({ password: STRONG })).error).toBeNull();
    expect((await anonClient().auth.signInWithPassword({ email, password: LOCAL_PASSWORD })).error).not.toBeNull();
    expect((await anonClient().auth.signInWithPassword({ email, password: STRONG })).error).toBeNull();
  });
});

describe('API exposure', () => {
  it('TEST-34: tables are not reachable through the Data API', async () => {
    const c = await signIn('user.a@danamon.co.id');
    expect((await c.from('bookings').select('*')).error).not.toBeNull();
    expect((await c.schema('app' as any).from('bookings').select('*')).error).not.toBeNull();
    expect((await c.schema('public' as any).from('bookings').select('*')).error).not.toBeNull();
  });

  it('TEST-42: anonymous callers only reach the two public RPCs', async () => {
    const anon = anonClient();
    const domains = await rpc(anon, 'get_registration_domains');
    expect(domains.ok && domains.data.domains).toEqual(['adira.co.id', 'danamon.co.id', 'homecredit.co.id']);
    expect((await rpc(anon, 'health')).ok).toBe(true);
    expect((await rpc(anon, 'get_availability', { p_facility_code: 'TENNIS', p_date: await wibDate(1) })).ok).toBe(false);
    expect((await rpc(anon, 'list_facilities')).ok).toBe(false);
  });

  it('TEST-25: a deactivated user is refused on the next call with the same session', async () => {
    const [email] = await createUsers('deact', 1, 'adira.co.id');
    const user = await signIn(email);
    const admin = await signIn('admin.one@danamon.co.id');
    expect((await rpc(user, 'get_app_config')).ok).toBe(true);
    const { rows } = await db.query('select id from app.profiles where email = $1', [email]);
    const off = await rpc(admin, 'admin_set_user_active', { p_user_id: rows[0].id, p_active: false, p_reason: 'Integration test' });
    expect(off.ok).toBe(true);
    const next = await rpc(user, 'create_booking', {
      p_facility_code: 'TENNIS', p_activity_code: 'TENNIS', p_date: await wibDate(2), p_start_time: '10:00',
      p_duration_minutes: 30, p_idempotency_key: randomUUID(),
    });
    expect(next).toEqual({ ok: false, code: 'ACCOUNT_DISABLED' });
  });
});

describe('realtime', () => {
  it('TEST-42/43: availability signals reach active users and contain no personal data', async () => {
    const listener = await signIn('user.b@adira.co.id');
    const booker = await signIn('user.c@homecredit.co.id');
    const { data: session } = await listener.auth.getSession();
    await listener.realtime.setAuth(session.session!.access_token);

    const received: any[] = [];
    const channel = listener.channel('availability:FOOSBALL', { config: { private: true } })
      .on('broadcast', { event: 'availability_changed' }, (msg) => received.push(msg.payload));
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('subscribe timeout')), 15_000);
      channel.subscribe((status) => { if (status === 'SUBSCRIBED') { clearTimeout(t); resolve(); } });
    });

    // The first subscription of a tenant starts Realtime's database replication; give it a moment.
    await new Promise((r) => setTimeout(r, 2_000));

    const date = await wibDate(3);
    const res = await rpc(booker, 'create_booking', {
      p_facility_code: 'FOOSBALL', p_activity_code: 'FOOSBALL', p_date: date, p_start_time: '12:00',
      p_duration_minutes: 30, p_idempotency_key: randomUUID(),
    });
    expect(res.ok).toBe(true);
    const started = Date.now();
    while (received.length === 0 && Date.now() - started < 3_000) await new Promise((r) => setTimeout(r, 100));
    expect(received.length, 'signal received within 3 s').toBeGreaterThan(0);
    // Realtime adds its own message "id"; everything else must be exactly the non-personal payload.
    const { id: _messageId, ...payload } = received[0];
    expect(payload).toEqual({ facility_code: 'FOOSBALL', date_wib: date });
    await listener.removeChannel(channel);
  });

  it('TEST-42: anonymous clients cannot subscribe to private availability channels', async () => {
    const anon = anonClient();
    const channel = anon.channel('availability:TENNIS', { config: { private: true } });
    const status = await new Promise<string>((resolve) => {
      const t = setTimeout(() => resolve('TIMED_OUT'), 10_000);
      channel.subscribe((s) => { if (s !== 'SUBSCRIBED') { clearTimeout(t); resolve(s); } else { clearTimeout(t); resolve(s); } });
    });
    expect(status).not.toBe('SUBSCRIBED');
    await anon.removeChannel(channel);
  });
});
