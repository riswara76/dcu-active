-- DCU Active — 0007 private helpers and trigger functions
-- Conventions (SOLUTION-ARCHITECTURE §6.1): search_path = '', fully qualified names, errors via raise_business_error.

------------------------------------------------------------------------------------------------
-- Errors and time
------------------------------------------------------------------------------------------------
create function private.raise_business_error(p_code text, p_detail jsonb default '{}'::jsonb)
returns void language plpgsql stable set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = coalesce(p_detail, '{}'::jsonb)::text;
end $$;

-- Server clock. Honours app.test_now ONLY when the database setting app.allow_time_override = 'on'
-- (local/staging test databases). Production never sets it (SOLUTION-ARCHITECTURE §6.6).
create function private.now() returns timestamptz
language sql stable set search_path = '' as $$
  select case
    when coalesce(current_setting('app.allow_time_override', true), '') = 'on'
     and nullif(current_setting('app.test_now', true), '') is not null
    then current_setting('app.test_now', true)::timestamptz
    else pg_catalog.now()
  end
$$;

create function private.today_wib() returns date
language sql stable set search_path = '' as $$
  select (private.now() at time zone 'Asia/Jakarta')::date
$$;

create function private.wib_instant(p_date date, p_time time) returns timestamptz
language sql immutable set search_path = '' as $$
  select (p_date + p_time) at time zone 'Asia/Jakarta'
$$;

create function private.fmt_time_wib(p_ts timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(p_ts at time zone 'Asia/Jakarta', 'HH24:MI')
$$;

create function private.fmt_date_wib(p_ts timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(p_ts at time zone 'Asia/Jakarta', 'YYYY-MM-DD')
$$;

create function private.setting_int(p_key text) returns integer
language plpgsql stable security definer set search_path = '' as $$
declare v integer;
begin
  select (s.value #>> '{}')::integer into v from app.app_settings s where s.key = p_key;
  if v is null then
    raise exception 'missing integer setting %', p_key;
  end if;
  return v;
end $$;

create function private.setting_time(p_key text) returns time
language plpgsql stable security definer set search_path = '' as $$
declare v time;
begin
  select (s.value #>> '{}')::time into v from app.app_settings s where s.key = p_key;
  if v is null then
    raise exception 'missing time setting %', p_key;
  end if;
  return v;
end $$;

------------------------------------------------------------------------------------------------
-- Authorization (always from live database state, ADR-006)
------------------------------------------------------------------------------------------------
create function private.current_user_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_active from app.profiles p where p.id = auth.uid()), false)
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.profiles p where p.id = auth.uid() and p.role = 'ADMIN' and p.is_active)
$$;

create function private.assert_active_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_active boolean;
begin
  if v_uid is null then
    perform private.raise_business_error('NOT_AUTHENTICATED');
  end if;
  select p.is_active into v_active from app.profiles p where p.id = v_uid;
  if not found then
    perform private.raise_business_error('NOT_AUTHENTICATED');
  end if;
  if not v_active then
    perform private.raise_business_error('ACCOUNT_DISABLED');
  end if;
  return v_uid;
end $$;

create function private.assert_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.assert_active_user();
begin
  if not private.is_admin() then
    perform private.raise_business_error('FORBIDDEN');
  end if;
  return v_uid;
end $$;

create function private.email_verified(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select u.email_confirmed_at is not null from auth.users u where u.id = p_uid), false)
$$;

create function private.is_email_domain_allowed(p_email text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_email text := lower(btrim(coalesce(p_email, '')));
begin
  -- exactly one '@' and a non-empty local part; domain must match an active entry exactly (no subdomains)
  if v_email !~ '^[^@\s]+@[^@\s]+$' then
    return false;
  end if;
  return exists (
    select 1 from app.allowed_email_domains d
    where d.removed_at is null and d.domain = split_part(v_email, '@', 2)
  );
end $$;

create function private.reason_or_error(p_reason text) returns text
language plpgsql stable set search_path = '' as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) < 5 then
    perform private.raise_business_error('REASON_REQUIRED', jsonb_build_object('min_length', 5));
  end if;
  if char_length(btrim(p_reason)) > 500 then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('reason', 'max 500 characters')));
  end if;
  return btrim(p_reason);
end $$;

------------------------------------------------------------------------------------------------
-- Shared write helpers
------------------------------------------------------------------------------------------------
create function private.write_audit(
  p_actor uuid, p_actor_role text, p_action text, p_entity_type text, p_entity_id text,
  p_before jsonb default null, p_after jsonb default null, p_reason text default null)
