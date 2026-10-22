-- DCU Active — 0015 classes (CR-03): admin-run classes such as Yoga, with sessions, capacity and enrolment.
-- A class is held either at an existing facility (each session blocks that facility, category CLASS)
-- or in a separate room described by free text (no effect on facility booking).
-- Enrolment rules mirror bookings: capacity first come first served, own limit of active enrolments,
-- cancellation cutoff and check-in window from the booking settings, automatic no-show.

------------------------------------------------------------------------------------------------
-- Types, tables, settings
------------------------------------------------------------------------------------------------
create type app.class_session_status as enum ('SCHEDULED', 'CANCELLED');

create table app.classes (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (char_length(btrim(title)) between 2 and 80),
  description    text check (description is null or char_length(description) <= 1000),
  instructor     text check (instructor is null or char_length(btrim(instructor)) between 2 and 80),
  facility_id    smallint references app.facilities (id),      -- null = separate room
  location_text  text check (location_text is null or char_length(btrim(location_text)) between 3 and 120),
  capacity       smallint not null check (capacity between 1 and 200),
  is_active      boolean not null default true,
  created_by     uuid not null references app.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((facility_id is null) = (location_text is not null))
);

create table app.class_sessions (
  id                   uuid primary key default gen_random_uuid(),
  class_id             uuid not null references app.classes (id),
  session_date         date not null,
  start_at             timestamptz not null,
  end_at               timestamptz not null,
  time_range           tstzrange generated always as (tstzrange(start_at, end_at, '[)')) stored,
  capacity             smallint not null check (capacity between 1 and 200),
  status               app.class_session_status not null default 'SCHEDULED',
  block_id             uuid references app.facility_blocks (id),
  cancelled_at         timestamptz,
  cancelled_by         uuid references app.profiles (id),
  cancellation_reason  text,
  created_at           timestamptz not null default now(),
  check (end_at > start_at),
  check (extract(epoch from start_at)::bigint % 1800 = 0 and extract(epoch from end_at)::bigint % 1800 = 0),
  check (session_date = (start_at at time zone 'Asia/Jakarta')::date),
  check ((status = 'SCHEDULED' and cancelled_at is null)
         or (status = 'CANCELLED' and cancelled_at is not null and char_length(btrim(cancellation_reason)) >= 5))
);
create index class_sessions_upcoming on app.class_sessions (start_at) where status = 'SCHEDULED';
create index class_sessions_class    on app.class_sessions (class_id, start_at);
create index class_sessions_block    on app.class_sessions (block_id) where block_id is not null;

create table app.class_enrolments (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references app.class_sessions (id),
  user_id              uuid not null references app.profiles (id),
  status               app.booking_status not null default 'CONFIRMED',
  idempotency_key      uuid not null,
  checked_in_at        timestamptz,
  completed_at         timestamptz,
  no_show_at           timestamptz,
  cancelled_at         timestamptz,
  cancelled_by         uuid references app.profiles (id),
  cancel_source        app.cancel_source,
  cancellation_reason  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, idempotency_key),
  check (status <> 'CHECKED_IN' or checked_in_at is not null),
  check (status <> 'COMPLETED'  or (checked_in_at is not null and completed_at is not null)),
  check (status <> 'NO_SHOW'    or (no_show_at is not null and checked_in_at is null)),
  check (status not in ('CANCELLED', 'ADMIN_CANCELLED') or (cancelled_at is not null and cancel_source is not null)),
  check (status <> 'ADMIN_CANCELLED' or char_length(btrim(cancellation_reason)) >= 5),
  check (status <> 'CANCELLED' or cancel_source = 'USER')
);
-- One place per person per session (cancelled enrolments do not count, so re-joining is possible).
create unique index class_enrolments_one_active on app.class_enrolments (session_id, user_id)
  where status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED');
create index class_enrolments_session on app.class_enrolments (session_id, status);
create index class_enrolments_user    on app.class_enrolments (user_id, status);

insert into app.app_settings (key, value, is_editable, min_value, max_value, description) values
  ('max_active_class_enrolments', '2', true, 1, 10, 'Maximum upcoming class enrolments per user');

-- Class notifications use the same inbox as bookings.
alter table app.notifications drop constraint notifications_type_check;
alter table app.notifications add constraint notifications_type_check
  check (type in ('BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'CHECKED_IN', 'ADMIN_CANCELLED', 'NO_SHOW',
                  'ACCOUNT_DEACTIVATED', 'CLASS_ENROLLED', 'CLASS_CANCELLED', 'CLASS_CHECKED_IN',
                  'CLASS_SESSION_CANCELLED', 'CLASS_NO_SHOW'));

------------------------------------------------------------------------------------------------
-- Triggers: timestamps, enrolment status guard, deactivation
------------------------------------------------------------------------------------------------
create trigger classes_touch before update on app.classes
  for each row execute function private.touch_updated_at();
create trigger class_enrolments_touch before update on app.class_enrolments
  for each row execute function private.touch_updated_at();

create function private.guard_class_enrolment() returns trigger
language plpgsql set search_path = '' as $$
declare v_transition text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'CONFIRMED' then
      raise exception using errcode = 'P0001', message = 'INVALID_STATUS_TRANSITION';
    end if;
    return new;
  end if;
  if (new.session_id, new.user_id, new.idempotency_key, new.created_at)
     is distinct from (old.session_id, old.user_id, old.idempotency_key, old.created_at) then
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

create trigger class_enrolments_guard before insert or update on app.class_enrolments
  for each row execute function private.guard_class_enrolment();

-- Deactivating an account releases its future class places (same rule as bookings, BR-28).
create function private.on_profile_deactivated() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in
    select e.id from app.class_enrolments e join app.class_sessions s on s.id = e.session_id
    where e.user_id = new.id and e.status = 'CONFIRMED' and s.start_at > private.now()
    order by e.id for update of e
  loop
    update app.class_enrolments
       set status = 'ADMIN_CANCELLED', cancelled_at = private.now(), cancelled_by = new.deactivated_by,
           cancel_source = 'DEACTIVATION', cancellation_reason = 'Account deactivated'
     where id = r.id;
    perform private.write_audit(new.deactivated_by, case when new.deactivated_by is null then 'SYSTEM' else 'ADMIN' end,
      'CLASS_ENROLMENT_ADMIN_CANCEL', 'class_enrolment', r.id::text,
      jsonb_build_object('status', 'CONFIRMED'), jsonb_build_object('status', 'ADMIN_CANCELLED', 'source', 'DEACTIVATION'),
      'Account deactivated');
  end loop;
  return new;
