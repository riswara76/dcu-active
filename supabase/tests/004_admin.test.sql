-- Administration: TEST-21, 22, 24, 25, 33, 36, 38, 39, 40, 53, 54
begin;
\ir _helpers.psql
select * from no_plan();

select tests.set_now('2030-01-07 08:00:00+07');
select tests.create_user('00000000-0000-4000-8000-00000000ad01', 't.admin.one@danamon.co.id', true, 'Admin One');
select tests.create_user('00000000-0000-4000-8000-00000000ad02', 't.admin.two@danamon.co.id', true, 'Admin Two');
select tests.make_admin('00000000-0000-4000-8000-00000000ad01');
select tests.make_admin('00000000-0000-4000-8000-00000000ad02');
select tests.create_user('00000000-0000-4000-8000-000000000201', 'u1@danamon.co.id', true, 'User One');
select tests.create_user('00000000-0000-4000-8000-000000000202', 'u2@adira.co.id', true, 'User Two');
select tests.create_user('00000000-0000-4000-8000-000000000203', 'u3@homecredit.co.id', true, 'User Three');
select tests.create_user('00000000-0000-4000-8000-000000000209', 'u9@danamon.co.id', true, 'User Nine');

------------------------------------------------------------------------------------------------
-- TEST-24: non-admins are refused, both by the RPC check and by RLS
------------------------------------------------------------------------------------------------
select throws_ok($$select tests.call('00000000-0000-4000-8000-000000000201', $q$select api.admin_list_bookings()$q$)$$,
                 'P0001', 'FORBIDDEN', 'TEST-24 user cannot list all bookings');
select throws_ok($$select tests.call('00000000-0000-4000-8000-000000000201', $q$select api.admin_dashboard_metrics('2030-01-07', '2030-01-07')$q$)$$,
                 'P0001', 'FORBIDDEN', 'TEST-24 user cannot read the dashboard');
select throws_ok($$select tests.call('00000000-0000-4000-8000-000000000201',
                   $q$select api.admin_set_user_role('00000000-0000-4000-8000-000000000201', 'ADMIN', 'Make me admin')$q$)$$,
                 'P0001', 'FORBIDDEN', 'TEST-40 user cannot grant themselves the admin role');
select is(tests.call('00000000-0000-4000-8000-000000000201', $q$select to_jsonb(count(*)) from app.audit_logs$q$), '0'::jsonb,
          'TEST-24 RLS hides audit logs from users');
select is(tests.call('00000000-0000-4000-8000-000000000201', $q$select to_jsonb(count(*)) from app.profiles$q$), '1'::jsonb,
          'TEST-23 RLS shows a user only their own profile');

------------------------------------------------------------------------------------------------
-- TEST-21: create a block without conflicts
------------------------------------------------------------------------------------------------
select ok(tests.call('00000000-0000-4000-8000-00000000ad01',
          $q$select api.admin_create_block('TENNIS', null, '2030-01-09 08:00+07', '2030-01-09 12:00+07', 'MAINTENANCE', 'Resurfacing the court')$q$)
          -> 'block' ->> 'id' is not null, 'TEST-21 block created');
select is((select s ->> 'state' || '/' || coalesce(s ->> 'unavailable_label', '')
           from jsonb_array_elements(tests.call('00000000-0000-4000-8000-000000000201',
                $q$select api.get_availability('TENNIS', '2030-01-09')$q$) -> 'slots') s where s ->> 'start_wib' = '09:00'),
          'UNAVAILABLE/Maintenance', 'TEST-21 users see "Unavailable – Maintenance" without the reason text');
select throws_ok($$select tests.book('00000000-0000-4000-8000-000000000201', 'TENNIS', 'TENNIS', '2030-01-09', '09:00', 30)$$,
                 'P0001', 'SLOT_UNAVAILABLE', 'TEST-21 blocked slot cannot be booked');
select tests.call('00000000-0000-4000-8000-00000000ad01',
  $q$select api.admin_create_block('AIR_HOCKEY', 'AIR_HOCKEY_1', '2030-01-09 08:00+07', '2030-01-09 10:00+07', 'OPERATIONAL', 'Table 1 repair')$q$);
