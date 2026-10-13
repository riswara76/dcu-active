-- DCU Active — 0013 scheduled jobs (SOLUTION-ARCHITECTURE §6.3)

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;

create function private.process_booking_statuses() returns integer
language plpgsql security definer set search_path = '' as $$
begin
  return private.apply_status_transitions(null, null, 1000);
end $$;

create function private.purge_notifications() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n integer; v_m integer;
begin
  delete from app.notifications
   where created_at < pg_catalog.now() - make_interval(days => private.setting_int('notification_retention_days'));
  get diagnostics v_n = row_count;
  delete from app.integrity_check_runs where ran_at < pg_catalog.now() - interval '90 days';
  get diagnostics v_m = row_count;
  return v_n + v_m;
end $$;

-- Daily data-integrity checks (DATABASE-DESIGN §9). Each check records its violation count.
create function private.run_integrity_checks() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_total integer := 0; v_n integer; v_sample jsonb;
begin
  -- overlap (impossible by constraint; defence in depth)
  select count(*), jsonb_agg(jsonb_build_object('a', a.id, 'b', b.id)) filter (where true)
    into v_n, v_sample
  from app.bookings a join app.bookings b
    on a.resource_id = b.resource_id and a.id < b.id and a.time_range && b.time_range
   and a.status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED') and b.status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED');
  insert into app.integrity_check_runs (check_name, violations, sample) values ('overlap', v_n, v_sample);
  v_total := v_total + v_n;

  select count(*) into v_n from app.bookings b
  where (b.start_at at time zone 'Asia/Jakarta')::time < private.setting_time('operating_open')
     or (b.end_at at time zone 'Asia/Jakarta')::time > private.setting_time('operating_close')
     or (b.end_at at time zone 'Asia/Jakarta')::date <> b.booking_date;
  insert into app.integrity_check_runs (check_name, violations) values ('outside_hours', v_n);
  v_total := v_total + v_n;

  select count(*) into v_n from app.bookings b
  where b.status = 'CONFIRMED'
    and b.start_at + make_interval(mins => private.setting_int('checkin_close_after_minutes')) < pg_catalog.now() - interval '5 minutes';
  insert into app.integrity_check_runs (check_name, violations) values ('overdue_confirmed', v_n);
  v_total := v_total + v_n;

  select count(*) into v_n from auth.users u full join app.profiles p on p.id = u.id where u.id is null or p.id is null;
  insert into app.integrity_check_runs (check_name, violations) values ('orphan_profiles', v_n);
  v_total := v_total + v_n;

  select case when count(*) = 0 then 1 else 0 end into v_n from app.profiles where role = 'ADMIN' and is_active;
  insert into app.integrity_check_runs (check_name, violations) values ('no_active_admin', v_n);
  v_total := v_total + v_n;

  select case when count(*) = 0 then 1 else 0 end into v_n from app.allowed_email_domains where removed_at is null;
  insert into app.integrity_check_runs (check_name, violations) values ('no_active_domain', v_n);
  v_total := v_total + v_n;

  return v_total;
end $$;

revoke execute on function private.process_booking_statuses(), private.purge_notifications(), private.run_integrity_checks()
  from public, anon, authenticated;

-- Schedules are in UTC (WIB = UTC+7).
select cron.schedule('booking-status',      '* * * * *',  $$select private.process_booking_statuses()$$);
select cron.schedule('purge-notifications', '0 20 * * *', $$select private.purge_notifications()$$);
select cron.schedule('integrity-check',     '15 20 * * *', $$select private.run_integrity_checks()$$);