end $$;

create trigger profiles_deactivated_classes after update of is_active on app.profiles
  for each row when (old.is_active and not new.is_active)
  execute function private.on_profile_deactivated();

------------------------------------------------------------------------------------------------
-- Helpers: views, counts, status transitions
------------------------------------------------------------------------------------------------
create function private.class_enrolled_count(p_session uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from app.class_enrolments
  where session_id = p_session and status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')
$$;

create function private.class_location(c app.classes) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when c.facility_id is null
    then jsonb_build_object('type', 'ROOM', 'name', c.location_text, 'facility_code', null)
    else (select jsonb_build_object('type', 'FACILITY', 'name', f.name, 'facility_code', f.code)
          from app.facilities f where f.id = c.facility_id)
  end
$$;

create function private.enrolment_effective_status(e app.class_enrolments, s app.class_sessions) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_now timestamptz := private.now();
  v_open integer := private.setting_int('checkin_open_before_minutes');
  v_close integer := private.setting_int('checkin_close_after_minutes');
  v_cutoff integer := private.setting_int('user_cancel_cutoff_minutes');
begin
  if e.status = 'CONFIRMED' then
    if v_now > s.start_at + make_interval(mins => v_close) then return 'NO_SHOW'; end if;
    if v_now >= s.start_at - make_interval(mins => v_open) then return 'CHECKIN_OPEN'; end if;
    if v_now > s.start_at - make_interval(mins => v_cutoff) then return 'CANCEL_CLOSED'; end if;
    return 'UPCOMING';
  elsif e.status = 'CHECKED_IN' then
    if v_now >= s.end_at then return 'COMPLETED'; end if;
    return 'IN_PROGRESS';
  end if;
  return e.status::text;
end $$;

create function private.enrolment_view(e app.class_enrolments) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_now timestamptz := private.now();
  v_open integer := private.setting_int('checkin_open_before_minutes');
  v_close integer := private.setting_int('checkin_close_after_minutes');
  v_cutoff integer := private.setting_int('user_cancel_cutoff_minutes');
  s app.class_sessions; c app.classes;
begin
  select * into s from app.class_sessions where id = e.session_id;
  select * into c from app.classes where id = s.class_id;
  return jsonb_build_object(
    'id', e.id,
    'session_id', s.id,
    'class', jsonb_build_object('id', c.id, 'title', c.title, 'instructor', c.instructor),
    'location', private.class_location(c),
    'date_wib', to_char(s.session_date, 'YYYY-MM-DD'),
    'start_wib', private.fmt_time_wib(s.start_at),
    'end_wib', private.fmt_time_wib(s.end_at),
    'start_at', s.start_at,
    'end_at', s.end_at,
    'duration_minutes', (extract(epoch from s.end_at - s.start_at) / 60)::integer,
    'session_status', s.status,
    'status', e.status,
    'effective_status', private.enrolment_effective_status(e, s),
    'checkin_opens_wib', private.fmt_time_wib(s.start_at - make_interval(mins => v_open)),
    'checkin_closes_wib', private.fmt_time_wib(s.start_at + make_interval(mins => v_close)),
    'cancel_until_wib', private.fmt_time_wib(s.start_at - make_interval(mins => v_cutoff)),
    'can_cancel', e.status = 'CONFIRMED' and v_now <= s.start_at - make_interval(mins => v_cutoff),
    'can_check_in', e.status = 'CONFIRMED'
                    and v_now between s.start_at - make_interval(mins => v_open)
                                  and s.start_at + make_interval(mins => v_close),
    'cancel_source', e.cancel_source,
    'cancellation_reason', e.cancellation_reason,
    'checked_in_at', e.checked_in_at,
    'cancelled_at', e.cancelled_at,
    'created_at', e.created_at);
end $$;

-- Session as seen by a user: counts only, never other participants' identities.
create function private.session_view(s app.class_sessions, p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare c app.classes; e app.class_enrolments; v_enrolled integer := private.class_enrolled_count(s.id);
begin
  select * into c from app.classes where id = s.class_id;
  select * into e from app.class_enrolments
   where session_id = s.id and user_id = p_uid and status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW')
   order by created_at desc limit 1;
  return jsonb_build_object(
    'id', s.id,
    'class', jsonb_build_object('id', c.id, 'title', c.title, 'description', c.description, 'instructor', c.instructor),
    'location', private.class_location(c),
    'date_wib', to_char(s.session_date, 'YYYY-MM-DD'),
    'start_wib', private.fmt_time_wib(s.start_at),
    'end_wib', private.fmt_time_wib(s.end_at),
    'start_at', s.start_at,
    'end_at', s.end_at,
    'duration_minutes', (extract(epoch from s.end_at - s.start_at) / 60)::integer,
    'status', s.status,
    'capacity', s.capacity,
    'enrolled_count', v_enrolled,
    'spots_left', greatest(s.capacity - v_enrolled, 0),
    'my_enrolment', case when e.id is null then null else private.enrolment_view(e) end,
    'can_enrol', s.status = 'SCHEDULED' and s.start_at > private.now() and v_enrolled < s.capacity and e.id is null);
end $$;

-- CONFIRMED → NO_SHOW after the check-in deadline; CHECKED_IN → COMPLETED after the end.
create function private.apply_class_transitions(p_user uuid default null, p_limit integer default 1000)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := private.now();
  v_close integer := private.setting_int('checkin_close_after_minutes');
  v_count integer := 0; v_done integer; r record;
begin
  for r in
    select e.id, e.user_id, c.title, s.start_at
    from app.class_enrolments e
    join app.class_sessions s on s.id = e.session_id
    join app.classes c on c.id = s.class_id
    where e.status = 'CONFIRMED' and s.start_at + make_interval(mins => v_close) < v_now
      and (p_user is null or e.user_id = p_user)
    order by s.start_at
    limit p_limit
    for update of e skip locked
  loop
    update app.class_enrolments set status = 'NO_SHOW', no_show_at = v_now where id = r.id;
    perform private.notify_user(r.user_id, 'CLASS_NO_SHOW', 'Missed class check-in',
      format('Your place in %s on %s at %s WIB was marked as a no-show because check-in was not completed in time.',
             r.title, to_char(r.start_at at time zone 'Asia/Jakarta', 'Dy DD Mon YYYY'), private.fmt_time_wib(r.start_at)));
    perform private.write_audit(null, 'SYSTEM', 'CLASS_ENROLMENT_NO_SHOW', 'class_enrolment', r.id::text,
      jsonb_build_object('status', 'CONFIRMED'), jsonb_build_object('status', 'NO_SHOW'));
    v_count := v_count + 1;
  end loop;

  with due as (
    select e.id from app.class_enrolments e join app.class_sessions s on s.id = e.session_id
    where e.status = 'CHECKED_IN' and s.end_at <= v_now and (p_user is null or e.user_id = p_user)
    limit p_limit
    for update of e skip locked
  )
  update app.class_enrolments e set status = 'COMPLETED', completed_at = v_now from due where e.id = due.id;
  get diagnostics v_done = row_count;
  return v_count + v_done;
end $$;

-- The existing every-minute job now also processes class enrolments (job name unchanged for health checks).
create or replace function private.process_booking_statuses() returns integer
language plpgsql security definer set search_path = '' as $$
begin
  return private.apply_status_transitions(null, null, 1000) + private.apply_class_transitions(null, 1000);
end $$;

------------------------------------------------------------------------------------------------
-- Schedule expansion (admin): one-off or weekly repeat
-- p_schedule: {"start_date":"2026-10-27","start_time":"18:00","duration_minutes":60,
--              "repeat_weekdays":[2,4],"until_date":"2026-12-17"}   (ISO weekdays 1=Mon … 7=Sun)
------------------------------------------------------------------------------------------------
create function private.expand_class_schedule(p_schedule jsonb)
returns table (session_date date, start_at timestamptz, end_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_start_date date; v_until date; v_time time; v_minutes integer; v_days integer[]; v_d date; v_n integer := 0;
begin
  begin
    v_start_date := (p_schedule ->> 'start_date')::date;
    v_time := (p_schedule ->> 'start_time')::time;
    v_minutes := (p_schedule ->> 'duration_minutes')::integer;
    v_until := nullif(p_schedule ->> 'until_date', '')::date;
    select coalesce(array_agg(distinct x::integer order by x::integer), '{}')
      into v_days from jsonb_array_elements_text(coalesce(p_schedule -> 'repeat_weekdays', '[]'::jsonb)) x;
  exception when others then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('schedule', 'invalid format')));
  end;
  if v_start_date is null or v_time is null then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('start', 'date and time required')));
  end if;
  if v_minutes is null or v_minutes not between 30 and 240 or v_minutes % 30 <> 0 then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('duration_minutes', '30-240, in steps of 30')));
  end if;
  if exists (select 1 from unnest(v_days) d where d not between 1 and 7) then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('repeat_weekdays', '1 (Mon) - 7 (Sun)')));
  end if;

  if cardinality(v_days) = 0 then
    session_date := v_start_date;
    start_at := private.wib_instant(v_start_date, v_time);
    end_at := start_at + make_interval(mins => v_minutes);
    perform private.validate_block_window(start_at, end_at);
    if start_at <= private.now() then
      perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('start', 'must be in the future')));
    end if;
    return next;
    return;
  end if;

  if v_until is null or v_until < v_start_date or v_until > v_start_date + 182 then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('until_date', 'on or after the start date, max 26 weeks')));
  end if;
  v_d := v_start_date;
  while v_d <= v_until loop
    if extract(isodow from v_d)::integer = any (v_days) then
      v_n := v_n + 1;
      if v_n > 60 then
        perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('until_date', 'max 60 sessions at once')));
      end if;
      session_date := v_d;
      start_at := private.wib_instant(v_d, v_time);
      end_at := start_at + make_interval(mins => v_minutes);
      perform private.validate_block_window(start_at, end_at);
      if start_at <= private.now() then
        perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('start', 'must be in the future')));
      end if;
      return next;
    end if;
    v_d := v_d + 1;
  end loop;
  if v_n = 0 then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('repeat_weekdays', 'no session falls in this period')));
  end if;
