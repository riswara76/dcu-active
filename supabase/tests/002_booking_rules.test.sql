-- Booking rules: TEST-04, 05, 06, 07, 08, 13, 14, 15, 16, 34 (input tampering), 44, 45
begin;
\ir _helpers.psql
select * from no_plan();

-- Clock: Monday 2030-01-07 08:00 WIB → bookable dates 2030-01-07 … 2030-01-14
select tests.set_now('2030-01-07 08:00:00+07');

select tests.create_user('00000000-0000-4000-8000-0000000000a1', 't.user.a@danamon.co.id');
select tests.create_user('00000000-0000-4000-8000-0000000000b1', 't.user.b@adira.co.id');
select tests.create_user('00000000-0000-4000-8000-0000000000c1', 't.user.c@homecredit.co.id');
select tests.create_user('00000000-0000-4000-8000-0000000000d1', 't.user.d@danamon.co.id');
select tests.create_user('00000000-0000-4000-8000-0000000000e1', 't.user.e@danamon.co.id');
select tests.create_user('00000000-0000-4000-8000-0000000000f1', 't.user.f@danamon.co.id');
select tests.create_user('00000000-0000-4000-8000-0000000000f2', 't.user.g@danamon.co.id');
select tests.create_user('00000000-0000-4000-8000-0000000000f3', 't.unverified@danamon.co.id', false);
select tests.create_user('00000000-0000-4000-8000-0000000000f4', 'inactive@danamon.co.id');
update app.profiles set is_active = false, deactivated_at = now(), deactivation_reason = 'Test inactive user'
 where id = '00000000-0000-4000-8000-0000000000f4';

-- TEST-04/05/06: Tennis 30/60/90
select is(tests.book('00000000-0000-4000-8000-0000000000a1', 'TENNIS', 'TENNIS', '2030-01-08', '10:00', 30) ->> 'status',
          'CONFIRMED', 'TEST-04 Tennis 30 min confirmed');
select is((select end_wib from (select tests.call('00000000-0000-4000-8000-0000000000a1',
           $q$select api.list_my_bookings('UPCOMING')$q$) -> 'items' -> 0 ->> 'end_wib' as end_wib) x),
          '10:30', 'TEST-04 ends 10:30 WIB and appears in My bookings');
select is(tests.book('00000000-0000-4000-8000-0000000000b1', 'TENNIS', 'TENNIS', '2030-01-08', '11:00', 60) ->> 'end_wib',
          '12:00', 'TEST-05 Tennis 60 min ends 12:00');
select is((select count(*)::int from app.bookings where user_id = '00000000-0000-4000-8000-0000000000b1'), 1,
          'TEST-05 a 60-minute booking is one continuous row (BR-17)');
select is(tests.book('00000000-0000-4000-8000-0000000000c1', 'TENNIS', 'TENNIS', '2030-01-08', '13:00', 90) ->> 'end_wib',
          '14:30', 'TEST-06 Tennis 90 min ends 14:30');
select is((select count(*)::int from app.notifications where user_id = '00000000-0000-4000-8000-0000000000c1'
           and type = 'BOOKING_CONFIRMED'), 1, 'booking creates a confirmation notification');

-- TEST-07: overlaps rejected
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000d1', 'TENNIS', 'TENNIS', '2030-01-08', '10:00', 30)$$,
                 'P0001', 'SLOT_UNAVAILABLE', 'TEST-07 identical slot rejected');
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000d1', 'TENNIS', 'TENNIS', '2030-01-08', '11:30', 30)$$,
                 'P0001', 'SLOT_UNAVAILABLE', 'TEST-07 slot inside an existing 60-min booking rejected');
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000d1', 'TENNIS', 'TENNIS', '2030-01-08', '12:30', 90)$$,
                 'P0001', 'SLOT_UNAVAILABLE', 'TEST-07 partial overlap at the end rejected');
select throws_ok($$insert into app.bookings (booking_ref, user_id, facility_id, activity_id, resource_id, booking_date,
                                             start_at, end_at, duration_minutes, idempotency_key)
                   select 'DCU-300108-ZZZZ', '00000000-0000-4000-8000-0000000000d1', facility_id, activity_id, resource_id,
                          booking_date, start_at, end_at, duration_minutes, gen_random_uuid()
                   from app.bookings where user_id = '00000000-0000-4000-8000-0000000000a1'$$,
                 '23P01', null, 'TEST-07 direct INSERT of an overlap violates the exclusion constraint');

