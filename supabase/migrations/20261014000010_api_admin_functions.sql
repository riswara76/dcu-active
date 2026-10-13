-- DCU Active — 0010 administrative RPCs (API-RPC-SPECIFICATION §6)
-- Reads: SECURITY INVOKER + private.assert_admin() + RLS admin policies (two independent checks).
-- Writes: SECURITY DEFINER with explicit authorization, mandatory reason, audit row in the same transaction.

grant execute on function private.wib_instant(date, time), private.setting_time(text) to authenticated;

------------------------------------------------------------------------------------------------
-- Shared helpers
------------------------------------------------------------------------------------------------
create function private.parse_cursor(p_cursor text) returns integer
language plpgsql stable set search_path = '' as $$
begin
  if p_cursor is null then return 0; end if;
  if p_cursor !~ '^[0-9]{1,6}$' then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('cursor', 'invalid')));
  end if;
  return p_cursor::integer;
end $$;

create function private.check_limit(p_limit integer, p_max integer) returns integer
language plpgsql stable set search_path = '' as $$
begin
  if p_limit is null or p_limit not between 1 and p_max then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('limit', '1-' || p_max)));
  end if;
  return p_limit;
end $$;

create function private.like_pattern(p_q text) returns text
language sql immutable set search_path = '' as $$
  select '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

grant execute on function private.parse_cursor(text), private.check_limit(integer, integer), private.like_pattern(text) to authenticated;

-- Validates a block window: 30-min aligned, end after start and in the future, within operating hours, ≤ 92 days.
create function private.validate_block_window(p_start timestamptz, p_end timestamptz) returns void
language plpgsql stable security definer set search_path = '' as $$
declare v_open time := private.setting_time('operating_open'); v_close time := private.setting_time('operating_close');
        v_s time; v_e time;
begin
  if p_start is null or p_end is null or p_end <= p_start then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('end_at', 'must be after start_at')));
  end if;
  if extract(epoch from p_start)::bigint % 1800 <> 0 or extract(epoch from p_end)::bigint % 1800 <> 0 then
    perform private.raise_business_error('SLOT_MISALIGNED');
  end if;
  if p_end <= private.now() then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('end_at', 'must be in the future')));
  end if;
  if p_end - p_start > interval '92 days' then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('end_at', 'max 92 days')));
  end if;
  v_s := (p_start at time zone 'Asia/Jakarta')::time;
  v_e := (p_end at time zone 'Asia/Jakarta')::time;
  if v_s < v_open or v_s >= v_close or v_e <= v_open or v_e > v_close then
    perform private.raise_business_error('OUTSIDE_OPERATING_HOURS');
  end if;
end $$;

-- Bookings that a block over [p_start, p_end) would affect (occupying, not yet finished).
create function private.block_conflicts(p_facility smallint, p_resource smallint, p_start timestamptz, p_end timestamptz)
returns setof app.bookings language sql stable security definer set search_path = '' as $$
  select b.* from app.bookings b
  where b.facility_id = p_facility
    and (p_resource is null or b.resource_id = p_resource)
    and b.time_range && tstzrange(p_start, p_end, '[)')
    and b.end_at > private.now()
    and (b.status = 'CHECKED_IN'
         or (b.status = 'CONFIRMED'
             and private.now() <= b.start_at + make_interval(mins => private.setting_int('checkin_close_after_minutes'))))
  order by b.start_at, b.id
$$;

create function private.conflict_view(b app.bookings) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'booking_id', b.id, 'booking_ref', b.booking_ref,
    'owner_name', p.full_name, 'owner_email', p.email, 'resource_name', r.name,
    'date_wib', to_char(b.booking_date, 'YYYY-MM-DD'),
    'start_wib', private.fmt_time_wib(b.start_at), 'end_wib', private.fmt_time_wib(b.end_at), 'status', b.status)
  from app.profiles p, app.physical_resources r
  where p.id = b.user_id and r.id = b.resource_id
$$;

-- Admin cancellation of one booking row (already locked by the caller).
create function private.admin_cancel_row(
  b app.bookings, p_admin uuid, p_source app.cancel_source, p_reason text, p_block uuid default null)
returns app.bookings language plpgsql security definer set search_path = '' as $$
declare v_old text := b.status::text; f app.facilities;
begin
  update app.bookings
     set status = 'ADMIN_CANCELLED', cancelled_at = private.now(), cancelled_by = p_admin,
         cancel_source = p_source, cancellation_reason = p_reason, block_id = p_block
   where id = b.id
  returning * into b;
  select * into f from app.facilities where id = b.facility_id;
  perform private.notify_user(b.user_id, 'ADMIN_CANCELLED', 'Booking cancelled by DCU',
    format('Your %s booking on %s at %s WIB was cancelled by DCU. Reason: %s', f.name,
           to_char(b.booking_date, 'Dy DD Mon YYYY'), private.fmt_time_wib(b.start_at), p_reason), b.id);
  perform private.write_audit(p_admin, 'ADMIN', 'BOOKING_ADMIN_CANCEL', 'booking', b.id::text,
    jsonb_build_object('status', v_old), jsonb_build_object('status', 'ADMIN_CANCELLED', 'source', p_source, 'block_id', p_block),
    p_reason);
  return b;