end $$;

-- Facility classes: other scheduled facility classes that overlap the proposed sessions.
create function private.class_facility_clashes(p_facility smallint, p_schedule jsonb, p_exclude_class uuid default null)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('class_title', c.title, 'date_wib', to_char(s.session_date, 'YYYY-MM-DD'),
                                               'start_wib', private.fmt_time_wib(s.start_at), 'end_wib', private.fmt_time_wib(s.end_at))
                            order by s.start_at), '[]'::jsonb)
  from private.expand_class_schedule(p_schedule) x
  join app.class_sessions s on s.status = 'SCHEDULED' and s.time_range && tstzrange(x.start_at, x.end_at, '[)')
  join app.classes c on c.id = s.class_id and c.facility_id = p_facility
  where p_exclude_class is null or c.id <> p_exclude_class
$$;

-- Bookings the proposed facility sessions would cancel.
create function private.class_booking_conflicts(p_facility smallint, p_schedule jsonb)
returns setof app.bookings language sql stable security definer set search_path = '' as $$
  select distinct on (b.id) b.*
  from private.expand_class_schedule(p_schedule) x
  cross join lateral private.block_conflicts(p_facility, null, x.start_at, x.end_at) b
  order by b.id
$$;

-- Creates the sessions of a class (and their facility blocks). Caller has authorized the admin.
create function private.create_class_sessions(
  p_class app.classes, p_schedule jsonb, p_admin uuid, p_confirm boolean, p_expected uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  x record; v_block app.facility_blocks; v_session app.class_sessions; c app.bookings;
  v_conflict_ids uuid[]; v_expected uuid[]; v_conflicts jsonb; v_clashes jsonb;
  v_sessions uuid[] := '{}'::uuid[]; v_cancelled uuid[] := '{}'::uuid[];
begin
  if p_class.facility_id is not null then
    -- Same lock order as create_booking / admin_create_block → serializes with bookings on this facility.
    perform 1 from app.physical_resources r where r.facility_id = p_class.facility_id order by r.allocation_order for update;

    v_clashes := private.class_facility_clashes(p_class.facility_id, p_schedule, p_class.id);
    if jsonb_array_length(v_clashes) > 0 then
      perform private.raise_business_error('CLASS_FACILITY_CONFLICT', jsonb_build_object('clashes', v_clashes));
    end if;

    select coalesce(array_agg(b.id order by b.id), '{}'),
           coalesce(jsonb_agg(private.conflict_view(b) order by b.start_at, b.id), '[]'::jsonb)
      into v_conflict_ids, v_conflicts
    from private.class_booking_conflicts(p_class.facility_id, p_schedule) b;

    if cardinality(v_conflict_ids) > 0 and not coalesce(p_confirm, false) then
      perform private.raise_business_error('ADMIN_BLOCK_CONFLICT', jsonb_build_object('conflicts', v_conflicts));
    end if;
    select coalesce(array_agg(y order by y), '{}') into v_expected from (select distinct unnest(p_expected) y) e;
    if v_expected <> v_conflict_ids then
      perform private.raise_business_error('BLOCK_CONFLICTS_CHANGED', jsonb_build_object('conflicts', v_conflicts));
    end if;
  end if;

  for x in select * from private.expand_class_schedule(p_schedule) order by start_at loop
    v_block := null;
    if p_class.facility_id is not null then
      insert into app.facility_blocks (facility_id, resource_id, start_at, end_at, category, reason, created_by)
      values (p_class.facility_id, null, x.start_at, x.end_at, 'CLASS', left('Class: ' || p_class.title, 500), p_admin)
      returning * into v_block;
      for c in select b.* from private.block_conflicts(p_class.facility_id, null, x.start_at, x.end_at) b
               order by b.id loop
        perform 1 from app.bookings where id = c.id for update;
        perform private.admin_cancel_row(c, p_admin, 'BLOCK', 'Facility used for class: ' || p_class.title, v_block.id);
        v_cancelled := v_cancelled || c.id;
      end loop;
    end if;
    insert into app.class_sessions (class_id, session_date, start_at, end_at, capacity, block_id)
    values (p_class.id, x.session_date, x.start_at, x.end_at, p_class.capacity, v_block.id)
    returning * into v_session;
    v_sessions := v_sessions || v_session.id;
  end loop;

  return jsonb_build_object('session_ids', to_jsonb(v_sessions), 'cancelled_booking_ids', to_jsonb(v_cancelled));
end $$;

-- Cancels one scheduled session: participants notified, facility block released.
create function private.cancel_class_session_row(s app.class_sessions, p_admin uuid, p_reason text)
returns integer language plpgsql security definer set search_path = '' as $$
declare c app.classes; r record; v_n integer := 0;
begin
  select * into c from app.classes where id = s.class_id;
  update app.class_sessions set status = 'CANCELLED', cancelled_at = private.now(), cancelled_by = p_admin,
                                cancellation_reason = p_reason
   where id = s.id;
  for r in select * from app.class_enrolments where session_id = s.id and status in ('CONFIRMED', 'CHECKED_IN')
           order by id for update loop
    update app.class_enrolments
       set status = 'ADMIN_CANCELLED', cancelled_at = private.now(), cancelled_by = p_admin,
           cancel_source = 'ADMIN', cancellation_reason = p_reason
     where id = r.id;
    perform private.notify_user(r.user_id, 'CLASS_SESSION_CANCELLED', 'Class cancelled by DCU',
      format('%s on %s at %s WIB was cancelled by DCU. Reason: %s', c.title,
             to_char(s.session_date, 'Dy DD Mon YYYY'), private.fmt_time_wib(s.start_at), p_reason));
    v_n := v_n + 1;
  end loop;
  if s.block_id is not null then
    update app.facility_blocks set removed_at = private.now(), removed_by = p_admin,
                                   removal_reason = left('Class session cancelled: ' || p_reason, 500)
     where id = s.block_id and removed_at is null;
  end if;
  perform private.write_audit(p_admin, 'ADMIN', 'CLASS_SESSION_CANCEL', 'class_session', s.id::text,
    jsonb_build_object('status', 'SCHEDULED'), jsonb_build_object('status', 'CANCELLED', 'cancelled_enrolments', v_n), p_reason);
  return v_n;
end $$;

------------------------------------------------------------------------------------------------
-- User API
------------------------------------------------------------------------------------------------
create function api.list_class_sessions(p_date_from date default null, p_days integer default 14) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.assert_active_user(); v_from date := coalesce(p_date_from, private.today_wib());
begin
  if p_days is null or p_days not between 1 and 31 then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('days', '1-31')));
  end if;
  return coalesce((
    select jsonb_agg(private.session_view(s, v_uid) order by s.start_at, s.id)
    from app.class_sessions s join app.classes c on c.id = s.class_id
    where s.status = 'SCHEDULED' and c.is_active
      and s.end_at > private.now()
      and s.session_date between v_from and v_from + (p_days - 1)), '[]'::jsonb);