returns void language sql security definer set search_path = '' as $$
  insert into app.audit_logs (actor_id, actor_role, action, entity_type, entity_id, before, after, reason)
  values (p_actor, p_actor_role, p_action, p_entity_type, p_entity_id, p_before, p_after, p_reason)
$$;

create function private.notify_user(p_user uuid, p_type text, p_title text, p_body text, p_booking uuid default null)
returns void language sql security definer set search_path = '' as $$
  insert into app.notifications (user_id, type, title, body, booking_id)
  values (p_user, p_type, p_title, p_body, p_booking)
$$;

create function private.new_booking_ref(p_date date) returns text
language plpgsql volatile set search_path = '' as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';   -- 32 unambiguous characters
  v_bytes bytea := extensions.gen_random_bytes(4);
  v_suffix text := '';
begin
  for i in 0..3 loop
    v_suffix := v_suffix || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return 'DCU-' || to_char(p_date, 'YYMMDD') || '-' || v_suffix;
end $$;

------------------------------------------------------------------------------------------------
-- Booking status: effective (display) status and the transition processor
------------------------------------------------------------------------------------------------
create function private.effective_status(b app.bookings) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_now timestamptz := private.now();
  v_open integer := private.setting_int('checkin_open_before_minutes');
  v_close integer := private.setting_int('checkin_close_after_minutes');
  v_cutoff integer := private.setting_int('user_cancel_cutoff_minutes');
begin
  if b.status = 'CONFIRMED' then
    if v_now > b.start_at + make_interval(mins => v_close) then return 'NO_SHOW'; end if;
    if v_now >= b.start_at - make_interval(mins => v_open) then return 'CHECKIN_OPEN'; end if;
    if v_now > b.start_at - make_interval(mins => v_cutoff) then return 'CANCEL_CLOSED'; end if;
    return 'UPCOMING';
  elsif b.status = 'CHECKED_IN' then
    if v_now >= b.end_at then return 'COMPLETED'; end if;
    return 'IN_PROGRESS';
  end if;
  return b.status::text;
end $$;

-- True when a booking still occupies its resource at server time (overdue no-shows are released, BR-25).
create function private.is_occupying(b app.bookings) returns boolean
language sql stable security definer set search_path = '' as $$
  select b.status in ('CHECKED_IN', 'COMPLETED')
      or (b.status = 'CONFIRMED'
          and private.now() <= b.start_at + make_interval(mins => private.setting_int('checkin_close_after_minutes')))
$$;

-- Applies due transitions: CONFIRMED → NO_SHOW after the check-in deadline; CHECKED_IN → COMPLETED after end.
-- Used by the cron job (no filters) and as an in-transaction sweep (filtered by user or resources).
create function private.apply_status_transitions(
  p_user uuid default null, p_resource_ids smallint[] default null, p_limit integer default 1000)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := private.now();
  v_close integer := private.setting_int('checkin_close_after_minutes');
  v_count integer := 0;
  v_done integer;
  r record;
begin
  for r in
    select b.id, b.user_id, b.booking_ref, b.start_at
    from app.bookings b
    where b.status = 'CONFIRMED'
      and b.start_at + make_interval(mins => v_close) < v_now
      and (p_user is null or b.user_id = p_user)
      and (p_resource_ids is null or b.resource_id = any (p_resource_ids))
    order by b.start_at
    limit p_limit
    for update skip locked
  loop
    update app.bookings set status = 'NO_SHOW', no_show_at = v_now where id = r.id;
    perform private.notify_user(r.user_id, 'NO_SHOW', 'Missed check-in',
      format('Booking %s was marked as a no-show because check-in was not completed by %s WIB.',
             r.booking_ref, private.fmt_time_wib(r.start_at + make_interval(mins => v_close))), r.id);
    perform private.write_audit(null, 'SYSTEM', 'BOOKING_NO_SHOW', 'booking', r.id::text,
      jsonb_build_object('status', 'CONFIRMED'), jsonb_build_object('status', 'NO_SHOW'));
    v_count := v_count + 1;
  end loop;

  with due as (
    select b.id from app.bookings b
    where b.status = 'CHECKED_IN' and b.end_at <= v_now
      and (p_user is null or b.user_id = p_user)
      and (p_resource_ids is null or b.resource_id = any (p_resource_ids))
    limit p_limit
    for update skip locked
  )
  update app.bookings b set status = 'COMPLETED', completed_at = v_now
  from due where b.id = due.id;
  get diagnostics v_done = row_count;

  return v_count + v_done;
end $$;