-- Operating hours at the end of the day
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000e1', 'TENNIS', 'TENNIS', '2030-01-08', '20:00', 90)$$,
                 'P0001', 'OUTSIDE_OPERATING_HOURS', 'TEST-06 20:00 + 90 min exceeds 21:00');
select is(tests.book('00000000-0000-4000-8000-0000000000e1', 'TENNIS', 'TENNIS', '2030-01-08', '20:30', 30) ->> 'end_wib',
          '21:00', '20:30–21:00 is valid');

-- Durations per facility
select is(tests.book('00000000-0000-4000-8000-0000000000d1', 'FOOTBALL', 'FOOTBALL', '2030-01-08', '07:00', 90) ->> 'duration_minutes',
          '90', 'Football Field accepts 90 minutes (OD-19)');
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000d1', 'TABLE_TENNIS', 'TABLE_TENNIS', '2030-01-08', '07:00', 60)$$,
                 'P0001', 'INVALID_DURATION', 'Table Tennis rejects 60 minutes');
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000d1', 'TENNIS', 'TENNIS', '2030-01-09', '07:00', 45)$$,
                 'P0001', 'INVALID_DURATION', '45 minutes is never allowed');

-- TEST-08: shared court
select is(tests.book('00000000-0000-4000-8000-0000000000a1', 'COURT', 'BASKETBALL', '2030-01-09', '16:00', 60) ->> 'status',
          'CONFIRMED', 'Basketball 16:00–17:00 confirmed');
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000b1', 'COURT', 'FUTSAL', '2030-01-09', '16:30', 30)$$,
                 'P0001', 'SLOT_UNAVAILABLE', 'TEST-08 Futsal rejected while Basketball occupies the court');

-- TEST-13: maximum two active/future bookings (user A now has Tennis + Basketball)
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000a1', 'FOOTBALL', 'FOOTBALL', '2030-01-10', '08:00', 30)$$,
                 'P0001', 'BOOKING_LIMIT_REACHED', 'TEST-13 third active booking rejected');

-- TEST-14: one booking per facility per day; Basketball and Futsal count as one facility
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000b1', 'TENNIS', 'TENNIS', '2030-01-08', '15:00', 30)$$,
                 'P0001', 'FACILITY_DAILY_LIMIT_REACHED', 'TEST-14 second Tennis booking on the same day rejected');
select is(tests.book('00000000-0000-4000-8000-0000000000f1', 'COURT', 'BASKETBALL', '2030-01-10', '08:00', 30) ->> 'status',
          'CONFIRMED', 'Basketball on 2030-01-10 confirmed');
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000f1', 'COURT', 'FUTSAL', '2030-01-10', '10:00', 30)$$,
                 'P0001', 'FACILITY_DAILY_LIMIT_REACHED', 'TEST-14 Futsal after Basketball on the same day rejected (BR-18)');

-- TEST-15: booking horizon (today … today + 7)
select is(tests.book('00000000-0000-4000-8000-0000000000f1', 'TENNIS', 'TENNIS', '2030-01-14', '09:00', 30) ->> 'date_wib',
          '2030-01-14', 'TEST-15 today + 7 is bookable');
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000f2', 'TENNIS', 'TENNIS', '2030-01-15', '09:00', 30)$$,
                 'P0001', 'BOOKING_WINDOW_EXCEEDED', 'TEST-15 today + 8 rejected');
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000f2', 'TENNIS', 'TENNIS', '2030-01-06', '09:00', 30)$$,
                 'P0001', 'BOOKING_WINDOW_EXCEEDED', 'TEST-15 yesterday rejected');