select is((select (s ->> 'available_count')::int from jsonb_array_elements(tests.call('00000000-0000-4000-8000-000000000201',
           $q$select api.get_availability('AIR_HOCKEY', '2030-01-09')$q$) -> 'slots') s where s ->> 'start_wib' = '08:00'),
          1, 'TEST-21 a resource-level block reduces pooled capacity to 1');
select throws_ok($$select tests.call('00000000-0000-4000-8000-00000000ad01',
                   $q$select api.admin_create_block('TENNIS', null, '2030-01-09 05:00+07', '2030-01-09 07:00+07', 'EVENT', 'Early event')$q$)$$,
                 'P0001', 'OUTSIDE_OPERATING_HOURS', 'blocks must lie within operating hours');
select throws_ok($$select tests.call('00000000-0000-4000-8000-00000000ad01',
                   $q$select api.admin_create_block('TENNIS', null, '2030-01-09 08:15+07', '2030-01-09 09:00+07', 'EVENT', 'Odd start')$q$)$$,
                 'P0001', 'SLOT_MISALIGNED', 'blocks must be 30-minute aligned');

------------------------------------------------------------------------------------------------
-- TEST-22: block conflicts with existing bookings
------------------------------------------------------------------------------------------------
select tests.book('00000000-0000-4000-8000-000000000201', 'TENNIS', 'TENNIS', '2030-01-10', '10:00', 30);
select tests.book('00000000-0000-4000-8000-000000000202', 'TENNIS', 'TENNIS', '2030-01-10', '11:00', 60);
create temp table conflict_ids as
select array_agg(id order by id) as ids from app.bookings where booking_date = '2030-01-10' and facility_id = (select id from app.facilities where code = 'TENNIS');

select is(jsonb_array_length(tests.call('00000000-0000-4000-8000-00000000ad01',
          $q$select api.admin_preview_block('TENNIS', null, '2030-01-10 09:00+07', '2030-01-10 12:00+07')$q$) -> 'conflicts'),
          2, 'TEST-22 preview lists both conflicting bookings');
select ok((tests.call('00000000-0000-4000-8000-00000000ad01',
          $q$select api.admin_preview_block('TENNIS', null, '2030-01-10 09:00+07', '2030-01-10 12:00+07')$q$) -> 'conflicts' -> 0 ->> 'owner_email') is not null,
          'TEST-22 preview shows owners to the admin');
select throws_ok($$select tests.call('00000000-0000-4000-8000-00000000ad01',
                   $q$select api.admin_create_block('TENNIS', null, '2030-01-10 09:00+07', '2030-01-10 12:00+07', 'EVENT', 'Company tournament')$q$)$$,
                 'P0001', 'ADMIN_BLOCK_CONFLICT', 'TEST-22 creating without confirmation is refused');
select throws_ok(format($$select tests.call('00000000-0000-4000-8000-00000000ad01',
                   $q$select api.admin_create_block('TENNIS', null, '2030-01-10 09:00+07', '2030-01-10 12:00+07', 'EVENT',
                                                    'Company tournament', true, array[%L]::uuid[])$q$)$$, (select ids[1] from conflict_ids)),
                 'P0001', 'BLOCK_CONFLICTS_CHANGED', 'TEST-22 a stale conflict list is refused');
select is(jsonb_array_length(tests.call('00000000-0000-4000-8000-00000000ad01',
          format($q$select api.admin_create_block('TENNIS', null, '2030-01-10 09:00+07', '2030-01-10 12:00+07', 'EVENT',
                                                  'Company tournament', true, %L::uuid[])$q$, (select ids from conflict_ids)))
          -> 'cancelled_booking_ids'), 2, 'TEST-22 confirmed block cancels both bookings');
select is((select array_agg(distinct status::text || '/' || cancel_source::text) from app.bookings where id = any ((select ids from conflict_ids)::uuid[])),
          array['ADMIN_CANCELLED/BLOCK'], 'TEST-22 bookings are ADMIN_CANCELLED with source BLOCK');