end $$;

------------------------------------------------------------------------------------------------
-- Dashboard
------------------------------------------------------------------------------------------------
create function api.admin_dashboard_metrics(p_date_from date, p_date_to date) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_now timestamptz := private.now();
  v_open time := private.setting_time('operating_open');
  v_close time := private.setting_time('operating_close');
  v_close_after integer := private.setting_int('checkin_close_after_minutes');
  v_bookings jsonb; v_util jsonb; v_active_users integer;
begin
  perform private.assert_admin();
  if p_date_from is null or p_date_to is null or p_date_to < p_date_from or p_date_to - p_date_from > 30 then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('range', 'max 31 days')));
  end if;

  select jsonb_build_object(
      'total',           count(*),
      'upcoming',        count(*) filter (where b.status = 'CONFIRMED' and b.start_at > v_now),
      'checked_in',      count(*) filter (where b.status in ('CHECKED_IN', 'COMPLETED')),
      'completed',       count(*) filter (where b.status = 'COMPLETED' or (b.status = 'CHECKED_IN' and b.end_at <= v_now)),
      'cancelled',       count(*) filter (where b.status = 'CANCELLED'),
      'admin_cancelled', count(*) filter (where b.status = 'ADMIN_CANCELLED'),
      'no_show',         count(*) filter (where b.status = 'NO_SHOW'
                                            or (b.status = 'CONFIRMED' and v_now > b.start_at + make_interval(mins => v_close_after))))
    into v_bookings
  from app.bookings b
  where b.booking_date between p_date_from and p_date_to;

  select count(*) into v_active_users from app.profiles where is_active;

  with days as (
    select d::date as day from generate_series(p_date_from::timestamp, p_date_to::timestamp, interval '1 day') d
  ), op as (
    select range_agg(tstzrange(private.wib_instant(day, v_open), private.wib_instant(day, v_close), '[)')) as mr from days
  ), res as (
    select r.id, r.facility_id from app.physical_resources r where r.is_active
  ), blk as (
    select res.id, range_agg(b.time_range) as mr
    from res join app.facility_blocks b
      on b.facility_id = res.facility_id and (b.resource_id is null or b.resource_id = res.id) and b.removed_at is null
    group by res.id
  ), per_res as (
    select res.id, res.facility_id,
      (select coalesce(sum(extract(epoch from (upper(x) - lower(x))) / 60), 0) from unnest((select mr from op)) x) as op_min,
      (select coalesce(sum(extract(epoch from (upper(x) - lower(x))) / 60), 0)
         from unnest(coalesce(blk.mr, '{}'::tstzmultirange) * (select mr from op)) x) as blk_min
    from res left join blk on blk.id = res.id
  ), usage as (
    select b.facility_id,
      coalesce(sum(b.duration_minutes) filter (where b.status in ('CHECKED_IN', 'COMPLETED')), 0) as used_min,
      coalesce(sum(b.duration_minutes) filter (where b.status in ('CHECKED_IN', 'COMPLETED', 'NO_SHOW')
                    or (b.status = 'CONFIRMED' and v_now > b.start_at + make_interval(mins => v_close_after))), 0) as reserved_min
    from app.bookings b
    where b.booking_date between p_date_from and p_date_to
    group by b.facility_id
  )
  select jsonb_agg(jsonb_build_object(
      'facility_code', f.code, 'facility_name', f.name,
      'available_minutes', a.avail, 'used_minutes', coalesce(u.used_min, 0), 'reserved_minutes', coalesce(u.reserved_min, 0),
      'used_pct', case when a.avail > 0 then round(coalesce(u.used_min, 0) * 100.0 / a.avail, 1) else 0 end,
      'reserved_pct', case when a.avail > 0 then round(coalesce(u.reserved_min, 0) * 100.0 / a.avail, 1) else 0 end)
    order by f.display_order)
    into v_util
  from app.facilities f
  join (select facility_id, sum(op_min - blk_min)::integer as avail from per_res group by facility_id) a on a.facility_id = f.id
  left join usage u on u.facility_id = f.id
  where f.is_active;

  return jsonb_build_object(
    'range', jsonb_build_object('from', to_char(p_date_from, 'YYYY-MM-DD'), 'to', to_char(p_date_to, 'YYYY-MM-DD')),
    'bookings', v_bookings, 'active_users', v_active_users, 'utilization', coalesce(v_util, '[]'::jsonb));
end $$;

