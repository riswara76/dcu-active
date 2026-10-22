-- Classes (CR-03): TEST-55 … TEST-64
begin;
\ir _helpers.psql
select * from no_plan();

select tests.set_now('2030-01-07 08:00:00+07');   -- Monday
select tests.create_user('00000000-0000-4000-8000-00000000ac01', 't.class.admin@danamon.co.id', true, 'Class Admin');
select tests.make_admin('00000000-0000-4000-8000-00000000ac01');
select tests.create_user('00000000-0000-4000-8000-000000000c01', 'c1@danamon.co.id', true, 'Class One');
select tests.create_user('00000000-0000-4000-8000-000000000c02', 'c2@adira.co.id', true, 'Class Two');
select tests.create_user('00000000-0000-4000-8000-000000000c03', 'c3@homecredit.co.id', true, 'Class Three');

create or replace function tests.create_class(p_title text, p_facility text, p_location text, p_capacity integer,
                                              p_schedule jsonb, p_confirm boolean default false,
                                              p_expected uuid[] default '{}')
returns jsonb language sql as $$
  select tests.call('00000000-0000-4000-8000-00000000ac01',
    format('select api.admin_create_class(%L, %L, %L, %L, %L, %s, %L::jsonb, %L, %L::uuid[])',
           p_title, 'Description', 'Maya', p_facility, p_location, p_capacity, p_schedule, p_confirm, p_expected))
$$;
create or replace function tests.enrol(p_uid uuid, p_session uuid, p_key uuid default gen_random_uuid())
returns jsonb language sql as $$
  select tests.call(p_uid, format('select api.enrol_class_session(%L::uuid, %L::uuid)', p_session, p_key))
$$;

------------------------------------------------------------------------------------------------
-- TEST-55: only admins manage classes
------------------------------------------------------------------------------------------------
select throws_ok($$select tests.call('00000000-0000-4000-8000-000000000c01',
                   $q$select api.admin_create_class('Yoga', null, null, null, 'Studio 2', 10, '{"start_date":"2030-01-08","start_time":"18:00","duration_minutes":60}')$q$)$$,
                 'P0001', 'FORBIDDEN', 'TEST-55 a user cannot create a class');
select throws_ok($$select tests.call_anon($q$select api.list_class_sessions()$q$)$$,
                 '42501', null, 'TEST-55 anon cannot list class sessions');

------------------------------------------------------------------------------------------------
-- TEST-56: room class with a weekly schedule; validation
------------------------------------------------------------------------------------------------
create temp table yoga as
select (tests.create_class('Yoga', null, 'Studio Lt. 2', 2,
        '{"start_date":"2030-01-08","start_time":"18:00","duration_minutes":60,"repeat_weekdays":[2,4],"until_date":"2030-01-17"}') ->> 'class_id')::uuid as id;
select is((select count(*)::int from app.class_sessions s join yoga y on y.id = s.class_id), 4,
          'TEST-56 Tue/Thu for two weeks creates 4 sessions');
select is((select count(*)::int from app.facility_blocks where category = 'CLASS'), 0,
          'TEST-56 a separate-room class does not block any facility');
select throws_ok($$select tests.create_class('Pilates', null, null, 10, '{"start_date":"2030-01-08","start_time":"18:00","duration_minutes":60}')$$,
                 'P0001', 'VALIDATION_ERROR', 'TEST-56 a room class needs a location');
select throws_ok($$select tests.create_class('Pilates', null, 'Studio', 0, '{"start_date":"2030-01-08","start_time":"18:00","duration_minutes":60}')$$,
                 'P0001', 'VALIDATION_ERROR', 'TEST-56 capacity must be at least 1');
select throws_ok($$select tests.create_class('Pilates', null, 'Studio', 10, '{"start_date":"2030-01-08","start_time":"18:00","duration_minutes":45}')$$,
                 'P0001', 'VALIDATION_ERROR', 'TEST-56 duration must be a multiple of 30');
select throws_ok($$select tests.create_class('Pilates', null, 'Studio', 10, '{"start_date":"2030-01-08","start_time":"20:30","duration_minutes":60}')$$,
                 'P0001', 'OUTSIDE_OPERATING_HOURS', 'TEST-56 sessions stay within operating hours');
select throws_ok($$select tests.create_class('Pilates', null, 'Studio', 10, '{"start_date":"2030-01-06","start_time":"18:00","duration_minutes":60}')$$,
                 'P0001', 'VALIDATION_ERROR', 'TEST-56 sessions must start in the future');