select is((select count(*)::int from app.notifications where type = 'ADMIN_CANCELLED'
           and user_id in ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000202')), 2,
          'TEST-22 both owners are notified');
select is((select count(*)::int from app.audit_logs where action = 'BOOKING_ADMIN_CANCEL'
           and entity_id = any (select unnest(ids)::text from conflict_ids)), 2,
          'TEST-33 one audit row per cancelled booking');
select is((select count(*)::int from app.audit_logs where action = 'BLOCK_CREATE' and reason = 'Company tournament'), 1,
          'TEST-33 one audit row for the block');

------------------------------------------------------------------------------------------------
-- TEST-38: removing a block restores availability but not cancelled bookings
------------------------------------------------------------------------------------------------
create temp table blk as select id from app.facility_blocks where reason = 'Company tournament';
select throws_ok(format($$select tests.call('00000000-0000-4000-8000-00000000ad01', format('select api.admin_remove_block(%%L, %%L)', %L, 'no'))$$,
                        (select id from blk)),
                 'P0001', 'REASON_REQUIRED', 'removing a block requires a reason');
select ok(tests.call('00000000-0000-4000-8000-00000000ad01',
          format('select api.admin_remove_block(%L, %L)', (select id from blk), 'Tournament postponed')) ->> 'removed_at' is not null,
          'TEST-38 block removed (soft)');
select is((select s ->> 'state' from jsonb_array_elements(tests.call('00000000-0000-4000-8000-000000000203',
           $q$select api.get_availability('TENNIS', '2030-01-10')$q$) -> 'slots') s where s ->> 'start_wib' = '10:00'),
          'AVAILABLE', 'TEST-38 slots are available again');
select is((select count(*)::int from app.bookings where id = any ((select ids from conflict_ids)::uuid[]) and status = 'ADMIN_CANCELLED'), 2,
          'TEST-38 cancelled bookings stay cancelled');
select is((select count(*)::int from app.facility_blocks where id = (select id from blk) and removed_by is not null), 1,
          'TEST-38 block history retained with remover');

------------------------------------------------------------------------------------------------
-- TEST-33: admin cancellation requires a reason and is audited
------------------------------------------------------------------------------------------------
select tests.book('00000000-0000-4000-8000-000000000203', 'FOOTBALL', 'FOOTBALL', '2030-01-08', '15:00', 60,
                  '00000000-0000-4000-8000-00000000f001');
create temp table fb as select id from app.bookings where idempotency_key = '00000000-0000-4000-8000-00000000f001';
select throws_ok(format($$select tests.call('00000000-0000-4000-8000-00000000ad02', format('select api.admin_cancel_booking(%%L, %%L)', %L, ''))$$,
                        (select id from fb)), 'P0001', 'REASON_REQUIRED', 'TEST-33 admin cancel without reason refused');
select is(tests.call('00000000-0000-4000-8000-00000000ad02',
          format('select api.admin_cancel_booking(%L, %L)', (select id from fb), 'Field needed for inspection')) ->> 'status',
          'ADMIN_CANCELLED', 'admin cancellation succeeds');
select is((select actor_id::text || '/' || reason from app.audit_logs where action = 'BOOKING_ADMIN_CANCEL'
           and entity_id = (select id from fb)::text),
          '00000000-0000-4000-8000-00000000ad02/Field needed for inspection', 'TEST-33 audit records admin and reason');

------------------------------------------------------------------------------------------------
-- TEST-36: dashboard utilization reproduces the documented example (900 open − 120 blocked = 780; 390 used → 50%)
------------------------------------------------------------------------------------------------
select tests.call('00000000-0000-4000-8000-00000000ad01',
  $q$select api.admin_create_block('TENNIS', null, '2030-01-11 06:00+07', '2030-01-11 08:00+07', 'MAINTENANCE', 'Morning cleaning')$q$);
insert into app.bookings (booking_ref, user_id, facility_id, activity_id, resource_id, booking_date, start_at, end_at, duration_minutes, idempotency_key)
select format('DCU-300111-%s', s.ref), '00000000-0000-4000-8000-000000000203', f.id, a.id, r.id, '2030-01-11',
       ('2030-01-11 ' || s.t || '+07')::timestamptz, ('2030-01-11 ' || s.t || '+07')::timestamptz + make_interval(mins => s.d),
       s.d, gen_random_uuid()
from (values ('AAA2', '08:00', 90), ('AAA3', '09:30', 90), ('AAA4', '11:00', 90), ('AAA5', '12:30', 90), ('AAA6', '14:00', 30)) s(ref, t, d)
cross join app.facilities f join app.activities a on a.facility_id = f.id join app.physical_resources r on r.facility_id = f.id
where f.code = 'TENNIS';
update app.bookings set status = 'CHECKED_IN', checked_in_at = start_at where booking_date = '2030-01-11';
select is((select u from jsonb_array_elements(tests.call('00000000-0000-4000-8000-00000000ad01',
           $q$select api.admin_dashboard_metrics('2030-01-11', '2030-01-11')$q$) -> 'utilization') u
           where u ->> 'facility_code' = 'TENNIS') - 'facility_name' - 'facility_code',
          '{"available_minutes": 780, "used_minutes": 390, "reserved_minutes": 390, "used_pct": 50.0, "reserved_pct": 50.0}'::jsonb,
          'TEST-36 utilization = 390 / (900 − 120) = 50%');
select is(tests.call('00000000-0000-4000-8000-00000000ad01',
          $q$select api.admin_dashboard_metrics('2030-01-10', '2030-01-10')$q$) -> 'bookings' ->> 'admin_cancelled',
          '2', 'TEST-36 dashboard counts admin cancellations');

------------------------------------------------------------------------------------------------
-- TEST-39 / TEST-25: deactivation
------------------------------------------------------------------------------------------------
select tests.book('00000000-0000-4000-8000-000000000201', 'COURT', 'FUTSAL', '2030-01-12', '17:00', 60);
select throws_ok($$select tests.call('00000000-0000-4000-8000-00000000ad01',
                   $q$select api.admin_set_user_active('00000000-0000-4000-8000-00000000ad01', false, 'Testing self')$q$)$$,
                 'P0001', 'SELF_MODIFICATION_NOT_ALLOWED', 'TEST-39 admins cannot deactivate themselves');
select is(jsonb_array_length(tests.call('00000000-0000-4000-8000-00000000ad01',
          $q$select api.admin_set_user_active('00000000-0000-4000-8000-000000000201', false, 'Left the company')$q$)
          -> 'cancelled_booking_ids'), 1, 'TEST-39 future bookings are cancelled on deactivation (BR-28)');
select is((select cancel_source::text from app.bookings where user_id = '00000000-0000-4000-8000-000000000201' and booking_date = '2030-01-12'),
          'DEACTIVATION', 'TEST-39 cancellation source is DEACTIVATION');
select throws_ok($$select tests.call('00000000-0000-4000-8000-000000000201', $q$select api.get_app_config()$q$)$$,
                 'P0001', 'ACCOUNT_DISABLED', 'TEST-25 deactivated user is refused on the next call');
select is(tests.call('00000000-0000-4000-8000-000000000201', $q$select api.get_my_profile()$q$) ->> 'is_active',
          'false', 'TEST-25 profile still readable so the app can show "Account disabled"');
select is(tests.call('00000000-0000-4000-8000-000000000201', $q$select to_jsonb(count(*)) from app.bookings$q$), '0'::jsonb,
          'TEST-25 RLS hides bookings from a deactivated user');
select is(tests.call('00000000-0000-4000-8000-00000000ad01',
          $q$select api.admin_set_user_active('00000000-0000-4000-8000-000000000201', true, 'Rejoined the company')$q$) -> 'user' ->> 'is_active',
          'true', 'TEST-39 reactivation works');
select is((select count(*)::int from app.audit_logs where entity_id = '00000000-0000-4000-8000-000000000201'
           and action in ('USER_DEACTIVATE', 'USER_ACTIVATE')), 2, 'TEST-33 activation changes are audited');

------------------------------------------------------------------------------------------------
-- TEST-40: roles
------------------------------------------------------------------------------------------------
select is(tests.call('00000000-0000-4000-8000-00000000ad01',
          $q$select api.admin_set_user_role('00000000-0000-4000-8000-000000000203', 'ADMIN', 'Facility coordinator')$q$) ->> 'role',
          'ADMIN', 'TEST-40 admin role granted');
select ok(tests.call('00000000-0000-4000-8000-000000000203', $q$select api.admin_list_users()$q$) -> 'items' is not null,
          'TEST-40 the new admin can use admin functions immediately');
select is(tests.call('00000000-0000-4000-8000-00000000ad01',
          $q$select api.admin_set_user_role('00000000-0000-4000-8000-000000000203', 'USER', 'Coordinator role ended')$q$) ->> 'role',
          'USER', 'TEST-40 admin role revoked');
select throws_ok($$select tests.call('00000000-0000-4000-8000-000000000203', $q$select api.admin_list_users()$q$)$$,
                 'P0001', 'FORBIDDEN', 'TEST-40 revocation is effective immediately');
select throws_ok($$select tests.call('00000000-0000-4000-8000-00000000ad01',
                   $q$select api.admin_set_user_role('00000000-0000-4000-8000-00000000ad01', 'USER', 'Step down')$q$)$$,
                 'P0001', 'SELF_MODIFICATION_NOT_ALLOWED', 'TEST-40 admins cannot demote themselves');
select is((select count(*)::int from app.audit_logs where entity_id = '00000000-0000-4000-8000-000000000203'
           and action in ('ROLE_GRANT', 'ROLE_REVOKE')), 2, 'TEST-40 role changes are audited');

------------------------------------------------------------------------------------------------
-- TEST-53: email domain management
------------------------------------------------------------------------------------------------
select throws_ok($$select tests.call('00000000-0000-4000-8000-000000000209', $q$select api.admin_add_email_domain('example.co.id', 'New partner')$q$)$$,
                 'P0001', 'FORBIDDEN', 'TEST-53 users cannot manage domains');
select is(tests.call('00000000-0000-4000-8000-00000000ad01',
          $q$select api.admin_add_email_domain(' Example.CO.id ', 'New partner company')$q$) ->> 'domain',
          'example.co.id', 'TEST-53 domain added (normalised to lower case)');
select is(private.hook_before_user_created('{"user":{"email":"x@example.co.id"}}'), '{}'::jsonb, 'TEST-53 new domain can register immediately');
select throws_ok($$select tests.call('00000000-0000-4000-8000-00000000ad01', $q$select api.admin_add_email_domain('example.co.id', 'Duplicate entry')$q$)$$,
                 'P0001', 'DOMAIN_ALREADY_EXISTS', 'TEST-53 duplicates refused');
select throws_ok($$select tests.call('00000000-0000-4000-8000-00000000ad01', $q$select api.admin_add_email_domain('@bad', 'Bad domain value')$q$)$$,
                 'P0001', 'VALIDATION_ERROR', 'TEST-53 invalid domains refused');
select is(tests.call('00000000-0000-4000-8000-00000000ad01',
          format('select api.admin_rename_email_domain(%L, %L, %L)',
                 (select id from app.allowed_email_domains where domain = 'example.co.id' and removed_at is null),
                 'example2.co.id', 'Company renamed')) ->> 'domain',
          'example2.co.id', 'TEST-53 domain renamed');
select is(private.hook_before_user_created('{"user":{"email":"x@example.co.id"}}') -> 'error' ->> 'message',
          'EMAIL_DOMAIN_NOT_ALLOWED', 'TEST-53 old name no longer accepted');
select ok(tests.call('00000000-0000-4000-8000-00000000ad01',
          format('select api.admin_remove_email_domain(%L, %L)',
                 (select id from app.allowed_email_domains where domain = 'adira.co.id' and removed_at is null), 'Partnership ended'))
          ->> 'removed_at' is not null, 'TEST-53 domain removed');
select is(private.hook_before_user_created('{"user":{"email":"new@adira.co.id"}}') -> 'error' ->> 'message',
          'EMAIL_DOMAIN_NOT_ALLOWED', 'TEST-53 removed domain cannot register');
select is(tests.book('00000000-0000-4000-8000-000000000202', 'TABLE_TENNIS', 'TABLE_TENNIS', '2030-01-09', '07:00', 30) ->> 'status',
          'CONFIRMED', 'TEST-53 existing users of a removed domain keep access (OD-30)');
select throws_ok($$select tests.call('00000000-0000-4000-8000-00000000ad01',
                   $q$select api.admin_set_user_role('00000000-0000-4000-8000-000000000202', 'ADMIN', 'Promote user two')$q$)$$,
                 'P0001', 'EMAIL_DOMAIN_NOT_ALLOWED', 'TEST-53 admin role needs a currently allowed domain (OD-31)');
select tests.call('00000000-0000-4000-8000-00000000ad01',
  format('select api.admin_remove_email_domain(%L, %L)', (select id from app.allowed_email_domains where domain = 'homecredit.co.id' and removed_at is null), 'Testing removal'));
select tests.call('00000000-0000-4000-8000-00000000ad01',
  format('select api.admin_remove_email_domain(%L, %L)', (select id from app.allowed_email_domains where domain = 'example2.co.id' and removed_at is null), 'Testing removal'));
select throws_ok(format($$select tests.call('00000000-0000-4000-8000-00000000ad01', format('select api.admin_remove_email_domain(%%L, %%L)', %L, 'Remove the last'))$$,
                        (select id from app.allowed_email_domains where domain = 'danamon.co.id' and removed_at is null)),
                 'P0001', 'LAST_DOMAIN_PROTECTED', 'TEST-53 the last domain cannot be removed');
select is((select count(*)::int from app.audit_logs where action like 'DOMAIN_%'), 5, 'TEST-33 domain changes are audited');

------------------------------------------------------------------------------------------------
-- TEST-54: settings
------------------------------------------------------------------------------------------------
select tests.book('00000000-0000-4000-8000-000000000209', 'TABLE_TENNIS', 'TABLE_TENNIS', '2030-01-07', '09:30', 30,
                  '00000000-0000-4000-8000-00000000a930');
select throws_ok($$select tests.call('00000000-0000-4000-8000-000000000209', $q$select api.admin_update_setting('user_cancel_cutoff_minutes', '60', 'Policy change')$q$)$$,
                 'P0001', 'FORBIDDEN', 'TEST-54 users cannot change settings');
select throws_ok($$select tests.call('00000000-0000-4000-8000-00000000ad01', $q$select api.admin_update_setting('user_cancel_cutoff_minutes', '241', 'Policy change')$q$)$$,
                 'P0001', 'VALIDATION_ERROR', 'TEST-54 out-of-range value refused');
select throws_ok($$select tests.call('00000000-0000-4000-8000-00000000ad01', $q$select api.admin_update_setting('timezone', '"UTC"', 'Policy change')$q$)$$,
                 'P0001', 'SETTING_READ_ONLY', 'TEST-54 read-only setting refused');
select throws_ok($$select tests.call('00000000-0000-4000-8000-00000000ad01', $q$select api.admin_update_setting('user_cancel_cutoff_minutes', '60', '')$q$)$$,
                 'P0001', 'REASON_REQUIRED', 'TEST-54 reason required');
select is(tests.call('00000000-0000-4000-8000-00000000ad01',
          $q$select api.admin_update_setting('user_cancel_cutoff_minutes', '60', 'Longer notice for cancellations')$q$) -> 'value',
          '60'::jsonb, 'TEST-54 cutoff changed to 60');
select is((select after from app.audit_logs where action = 'SETTING_UPDATE' and entity_id = 'user_cancel_cutoff_minutes'),
          '{"value": 60}'::jsonb, 'TEST-54 audit keeps the new value');
select is((select before from app.audit_logs where action = 'SETTING_UPDATE' and entity_id = 'user_cancel_cutoff_minutes'),
          '{"value": 30}'::jsonb, 'TEST-54 audit keeps the old value');
select tests.set_now('2030-01-07 08:31:00+07');
select throws_ok(format($$select tests.call('00000000-0000-4000-8000-000000000209', format('select api.cancel_my_booking(%%L)', %L))$$,
                        (select id from app.bookings where idempotency_key = '00000000-0000-4000-8000-00000000a930')),
                 'P0001', 'BOOKING_NOT_CANCELLABLE', 'TEST-54 the new 60-minute cutoff applies immediately (09:30 start, 08:31 now)');
select is((select status::text from app.bookings where idempotency_key = '00000000-0000-4000-8000-00000000a930'), 'CONFIRMED',
          'TEST-54 existing bookings are not cancelled by a settings change');
select tests.call('00000000-0000-4000-8000-00000000ad01',
  $q$select api.admin_update_setting('booking_horizon_days', '1', 'Short horizon during renovation')$q$);
select throws_ok($$select tests.book('00000000-0000-4000-8000-000000000209', 'TENNIS', 'TENNIS', '2030-01-09', '09:00', 30)$$,
                 'P0001', 'BOOKING_WINDOW_EXCEEDED', 'TEST-54 a shorter horizon applies immediately');

select * from finish();
rollback;
