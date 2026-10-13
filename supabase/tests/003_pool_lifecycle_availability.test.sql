-- Pooled allocation, cancellation, check-in, no-show, availability privacy:
-- TEST-09, 11 (sequential part), 17, 18, 19, 20, 42, 45 (completion), 54 (cancel cutoff boundary)
begin;
\ir _helpers.psql
select * from no_plan();

select tests.set_now('2030-01-07 08:00:00+07');
select tests.create_user('00000000-0000-4000-8000-000000000101', 'p1@danamon.co.id');
select tests.create_user('00000000-0000-4000-8000-000000000102', 'p2@adira.co.id');
select tests.create_user('00000000-0000-4000-8000-000000000103', 'p3@homecredit.co.id');
select tests.create_user('00000000-0000-4000-8000-000000000104', 'p4@danamon.co.id');

------------------------------------------------------------------------------------------------
-- TEST-09 / TEST-11: pooled facilities allocate the lowest free table, then the next; a third is rejected
------------------------------------------------------------------------------------------------
select is(tests.book('00000000-0000-4000-8000-000000000101', 'AIR_HOCKEY', 'AIR_HOCKEY', '2030-01-08', '12:00', 30) ->> 'resource_name',
          'Air Hockey Table 1', 'TEST-09 first booking gets Table 1');
select is(tests.book('00000000-0000-4000-8000-000000000102', 'AIR_HOCKEY', 'AIR_HOCKEY', '2030-01-08', '12:00', 30) ->> 'resource_name',
          'Air Hockey Table 2', 'TEST-09 second booking gets Table 2');
select throws_ok($$select tests.book('00000000-0000-4000-8000-000000000103', 'AIR_HOCKEY', 'AIR_HOCKEY', '2030-01-08', '12:00', 30)$$,
                 'P0001', 'SLOT_UNAVAILABLE', 'TEST-10 third booking for the same slot rejected');
select is(tests.book('00000000-0000-4000-8000-000000000101', 'FOOSBALL', 'FOOSBALL', '2030-01-08', '12:00', 30) ->> 'resource_name',
          'Foosball Table 1', 'TEST-11 Foosball Table 1');
select is(tests.book('00000000-0000-4000-8000-000000000102', 'FOOSBALL', 'FOOSBALL', '2030-01-08', '12:00', 30) ->> 'resource_name',
          'Foosball Table 2', 'TEST-11 Foosball Table 2');
select throws_ok($$select tests.book('00000000-0000-4000-8000-000000000103', 'FOOSBALL', 'FOOSBALL', '2030-01-08', '12:00', 30)$$,
                 'P0001', 'SLOT_UNAVAILABLE', 'TEST-12 third Foosball booking rejected');

------------------------------------------------------------------------------------------------
-- Availability: capacity counts and privacy (TEST-42)
------------------------------------------------------------------------------------------------
create temp table avail as
select tests.call('00000000-0000-4000-8000-000000000103', $q$select api.get_availability('AIR_HOCKEY', '2030-01-08')$q$) as j;
grant select on avail to authenticated;
select is((select s ->> 'state' from avail, jsonb_array_elements(j -> 'slots') s where s ->> 'start_wib' = '12:00'),
          'BOOKED', 'fully booked pooled slot shows BOOKED');
select is((select (s ->> 'available_count')::int from avail, jsonb_array_elements(j -> 'slots') s where s ->> 'start_wib' = '12:30'),
          2, 'free pooled slot shows 2 tables available');
select is((select jsonb_array_length(j -> 'slots') from avail), 30, '30 half-hour slots between 06:00 and 21:00');
select ok((select j::text !~* '(user_id|full_name|email|booking_ref|p1@|p2@|Table 1|Table 2)' from avail),
          'TEST-42 availability contains no owner identity, booking reference or table assignment');
select is((select tests.call('00000000-0000-4000-8000-000000000101', $q$select api.get_availability('AIR_HOCKEY', '2030-01-08')$q$)
           -> 'slots' -> 12 ->> 'is_mine'), 'true', 'own booking is flagged is_mine for its owner');

