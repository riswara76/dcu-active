-- DCU Active — 0009 user-facing RPCs (API-RPC-SPECIFICATION §4–5)
-- Lock order (SOLUTION-ARCHITECTURE §6.2): profile → physical resources (allocation_order) → bookings.

------------------------------------------------------------------------------------------------
-- Public
------------------------------------------------------------------------------------------------
create function api.get_registration_domains() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('domains', coalesce(jsonb_agg(d.domain order by d.domain), '[]'::jsonb))
  from app.allowed_email_domains d where d.removed_at is null
$$;

create function api.health() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_last timestamptz;
begin
  begin
    select max(d.end_time) into v_last
    from cron.job_run_details d join cron.job j on j.jobid = d.jobid
    where j.jobname = 'booking-status' and d.status = 'succeeded';
  exception when others then
    v_last := null;
  end;
  return jsonb_build_object(
    'ok', true,
    'db_time', pg_catalog.now(),
    'status_job_last_run', v_last,
    'status_job_healthy', v_last is not null and v_last > pg_catalog.now() - interval '5 minutes');
end $$;

------------------------------------------------------------------------------------------------
-- Profile and configuration
------------------------------------------------------------------------------------------------
create function api.get_my_profile() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); p app.profiles;
begin
  if v_uid is null then perform private.raise_business_error('NOT_AUTHENTICATED'); end if;
  select * into p from app.profiles where id = v_uid;
  if not found then perform private.raise_business_error('NOT_AUTHENTICATED'); end if;
  return jsonb_build_object(
    'id', p.id, 'email', p.email, 'full_name', p.full_name, 'role', p.role, 'is_active', p.is_active,
    'email_verified', private.email_verified(p.id), 'created_at', p.created_at);
end $$;

create function api.update_my_profile(p_full_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.assert_active_user(); v_name text; v_old text;
begin
  v_name := btrim(coalesce(p_full_name, ''));
  if char_length(v_name) not between 2 and 100 or v_name ~ '[[:cntrl:]]' then
    perform private.raise_business_error('VALIDATION_ERROR',
      jsonb_build_object('fields', jsonb_build_object('full_name', '2-100 characters, no control characters')));
  end if;
  select full_name into v_old from app.profiles where id = v_uid for update;
  update app.profiles set full_name = v_name where id = v_uid;
  perform private.write_audit(v_uid, 'USER', 'PROFILE_UPDATE', 'profile', v_uid::text,
    jsonb_build_object('full_name', v_old), jsonb_build_object('full_name', v_name));
  return api.get_my_profile();
end $$;

create function api.get_app_config() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_active_user();
  return jsonb_build_object(
    'timezone', 'Asia/Jakarta',
    'now', private.now(),
    'today_wib', to_char(private.today_wib(), 'YYYY-MM-DD'),
    'operating_open', to_char(private.setting_time('operating_open'), 'HH24:MI'),
    'operating_close', to_char(private.setting_time('operating_close'), 'HH24:MI'),
    'slot_minutes', private.setting_int('slot_minutes'),
    'booking_horizon_days', private.setting_int('booking_horizon_days'),
    'max_active_bookings', private.setting_int('max_active_bookings'),
    'max_bookings_per_facility_per_day', private.setting_int('max_bookings_per_facility_per_day'),
    'checkin_open_before_minutes', private.setting_int('checkin_open_before_minutes'),
    'checkin_close_after_minutes', private.setting_int('checkin_close_after_minutes'),
    'user_cancel_cutoff_minutes', private.setting_int('user_cancel_cutoff_minutes'));
end $$;

create function api.list_facilities() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_active_user();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'code', f.code, 'name', f.name, 'description', f.description,
      'allowed_durations', to_jsonb(f.allowed_durations), 'allocation_mode', f.allocation_mode,
      'resource_count', (select count(*) from app.physical_resources r where r.facility_id = f.id and r.is_active),
      'activities', (select coalesce(jsonb_agg(jsonb_build_object('code', a.code, 'name', a.name) order by a.id), '[]'::jsonb)
                     from app.activities a where a.facility_id = f.id and a.is_active)
    ) order by f.display_order)
    from app.facilities f where f.is_active), '[]'::jsonb);
end $$;