end $$;

create function api.get_class_session(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := private.assert_active_user(); s app.class_sessions;
begin
  select * into s from app.class_sessions where id = p_session_id;
  if not found then perform private.raise_business_error('CLASS_SESSION_NOT_FOUND'); end if;
  return private.session_view(s, v_uid);
end $$;

create function api.enrol_class_session(p_session_id uuid, p_idempotency_key uuid) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare
  v_uid uuid := private.assert_active_user();
  v_close integer := private.setting_int('checkin_close_after_minutes');
  v_limit integer := private.setting_int('max_active_class_enrolments');
  s app.class_sessions; c app.classes; e app.class_enrolments; v_count integer;
begin
  -- Lock order: profile → session (serializes a user's requests and the session's capacity).
  perform 1 from app.profiles where id = v_uid for update;
  if not private.email_verified(v_uid) then perform private.raise_business_error('EMAIL_NOT_VERIFIED'); end if;
  if p_idempotency_key is null then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('idempotency_key', 'required')));
  end if;

  select * into e from app.class_enrolments where user_id = v_uid and idempotency_key = p_idempotency_key;
  if found then return private.enrolment_view(e); end if;           -- retry of the same request

  select * into s from app.class_sessions where id = p_session_id for update;
  if not found then perform private.raise_business_error('CLASS_SESSION_NOT_FOUND'); end if;
  select * into c from app.classes where id = s.class_id;
  if s.status <> 'SCHEDULED' or not c.is_active then perform private.raise_business_error('CLASS_SESSION_CANCELLED'); end if;
  if s.start_at <= private.now() then perform private.raise_business_error('CLASS_SESSION_STARTED'); end if;

  perform private.apply_class_transitions(v_uid, 100);

  if exists (select 1 from app.class_enrolments where session_id = s.id and user_id = v_uid
             and status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED')) then
    perform private.raise_business_error('CLASS_ALREADY_ENROLLED');
  end if;
  if private.class_enrolled_count(s.id) >= s.capacity then
    perform private.raise_business_error('CLASS_FULL', jsonb_build_object('capacity', s.capacity));
  end if;

  select count(*) into v_count from app.class_enrolments x join app.class_sessions y on y.id = x.session_id
  where x.user_id = v_uid
    and ((x.status = 'CHECKED_IN' and y.end_at > private.now())
         or (x.status = 'CONFIRMED' and private.now() <= y.start_at + make_interval(mins => v_close)));
  if v_count >= v_limit then
    perform private.raise_business_error('CLASS_LIMIT_REACHED', jsonb_build_object('limit', v_limit));
  end if;

  if exists (select 1 from app.class_enrolments x join app.class_sessions y on y.id = x.session_id
             where x.user_id = v_uid and x.status in ('CONFIRMED', 'CHECKED_IN') and y.time_range && s.time_range) then
    perform private.raise_business_error('CLASS_TIME_CONFLICT');
  end if;

  insert into app.class_enrolments (session_id, user_id, idempotency_key)
  values (s.id, v_uid, p_idempotency_key) returning * into e;

  perform private.notify_user(v_uid, 'CLASS_ENROLLED', 'You joined a class',
    format('%s on %s, %s–%s WIB. Check in from %s WIB.', c.title, to_char(s.session_date, 'Dy DD Mon YYYY'),
           private.fmt_time_wib(s.start_at), private.fmt_time_wib(s.end_at),
           private.fmt_time_wib(s.start_at - make_interval(mins => private.setting_int('checkin_open_before_minutes')))));
  perform private.write_audit(v_uid, 'USER', 'CLASS_ENROL', 'class_enrolment', e.id::text, null,
    jsonb_build_object('session_id', s.id, 'class', c.title));
  return private.enrolment_view(e);
exception
  when lock_not_available then raise exception using errcode = 'P0001', message = 'SYSTEM_BUSY';
end $$;

create function api.list_my_class_enrolments(p_scope text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := private.assert_active_user();
  v_now timestamptz := private.now();
  v_close integer := private.setting_int('checkin_close_after_minutes');
begin
  if p_scope is null or p_scope not in ('UPCOMING', 'HISTORY') then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('scope', 'UPCOMING or HISTORY')));
  end if;
  return coalesce((
    select jsonb_agg(private.enrolment_view(q.e) order by
             case when p_scope = 'UPCOMING' then q.start_at end asc,
             case when p_scope = 'HISTORY' then q.start_at end desc)
    from (
      select e, s.start_at from app.class_enrolments e join app.class_sessions s on s.id = e.session_id
      where e.user_id = v_uid
        and (((e.status = 'CHECKED_IN' and s.end_at > v_now)
              or (e.status = 'CONFIRMED' and v_now <= s.start_at + make_interval(mins => v_close)))
             = (p_scope = 'UPCOMING'))
      order by s.start_at desc
      limit 50
    ) q), '[]'::jsonb);