------------------------------------------------------------------------------------------------
-- Booking management
------------------------------------------------------------------------------------------------
create function api.admin_list_bookings(p_filters jsonb default '{}'::jsonb, p_limit integer default 50, p_cursor text default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_from date := nullif(p_filters ->> 'date_from', '')::date;
  v_to date := nullif(p_filters ->> 'date_to', '')::date;
  v_fac text := nullif(p_filters ->> 'facility_code', '');
  v_act text := nullif(p_filters ->> 'activity_code', '');
  v_res text := nullif(p_filters ->> 'resource_code', '');
  v_q text := nullif(btrim(coalesce(p_filters ->> 'q', '')), '');
  v_status text[];
  v_offset integer := private.parse_cursor(p_cursor);
  v_items jsonb; v_total integer;
begin
  perform private.assert_admin();
  perform private.check_limit(p_limit, 100);
  if v_from is not null and v_to is not null and (v_to < v_from or v_to - v_from > 92) then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('range', 'max 92 days')));
  end if;
  if jsonb_typeof(p_filters -> 'status') = 'array' then
    select array_agg(x) into v_status from jsonb_array_elements_text(p_filters -> 'status') x;
  end if;

  select jsonb_agg(private.booking_view(q.b, true)
                   || jsonb_build_object('owner', jsonb_build_object('id', q.owner_id, 'full_name', q.full_name, 'email', q.email))
                   order by q.ord),
         count(*)
    into v_items, v_total
  from (
    select b, p.id as owner_id, p.full_name, p.email,
           row_number() over (order by b.start_at desc, b.id) as ord
    from app.bookings b
    join app.profiles p on p.id = b.user_id
    join app.facilities f on f.id = b.facility_id
    join app.activities a on a.id = b.activity_id
    join app.physical_resources r on r.id = b.resource_id
    where (v_from is null or b.booking_date >= v_from)
      and (v_to is null or b.booking_date <= v_to)
      and (v_fac is null or f.code = v_fac)
      and (v_act is null or a.code = v_act)
      and (v_res is null or r.code = v_res)
      and (v_status is null or b.status::text = any (v_status))
      and (v_q is null or b.booking_ref ilike private.like_pattern(v_q)
           or p.full_name ilike private.like_pattern(v_q) or p.email ilike private.like_pattern(v_q))
    order by ord
    offset v_offset limit p_limit + 1
  ) q;

  if coalesce(v_total, 0) > p_limit then
    return jsonb_build_object('items', v_items - p_limit, 'next_cursor', (v_offset + p_limit)::text);
  end if;
  return jsonb_build_object('items', coalesce(v_items, '[]'::jsonb), 'next_cursor', null);
end $$;

create function api.admin_get_booking(p_booking_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare b app.bookings; p app.profiles; v_audit jsonb;
begin
  perform private.assert_admin();
  select * into b from app.bookings where id = p_booking_id;
  if not found then perform private.raise_business_error('BOOKING_NOT_FOUND'); end if;
  select * into p from app.profiles where id = b.user_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'occurred_at', l.occurred_at, 'actor_name', coalesce(ap.full_name, 'System'), 'actor_role', l.actor_role,
           'action', l.action, 'reason', l.reason) order by l.occurred_at, l.id), '[]'::jsonb)
    into v_audit
  from app.audit_logs l left join app.profiles ap on ap.id = l.actor_id
  where l.entity_type = 'booking' and l.entity_id = b.id::text;
  return private.booking_view(b, true)
         || jsonb_build_object('owner', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email),
                               'audit', v_audit);
end $$;

create function api.admin_cancel_booking(p_booking_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare v_admin uuid := private.assert_admin(); v_reason text := private.reason_or_error(p_reason); b app.bookings;
begin
  select * into b from app.bookings where id = p_booking_id for update;
  if not found then perform private.raise_business_error('BOOKING_NOT_FOUND'); end if;
  if b.status not in ('CONFIRMED', 'CHECKED_IN') or b.end_at <= private.now() then
    perform private.raise_business_error('BOOKING_NOT_CANCELLABLE', jsonb_build_object('status', b.status));
  end if;
  b := private.admin_cancel_row(b, v_admin, 'ADMIN', v_reason);
  return private.booking_view(b, true);
exception
  when lock_not_available then raise exception using errcode = 'P0001', message = 'SYSTEM_BUSY';
end $$;

------------------------------------------------------------------------------------------------
-- Facility blocks
------------------------------------------------------------------------------------------------
create function private.resolve_block_target(p_facility_code text, p_resource_code text,
                                             out o_facility app.facilities, out o_resource_id smallint)
language plpgsql stable security definer set search_path = '' as $$
begin
  select * into o_facility from app.facilities where code = p_facility_code;
  if not found then perform private.raise_business_error('FACILITY_NOT_FOUND'); end if;
  if nullif(p_resource_code, '') is not null then
    select r.id into o_resource_id from app.physical_resources r where r.code = p_resource_code and r.facility_id = o_facility.id;
    if not found then
      perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('resource_code', 'not part of facility')));
    end if;
  end if;
end $$;

