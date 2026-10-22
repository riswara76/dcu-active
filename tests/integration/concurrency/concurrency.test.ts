// Concurrency tests (TEST-PLAN §4): TEST-07, 10, 12, 13, 14, 22 (race), 26, 34, 40 (last-admin race)
// Each scenario fires requests simultaneously from independent sessions and then checks the database directly.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createUsers, db, overlapCount, resetBookings, rpc, signIn, SLOTS, wibDate } from '../env';

const ITERATIONS = 50;
const BUSINESS_CODES = new Set([
  'SLOT_UNAVAILABLE', 'BOOKING_LIMIT_REACHED', 'FACILITY_DAILY_LIMIT_REACHED', 'ADMIN_BLOCK_CONFLICT',
  'BLOCK_CONFLICTS_CHANGED', 'LAST_ADMIN_PROTECTED', 'FORBIDDEN', 'SYSTEM_BUSY',
]);

type Api = SupabaseClient<any, 'api'>;
const book = (c: Api, facility: string, activity: string, date: string, time: string, duration = 30) =>
  rpc(c, 'create_booking', {
    p_facility_code: facility, p_activity_code: activity, p_date: date, p_start_time: time,
    p_duration_minutes: duration, p_idempotency_key: randomUUID(),
  });

let users: Api[] = [];
let admin: Api;
let dates: string[] = [];

beforeAll(async () => {
  await resetBookings();
  const emails = await createUsers('cc', 30, 'danamon.co.id');
  users = await Promise.all(emails.map((e) => signIn(e)));
  admin = await signIn('admin.one@danamon.co.id');
  dates = await Promise.all([1, 2, 3, 4, 5, 6, 7].map((d) => wibDate(d)));
});

afterAll(async () => {
  await resetBookings();
  await db.end();
});

function codesOf(results: Awaited<ReturnType<typeof rpc>>[]) {
  return results.filter((r) => !r.ok).map((r) => (r as { code: string }).code);
}