-- Tennis: bookable durations respect the next booking and closing time
select tests.book('00000000-0000-4000-8000-000000000104', 'TENNIS', 'TENNIS', '2030-01-09', '10:00', 30);
select is((select s -> 'bookable_durations'
           from jsonb_array_elements(tests.call('00000000-0000-4000-8000-000000000103',
                $q$select api.get_availability('TENNIS', '2030-01-09')$q$) -> 'slots') s
           where s ->> 'start_wib' = '09:00'), '[30, 60]'::jsonb, '09:00 can be booked for 30/60 but not 90 (blocked by 10:00)');
select is((select s -> 'bookable_durations'
           from jsonb_array_elements(tests.call('00000000-0000-4000-8000-000000000103',
                $q$select api.get_availability('TENNIS', '2030-01-09')$q$) -> 'slots') s
           where s ->> 'start_wib' = '20:30'), '[30]'::jsonb, '20:30 can only be booked for 30 minutes');
select throws_ok($$select tests.call('00000000-0000-4000-8000-000000000103', $q$select api.get_availability('TENNIS', '2030-01-20')$q$)$$,
                 'P0001', 'BOOKING_WINDOW_EXCEEDED', 'availability outside the horizon is rejected');

------------------------------------------------------------------------------------------------
-- TEST-17 / TEST-54: cancellation and the 30-minute cutoff (booking p3 on Tennis 2030-01-07 18:00)
------------------------------------------------------------------------------------------------
select tests.book('00000000-0000-4000-8000-000000000103', 'TENNIS', 'TENNIS', '2030-01-07', '18:00', 60,
                  '00000000-0000-4000-8000-000000001801');
create temp table b18 as select id from app.bookings where idempotency_key = '00000000-0000-4000-8000-000000001801';
grant select on b18 to authenticated;

select tests.set_now('2030-01-07 17:30:01+07');
select throws_ok($$select tests.call('00000000-0000-4000-8000-000000000103',
                   format('select api.cancel_my_booking(%L)', (select id from b18)))$$,
                 'P0001', 'BOOKING_NOT_CANCELLABLE', 'TEST-54 cancelling at 17:30:01 for an 18:00 start is rejected');
select tests.set_now('2030-01-07 17:30:00+07');
select is(tests.call('00000000-0000-4000-8000-000000000103', format('select api.cancel_my_booking(%L)', (select id from b18))) ->> 'status',
          'CANCELLED', 'TEST-54 cancelling exactly 30 minutes before start is allowed');
select is((select count(*)::int from app.bookings where id = (select id from b18)), 1, 'TEST-17 cancelled booking is retained');
select is(tests.book('00000000-0000-4000-8000-000000000104', 'TENNIS', 'TENNIS', '2030-01-07', '18:00', 30) ->> 'status',
          'CONFIRMED', 'TEST-17 the released slot can be booked by someone else');
select throws_ok($$select tests.call('00000000-0000-4000-8000-000000000104',
                   format('select api.cancel_my_booking(%L)', (select id from b18)))$$,
                 'P0001', 'BOOKING_NOT_FOUND', 'TEST-23 another user cannot cancel (or see) this booking');
select is(tests.book('00000000-0000-4000-8000-000000000103', 'TENNIS', 'TENNIS', '2030-01-07', '19:00', 30) ->> 'status',
          'CONFIRMED', 'BR-22 after cancelling, the same facility can be booked again that day');

------------------------------------------------------------------------------------------------
-- TEST-18 / TEST-19: check-in window (p4 booking 18:00 today)
------------------------------------------------------------------------------------------------
create temp table c18 as
select id from app.bookings where user_id = '00000000-0000-4000-8000-000000000104' and booking_date = '2030-01-07';
grant select on c18 to authenticated;

select tests.set_now('2030-01-07 17:44:59+07');
select throws_ok($$select tests.call('00000000-0000-4000-8000-000000000104', format('select api.check_in(%L)', (select id from c18)))$$,
                 'P0001', 'CHECKIN_TOO_EARLY', 'TEST-19 check-in at 17:44:59 is too early');
select tests.set_now('2030-01-07 17:45:00+07');
select is(tests.call('00000000-0000-4000-8000-000000000104', format('select api.get_my_booking(%L)', (select id from c18))) ->> 'effective_status',
          'CHECKIN_OPEN', 'effective status is CHECKIN_OPEN at 17:45');