create function api.admin_preview_block(p_facility_code text, p_resource_code text, p_start_at timestamptz, p_end_at timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t record; v_conflicts jsonb; v_users integer;
begin
  perform private.assert_admin();
  select * into t from private.resolve_block_target(p_facility_code, p_resource_code);
  perform private.validate_block_window(p_start_at, p_end_at);
  select coalesce(jsonb_agg(private.conflict_view(c) order by c.start_at, c.id), '[]'::jsonb), count(distinct c.user_id)
    into v_conflicts, v_users
  from private.block_conflicts((t.o_facility).id, t.o_resource_id, p_start_at, p_end_at) c;
  return jsonb_build_object(
    'conflicts', v_conflicts, 'affected_users', v_users,
    'summary', case when jsonb_array_length(v_conflicts) = 0 then 'No bookings are affected.'
                    else format('This block overlaps %s booking(s). They will be cancelled and the owners notified.',
                                jsonb_array_length(v_conflicts)) end);
end $$;

create function api.admin_create_block(
  p_facility_code text, p_resource_code text, p_start_at timestamptz, p_end_at timestamptz,
  p_category text, p_reason text, p_confirm_cancel_conflicts boolean default false,
  p_expected_conflict_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare
  v_admin uuid := private.assert_admin();
  v_reason text := private.reason_or_error(p_reason);
  v_category app.block_category;
  t record; v_block app.facility_blocks; c app.bookings;
  v_conflict_ids uuid[]; v_expected uuid[]; v_conflicts jsonb; v_cancelled uuid[] := '{}'::uuid[];
begin
  select * into t from private.resolve_block_target(p_facility_code, p_resource_code);
  if p_category is null or p_category not in ('MAINTENANCE', 'EVENT', 'OPERATIONAL', 'OTHER') then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('category', 'MAINTENANCE, EVENT, OPERATIONAL or OTHER')));
  end if;
  v_category := p_category::app.block_category;
  perform private.validate_block_window(p_start_at, p_end_at);

  -- Same locks as create_booking → bookings and blocks on these resources serialize.
  perform 1 from app.physical_resources r
  where r.facility_id = (t.o_facility).id and (t.o_resource_id is null or r.id = t.o_resource_id)
  order by r.allocation_order
  for update;

  select coalesce(array_agg(c2.id order by c2.id), '{}'),
         coalesce(jsonb_agg(private.conflict_view(c2) order by c2.start_at, c2.id), '[]'::jsonb)
    into v_conflict_ids, v_conflicts
  from private.block_conflicts((t.o_facility).id, t.o_resource_id, p_start_at, p_end_at) c2;

  if cardinality(v_conflict_ids) > 0 and not coalesce(p_confirm_cancel_conflicts, false) then
    perform private.raise_business_error('ADMIN_BLOCK_CONFLICT', jsonb_build_object('conflicts', v_conflicts));
  end if;
  select coalesce(array_agg(x order by x), '{}') into v_expected from (select distinct unnest(p_expected_conflict_ids) x) e;
  if v_expected <> v_conflict_ids then
    perform private.raise_business_error('BLOCK_CONFLICTS_CHANGED', jsonb_build_object('conflicts', v_conflicts));
  end if;

  insert into app.facility_blocks (facility_id, resource_id, start_at, end_at, category, reason, created_by)
  values ((t.o_facility).id, t.o_resource_id, p_start_at, p_end_at, v_category, v_reason, v_admin)
  returning * into v_block;

  for c in select * from app.bookings where id = any (v_conflict_ids) order by id for update loop
    perform private.admin_cancel_row(c, v_admin, 'BLOCK', 'Facility unavailable: ' || v_reason, v_block.id);
    v_cancelled := v_cancelled || c.id;
  end loop;

  perform private.write_audit(v_admin, 'ADMIN', 'BLOCK_CREATE', 'facility_block', v_block.id::text, null,
    jsonb_build_object('facility', (t.o_facility).code, 'resource_id', t.o_resource_id, 'start_at', p_start_at,
                       'end_at', p_end_at, 'category', v_category, 'cancelled_booking_ids', to_jsonb(v_cancelled)),
    v_reason);

  return jsonb_build_object('block', to_jsonb(v_block) - 'time_range', 'cancelled_booking_ids', to_jsonb(v_cancelled));
exception
  when lock_not_available then raise exception using errcode = 'P0001', message = 'SYSTEM_BUSY';
end $$;