describe('concurrency', () => {
  it(`TEST-07/26: 20 simultaneous requests for one Tennis slot → exactly 1 succeeds (${ITERATIONS} iterations)`, async () => {
    for (let i = 0; i < ITERATIONS; i++) {
      const date = dates[i % dates.length];
      const time = SLOTS[(i * 7) % SLOTS.length];
      const results = await Promise.all(users.slice(0, 20).map((u) => book(u, 'TENNIS', 'TENNIS', date, time)));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(new Set(codesOf(results))).toEqual(new Set(['SLOT_UNAVAILABLE']));
      await resetBookings();
    }
    expect(await overlapCount()).toBe(0);
  });

  for (const facility of ['AIR_HOCKEY', 'FOOSBALL']) {
    it(`TEST-10/12: 3 simultaneous ${facility} requests → 2 succeed on different tables, 1 rejected (${ITERATIONS} iterations)`, async () => {
      for (let i = 0; i < ITERATIONS; i++) {
        const date = dates[i % dates.length];
        const time = SLOTS[(i * 11) % SLOTS.length];
        const results = await Promise.all(users.slice(0, 3).map((u) => book(u, facility, facility, date, time)));
        const ok = results.filter((r) => r.ok) as { ok: true; data: any }[];
        expect(ok).toHaveLength(2);
        expect(new Set(ok.map((r) => r.data.resource_name)).size).toBe(2);
        expect(codesOf(results)).toEqual(['SLOT_UNAVAILABLE']);
        await resetBookings();
      }
      expect(await overlapCount()).toBe(0);
    });
  }

  it('TEST-13/34: one user firing 10 simultaneous requests (different facilities/days) → exactly 2 succeed (20 iterations)', async () => {
    const combos = [
      ['TENNIS', 'TENNIS'], ['COURT', 'BASKETBALL'], ['TABLE_TENNIS', 'TABLE_TENNIS'], ['FOOTBALL', 'FOOTBALL'],
      ['AIR_HOCKEY', 'AIR_HOCKEY'], ['FOOSBALL', 'FOOSBALL'], ['TENNIS', 'TENNIS'], ['COURT', 'FUTSAL'],
      ['TABLE_TENNIS', 'TABLE_TENNIS'], ['FOOTBALL', 'FOOTBALL'],
    ];
    for (let i = 0; i < 20; i++) {
      const u = users[i % users.length];
      const results = await Promise.all(combos.map(([f, a], k) =>
        book(u, f, a, dates[(k + i) % dates.length], SLOTS[(i + k * 3) % SLOTS.length])));
      expect(results.filter((r) => r.ok)).toHaveLength(2);
      for (const code of codesOf(results)) expect(['BOOKING_LIMIT_REACHED', 'FACILITY_DAILY_LIMIT_REACHED']).toContain(code);
      await resetBookings();
    }
  });

  it('TEST-14: one user firing 5 simultaneous Tennis requests on the same day → exactly 1 succeeds (20 iterations)', async () => {
    for (let i = 0; i < 20; i++) {
      const u = users[(i + 5) % users.length];
      const date = dates[i % dates.length];
      const results = await Promise.all([0, 4, 8, 12, 16].map((k) => book(u, 'TENNIS', 'TENNIS', date, SLOTS[k])));
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      expect(new Set(codesOf(results))).toEqual(new Set(['FACILITY_DAILY_LIMIT_REACHED']));
      await resetBookings();
    }
  });

  it('TEST-22: a block racing 5 bookings never leaves a confirmed booking inside an active block (30 iterations)', async () => {
    for (let i = 0; i < 30; i++) {
      const date = dates[i % dates.length];
      const time = SLOTS[(i * 5) % SLOTS.length];
      const [h, m] = time.split(':').map(Number);
      const start = `${date}T${time}:00+07:00`;
      const endMin = h * 60 + m + 30;
      const end = `${date}T${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}:00+07:00`;
      const blockCall = rpc(admin, 'admin_create_block', {
        p_facility_code: 'TENNIS', p_resource_code: null, p_start_at: start, p_end_at: end,
        p_category: 'EVENT', p_reason: 'Concurrency test block', p_confirm_cancel_conflicts: true, p_expected_conflict_ids: [],
      });
      const results = await Promise.all([blockCall, ...users.slice(0, 5).map((u) => book(u, 'TENNIS', 'TENNIS', date, time))]);
      for (const code of codesOf(results)) expect(BUSINESS_CODES).toContain(code);
      const { rows } = await db.query(`
        select count(*)::int as n from app.bookings b join app.facility_blocks k
          on k.facility_id = b.facility_id and (k.resource_id is null or k.resource_id = b.resource_id)
         and k.removed_at is null and k.time_range && b.time_range
        where b.status in ('CONFIRMED','CHECKED_IN')`);
      expect(rows[0].n).toBe(0);
      await resetBookings();
    }
  });

  it('TEST-26: 30 users booking random slots on all facilities at once → no overlaps, only business errors (10 rounds)', async () => {
    const facilities = [['TENNIS', 'TENNIS', 60], ['COURT', 'FUTSAL', 90], ['TABLE_TENNIS', 'TABLE_TENNIS', 30],
                        ['FOOTBALL', 'FOOTBALL', 60], ['AIR_HOCKEY', 'AIR_HOCKEY', 30], ['FOOSBALL', 'FOOSBALL', 30]] as const;
    for (let round = 0; round < 10; round++) {
      const results = await Promise.all(users.map((u, k) => {
        const [f, a, d] = facilities[(k + round) % facilities.length];
        return book(u, f, a, dates[round % 2], SLOTS[(k * 3 + round) % 26], d);
      }));
      for (const code of codesOf(results)) expect(BUSINESS_CODES).toContain(code);
      expect(results.some((r) => r.ok)).toBe(true);
      expect(await overlapCount()).toBe(0);
      await resetBookings(); // fresh limits for every user in the next round
    }
  });

  it('TEST-40: two admins deactivating each other at the same time never leaves zero active admins (10 iterations)', async () => {
    const [e1, e2] = await createUsers('race.admin', 2, 'danamon.co.id');
    const { rows: ids } = await db.query('select id, email from app.profiles where email = any($1)', [[e1, e2]]);
    const id1 = ids.find((r) => r.email === e1).id;
    const id2 = ids.find((r) => r.email === e2).id;
    // Only the two race admins are active admins during this test.
    const { rows: others } = await db.query(`select id from app.profiles where role = 'ADMIN' and is_active`);
    await db.query(`update app.profiles set role = 'USER' where id = any($1)`, [others.map((r) => r.id)]);
    try {
      for (let i = 0; i < 10; i++) {
        await db.query(`update app.profiles set role = 'ADMIN', is_active = true, deactivated_at = null,
                          deactivated_by = null, deactivation_reason = null where id = any($1)`, [[id1, id2]]);
        const [a1, a2] = await Promise.all([signIn(e1), signIn(e2)]);
        const results = await Promise.all([
          rpc(a1, 'admin_set_user_active', { p_user_id: id2, p_active: false, p_reason: 'Race test deactivation' }),
          rpc(a2, 'admin_set_user_active', { p_user_id: id1, p_active: false, p_reason: 'Race test deactivation' }),
        ]);
        expect(results.filter((r) => r.ok)).toHaveLength(1);
        for (const code of codesOf(results)) expect(['LAST_ADMIN_PROTECTED', 'FORBIDDEN']).toContain(code);
        const { rows } = await db.query(`select count(*)::int as n from app.profiles where role = 'ADMIN' and is_active`);
        expect(rows[0].n).toBe(1);
      }
    } finally {
      await db.query(`update app.profiles set role = 'ADMIN' where id = any($1)`, [others.map((r) => r.id)]);
      await db.query(`update app.profiles set role = 'USER', is_active = true, deactivated_at = null, deactivated_by = null,
                        deactivation_reason = null where id = any($1)`, [[id1, id2]]);
    }
  });
});

describe('concurrency — classes (CR-03)', () => {
  it('TEST-58: 30 users join a 5-place class at the same moment → exactly 5 places taken (20 iterations)', async () => {
    for (let i = 0; i < 20; i++) {
      const created = await rpc(admin, 'admin_create_class', {
        p_title: `Race ${i}`, p_description: null, p_instructor: null, p_facility_code: null,
        p_location_text: 'Studio race', p_capacity: 5,
        p_schedule: { start_date: dates[i % dates.length], start_time: SLOTS[(i * 5) % SLOTS.length], duration_minutes: 30,
                      repeat_weekdays: [], until_date: null },
      });
      expect(created.ok).toBe(true);
      const session = (created as { data: { session_ids: string[] } }).data.session_ids[0];
      const results = await Promise.all(users.map((u) =>
        rpc(u, 'enrol_class_session', { p_session_id: session, p_idempotency_key: randomUUID() })));
      expect(results.filter((r) => r.ok)).toHaveLength(5);
      expect(new Set(codesOf(results))).toEqual(new Set(['CLASS_FULL']));
      const { rows } = await db.query(
        `select count(*)::int n from app.class_enrolments where session_id = $1 and status = 'CONFIRMED'`, [session]);
      expect(rows[0].n).toBe(5);
      await resetBookings();
    }
  });
});