------------------------------------------------------------------------------------------------
-- TEST-57: facility class closes the facility and handles booking conflicts
------------------------------------------------------------------------------------------------
select tests.book('00000000-0000-4000-8000-000000000c03', 'COURT', 'FUTSAL', '2030-01-09', '16:30', 30);
select is(jsonb_array_length(tests.call('00000000-0000-4000-8000-00000000ac01',
          $q$select api.admin_preview_class_schedule('COURT', '{"start_date":"2030-01-09","start_time":"16:00","duration_minutes":90}')$q$) -> 'conflicts'),
          1, 'TEST-57 preview lists the overlapping booking');
select throws_ok($$select tests.create_class('Futsal Clinic', 'COURT', null, 12, '{"start_date":"2030-01-09","start_time":"16:00","duration_minutes":90}')$$,
                 'P0001', 'ADMIN_BLOCK_CONFLICT', 'TEST-57 conflicts must be confirmed');
create temp table clinic as
select (tests.create_class('Futsal Clinic', 'COURT', null, 12, '{"start_date":"2030-01-09","start_time":"16:00","duration_minutes":90}', true,
          (select array_agg(id) from app.bookings where facility_id = (select id from app.facilities where code = 'COURT'))) ->> 'class_id')::uuid as id;
select is((select status::text || '/' || cancel_source::text from app.bookings
           where user_id = '00000000-0000-4000-8000-000000000c03'), 'ADMIN_CANCELLED/BLOCK',
          'TEST-57 the overlapping booking is cancelled');
select is((select s ->> 'state' || '/' || coalesce(s ->> 'unavailable_label', '')
           from jsonb_array_elements(tests.call('00000000-0000-4000-8000-000000000c01',
                $q$select api.get_availability('COURT', '2030-01-09')$q$) -> 'slots') s where s ->> 'start_wib' = '16:30'),
          'UNAVAILABLE/Class: Futsal Clinic', 'TEST-57 users see "Unavailable – Class: Futsal Clinic"');
select throws_ok($$select tests.book('00000000-0000-4000-8000-000000000c01', 'COURT', 'BASKETBALL', '2030-01-09', '17:00', 30)$$,
                 'P0001', 'SLOT_UNAVAILABLE', 'TEST-57 the class period cannot be booked');
select throws_ok($$select tests.create_class('Basketball Drills', 'COURT', null, 8, '{"start_date":"2030-01-09","start_time":"17:00","duration_minutes":60}')$$,
                 'P0001', 'CLASS_FACILITY_CONFLICT', 'TEST-57 two classes cannot share a facility at the same time');
select throws_ok(format($$select tests.call('00000000-0000-4000-8000-00000000ac01', 'select api.admin_remove_block(''%s'', ''Try to remove'')')$$,
                        (select block_id from app.class_sessions s join clinic c on c.id = s.class_id)),
                 'P0001', 'CLASS_BLOCK_MANAGED', 'TEST-57 a class block is released only by cancelling the session');

------------------------------------------------------------------------------------------------
-- TEST-58: enrolment, idempotency, duplicates, capacity
------------------------------------------------------------------------------------------------
create temp table s1 as
select s.id from app.class_sessions s join yoga y on y.id = s.class_id order by s.start_at limit 1;
select is((tests.call('00000000-0000-4000-8000-000000000c01', $q$select api.list_class_sessions('2030-01-07', 7)$q$) -> 0 ->> 'spots_left')::int,
          2, 'TEST-58 users see the free places');
select is(tests.enrol('00000000-0000-4000-8000-000000000c01', (select id from s1), '00000000-0000-4000-8000-0000000000e1') ->> 'status',
          'CONFIRMED', 'TEST-58 a user joins a session');
select is(tests.enrol('00000000-0000-4000-8000-000000000c01', (select id from s1), '00000000-0000-4000-8000-0000000000e1') ->> 'id',
          (select id::text from app.class_enrolments where idempotency_key = '00000000-0000-4000-8000-0000000000e1'),
          'TEST-58 a retry with the same key returns the same place');
select throws_ok($$select tests.enrol('00000000-0000-4000-8000-000000000c01', (select id from s1))$$,
                 'P0001', 'CLASS_ALREADY_ENROLLED', 'TEST-58 one place per person per session');