create function api.admin_remove_block(p_block_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := private.assert_admin(); v_reason text := private.reason_or_error(p_reason); v_block app.facility_blocks;
begin
  select * into v_block from app.facility_blocks where id = p_block_id and removed_at is null for update;
  if not found then perform private.raise_business_error('BLOCK_NOT_FOUND'); end if;
  update app.facility_blocks set removed_at = private.now(), removed_by = v_admin, removal_reason = v_reason
   where id = p_block_id returning * into v_block;
  perform private.write_audit(v_admin, 'ADMIN', 'BLOCK_REMOVE', 'facility_block', v_block.id::text,
    jsonb_build_object('removed', false), jsonb_build_object('removed', true), v_reason);
  return to_jsonb(v_block) - 'time_range';
end $$;

create function api.admin_list_blocks(p_filters jsonb default '{}'::jsonb, p_limit integer default 50, p_cursor text default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_from date := nullif(p_filters ->> 'date_from', '')::date;
  v_to date := nullif(p_filters ->> 'date_to', '')::date;
  v_fac text := nullif(p_filters ->> 'facility_code', '');
  v_removed boolean := coalesce((p_filters ->> 'include_removed')::boolean, false);
  v_offset integer := private.parse_cursor(p_cursor);
  v_items jsonb; v_total integer;
begin
  perform private.assert_admin();
  perform private.check_limit(p_limit, 100);
  select jsonb_agg(q.item order by q.ord), count(*) into v_items, v_total
  from (
    select jsonb_build_object(
             'id', b.id, 'facility_code', f.code, 'facility_name', f.name,
             'resource_name', coalesce(r.name, 'Whole facility'),
             'start_at', b.start_at, 'end_at', b.end_at,
             'start_wib', private.fmt_date_wib(b.start_at) || ' ' || private.fmt_time_wib(b.start_at),
             'end_wib', private.fmt_date_wib(b.end_at) || ' ' || private.fmt_time_wib(b.end_at),
             'category', b.category, 'reason', b.reason, 'created_by_name', cp.full_name, 'created_at', b.created_at,
             'removed_at', b.removed_at, 'removed_by_name', rp.full_name, 'removal_reason', b.removal_reason,
             'cancelled_bookings', (select count(*) from app.bookings x where x.block_id = b.id)) as item,
           row_number() over (order by b.start_at desc, b.id) as ord
    from app.facility_blocks b
    join app.facilities f on f.id = b.facility_id
    left join app.physical_resources r on r.id = b.resource_id
    left join app.profiles cp on cp.id = b.created_by
    left join app.profiles rp on rp.id = b.removed_by
    where (v_removed or b.removed_at is null)
      and (v_fac is null or f.code = v_fac)
      and (v_from is null or b.end_at > private.wib_instant(v_from, time '00:00'))
      and (v_to is null or b.start_at < private.wib_instant(v_to + 1, time '00:00'))
    order by ord offset v_offset limit p_limit + 1
  ) q;
  if coalesce(v_total, 0) > p_limit then
    return jsonb_build_object('items', v_items - p_limit, 'next_cursor', (v_offset + p_limit)::text);
  end if;
  return jsonb_build_object('items', coalesce(v_items, '[]'::jsonb), 'next_cursor', null);
end $$;

------------------------------------------------------------------------------------------------
-- Users
------------------------------------------------------------------------------------------------
create function api.admin_list_users(p_q text default null, p_status text default null, p_role text default null,
                                     p_limit integer default 50, p_cursor text default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare v_offset integer := private.parse_cursor(p_cursor); v_items jsonb; v_total integer; v_q text := nullif(btrim(coalesce(p_q, '')), '');
begin
  perform private.assert_admin();
  perform private.check_limit(p_limit, 100);
  if p_status is not null and p_status not in ('ACTIVE', 'INACTIVE') then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('status', 'ACTIVE or INACTIVE')));
  end if;
  if p_role is not null and p_role not in ('USER', 'ADMIN') then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('role', 'USER or ADMIN')));
  end if;
  select jsonb_agg(q.item order by q.ord), count(*) into v_items, v_total
  from (
    select jsonb_build_object(
             'id', p.id, 'full_name', p.full_name, 'email', p.email, 'email_domain', split_part(p.email, '@', 2),
             'role', p.role, 'is_active', p.is_active, 'created_at', p.created_at,
             'upcoming_count', (select count(*) from app.bookings b
                                where b.user_id = p.id and b.status in ('CONFIRMED', 'CHECKED_IN') and b.end_at > private.now())) as item,
           row_number() over (order by p.full_name, p.id) as ord
    from app.profiles p
    where (v_q is null or p.full_name ilike private.like_pattern(v_q) or p.email ilike private.like_pattern(v_q))
      and (p_status is null or p.is_active = (p_status = 'ACTIVE'))
      and (p_role is null or p.role::text = p_role)
    order by ord offset v_offset limit p_limit + 1
  ) q;
  if coalesce(v_total, 0) > p_limit then
    return jsonb_build_object('items', v_items - p_limit, 'next_cursor', (v_offset + p_limit)::text);
  end if;
  return jsonb_build_object('items', coalesce(v_items, '[]'::jsonb), 'next_cursor', null);
end $$;

create function api.admin_get_user(p_user_id uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare p app.profiles; v_stats jsonb; v_recent jsonb;
begin
  perform private.assert_admin();
  select * into p from app.profiles where id = p_user_id;
  if not found then perform private.raise_business_error('USER_NOT_FOUND'); end if;
  select jsonb_build_object(
           'total', count(*),
           'upcoming', count(*) filter (where b.status in ('CONFIRMED', 'CHECKED_IN') and b.end_at > private.now()),
           'no_shows', count(*) filter (where b.status = 'NO_SHOW'),
           'cancelled', count(*) filter (where b.status in ('CANCELLED', 'ADMIN_CANCELLED')))
    into v_stats from app.bookings b where b.user_id = p.id;
  select coalesce(jsonb_agg(private.booking_view(x.b, true) order by x.start_at desc), '[]'::jsonb) into v_recent
  from (select b, b.start_at from app.bookings b where b.user_id = p.id order by b.start_at desc limit 10) x;
  return jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'email', p.email, 'email_domain', split_part(p.email, '@', 2),
    'role', p.role, 'is_active', p.is_active, 'deactivated_at', p.deactivated_at,
    'deactivation_reason', p.deactivation_reason, 'created_at', p.created_at,
    'email_domain_allowed', private.is_email_domain_allowed(p.email),
    'stats', v_stats, 'recent_bookings', v_recent);