------------------------------------------------------------------------------------------------
-- JSON view of a booking for API responses (API-RPC-SPECIFICATION §1.3)
------------------------------------------------------------------------------------------------
create function private.booking_view(b app.bookings, p_with_resource boolean default true)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_now timestamptz := private.now();
  v_open integer := private.setting_int('checkin_open_before_minutes');
  v_close integer := private.setting_int('checkin_close_after_minutes');
  v_cutoff integer := private.setting_int('user_cancel_cutoff_minutes');
  f app.facilities; a app.activities; r app.physical_resources;
begin
  select * into f from app.facilities where id = b.facility_id;
  select * into a from app.activities where id = b.activity_id;
  select * into r from app.physical_resources where id = b.resource_id;
  return jsonb_build_object(
    'id', b.id,
    'booking_ref', b.booking_ref,
    'facility', jsonb_build_object('code', f.code, 'name', f.name),
    'activity', jsonb_build_object('code', a.code, 'name', a.name),
    'resource_name', case when p_with_resource then r.name end,
    'date_wib', to_char(b.booking_date, 'YYYY-MM-DD'),
    'start_wib', private.fmt_time_wib(b.start_at),
    'end_wib', private.fmt_time_wib(b.end_at),
    'start_at', b.start_at,
    'end_at', b.end_at,
    'duration_minutes', b.duration_minutes,
    'status', b.status,
    'effective_status', private.effective_status(b),
    'checkin_opens_wib', private.fmt_time_wib(b.start_at - make_interval(mins => v_open)),
    'checkin_closes_wib', private.fmt_time_wib(b.start_at + make_interval(mins => v_close)),
    'cancel_until_wib', private.fmt_time_wib(b.start_at - make_interval(mins => v_cutoff)),
    'can_cancel', b.status = 'CONFIRMED' and v_now <= b.start_at - make_interval(mins => v_cutoff),
    'can_check_in', b.status = 'CONFIRMED'
                    and v_now between b.start_at - make_interval(mins => v_open)
                                  and b.start_at + make_interval(mins => v_close),
    'cancel_source', b.cancel_source,
    'cancellation_reason', b.cancellation_reason,
    'checked_in_at', b.checked_in_at,
    'cancelled_at', b.cancelled_at,
    'created_at', b.created_at
  );
end $$;

------------------------------------------------------------------------------------------------
-- Trigger functions
------------------------------------------------------------------------------------------------
create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end $$;

create function private.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_name text := regexp_replace(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '[[:cntrl:]]', '', 'g');
begin
  if char_length(v_name) < 2 then
    v_name := 'DCU user';
  end if;
  insert into app.profiles (id, email, full_name) values (new.id, lower(new.email), left(v_name, 100));
  return new;
end $$;

-- Guards bookings: WIB date consistency on insert; immutable core fields and allowed status transitions on update.
create function private.guard_booking() returns trigger
language plpgsql set search_path = '' as $$
declare v_transition text;
begin
  if tg_op = 'INSERT' then
    if new.booking_date <> (new.start_at at time zone 'Asia/Jakarta')::date then
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR', detail = '{"reason":"booking_date mismatch"}';
    end if;
    if new.status <> 'CONFIRMED' then
      raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
    end if;
    return new;
  end if;

  if (new.user_id, new.facility_id, new.activity_id, new.resource_id, new.booking_date, new.start_at,
      new.end_at, new.duration_minutes, new.booking_ref, new.idempotency_key, new.created_at)
     is distinct from
     (old.user_id, old.facility_id, old.activity_id, old.resource_id, old.booking_date, old.start_at,
      old.end_at, old.duration_minutes, old.booking_ref, old.idempotency_key, old.created_at) then
    raise exception using errcode = 'P0001', message = 'BOOKING_IMMUTABLE_FIELD';
  end if;

  if new.status <> old.status then
    v_transition := old.status::text || '>' || new.status::text;
    if v_transition <> all (array['CONFIRMED>CHECKED_IN', 'CONFIRMED>CANCELLED', 'CONFIRMED>ADMIN_CANCELLED',
                                  'CONFIRMED>NO_SHOW', 'CHECKED_IN>COMPLETED', 'CHECKED_IN>ADMIN_CANCELLED']) then
      raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION',
        detail = jsonb_build_object('from', old.status, 'to', new.status)::text;
    end if;
  end if;
  return new;
end $$;

------------------------------------------------------------------------------------------------
-- Triggers
------------------------------------------------------------------------------------------------
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.on_auth_user_created();

create trigger profiles_touch before update on app.profiles
  for each row execute function private.touch_updated_at();
create trigger bookings_touch before update on app.bookings
  for each row execute function private.touch_updated_at();
create trigger bookings_guard before insert or update on app.bookings
  for each row execute function private.guard_booking();