end $$;

create function api.cancel_my_enrolment(p_enrolment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare
  v_uid uuid := private.assert_active_user();
  v_cutoff integer := private.setting_int('user_cancel_cutoff_minutes');
  e app.class_enrolments; s app.class_sessions; c app.classes;
begin
  perform 1 from app.profiles where id = v_uid for update;
  select * into e from app.class_enrolments where id = p_enrolment_id and user_id = v_uid for update;
  if not found then perform private.raise_business_error('CLASS_ENROLMENT_NOT_FOUND'); end if;
  select * into s from app.class_sessions where id = e.session_id;
  if e.status <> 'CONFIRMED' or private.now() > s.start_at - make_interval(mins => v_cutoff) then
    perform private.raise_business_error('BOOKING_NOT_CANCELLABLE', jsonb_build_object(
      'cutoff_minutes', v_cutoff, 'cancel_until_wib', private.fmt_time_wib(s.start_at - make_interval(mins => v_cutoff))));
  end if;
  update app.class_enrolments
     set status = 'CANCELLED', cancelled_at = private.now(), cancelled_by = v_uid, cancel_source = 'USER'
   where id = e.id returning * into e;
  select * into c from app.classes where id = s.class_id;
  perform private.notify_user(v_uid, 'CLASS_CANCELLED', 'Class place cancelled',
    format('You left %s on %s, %s WIB. Your place is now free for others.', c.title,
           to_char(s.session_date, 'Dy DD Mon YYYY'), private.fmt_time_wib(s.start_at)));
  perform private.write_audit(v_uid, 'USER', 'CLASS_ENROLMENT_CANCEL', 'class_enrolment', e.id::text,
    jsonb_build_object('status', 'CONFIRMED'), jsonb_build_object('status', 'CANCELLED'));
  return private.enrolment_view(e);
exception
  when lock_not_available then raise exception using errcode = 'P0001', message = 'SYSTEM_BUSY';
end $$;

create function api.check_in_class(p_enrolment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare
  v_uid uuid := private.assert_active_user();
  v_now timestamptz := private.now();
  v_open integer := private.setting_int('checkin_open_before_minutes');
  v_close integer := private.setting_int('checkin_close_after_minutes');
  e app.class_enrolments; s app.class_sessions; c app.classes;
begin
  perform 1 from app.profiles where id = v_uid for update;
  select * into e from app.class_enrolments where id = p_enrolment_id and user_id = v_uid for update;
  if not found then perform private.raise_business_error('CLASS_ENROLMENT_NOT_FOUND'); end if;
  select * into s from app.class_sessions where id = e.session_id;
  if e.status <> 'CONFIRMED' or s.status <> 'SCHEDULED' then
    perform private.raise_business_error('CHECKIN_NOT_ALLOWED', jsonb_build_object('status', e.status));
  end if;
  if v_now < s.start_at - make_interval(mins => v_open) then
    perform private.raise_business_error('CHECKIN_TOO_EARLY',
      jsonb_build_object('opens_wib', private.fmt_time_wib(s.start_at - make_interval(mins => v_open))));
  end if;
  if v_now > s.start_at + make_interval(mins => v_close) then
    perform private.raise_business_error('CHECKIN_WINDOW_CLOSED');
  end if;
  update app.class_enrolments set status = 'CHECKED_IN', checked_in_at = v_now where id = e.id returning * into e;
  select * into c from app.classes where id = s.class_id;
  perform private.notify_user(v_uid, 'CLASS_CHECKED_IN', 'Checked in to class',
    format('You are checked in for %s, %s–%s WIB. Enjoy the class!', c.title,
           private.fmt_time_wib(s.start_at), private.fmt_time_wib(s.end_at)));
  perform private.write_audit(v_uid, 'USER', 'CLASS_CHECKIN', 'class_enrolment', e.id::text,
    jsonb_build_object('status', 'CONFIRMED'), jsonb_build_object('status', 'CHECKED_IN'));
  return private.enrolment_view(e);
exception
  when lock_not_available then raise exception using errcode = 'P0001', message = 'SYSTEM_BUSY';
end $$;

------------------------------------------------------------------------------------------------
-- Admin API
------------------------------------------------------------------------------------------------
create function private.validate_class_fields(p_title text, p_description text, p_instructor text, p_capacity integer)
returns void language plpgsql stable set search_path = '' as $$
declare v_fields jsonb := '{}'::jsonb;
begin
  if p_title is null or char_length(btrim(p_title)) not between 2 and 80 then
    v_fields := v_fields || jsonb_build_object('title', '2-80 characters');
  end if;
  if p_description is not null and char_length(p_description) > 1000 then
    v_fields := v_fields || jsonb_build_object('description', 'max 1000 characters');
  end if;
  if nullif(btrim(p_instructor), '') is not null and char_length(btrim(p_instructor)) not between 2 and 80 then
    v_fields := v_fields || jsonb_build_object('instructor', '2-80 characters');
  end if;
  if p_capacity is null or p_capacity not between 1 and 200 then
    v_fields := v_fields || jsonb_build_object('capacity', '1-200');
  end if;
  if v_fields <> '{}'::jsonb then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', v_fields));
  end if;
end $$;

create function api.admin_preview_class_schedule(p_facility_code text, p_schedule jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare f app.facilities; v_sessions jsonb; v_conflicts jsonb := '[]'::jsonb; v_clashes jsonb := '[]'::jsonb;
begin
  perform private.assert_admin();
  select coalesce(jsonb_agg(jsonb_build_object('date_wib', to_char(x.session_date, 'YYYY-MM-DD'),
                                               'start_wib', private.fmt_time_wib(x.start_at), 'end_wib', private.fmt_time_wib(x.end_at))
                            order by x.start_at), '[]'::jsonb)
    into v_sessions from private.expand_class_schedule(p_schedule) x;
  if nullif(p_facility_code, '') is not null then
    select * into f from app.facilities where code = p_facility_code;
    if not found then perform private.raise_business_error('FACILITY_NOT_FOUND'); end if;
    v_clashes := private.class_facility_clashes(f.id, p_schedule, null);
    select coalesce(jsonb_agg(private.conflict_view(b) order by b.start_at, b.id), '[]'::jsonb)
      into v_conflicts from private.class_booking_conflicts(f.id, p_schedule) b;
  end if;
  return jsonb_build_object(
    'sessions', v_sessions, 'conflicts', v_conflicts, 'class_clashes', v_clashes,
    'summary', format('%s session(s). %s', jsonb_array_length(v_sessions),
                      case when jsonb_array_length(v_clashes) > 0 then 'Another class already uses this facility at some of these times.'
                           when jsonb_array_length(v_conflicts) = 0 then 'No bookings are affected.'
                           else format('%s booking(s) overlap and will be cancelled, with the owners notified.', jsonb_array_length(v_conflicts)) end));
end $$;

create function api.admin_create_class(
  p_title text, p_description text, p_instructor text, p_facility_code text, p_location_text text,
  p_capacity integer, p_schedule jsonb, p_confirm_cancel_conflicts boolean default false,
  p_expected_conflict_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare v_admin uuid := private.assert_admin(); f app.facilities; c app.classes; v_result jsonb;
begin
  perform private.validate_class_fields(p_title, p_description, p_instructor, p_capacity);
  if nullif(p_facility_code, '') is not null then
    select * into f from app.facilities where code = p_facility_code and is_active;
    if not found then perform private.raise_business_error('FACILITY_NOT_FOUND'); end if;
  elsif nullif(btrim(p_location_text), '') is null or char_length(btrim(p_location_text)) not between 3 and 120 then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('location_text', 'required for a separate room, 3-120 characters')));
  end if;

  insert into app.classes (title, description, instructor, facility_id, location_text, capacity, created_by)
  values (btrim(p_title), nullif(btrim(p_description), ''), nullif(btrim(p_instructor), ''), f.id,
          case when f.id is null then btrim(p_location_text) end, p_capacity, v_admin)
  returning * into c;

  v_result := private.create_class_sessions(c, p_schedule, v_admin, p_confirm_cancel_conflicts, p_expected_conflict_ids);
  perform private.write_audit(v_admin, 'ADMIN', 'CLASS_CREATE', 'class', c.id::text, null,
    jsonb_build_object('title', c.title, 'facility', f.code, 'location_text', c.location_text, 'capacity', c.capacity,
                       'schedule', p_schedule, 'sessions', jsonb_array_length(v_result -> 'session_ids'),
                       'cancelled_booking_ids', v_result -> 'cancelled_booking_ids'));
  return jsonb_build_object('class_id', c.id) || v_result;
exception
  when lock_not_available then raise exception using errcode = 'P0001', message = 'SYSTEM_BUSY';
end $$;

create function api.admin_add_class_sessions(
  p_class_id uuid, p_schedule jsonb, p_confirm_cancel_conflicts boolean default false,
  p_expected_conflict_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare v_admin uuid := private.assert_admin(); c app.classes; v_result jsonb;
begin
  select * into c from app.classes where id = p_class_id for update;
  if not found or not c.is_active then perform private.raise_business_error('CLASS_NOT_FOUND'); end if;
  v_result := private.create_class_sessions(c, p_schedule, v_admin, p_confirm_cancel_conflicts, p_expected_conflict_ids);
  perform private.write_audit(v_admin, 'ADMIN', 'CLASS_ADD_SESSIONS', 'class', c.id::text, null,
    jsonb_build_object('schedule', p_schedule, 'sessions', jsonb_array_length(v_result -> 'session_ids'),
                       'cancelled_booking_ids', v_result -> 'cancelled_booking_ids'));
  return jsonb_build_object('class_id', c.id) || v_result;
exception
  when lock_not_available then raise exception using errcode = 'P0001', message = 'SYSTEM_BUSY';
end $$;

create function api.admin_update_class(
  p_class_id uuid, p_title text, p_description text, p_instructor text, p_location_text text, p_capacity integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := private.assert_admin(); c app.classes; v_old jsonb; v_max integer;
begin
  perform private.validate_class_fields(p_title, p_description, p_instructor, p_capacity);
  select * into c from app.classes where id = p_class_id for update;
  if not found then perform private.raise_business_error('CLASS_NOT_FOUND'); end if;
  v_old := jsonb_build_object('title', c.title, 'description', c.description, 'instructor', c.instructor,
                              'location_text', c.location_text, 'capacity', c.capacity);
  if c.facility_id is null and (nullif(btrim(p_location_text), '') is null or char_length(btrim(p_location_text)) not between 3 and 120) then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('location_text', '3-120 characters')));
  end if;

  -- Capacity applies to future scheduled sessions; it may not drop below places already taken.
  perform 1 from app.class_sessions where class_id = c.id and status = 'SCHEDULED' and start_at > private.now()
   order by id for update;
  select coalesce(max(private.class_enrolled_count(s.id)), 0) into v_max
  from app.class_sessions s where s.class_id = c.id and s.status = 'SCHEDULED' and s.start_at > private.now();
  if p_capacity < v_max then
    perform private.raise_business_error('CLASS_CAPACITY_BELOW_ENROLLED', jsonb_build_object('enrolled', v_max));
  end if;

  update app.classes
     set title = btrim(p_title), description = nullif(btrim(p_description), ''), instructor = nullif(btrim(p_instructor), ''),
         location_text = case when facility_id is null then btrim(p_location_text) end, capacity = p_capacity
   where id = c.id returning * into c;
  update app.class_sessions set capacity = p_capacity
   where class_id = c.id and status = 'SCHEDULED' and start_at > private.now();
  if c.facility_id is not null then
    update app.facility_blocks b set reason = left('Class: ' || c.title, 500)
      from app.class_sessions s
     where s.block_id = b.id and s.class_id = c.id and s.status = 'SCHEDULED' and b.removed_at is null;
  end if;
  perform private.write_audit(v_admin, 'ADMIN', 'CLASS_UPDATE', 'class', c.id::text, v_old,
    jsonb_build_object('title', c.title, 'description', c.description, 'instructor', c.instructor,
                       'location_text', c.location_text, 'capacity', c.capacity));
  return jsonb_build_object('class_id', c.id);
end $$;

create function api.admin_cancel_class_session(p_session_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare v_admin uuid := private.assert_admin(); v_reason text := private.reason_or_error(p_reason); s app.class_sessions; v_n integer;
begin
  select * into s from app.class_sessions where id = p_session_id for update;
  if not found then perform private.raise_business_error('CLASS_SESSION_NOT_FOUND'); end if;
  if s.status <> 'SCHEDULED' or s.end_at <= private.now() then
    perform private.raise_business_error('CLASS_SESSION_NOT_CANCELLABLE');
  end if;
  v_n := private.cancel_class_session_row(s, v_admin, v_reason);
  return jsonb_build_object('session_id', s.id, 'cancelled_enrolments', v_n);
exception
  when lock_not_available then raise exception using errcode = 'P0001', message = 'SYSTEM_BUSY';
end $$;

-- Ends a class: all future sessions are cancelled and the class is hidden from users.
create function api.admin_cancel_class(p_class_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare v_admin uuid := private.assert_admin(); v_reason text := private.reason_or_error(p_reason);
        c app.classes; s app.class_sessions; v_sessions integer := 0; v_enrolments integer := 0;
begin
  select * into c from app.classes where id = p_class_id for update;
  if not found or not c.is_active then perform private.raise_business_error('CLASS_NOT_FOUND'); end if;
  for s in select * from app.class_sessions where class_id = c.id and status = 'SCHEDULED' and start_at > private.now()
           order by start_at for update loop
    v_enrolments := v_enrolments + private.cancel_class_session_row(s, v_admin, v_reason);
    v_sessions := v_sessions + 1;
  end loop;
  update app.classes set is_active = false where id = c.id;
  perform private.write_audit(v_admin, 'ADMIN', 'CLASS_CANCEL', 'class', c.id::text,
    jsonb_build_object('is_active', true), jsonb_build_object('is_active', false, 'cancelled_sessions', v_sessions,
                                                               'cancelled_enrolments', v_enrolments), v_reason);
  return jsonb_build_object('class_id', c.id, 'cancelled_sessions', v_sessions, 'cancelled_enrolments', v_enrolments);
exception
  when lock_not_available then raise exception using errcode = 'P0001', message = 'SYSTEM_BUSY';
end $$;

create function api.admin_list_classes(p_include_inactive boolean default false) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  perform private.assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'title', c.title, 'instructor', c.instructor, 'capacity', c.capacity, 'is_active', c.is_active,
      'location', private.class_location(c),
      'upcoming_sessions', (select count(*) from app.class_sessions s where s.class_id = c.id and s.status = 'SCHEDULED' and s.end_at > private.now()),
      'next_session', (select jsonb_build_object('id', s.id, 'date_wib', to_char(s.session_date, 'YYYY-MM-DD'),
                                                 'start_wib', private.fmt_time_wib(s.start_at), 'end_wib', private.fmt_time_wib(s.end_at),
                                                 'enrolled_count', private.class_enrolled_count(s.id), 'capacity', s.capacity)
                       from app.class_sessions s where s.class_id = c.id and s.status = 'SCHEDULED' and s.end_at > private.now()
                       order by s.start_at limit 1),
      'created_at', c.created_at) order by c.is_active desc, c.title)
    from app.classes c where p_include_inactive or c.is_active), '[]'::jsonb);