end $$;

create function api.admin_set_user_active(p_user_id uuid, p_active boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare
  v_admin uuid := private.assert_admin();
  v_reason text := private.reason_or_error(p_reason);
  p app.profiles; c app.bookings; v_cancelled uuid[] := '{}'::uuid[]; v_admins integer;
begin
  if p_active is null then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('active', 'required')));
  end if;
  if p_user_id = v_admin then perform private.raise_business_error('SELF_MODIFICATION_NOT_ALLOWED'); end if;

  -- Lock all active admins first (deterministic order) so the last-admin check is race-safe.
  perform 1 from app.profiles where role = 'ADMIN' and is_active order by id for update;
  select * into p from app.profiles where id = p_user_id for update;
  if not found then perform private.raise_business_error('USER_NOT_FOUND'); end if;

  if p.is_active = p_active then
    return jsonb_build_object('user', jsonb_build_object('id', p.id, 'is_active', p.is_active), 'cancelled_booking_ids', '[]'::jsonb);
  end if;

  if not p_active then
    if p.role = 'ADMIN' then
      select count(*) into v_admins from app.profiles where role = 'ADMIN' and is_active;
      if v_admins <= 1 then perform private.raise_business_error('LAST_ADMIN_PROTECTED'); end if;
    end if;
    update app.profiles set is_active = false, deactivated_at = private.now(), deactivated_by = v_admin,
                            deactivation_reason = v_reason
     where id = p.id returning * into p;
    -- BR-28 / OD-14: future confirmed bookings are cancelled and released.
    for c in select * from app.bookings
             where user_id = p.id and status = 'CONFIRMED' and start_at > private.now()
             order by id for update loop
      perform private.admin_cancel_row(c, v_admin, 'DEACTIVATION', 'Account deactivated');
      v_cancelled := v_cancelled || c.id;
    end loop;
    perform private.notify_user(p.id, 'ACCOUNT_DEACTIVATED', 'Account deactivated',
      'Your DCU Active account has been deactivated. Please contact DCU if you think this is a mistake.');
    perform private.write_audit(v_admin, 'ADMIN', 'USER_DEACTIVATE', 'profile', p.id::text,
      jsonb_build_object('is_active', true), jsonb_build_object('is_active', false, 'cancelled_booking_ids', to_jsonb(v_cancelled)),
      v_reason);
  else
    update app.profiles set is_active = true, deactivated_at = null, deactivated_by = null, deactivation_reason = null
     where id = p.id returning * into p;
    perform private.write_audit(v_admin, 'ADMIN', 'USER_ACTIVATE', 'profile', p.id::text,
      jsonb_build_object('is_active', false), jsonb_build_object('is_active', true), v_reason);
  end if;

  return jsonb_build_object('user', jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email,
                                                       'role', p.role, 'is_active', p.is_active),
                            'cancelled_booking_ids', to_jsonb(v_cancelled));
exception
  when lock_not_available then raise exception using errcode = 'P0001', message = 'SYSTEM_BUSY';
end $$;

create function api.admin_set_user_role(p_user_id uuid, p_role text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare v_admin uuid := private.assert_admin(); v_reason text := private.reason_or_error(p_reason); p app.profiles; v_admins integer;
begin
  if p_role is null or p_role not in ('USER', 'ADMIN') then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('role', 'USER or ADMIN')));
  end if;
  if p_user_id = v_admin then perform private.raise_business_error('SELF_MODIFICATION_NOT_ALLOWED'); end if;

  perform 1 from app.profiles where role = 'ADMIN' and is_active order by id for update;
  select * into p from app.profiles where id = p_user_id for update;
  if not found then perform private.raise_business_error('USER_NOT_FOUND'); end if;
  if p.role::text = p_role then
    return jsonb_build_object('id', p.id, 'role', p.role);
  end if;

  if p_role = 'ADMIN' then
    if not p.is_active or not private.email_verified(p.id) then
      perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('reason', 'target must be active and verified'));
    end if;
    if not private.is_email_domain_allowed(p.email) then
      perform private.raise_business_error('EMAIL_DOMAIN_NOT_ALLOWED');
    end if;
  else
    select count(*) into v_admins from app.profiles where role = 'ADMIN' and is_active;
    if p.is_active and v_admins <= 1 then perform private.raise_business_error('LAST_ADMIN_PROTECTED'); end if;
  end if;

  update app.profiles set role = p_role::app.app_role where id = p.id returning * into p;
  perform private.write_audit(v_admin, 'ADMIN', case when p_role = 'ADMIN' then 'ROLE_GRANT' else 'ROLE_REVOKE' end,
    'profile', p.id::text, jsonb_build_object('role', case when p_role = 'ADMIN' then 'USER' else 'ADMIN' end),
    jsonb_build_object('role', p_role), v_reason);
  return jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'role', p.role, 'is_active', p.is_active);
exception
  when lock_not_available then raise exception using errcode = 'P0001', message = 'SYSTEM_BUSY';
end $$;