-- TEST-16: operating hours, alignment, format, not started
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000f2', 'TENNIS', 'TENNIS', '2030-01-09', '05:30', 30)$$,
                 'P0001', 'OUTSIDE_OPERATING_HOURS', 'TEST-16 05:30 rejected');
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000f2', 'TENNIS', 'TENNIS', '2030-01-09', '06:15', 30)$$,
                 'P0001', 'SLOT_MISALIGNED', 'TEST-16 06:15 rejected');
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000f2', 'TENNIS', 'TENNIS', '2030-01-09', '6:00', 30)$$,
                 'P0001', 'VALIDATION_ERROR', 'malformed time rejected');
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000f2', 'TENNIS', 'TENNIS', '2030-01-07', '07:30', 30)$$,
                 'P0001', 'SLOT_IN_PAST', 'TEST-16 a slot that already started is rejected');
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000f2', 'TENNIS', 'TENNIS', '2030-01-07', '08:00', 30)$$,
                 'P0001', 'SLOT_IN_PAST', 'BR-24 a slot starting exactly now is rejected');
select is(tests.book('00000000-0000-4000-8000-0000000000f2', 'TENNIS', 'TENNIS', '2030-01-07', '08:30', 30) ->> 'status',
          'CONFIRMED', 'the next half-hour today is bookable');

-- Input tampering (TEST-34, database level)
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000f2', 'SQUASH', 'SQUASH', '2030-01-09', '09:00', 30)$$,
                 'P0001', 'FACILITY_NOT_FOUND', 'unknown facility rejected');
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000f2', 'TENNIS', 'FUTSAL', '2030-01-09', '09:00', 30)$$,
                 'P0001', 'ACTIVITY_INVALID', 'activity from another facility rejected');

-- TEST-44: idempotency
select tests.book('00000000-0000-4000-8000-0000000000c1', 'TABLE_TENNIS', 'TABLE_TENNIS', '2030-01-09', '09:00', 30,
                  '00000000-0000-4000-8000-00000000cafe');
select is(tests.book('00000000-0000-4000-8000-0000000000c1', 'TABLE_TENNIS', 'TABLE_TENNIS', '2030-01-09', '09:00', 30,
                     '00000000-0000-4000-8000-00000000cafe') ->> 'status',
          'CONFIRMED', 'TEST-44 repeating the same request returns the booking');
select is((select count(*)::int from app.bookings where user_id = '00000000-0000-4000-8000-0000000000c1'
           and idempotency_key = '00000000-0000-4000-8000-00000000cafe'), 1, 'TEST-44 only one row exists');

-- Account state
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000f3', 'TENNIS', 'TENNIS', '2030-01-10', '09:00', 30)$$,
                 'P0001', 'EMAIL_NOT_VERIFIED', 'unverified users cannot book');
select throws_ok($$select tests.book('00000000-0000-4000-8000-0000000000f4', 'TENNIS', 'TENNIS', '2030-01-10', '09:00', 30)$$,
                 'P0001', 'ACCOUNT_DISABLED', 'deactivated users cannot book');
select throws_ok($$select tests.book(null, 'TENNIS', 'TENNIS', '2030-01-10', '09:00', 30)$$,
                 'P0001', 'NOT_AUTHENTICATED', 'requests without a session are rejected');

-- TEST-45: status transition integrity (enforced even for the table owner)
select throws_ok($$update app.bookings set status = 'COMPLETED', completed_at = now(), checked_in_at = now()
                   where booking_ref = (select booking_ref from app.bookings where user_id = '00000000-0000-4000-8000-0000000000e1')$$,
                 'P0001', 'INVALID_STATUS_TRANSITION', 'TEST-45 CONFIRMED → COMPLETED is not allowed');
select throws_ok($$update app.bookings set start_at = start_at + interval '30 minutes', end_at = end_at + interval '30 minutes'
                   where user_id = '00000000-0000-4000-8000-0000000000e1'$$,
                 'P0001', 'BOOKING_IMMUTABLE_FIELD', 'TEST-45 booking times cannot be changed');
update app.bookings set status = 'CANCELLED', cancelled_at = now(), cancel_source = 'USER'
 where user_id = '00000000-0000-4000-8000-0000000000e1';
select throws_ok($$update app.bookings set status = 'CONFIRMED' where user_id = '00000000-0000-4000-8000-0000000000e1'$$,
                 'P0001', 'INVALID_STATUS_TRANSITION', 'TEST-45 CANCELLED → CONFIRMED is not allowed');

select * from finish();
rollback;