select tests.enrol('00000000-0000-4000-8000-000000000c02', (select id from s1));
select throws_ok($$select tests.enrol('00000000-0000-4000-8000-000000000c03', (select id from s1))$$,
                 'P0001', 'CLASS_FULL', 'TEST-58 a full session refuses new participants');

------------------------------------------------------------------------------------------------
-- TEST-59: active-enrolment limit and time clash
------------------------------------------------------------------------------------------------
select tests.enrol('00000000-0000-4000-8000-000000000c01',
                   (select s.id from app.class_sessions s join clinic c on c.id = s.class_id));
select throws_ok($$select tests.enrol('00000000-0000-4000-8000-000000000c01',
                   (select s.id from app.class_sessions s join yoga y on y.id = s.class_id order by s.start_at offset 1 limit 1))$$,
                 'P0001', 'CLASS_LIMIT_REACHED', 'TEST-59 the limit of 2 upcoming classes applies');
select tests.create_class('Stretching', null, 'Studio Lt. 3', 10, '{"start_date":"2030-01-08","start_time":"18:00","duration_minutes":30}');
select throws_ok($$select tests.enrol('00000000-0000-4000-8000-000000000c02',
                   (select s.id from app.class_sessions s join app.classes c on c.id = s.class_id where c.title = 'Stretching'))$$,
                 'P0001', 'CLASS_TIME_CONFLICT', 'TEST-59 two classes at the same time are refused');
select is((select count(*)::int from app.bookings where status = 'CONFIRMED'), 0,
          'TEST-59 class places do not use facility booking quota (no bookings were created)');

------------------------------------------------------------------------------------------------
-- TEST-60: cancellation by the user
------------------------------------------------------------------------------------------------
select is(tests.call('00000000-0000-4000-8000-000000000c02',
          format('select api.cancel_my_enrolment(%L)', (select id from app.class_enrolments where user_id = '00000000-0000-4000-8000-000000000c02'))) ->> 'status',
          'CANCELLED', 'TEST-60 a user leaves a class before the cutoff');
select is((tests.call('00000000-0000-4000-8000-000000000c03', format('select api.get_class_session(%L)', (select id from s1))) ->> 'spots_left')::int,
          1, 'TEST-60 the place is free again');
select tests.enrol('00000000-0000-4000-8000-000000000c03', (select id from s1));
select tests.set_now('2030-01-08 17:40:00+07');
select throws_ok(format($$select tests.call('00000000-0000-4000-8000-000000000c03', 'select api.cancel_my_enrolment(''%s'')')$$,
                        (select id from app.class_enrolments where user_id = '00000000-0000-4000-8000-000000000c03' and status = 'CONFIRMED')),
                 'P0001', 'BOOKING_NOT_CANCELLABLE', 'TEST-60 no cancellation within 30 minutes of the start');

------------------------------------------------------------------------------------------------
-- TEST-61: check-in, no-show and completion
------------------------------------------------------------------------------------------------
select tests.set_now('2030-01-08 17:40:00+07');
select throws_ok(format($$select tests.call('00000000-0000-4000-8000-000000000c01', 'select api.check_in_class(''%s'')')$$,
                        (select e.id from app.class_enrolments e join s1 on s1.id = e.session_id where e.user_id = '00000000-0000-4000-8000-000000000c01')),
                 'P0001', 'CHECKIN_TOO_EARLY', 'TEST-61 check-in opens 15 minutes before the start');
select tests.set_now('2030-01-08 17:50:00+07');
select is(tests.call('00000000-0000-4000-8000-000000000c01',
          format('select api.check_in_class(%L)', (select e.id from app.class_enrolments e join s1 on s1.id = e.session_id
                                                   where e.user_id = '00000000-0000-4000-8000-000000000c01'))) ->> 'status',
          'CHECKED_IN', 'TEST-61 a participant checks in');
select tests.set_now('2030-01-08 18:20:00+07');
select ok(private.apply_class_transitions() >= 1, 'TEST-61 the status job runs');
select is((select status::text from app.class_enrolments where user_id = '00000000-0000-4000-8000-000000000c03' and session_id = (select id from s1)),
          'NO_SHOW', 'TEST-61 no check-in by start + 15 minutes means no-show');
select is((select count(*)::int from app.notifications where user_id = '00000000-0000-4000-8000-000000000c03' and type = 'CLASS_NO_SHOW'),
          1, 'TEST-61 the no-show is notified');