------------------------------------------------------------------------------------------------
-- Settings
------------------------------------------------------------------------------------------------
create function api.admin_get_settings() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  perform private.assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'key', s.key, 'value', s.value, 'is_editable', s.is_editable, 'min_value', s.min_value,
             'max_value', s.max_value, 'description', s.description, 'updated_at', s.updated_at,
             'updated_by_name', p.full_name) order by s.is_editable desc, s.key)
    from app.app_settings s left join app.profiles p on p.id = s.updated_by), '[]'::jsonb);
end $$;

create function api.admin_update_setting(p_key text, p_value jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := private.assert_admin(); v_reason text := private.reason_or_error(p_reason); s app.app_settings; v_old jsonb;
begin
  select * into s from app.app_settings where key = p_key for update;
  if not found then
    perform private.raise_business_error('VALIDATION_ERROR', jsonb_build_object('fields', jsonb_build_object('key', 'unknown setting')));
  end if;
  if not s.is_editable then perform private.raise_business_error('SETTING_READ_ONLY'); end if;
  if p_value is null or jsonb_typeof(p_value) <> 'number' or (p_value #>> '{}') !~ '^[0-9]+$'
     or (p_value #>> '{}')::numeric not between s.min_value and s.max_value then
    perform private.raise_business_error('VALIDATION_ERROR',
      jsonb_build_object('fields', jsonb_build_object('value', format('integer %s-%s', s.min_value, s.max_value))));
  end if;
  v_old := s.value;
  update app.app_settings set value = p_value, updated_at = pg_catalog.now(), updated_by = v_admin
   where key = p_key returning * into s;
  perform private.write_audit(v_admin, 'ADMIN', 'SETTING_UPDATE', 'setting', p_key,
    jsonb_build_object('value', v_old), jsonb_build_object('value', p_value), v_reason);
  return jsonb_build_object('key', s.key, 'value', s.value, 'updated_at', s.updated_at);
end $$;

------------------------------------------------------------------------------------------------
-- Allowed email domains
------------------------------------------------------------------------------------------------
create function private.normalize_domain(p_domain text) returns text
language plpgsql stable set search_path = '' as $$
declare v text := lower(btrim(coalesce(p_domain, '')));
begin
  if v !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' then
    perform private.raise_business_error('VALIDATION_ERROR',
      jsonb_build_object('fields', jsonb_build_object('domain', 'a domain such as example.co.id, without @')));
  end if;
  return v;
end $$;

create function api.admin_list_email_domains(p_include_removed boolean default false) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  perform private.assert_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'domain', d.domain, 'added_at', d.added_at, 'added_by_name', coalesce(ap.full_name, 'Initial setup'),
             'removed_at', d.removed_at, 'removed_by_name', rp.full_name, 'removal_reason', d.removal_reason,
             'user_count', (select count(*) from app.profiles p where split_part(p.email, '@', 2) = d.domain))
           order by d.removed_at nulls first, d.domain)
    from app.allowed_email_domains d
    left join app.profiles ap on ap.id = d.added_by
    left join app.profiles rp on rp.id = d.removed_by
    where coalesce(p_include_removed, false) or d.removed_at is null), '[]'::jsonb);
end $$;