------------------------------------------------------------------------------------------------
-- Availability (aggregates only — never exposes who booked; SEC-05)
------------------------------------------------------------------------------------------------
create function api.get_availability(p_facility_code text, p_date date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.assert_active_user();
  v_now timestamptz := private.now();
  v_today date := private.today_wib();
  v_open time := private.setting_time('operating_open');
  v_close time := private.setting_time('operating_close');
  v_close_after integer := private.setting_int('checkin_close_after_minutes');
  v_fac app.facilities;
  v_n integer; v_res smallint[]; v_nres integer;
  v_free boolean[] := '{}'::boolean[]; v_blocked boolean[] := '{}'::boolean[];
  v_slots jsonb := '[]'::jsonb;
  v_s timestamptz; v_e timestamptz;
  v_avail integer; v_nblocked integer; v_mine boolean; v_label text; v_state text; v_durs integer[];
  v_steps integer; v_ok boolean; v_any boolean; d integer;
begin
  select * into v_fac from app.facilities where code = p_facility_code and is_active;
  if not found then perform private.raise_business_error('FACILITY_NOT_FOUND'); end if;
  if p_date is null or p_date < v_today or p_date > v_today + private.setting_int('booking_horizon_days') then
    perform private.raise_business_error('BOOKING_WINDOW_EXCEEDED',
      jsonb_build_object('horizon_days', private.setting_int('booking_horizon_days')));
  end if;

  v_n := (extract(epoch from (v_close - v_open)) / 1800)::integer;
  select coalesce(array_agg(r.id order by r.allocation_order), '{}') into v_res
  from app.physical_resources r where r.facility_id = v_fac.id and r.is_active;
  v_nres := coalesce(array_length(v_res, 1), 0);

  -- Pass 1: per (slot, resource) free/blocked matrix, flattened as [slot * nres + resource].
  for i in 0..v_n - 1 loop
    v_s := private.wib_instant(p_date, v_open + make_interval(mins => i * 30));
    v_e := v_s + interval '30 minutes';
    for j in 1..v_nres loop
      v_blocked[i * v_nres + j] := exists (
        select 1 from app.facility_blocks b
        where b.removed_at is null and b.facility_id = v_fac.id
          and (b.resource_id is null or b.resource_id = v_res[j])
          and b.time_range && tstzrange(v_s, v_e, '[)'));
      v_free[i * v_nres + j] := not v_blocked[i * v_nres + j] and not exists (
        select 1 from app.bookings x
        where x.resource_id = v_res[j] and x.time_range && tstzrange(v_s, v_e, '[)')
          and (x.status in ('CHECKED_IN', 'COMPLETED')
               or (x.status = 'CONFIRMED' and v_now <= x.start_at + make_interval(mins => v_close_after))));
    end loop;
  end loop;

  -- Pass 2: slot states and bookable durations.
  for i in 0..v_n - 1 loop
    v_s := private.wib_instant(p_date, v_open + make_interval(mins => i * 30));
    v_e := v_s + interval '30 minutes';
    v_avail := 0; v_nblocked := 0; v_label := null; v_durs := '{}';
    for j in 1..v_nres loop
      if v_free[i * v_nres + j] then v_avail := v_avail + 1; end if;
      if v_blocked[i * v_nres + j] then v_nblocked := v_nblocked + 1; end if;
    end loop;

    v_mine := exists (
      select 1 from app.bookings x
      where x.user_id = v_uid and x.facility_id = v_fac.id and x.time_range && tstzrange(v_s, v_e, '[)')
        and (x.status in ('CHECKED_IN', 'COMPLETED')
             or (x.status = 'CONFIRMED' and v_now <= x.start_at + make_interval(mins => v_close_after))));

    if v_s <= v_now then
      v_state := 'PAST'; v_avail := 0;
    elsif v_avail > 0 then
      v_state := 'AVAILABLE';
      foreach d in array v_fac.allowed_durations::integer[] loop
        v_steps := d / 30;
        continue when i + v_steps > v_n;
        v_any := false;
        for j in 1..v_nres loop
          v_ok := true;
          for m in 0..v_steps - 1 loop
            if not v_free[(i + m) * v_nres + j] then v_ok := false; exit; end if;
          end loop;
          if v_ok then v_any := true; exit; end if;
        end loop;
        if v_any then v_durs := v_durs || d; end if;
      end loop;
    elsif v_nres > 0 and v_nblocked = v_nres then
      v_state := 'UNAVAILABLE';
      select case b.category when 'MAINTENANCE' then 'Maintenance' when 'EVENT' then 'Event'
                             when 'OPERATIONAL' then 'Operational' else null end
        into v_label
      from app.facility_blocks b
      where b.removed_at is null and b.facility_id = v_fac.id and b.time_range && tstzrange(v_s, v_e, '[)')
      order by (b.resource_id is null) desc, b.start_at
      limit 1;
    else
      v_state := 'BOOKED';
    end if;

    v_slots := v_slots || jsonb_build_object(
      'start_wib', private.fmt_time_wib(v_s), 'end_wib', private.fmt_time_wib(v_e), 'start_at', v_s,
      'state', v_state, 'available_count', v_avail, 'bookable_durations', to_jsonb(v_durs),
      'is_mine', v_mine, 'unavailable_label', v_label);
  end loop;

  return jsonb_build_object('facility_code', v_fac.code, 'date_wib', to_char(p_date, 'YYYY-MM-DD'),
                            'total_resources', v_nres, 'slots', v_slots);
end $$;

------------------------------------------------------------------------------------------------
-- Booking (atomic; TRD §7.2)
------------------------------------------------------------------------------------------------
create function api.create_booking(
  p_facility_code text, p_activity_code text, p_date date, p_start_time text,
  p_duration_minutes integer, p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare
  v_uid uuid;
  v_now timestamptz := private.now();
  v_today date := private.today_wib();
  v_fac app.facilities; v_act app.activities; v_existing app.bookings; v_booking app.bookings;
  v_time time; v_start_min integer; v_open_min integer; v_close_min integer;
  v_start timestamptz; v_end timestamptz; v_range tstzrange;
  v_limit integer; v_count integer;
  v_res smallint[] := '{}'::smallint[]; v_rid smallint; v_chosen smallint; v_ref text; r record;
begin
  -- 1–2: authenticate, active, verified; serialize this user's requests
  v_uid := private.assert_active_user();
  perform 1 from app.profiles where id = v_uid for update;
  if not private.email_verified(v_uid) then perform private.raise_business_error('EMAIL_NOT_VERIFIED'); end if;
  if p_idempotency_key is null then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('idempotency_key', 'required')));
  end if;
  select * into v_existing from app.bookings where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then return private.booking_view(v_existing, true); end if;

  -- 3: facility and activity
  select * into v_fac from app.facilities where code = p_facility_code and is_active;
  if not found then perform private.raise_business_error('FACILITY_NOT_FOUND'); end if;
  select * into v_act from app.activities where code = p_activity_code and facility_id = v_fac.id and is_active;
  if not found then perform private.raise_business_error('ACTIVITY_INVALID'); end if;

  -- 4: booking window (WIB dates)
  if p_date is null or p_date < v_today or p_date > v_today + private.setting_int('booking_horizon_days') then
    perform private.raise_business_error('BOOKING_WINDOW_EXCEEDED',
      jsonb_build_object('horizon_days', private.setting_int('booking_horizon_days')));
  end if;

  -- 5–6: start time format/alignment, duration, operating hours, not started
  if p_start_time is null or p_start_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('start_time', 'HH:MM')));
  end if;
  v_time := p_start_time::time;
  if extract(minute from v_time)::integer not in (0, 30) then
    perform private.raise_business_error('SLOT_MISALIGNED');
  end if;
  if p_duration_minutes is null or not (p_duration_minutes = any (v_fac.allowed_durations::integer[])) then
    perform private.raise_business_error('INVALID_DURATION', jsonb_build_object('allowed', to_jsonb(v_fac.allowed_durations)));
  end if;
  v_start_min := extract(hour from v_time)::integer * 60 + extract(minute from v_time)::integer;
  v_open_min  := extract(epoch from private.setting_time('operating_open'))::integer / 60;
  v_close_min := extract(epoch from private.setting_time('operating_close'))::integer / 60;
  if v_start_min < v_open_min or v_start_min + p_duration_minutes > v_close_min then
    perform private.raise_business_error('OUTSIDE_OPERATING_HOURS');
  end if;
  v_start := private.wib_instant(p_date, v_time);
  v_end := v_start + make_interval(mins => p_duration_minutes);
  v_range := tstzrange(v_start, v_end, '[)');
  if v_start <= v_now then
    perform private.raise_business_error('SLOT_IN_PAST');
  end if;

  -- 7: fair-use limits (after releasing this user's overdue bookings)
  perform private.apply_status_transitions(p_user => v_uid);
  v_limit := private.setting_int('max_active_bookings');
  select count(*) into v_count from app.bookings
  where user_id = v_uid and status in ('CONFIRMED', 'CHECKED_IN') and end_at > v_now;
  if v_count >= v_limit then
    perform private.raise_business_error('BOOKING_LIMIT_REACHED', jsonb_build_object('limit', v_limit));
  end if;
  v_limit := private.setting_int('max_bookings_per_facility_per_day');
  select count(*) into v_count from app.bookings
  where user_id = v_uid and facility_id = v_fac.id and booking_date = p_date
    and status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW');
  if v_count >= v_limit then
    perform private.raise_business_error('FACILITY_DAILY_LIMIT_REACHED', jsonb_build_object('limit', v_limit));
  end if;

  -- 8: lock the facility's resources in allocation order; release overdue no-shows on them
  for r in
    select pr.id from app.physical_resources pr
    where pr.facility_id = v_fac.id and pr.is_active
    order by pr.allocation_order
    for update
  loop
    v_res := v_res || r.id;
  end loop;
  if cardinality(v_res) = 0 then perform private.raise_business_error('SLOT_UNAVAILABLE'); end if;
  perform private.apply_status_transitions(p_resource_ids => v_res);

  -- 9: allocate the first free resource (no active block, no occupying booking)
  foreach v_rid in array v_res loop
    continue when exists (
      select 1 from app.facility_blocks b
      where b.removed_at is null and b.facility_id = v_fac.id
        and (b.resource_id is null or b.resource_id = v_rid) and b.time_range && v_range);
    continue when exists (
      select 1 from app.bookings x
      where x.resource_id = v_rid and x.status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED') and x.time_range && v_range);
    v_chosen := v_rid;
    exit;
  end loop;
  if v_chosen is null then
    perform private.raise_business_error('SLOT_UNAVAILABLE',
      jsonb_build_object('facility_code', v_fac.code, 'date', p_date, 'start_time', p_start_time));
  end if;

  -- 10: create the booking (exclusion constraint is the final backstop)
  loop
    v_ref := private.new_booking_ref(p_date);
    exit when not exists (select 1 from app.bookings where booking_ref = v_ref);
  end loop;
  begin
    insert into app.bookings (booking_ref, user_id, facility_id, activity_id, resource_id, booking_date,
                              start_at, end_at, duration_minutes, idempotency_key)
    values (v_ref, v_uid, v_fac.id, v_act.id, v_chosen, p_date, v_start, v_end, p_duration_minutes, p_idempotency_key)
    returning * into v_booking;
  exception when exclusion_violation then
    perform private.raise_business_error('SLOT_UNAVAILABLE',
      jsonb_build_object('facility_code', v_fac.code, 'date', p_date, 'start_time', p_start_time));
  end;

  perform private.notify_user(v_uid, 'BOOKING_CONFIRMED', 'Booking confirmed',
    format('%s · %s on %s, %s–%s WIB. Check-in opens %s WIB.', v_fac.name, v_act.name, to_char(p_date, 'Dy DD Mon YYYY'),
           private.fmt_time_wib(v_start), private.fmt_time_wib(v_end),
           private.fmt_time_wib(v_start - make_interval(mins => private.setting_int('checkin_open_before_minutes')))),
    v_booking.id);
  perform private.write_audit(v_uid, 'USER', 'BOOKING_CREATE', 'booking', v_booking.id::text, null,
    jsonb_build_object('booking_ref', v_ref, 'facility', v_fac.code, 'activity', v_act.code,
                       'resource_id', v_chosen, 'start_at', v_start, 'duration', p_duration_minutes));

  -- 11: confirmation
  return private.booking_view(v_booking, true);
exception
  when lock_not_available then
    raise exception using errcode = 'P0001', message = 'SYSTEM_BUSY';
end $$;

------------------------------------------------------------------------------------------------
-- My bookings (SECURITY INVOKER: RLS is the authority for "own rows only")
------------------------------------------------------------------------------------------------
create function api.list_my_bookings(p_scope text, p_limit integer default 20, p_cursor text default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_uid uuid := private.assert_active_user();
  v_now timestamptz := private.now();
  v_close integer := private.setting_int('checkin_close_after_minutes');
  v_offset integer; v_items jsonb; v_total integer;
begin
  if p_scope is null or p_scope not in ('UPCOMING', 'HISTORY') then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('scope', 'UPCOMING or HISTORY')));
  end if;
  if p_limit is null or p_limit not between 1 and 50 then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('limit', '1-50')));
  end if;
  if p_cursor is not null and p_cursor !~ '^[0-9]{1,6}$' then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('cursor', 'invalid')));
  end if;
  v_offset := coalesce(p_cursor::integer, 0);

  select jsonb_agg(private.booking_view(p.b, true) order by p.ord), count(*)
    into v_items, v_total
  from (
    select b, row_number() over (
             order by case when p_scope = 'UPCOMING' then b.start_at end asc,
                      case when p_scope = 'HISTORY'  then b.start_at end desc,
                      b.id) as ord
    from app.bookings b
    where b.user_id = v_uid
      and (((b.status = 'CHECKED_IN' and b.end_at > v_now)
            or (b.status = 'CONFIRMED' and v_now <= b.start_at + make_interval(mins => v_close)))
           = (p_scope = 'UPCOMING'))
    order by ord
    offset v_offset limit p_limit + 1
  ) p;

  if coalesce(v_total, 0) > p_limit then
    v_items := v_items - p_limit;                     -- drop the look-ahead row
    return jsonb_build_object('items', v_items, 'next_cursor', (v_offset + p_limit)::text);
  end if;
  return jsonb_build_object('items', coalesce(v_items, '[]'::jsonb), 'next_cursor', null);