select tests.set_now('2030-01-08 19:00:00+07');
select private.apply_class_transitions();
select is((select status::text from app.class_enrolments where user_id = '00000000-0000-4000-8000-000000000c01' and session_id = (select id from s1)),
          'COMPLETED', 'TEST-61 checked-in places complete after the end');

------------------------------------------------------------------------------------------------
-- TEST-62: admin cancels a session
------------------------------------------------------------------------------------------------
select is((tests.call('00000000-0000-4000-8000-00000000ac01',
          format('select api.admin_cancel_class_session(%L, ''Instructor is ill'')', (select s.id from app.class_sessions s join clinic c on c.id = s.class_id)))
          ->> 'cancelled_enrolments')::int, 1, 'TEST-62 the participant place is cancelled');
select is((select count(*)::int from app.notifications where user_id = '00000000-0000-4000-8000-000000000c01' and type = 'CLASS_SESSION_CANCELLED'),
          1, 'TEST-62 the participant is notified with the reason');
select is((select s ->> 'state' from jsonb_array_elements(tests.call('00000000-0000-4000-8000-000000000c02',
           $q$select api.get_availability('COURT', '2030-01-09')$q$) -> 'slots') s where s ->> 'start_wib' = '16:30'),
          'AVAILABLE', 'TEST-62 the facility is bookable again');
select throws_ok($$select tests.call('00000000-0000-4000-8000-00000000ac01',
                   format('select api.admin_cancel_class_session(%L, ''Nope'')', (select s.id from app.class_sessions s join yoga y on y.id = s.class_id order by s.start_at offset 1 limit 1)))$$,
                 'P0001', 'REASON_REQUIRED', 'TEST-62 a reason of at least 5 characters is required');

------------------------------------------------------------------------------------------------
-- TEST-63: privacy and monitoring
------------------------------------------------------------------------------------------------
select is(tests.call('00000000-0000-4000-8000-000000000c02', $q$select to_jsonb(count(*)) from app.class_enrolments$q$),
          '1'::jsonb, 'TEST-63 RLS shows a user only their own class places');
select ok(not (tests.call('00000000-0000-4000-8000-000000000c02', format('select api.get_class_session(%L)', (select id from s1)))::text ~ 'Class One'),
          'TEST-63 a session never reveals other participants');
select is(jsonb_array_length(tests.call('00000000-0000-4000-8000-00000000ac01', format('select api.admin_list_session_participants(%L)', (select id from s1)))),
          3, 'TEST-63 admins see the participant list');
select is((tests.call('00000000-0000-4000-8000-00000000ac01', $q$select api.admin_class_metrics('2030-01-08', '2030-01-08')$q$) ->> 'attended')::int,
          1, 'TEST-63 class metrics count attendance');
select throws_ok($$select tests.call('00000000-0000-4000-8000-000000000c01', $q$select api.admin_class_metrics('2030-01-08', '2030-01-08')$q$)$$,
                 'P0001', 'FORBIDDEN', 'TEST-63 users cannot read class metrics');
select ok((select count(*) from app.audit_logs where action = 'CLASS_CREATE') >= 3, 'TEST-63 class creation is audited');

------------------------------------------------------------------------------------------------
-- TEST-64: capacity changes and deactivation
------------------------------------------------------------------------------------------------
select tests.enrol('00000000-0000-4000-8000-000000000c02',
                   (select s.id from app.class_sessions s join yoga y on y.id = s.class_id order by s.start_at offset 2 limit 1));
select tests.enrol('00000000-0000-4000-8000-000000000c03',
                   (select s.id from app.class_sessions s join yoga y on y.id = s.class_id order by s.start_at offset 2 limit 1));
select throws_ok(format($$select tests.call('00000000-0000-4000-8000-00000000ac01',
                   'select api.admin_update_class(''%s'', ''Yoga'', null, ''Maya'', ''Studio Lt. 2'', 1)')$$, (select id from yoga)),
                 'P0001', 'CLASS_CAPACITY_BELOW_ENROLLED', 'TEST-64 capacity cannot drop below places taken');
select tests.call('00000000-0000-4000-8000-00000000ac01',
  format('select api.admin_set_user_active(%L, false, ''Left the company'')', '00000000-0000-4000-8000-000000000c03'));
select is((select status::text || '/' || cancel_source::text from app.class_enrolments
           where user_id = '00000000-0000-4000-8000-000000000c03' and status <> 'NO_SHOW'),
          'ADMIN_CANCELLED/DEACTIVATION', 'TEST-64 deactivation releases future class places');

select * from finish();
rollback;