create function api.admin_add_email_domain(p_domain text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := private.assert_admin(); v_reason text := private.reason_or_error(p_reason);
        v_domain text := private.normalize_domain(p_domain); d app.allowed_email_domains;
begin
  perform pg_advisory_xact_lock(hashtext('dcu.allowed_email_domains'));
  if exists (select 1 from app.allowed_email_domains where domain = v_domain and removed_at is null) then
    perform private.raise_business_error('DOMAIN_ALREADY_EXISTS');
  end if;
  insert into app.allowed_email_domains (domain, added_by) values (v_domain, v_admin) returning * into d;
  perform private.write_audit(v_admin, 'ADMIN', 'DOMAIN_ADD', 'email_domain', d.id::text, null,
    jsonb_build_object('domain', v_domain), v_reason);
  return jsonb_build_object('id', d.id, 'domain', d.domain, 'added_at', d.added_at);
end $$;

create function api.admin_rename_email_domain(p_domain_id uuid, p_new_domain text, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := private.assert_admin(); v_reason text := private.reason_or_error(p_reason);
        v_domain text := private.normalize_domain(p_new_domain); d app.allowed_email_domains; v_old text;
begin
  perform pg_advisory_xact_lock(hashtext('dcu.allowed_email_domains'));
  select * into d from app.allowed_email_domains where id = p_domain_id and removed_at is null for update;
  if not found then perform private.raise_business_error('DOMAIN_NOT_FOUND'); end if;
  if exists (select 1 from app.allowed_email_domains where domain = v_domain and removed_at is null and id <> d.id) then
    perform private.raise_business_error('DOMAIN_ALREADY_EXISTS');
  end if;
  v_old := d.domain;
  update app.allowed_email_domains set domain = v_domain where id = d.id returning * into d;
  perform private.write_audit(v_admin, 'ADMIN', 'DOMAIN_RENAME', 'email_domain', d.id::text,
    jsonb_build_object('domain', v_old), jsonb_build_object('domain', v_domain), v_reason);
  return jsonb_build_object('id', d.id, 'domain', d.domain);
end $$;

create function api.admin_remove_email_domain(p_domain_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := private.assert_admin(); v_reason text := private.reason_or_error(p_reason); d app.allowed_email_domains;
begin
  perform pg_advisory_xact_lock(hashtext('dcu.allowed_email_domains'));
  select * into d from app.allowed_email_domains where id = p_domain_id and removed_at is null for update;
  if not found then perform private.raise_business_error('DOMAIN_NOT_FOUND'); end if;
  if (select count(*) from app.allowed_email_domains where removed_at is null) <= 1 then
    perform private.raise_business_error('LAST_DOMAIN_PROTECTED');
  end if;
  update app.allowed_email_domains set removed_at = private.now(), removed_by = v_admin, removal_reason = v_reason
   where id = d.id returning * into d;
  perform private.write_audit(v_admin, 'ADMIN', 'DOMAIN_REMOVE', 'email_domain', d.id::text,
    jsonb_build_object('domain', d.domain, 'removed', false), jsonb_build_object('domain', d.domain, 'removed', true), v_reason);
  return jsonb_build_object('id', d.id, 'domain', d.domain, 'removed_at', d.removed_at);
end $$;

------------------------------------------------------------------------------------------------
-- Audit log
------------------------------------------------------------------------------------------------
create function api.admin_list_audit_logs(p_filters jsonb default '{}'::jsonb, p_limit integer default 50, p_cursor text default null)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare
  v_from date := nullif(p_filters ->> 'date_from', '')::date;
  v_to date := nullif(p_filters ->> 'date_to', '')::date;
  v_actor uuid := nullif(p_filters ->> 'actor_id', '')::uuid;
  v_etype text := nullif(p_filters ->> 'entity_type', '');
  v_eid text := nullif(p_filters ->> 'entity_id', '');
  v_actions text[];
  v_offset integer := private.parse_cursor(p_cursor);
  v_items jsonb; v_total integer;
begin
  perform private.assert_admin();
  perform private.check_limit(p_limit, 100);
  if jsonb_typeof(p_filters -> 'action') = 'array' then
    select array_agg(x) into v_actions from jsonb_array_elements_text(p_filters -> 'action') x;
  end if;
  select jsonb_agg(q.item order by q.ord), count(*) into v_items, v_total
  from (
    select jsonb_build_object(
             'id', l.id, 'occurred_at', l.occurred_at, 'actor_name', coalesce(p.full_name, 'System'),
             'actor_role', l.actor_role, 'action', l.action, 'entity_type', l.entity_type, 'entity_id', l.entity_id,
             'before', l.before, 'after', l.after, 'reason', l.reason) as item,
           row_number() over (order by l.occurred_at desc, l.id desc) as ord
    from app.audit_logs l left join app.profiles p on p.id = l.actor_id
    where (v_from is null or l.occurred_at >= private.wib_instant(v_from, time '00:00'))
      and (v_to is null or l.occurred_at < private.wib_instant(v_to + 1, time '00:00'))
      and (v_actor is null or l.actor_id = v_actor)
      and (v_etype is null or l.entity_type = v_etype)
      and (v_eid is null or l.entity_id = v_eid)
      and (v_actions is null or l.action = any (v_actions))
    order by ord offset v_offset limit p_limit + 1
  ) q;
  if coalesce(v_total, 0) > p_limit then
    return jsonb_build_object('items', v_items - p_limit, 'next_cursor', (v_offset + p_limit)::text);
  end if;
  return jsonb_build_object('items', coalesce(v_items, '[]'::jsonb), 'next_cursor', null);
end $$;

------------------------------------------------------------------------------------------------
-- Grants
------------------------------------------------------------------------------------------------
revoke execute on all functions in schema api from public, anon;
revoke execute on all functions in schema private from public, anon;
grant execute on function private.booking_view(app.bookings, boolean), private.is_email_domain_allowed(text) to authenticated;
grant execute on function
  api.admin_dashboard_metrics(date, date),
  api.admin_list_bookings(jsonb, integer, text), api.admin_get_booking(uuid), api.admin_cancel_booking(uuid, text),
  api.admin_preview_block(text, text, timestamptz, timestamptz),
  api.admin_create_block(text, text, timestamptz, timestamptz, text, text, boolean, uuid[]),
  api.admin_remove_block(uuid, text), api.admin_list_blocks(jsonb, integer, text),
  api.admin_list_users(text, text, text, integer, text), api.admin_get_user(uuid),
  api.admin_set_user_active(uuid, boolean, text), api.admin_set_user_role(uuid, text, text),
  api.admin_get_settings(), api.admin_update_setting(text, jsonb, text),
  api.admin_list_email_domains(boolean), api.admin_add_email_domain(text, text),
  api.admin_rename_email_domain(uuid, text, text), api.admin_remove_email_domain(uuid, text),
  api.admin_list_audit_logs(jsonb, integer, text)
  to authenticated;
-- re-grant the public RPCs revoked by the blanket statement above
grant execute on function api.get_registration_domains(), api.health() to anon, authenticated;