end $$;

create function api.admin_get_class(p_class_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare c app.classes;
begin
  perform private.assert_admin();
  select * into c from app.classes where id = p_class_id;
  if not found then perform private.raise_business_error('CLASS_NOT_FOUND'); end if;
  return jsonb_build_object(
    'id', c.id, 'title', c.title, 'description', c.description, 'instructor', c.instructor,
    'capacity', c.capacity, 'is_active', c.is_active, 'location', private.class_location(c),
    'location_text', c.location_text, 'created_at', c.created_at,
    'created_by_name', (select p.full_name from app.profiles p where p.id = c.created_by),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'date_wib', to_char(s.session_date, 'YYYY-MM-DD'),
        'start_wib', private.fmt_time_wib(s.start_at), 'end_wib', private.fmt_time_wib(s.end_at),
        'start_at', s.start_at, 'end_at', s.end_at, 'status', s.status, 'capacity', s.capacity,
        'enrolled_count', private.class_enrolled_count(s.id),
        'checked_in_count', (select count(*) from app.class_enrolments e where e.session_id = s.id and e.status in ('CHECKED_IN', 'COMPLETED')),
        'no_show_count', (select count(*) from app.class_enrolments e where e.session_id = s.id and e.status = 'NO_SHOW'),
        'is_past', s.end_at <= private.now(),
        'cancellation_reason', s.cancellation_reason) order by s.start_at)
      from app.class_sessions s where s.class_id = c.id), '[]'::jsonb));
