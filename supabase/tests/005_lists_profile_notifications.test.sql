-- Admin list filters/search (TEST-37), notifications (TEST-41), profile (TEST-46), pagination
begin;
\ir _helpers.psql
select * from no_plan();

select tests.set_now('2030-01-07 08:00:00+07');
select tests.create_user('00000000-0000-4000-8000-00000000a501', 't5.admin@danamon.co.id', true, 'Admin Five');
select tests.make_admin('00000000-0000-4000-8000-00000000a501');
select tests.create_user('00000000-0000-4000-8000-000000000501', 't5.rina@danamon.co.id', true, 'Rina Lestari');
select tests.create_user('00000000-0000-4000-8000-000000000502', 't5.budi@adira.co.id', true, 'Budi Santoso');

select tests.book('00000000-0000-4000-8000-000000000501', 'TENNIS', 'TENNIS', '2030-01-08', '07:00', 60);
select tests.book('00000000-0000-4000-8000-000000000501', 'AIR_HOCKEY', 'AIR_HOCKEY', '2030-01-09', '12:00', 30);
select tests.book('00000000-0000-4000-8000-000000000502', 'COURT', 'FUTSAL', '2030-01-08', '18:00', 90);

------------------------------------------------------------------------------------------------
-- TEST-37: admin booking management filters and search
------------------------------------------------------------------------------------------------
select is(jsonb_array_length(tests.call('00000000-0000-4000-8000-00000000a501',
          $q$select api.admin_list_bookings('{"q":"lestari"}')$q$) -> 'items'), 2, 'TEST-37 search by owner name');
select is(jsonb_array_length(tests.call('00000000-0000-4000-8000-00000000a501',
          $q$select api.admin_list_bookings('{"q":"t5.budi@adira"}')$q$) -> 'items'), 1, 'TEST-37 search by email');
select is(jsonb_array_length(tests.call('00000000-0000-4000-8000-00000000a501',
          $q$select api.admin_list_bookings('{"facility_code":"COURT","activity_code":"FUTSAL"}')$q$) -> 'items'), 1,
          'TEST-37 filter by facility and activity');
select is(jsonb_array_length(tests.call('00000000-0000-4000-8000-00000000a501',
          $q$select api.admin_list_bookings('{"date_from":"2030-01-09","date_to":"2030-01-09"}')$q$) -> 'items'), 1,
          'TEST-37 filter by date range');
select is(jsonb_array_length(tests.call('00000000-0000-4000-8000-00000000a501',
          $q$select api.admin_list_bookings('{"status":["CANCELLED"]}')$q$) -> 'items'), 0, 'TEST-37 filter by status');
select is(tests.call('00000000-0000-4000-8000-00000000a501',
          $q$select api.admin_list_bookings('{"q":"budi"}')$q$) -> 'items' -> 0 -> 'owner' ->> 'email',
          't5.budi@adira.co.id', 'TEST-37 admin sees the owner');
select is(tests.call('00000000-0000-4000-8000-00000000a501',
          $q$select api.admin_list_bookings('{"q":"budi"}')$q$) -> 'items' -> 0 ->> 'resource_name',
          'Multipurpose Court 1', 'TEST-37 admin sees the allocated resource');
select is(jsonb_array_length(tests.call('00000000-0000-4000-8000-00000000a501',
          $q$select api.admin_list_bookings('{"q":"100%_"}')$q$) -> 'items'), 0, 'search treats % and _ literally');

-- Pagination
select is(jsonb_array_length(tests.call('00000000-0000-4000-8000-00000000a501',
          $q$select api.admin_list_bookings('{}', 2)$q$) -> 'items'), 2, 'page 1 has 2 items');
select is(tests.call('00000000-0000-4000-8000-00000000a501', $q$select api.admin_list_bookings('{}', 2)$q$) ->> 'next_cursor',
          '2', 'page 1 returns a cursor');
select is(jsonb_array_length(tests.call('00000000-0000-4000-8000-00000000a501',
          $q$select api.admin_list_bookings('{}', 2, '2')$q$) -> 'items'), 1, 'page 2 has the remaining item');
select throws_ok($$select tests.call('00000000-0000-4000-8000-00000000a501', $q$select api.admin_list_bookings('{}', 2, 'abc')$q$)$$,
                 'P0001', 'VALIDATION_ERROR', 'invalid cursor rejected');

------------------------------------------------------------------------------------------------
-- TEST-41: notifications reach the right user only; mark as read
------------------------------------------------------------------------------------------------
select is((tests.call('00000000-0000-4000-8000-000000000501', $q$select api.list_my_notifications()$q$) ->> 'unread_count')::int,
          2, 'TEST-41 Rina has 2 unread confirmations');
select is((tests.call('00000000-0000-4000-8000-000000000502', $q$select api.list_my_notifications()$q$) ->> 'unread_count')::int,
          1, 'TEST-41 Budi has only his own notification');
select is(tests.call('00000000-0000-4000-8000-000000000501', $q$select api.mark_notifications_read()$q$) ->> 'updated',
          '2', 'TEST-41 mark all as read');
select is((tests.call('00000000-0000-4000-8000-000000000501', $q$select api.list_my_notifications()$q$) ->> 'unread_count')::int,
          0, 'TEST-41 unread count is now 0');
select is((tests.call('00000000-0000-4000-8000-000000000502', $q$select api.list_my_notifications()$q$) ->> 'unread_count')::int,
          1, 'TEST-41 other users are unaffected');

------------------------------------------------------------------------------------------------
-- TEST-46: profile
------------------------------------------------------------------------------------------------
select is(tests.call('00000000-0000-4000-8000-000000000501', $q$select api.get_my_profile()$q$) ->> 'email',
          't5.rina@danamon.co.id', 'TEST-46 profile shows own email');
select is(tests.call('00000000-0000-4000-8000-000000000501', $q$select api.update_my_profile('  Rina L. Putri  ')$q$) ->> 'full_name',
          'Rina L. Putri', 'TEST-46 name updated (trimmed)');
select throws_ok($$select tests.call('00000000-0000-4000-8000-000000000501', $q$select api.update_my_profile('R')$q$)$$,
                 'P0001', 'VALIDATION_ERROR', 'TEST-46 too-short name rejected');
select is((select count(*)::int from app.audit_logs where action = 'PROFILE_UPDATE'
           and entity_id = '00000000-0000-4000-8000-000000000501'), 1, 'TEST-46 profile change audited');
select is(jsonb_array_length(tests.call('00000000-0000-4000-8000-000000000501',
          $q$select api.list_my_bookings('UPCOMING')$q$) -> 'items'), 2, 'My bookings lists both upcoming bookings');
select is(tests.call('00000000-0000-4000-8000-000000000501',
          $q$select api.list_my_bookings('UPCOMING')$q$) -> 'items' -> 0 ->> 'start_wib', '07:00', 'upcoming bookings are sorted by start');

select * from finish();
rollback;