end $$;

create function api.get_my_booking(p_booking_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_uid uuid := private.assert_active_user(); b app.bookings;
begin
  select * into b from app.bookings where id = p_booking_id and user_id = v_uid;
  if not found then perform private.raise_business_error('BOOKING_NOT_FOUND'); end if;
  return private.booking_view(b, true);
end $$;

create function api.cancel_my_booking(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare
  v_uid uuid := private.assert_active_user();
  v_cutoff integer := private.setting_int('user_cancel_cutoff_minutes');
  b app.bookings; f app.facilities;
begin
  perform 1 from app.profiles where id = v_uid for update;
  select * into b from app.bookings where id = p_booking_id and user_id = v_uid for update;
  if not found then perform private.raise_business_error('BOOKING_NOT_FOUND'); end if;
  if b.status <> 'CONFIRMED' or private.now() > b.start_at - make_interval(mins => v_cutoff) then
    perform private.raise_business_error('BOOKING_NOT_CANCELLABLE', jsonb_build_object(
      'cutoff_minutes', v_cutoff,
      'cancel_until_wib', private.fmt_time_wib(b.start_at - make_interval(mins => v_cutoff))));
  end if;

  update app.bookings
     set status = 'CANCELLED', cancelled_at = private.now(), cancelled_by = v_uid, cancel_source = 'USER'
   where id = b.id
  returning * into b;

  select * into f from app.facilities where id = b.facility_id;
  perform private.notify_user(v_uid, 'BOOKING_CANCELLED', 'Booking cancelled',
    format('%s on %s, %s–%s WIB was cancelled. The time is now free for others.', f.name,
           to_char(b.booking_date, 'Dy DD Mon YYYY'), private.fmt_time_wib(b.start_at), private.fmt_time_wib(b.end_at)), b.id);
  perform private.write_audit(v_uid, 'USER', 'BOOKING_CANCEL', 'booking', b.id::text,
    jsonb_build_object('status', 'CONFIRMED'), jsonb_build_object('status', 'CANCELLED'));
  return private.booking_view(b, true);
exception
  when lock_not_available then raise exception using errcode = 'P0001', message = 'SYSTEM_BUSY';
end $$;

create function api.check_in(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare
  v_uid uuid := private.assert_active_user();
  v_now timestamptz := private.now();
  v_open integer := private.setting_int('checkin_open_before_minutes');
  v_close integer := private.setting_int('checkin_close_after_minutes');
  b app.bookings; f app.facilities;
begin
  perform 1 from app.profiles where id = v_uid for update;
  select * into b from app.bookings where id = p_booking_id and user_id = v_uid for update;
  if not found then perform private.raise_business_error('BOOKING_NOT_FOUND'); end if;
  if b.status <> 'CONFIRMED' then
    perform private.raise_business_error('CHECKIN_NOT_ALLOWED', jsonb_build_object('status', b.status));
  end if;
  if v_now < b.start_at - make_interval(mins => v_open) then
    perform private.raise_business_error('CHECKIN_TOO_EARLY',
      jsonb_build_object('opens_wib', private.fmt_time_wib(b.start_at - make_interval(mins => v_open))));
  end if;
  if v_now > b.start_at + make_interval(mins => v_close) then
    perform private.raise_business_error('CHECKIN_WINDOW_CLOSED');
  end if;

  update app.bookings set status = 'CHECKED_IN', checked_in_at = v_now where id = b.id returning * into b;

  select * into f from app.facilities where id = b.facility_id;
  perform private.notify_user(v_uid, 'CHECKED_IN', 'Checked in',
    format('You are checked in for %s, %s–%s WIB. Enjoy your game!', f.name,
           private.fmt_time_wib(b.start_at), private.fmt_time_wib(b.end_at)), b.id);
  perform private.write_audit(v_uid, 'USER', 'BOOKING_CHECKIN', 'booking', b.id::text,
    jsonb_build_object('status', 'CONFIRMED'), jsonb_build_object('status', 'CHECKED_IN'));
  return private.booking_view(b, true);
exception
  when lock_not_available then raise exception using errcode = 'P0001', message = 'SYSTEM_BUSY';
end $$;

------------------------------------------------------------------------------------------------
-- Notifications
------------------------------------------------------------------------------------------------
create function api.list_my_notifications(p_limit integer default 20, p_cursor text default null) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_uid uuid := private.assert_active_user(); v_offset integer; v_items jsonb; v_total integer; v_unread integer;
begin
  if p_limit is null or p_limit not between 1 and 50 then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('limit', '1-50')));
  end if;
  if p_cursor is not null and p_cursor !~ '^[0-9]{1,6}$' then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('cursor', 'invalid')));
  end if;
  v_offset := coalesce(p_cursor::integer, 0);
  select jsonb_agg(jsonb_build_object('id', n.id, 'type', n.type, 'title', n.title, 'body', n.body,
                                      'booking_id', n.booking_id, 'created_at', n.created_at, 'read_at', n.read_at)
                   order by n.created_at desc, n.id),
         count(*)
    into v_items, v_total
  from (select * from app.notifications where user_id = v_uid
        order by created_at desc, id offset v_offset limit p_limit + 1) n;
  select count(*) into v_unread from app.notifications where user_id = v_uid and read_at is null;
  if coalesce(v_total, 0) > p_limit then
    return jsonb_build_object('items', v_items - p_limit, 'unread_count', v_unread, 'next_cursor', (v_offset + p_limit)::text);
  end if;
  return jsonb_build_object('items', coalesce(v_items, '[]'::jsonb), 'unread_count', v_unread, 'next_cursor', null);
end $$;

create function api.mark_notifications_read(p_ids uuid[] default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.assert_active_user(); v_n integer;
begin
  update app.notifications set read_at = pg_catalog.now()
   where user_id = v_uid and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_n = row_count;
  return jsonb_build_object('updated', v_n);
end $$;

------------------------------------------------------------------------------------------------
-- Grants (explicit; PUBLIC has none by default privileges)
------------------------------------------------------------------------------------------------
revoke execute on all functions in schema api from public, anon;
grant execute on function api.get_registration_domains(), api.health() to anon, authenticated;
grant execute on function
  api.get_my_profile(), api.update_my_profile(text), api.get_app_config(), api.list_facilities(),
  api.get_availability(text, date),
  api.create_booking(text, text, date, text, integer, uuid),
  api.list_my_bookings(text, integer, text), api.get_my_booking(uuid),
  api.cancel_my_booking(uuid), api.check_in(uuid),
  api.list_my_notifications(integer, text), api.mark_notifications_read(uuid[])
  to authenticated;