end $$;

create function api.admin_list_session_participants(p_session_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare s app.class_sessions;
begin
  perform private.assert_admin();
  select * into s from app.class_sessions where id = p_session_id;
  if not found then perform private.raise_business_error('CLASS_SESSION_NOT_FOUND'); end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'enrolment_id', e.id, 'user_id', p.id, 'full_name', p.full_name, 'email', p.email,
      'status', e.status, 'effective_status', private.enrolment_effective_status(e, s),
      'joined_at', e.created_at, 'checked_in_at', e.checked_in_at, 'cancelled_at', e.cancelled_at,
      'cancellation_reason', e.cancellation_reason) order by e.created_at)
    from app.class_enrolments e join app.profiles p on p.id = e.user_id
    where e.session_id = s.id), '[]'::jsonb);
end $$;

-- Class usage for the dashboard (sessions that start in the WIB date range).
create function api.admin_class_metrics(p_date_from date, p_date_to date) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_from timestamptz; v_to timestamptz;
begin
  perform private.assert_admin();
  if p_date_from is null or p_date_to is null or p_date_to < p_date_from or p_date_to - p_date_from > 30 then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('range', 'max 31 days')));
  end if;
  v_from := private.wib_instant(p_date_from, time '00:00');
  v_to := private.wib_instant(p_date_to + 1, time '00:00');
  return jsonb_build_object(
    'sessions', (select count(*) from app.class_sessions s where s.status = 'SCHEDULED' and s.start_at >= v_from and s.start_at < v_to),
    'enrolled', (select count(*) from app.class_enrolments e join app.class_sessions s on s.id = e.session_id
                 where s.status = 'SCHEDULED' and s.start_at >= v_from and s.start_at < v_to
                   and e.status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW')),
    'attended', (select count(*) from app.class_enrolments e join app.class_sessions s on s.id = e.session_id
                 where s.start_at >= v_from and s.start_at < v_to and e.status in ('CHECKED_IN', 'COMPLETED')),
    'no_show', (select count(*) from app.class_enrolments e join app.class_sessions s on s.id = e.session_id
                where s.start_at >= v_from and s.start_at < v_to and e.status = 'NO_SHOW'),
    'capacity', (select coalesce(sum(s.capacity), 0) from app.class_sessions s
                 where s.status = 'SCHEDULED' and s.start_at >= v_from and s.start_at < v_to),
    'by_class', coalesce((
      select jsonb_agg(jsonb_build_object('title', q.title, 'sessions', q.sessions, 'capacity', q.capacity,
                                          'enrolled', q.enrolled, 'attended', q.attended) order by q.title)
      from (
        select c.title, count(*) as sessions, sum(s.capacity) as capacity,
               sum((select count(*) from app.class_enrolments e where e.session_id = s.id
                    and e.status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW'))) as enrolled,
               sum((select count(*) from app.class_enrolments e where e.session_id = s.id
                    and e.status in ('CHECKED_IN', 'COMPLETED'))) as attended
        from app.classes c
        join app.class_sessions s on s.class_id = c.id and s.status = 'SCHEDULED' and s.start_at >= v_from and s.start_at < v_to
        group by c.id, c.title
      ) q), '[]'::jsonb));
end $$;

-- Availability: a facility closed for a class shows "Unavailable – Class: <title>" (no participant data).
create or replace function api.get_availability(p_facility_code text, p_date date) returns jsonb
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
                             when 'OPERATIONAL' then 'Operational'
                             when 'CLASS' then (select 'Class: ' || c.title from app.class_sessions cs
                                                join app.classes c on c.id = cs.class_id where cs.block_id = b.id limit 1)
                             else null end
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

-- Blocks owned by a class session are released by cancelling the session, not from the blocks screen.
create or replace function api.admin_remove_block(p_block_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := private.assert_admin(); v_reason text := private.reason_or_error(p_reason); v_block app.facility_blocks;
begin
  select * into v_block from app.facility_blocks where id = p_block_id and removed_at is null for update;
  if not found then perform private.raise_business_error('BLOCK_NOT_FOUND'); end if;
  if exists (select 1 from app.class_sessions s where s.block_id = v_block.id and s.status = 'SCHEDULED') then
    perform private.raise_business_error('CLASS_BLOCK_MANAGED');
  end if;
  update app.facility_blocks set removed_at = private.now(), removed_by = v_admin, removal_reason = v_reason
   where id = p_block_id returning * into v_block;
  perform private.write_audit(v_admin, 'ADMIN', 'BLOCK_REMOVE', 'facility_block', v_block.id::text,
    jsonb_build_object('removed', false), jsonb_build_object('removed', true), v_reason);
  return to_jsonb(v_block) - 'time_range';
end $$;

------------------------------------------------------------------------------------------------
-- Row Level Security and grants
------------------------------------------------------------------------------------------------
revoke all on app.classes, app.class_sessions, app.class_enrolments from public, anon, authenticated;
grant select on app.classes, app.class_sessions, app.class_enrolments to authenticated;
grant all on app.classes, app.class_sessions, app.class_enrolments to service_role;

alter table app.classes          enable row level security;
alter table app.class_sessions   enable row level security;
alter table app.class_enrolments enable row level security;

create policy classes_select on app.classes for select to authenticated
  using ((select private.current_user_active()) and (is_active or (select private.is_admin())));
create policy class_sessions_select on app.class_sessions for select to authenticated
  using ((select private.current_user_active()));
create policy class_enrolments_select on app.class_enrolments for select to authenticated
  using ((user_id = (select auth.uid()) and (select private.current_user_active())) or (select private.is_admin()));

revoke execute on all functions in schema api from public, anon;
revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.class_enrolled_count(uuid), private.class_location(app.classes),
  private.enrolment_effective_status(app.class_enrolments, app.class_sessions),
  private.enrolment_view(app.class_enrolments)
  to authenticated;
grant execute on function
  api.list_class_sessions(date, integer), api.get_class_session(uuid), api.enrol_class_session(uuid, uuid),
  api.list_my_class_enrolments(text), api.cancel_my_enrolment(uuid), api.check_in_class(uuid),
  api.admin_preview_class_schedule(text, jsonb),
  api.admin_create_class(text, text, text, text, text, integer, jsonb, boolean, uuid[]),
  api.admin_add_class_sessions(uuid, jsonb, boolean, uuid[]),
  api.admin_update_class(uuid, text, text, text, text, integer),
  api.admin_cancel_class_session(uuid, text), api.admin_cancel_class(uuid, text),
  api.admin_list_classes(boolean), api.admin_get_class(uuid), api.admin_list_session_participants(uuid),
  api.admin_class_metrics(date, date)
  to authenticated;
-- re-grant the public RPCs revoked by the blanket statement above
grant execute on function api.get_registration_domains(), api.health() to anon, authenticated;