select is(tests.call('00000000-0000-4000-8000-000000000104', format('select api.check_in(%L)', (select id from c18))) ->> 'status',
          'CHECKED_IN', 'TEST-18 check-in at 17:45:00 succeeds');
select throws_ok($$select tests.call('00000000-0000-4000-8000-000000000104', format('select api.check_in(%L)', (select id from c18)))$$,
                 'P0001', 'CHECKIN_NOT_ALLOWED', 'checking in twice is rejected');

-- Completion after end (TEST-45)
select tests.set_now('2030-01-07 18:30:00+07');
select ok(private.apply_status_transitions() >= 1, 'status processor runs');
select is((select status::text from app.bookings where id = (select id from c18)), 'COMPLETED',
          'TEST-45 CHECKED_IN becomes COMPLETED after the end time');

------------------------------------------------------------------------------------------------
-- TEST-20: no-show (p3 booking 19:00 today, never checked in)
------------------------------------------------------------------------------------------------
create temp table n19 as
select id from app.bookings where user_id = '00000000-0000-4000-8000-000000000103' and booking_date = '2030-01-07' and status = 'CONFIRMED';
grant select on n19 to authenticated;

select tests.set_now('2030-01-07 19:15:00+07');
select is(tests.call('00000000-0000-4000-8000-000000000103', format('select api.check_in(%L)', (select id from n19))) ->> 'status',
          'CHECKED_IN', 'TEST-18 check-in exactly at the deadline (start + 15:00) is still allowed');
-- User p5 books Tennis 20:00–21:00 today and does not check in
select tests.create_user('00000000-0000-4000-8000-000000000105', 'p5@danamon.co.id');
select tests.create_user('00000000-0000-4000-8000-000000000106', 'p6@adira.co.id');
select tests.set_now('2030-01-07 19:20:00+07');
select tests.book('00000000-0000-4000-8000-000000000105', 'TENNIS', 'TENNIS', '2030-01-07', '20:00', 60,
                  '00000000-0000-4000-8000-000000002001');
select tests.set_now('2030-01-07 20:15:01+07');
select is((select tests.call('00000000-0000-4000-8000-000000000105',
           $q$select api.list_my_bookings('HISTORY')$q$) -> 'items' -> 0 ->> 'effective_status'),
          'NO_SHOW', 'TEST-20 effective status is NO_SHOW immediately after the deadline');
select is((select s ->> 'state' from jsonb_array_elements(tests.call('00000000-0000-4000-8000-000000000106',
           $q$select api.get_availability('TENNIS', '2030-01-07')$q$) -> 'slots') s where s ->> 'start_wib' = '20:30'),
          'AVAILABLE', 'TEST-20 the released court is available from the next half hour (BR-25)');
select is((select s ->> 'state' from jsonb_array_elements(tests.call('00000000-0000-4000-8000-000000000106',
           $q$select api.get_availability('TENNIS', '2030-01-07')$q$) -> 'slots') s where s ->> 'start_wib' = '20:00'),
          'PAST', 'TEST-20 the started slot stays unbookable (BR-14)');
select is(tests.book('00000000-0000-4000-8000-000000000106', 'TENNIS', 'TENNIS', '2030-01-07', '20:30', 30) ->> 'status',
          'CONFIRMED', 'TEST-20 another user books 20:30 (the sweep releases the no-show inside the transaction)');
select is((select status::text from app.bookings where idempotency_key = '00000000-0000-4000-8000-000000002001'),
          'NO_SHOW', 'TEST-20 stored status became NO_SHOW');
select is((select count(*)::int from app.notifications n join app.bookings b on b.id = n.booking_id
           where b.idempotency_key = '00000000-0000-4000-8000-000000002001' and n.type = 'NO_SHOW'), 1,
          'TEST-20 the owner is notified of the no-show');
select throws_ok($$select tests.book('00000000-0000-4000-8000-000000000105', 'TENNIS', 'TENNIS', '2030-01-07', '20:30', 30)$$,
                 'P0001', 'FACILITY_DAILY_LIMIT_REACHED', 'TEST-14 a no-show still uses that day''s Tennis allowance (BR-22)');

select * from finish();
rollback;
