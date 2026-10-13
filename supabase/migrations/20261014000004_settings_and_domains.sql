-- DCU Active — 0004 configurable settings + allowed registration email domains

create table app.app_settings (
  key          text primary key,
  value        jsonb not null,
  is_editable  boolean not null,
  min_value    integer,
  max_value    integer,
  description  text not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references app.profiles (id),
  check (not is_editable or (min_value is not null and max_value is not null and min_value <= max_value))
);

-- Editable integer settings must stay within their range (also enforced by api.admin_update_setting).
create function private.validate_setting() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.is_editable then
    if jsonb_typeof(new.value) <> 'number' or (new.value #>> '{}') !~ '^-?[0-9]+$' then
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR',
        detail = jsonb_build_object('key', new.key, 'reason', 'integer required')::text;
    end if;
    if (new.value #>> '{}')::integer not between new.min_value and new.max_value then
      raise exception using errcode = 'P0001', message = 'VALIDATION_ERROR',
        detail = jsonb_build_object('key', new.key, 'min', new.min_value, 'max', new.max_value)::text;
    end if;
  end if;
  return new;
end $$;

create trigger app_settings_validate before insert or update on app.app_settings
  for each row execute function private.validate_setting();

insert into app.app_settings (key, value, is_editable, min_value, max_value, description) values
  ('timezone',                          '"Asia/Jakarta"', false, null, null, 'Business timezone (read-only in V1)'),
  ('slot_minutes',                      '30',             false, null, null, 'Slot length in minutes (read-only in V1)'),
  ('operating_open',                    '"06:00"',        false, null, null, 'Daily opening time, WIB (read-only in V1)'),
  ('operating_close',                   '"21:00"',        false, null, null, 'Daily closing time, WIB (read-only in V1)'),
  ('booking_horizon_days',              '7',              true,  0,    30,   'Bookable days ahead of today'),
  ('max_active_bookings',               '2',              true,  1,    10,   'Maximum active/future bookings per user'),
  ('max_bookings_per_facility_per_day', '1',              true,  1,    5,    'Maximum bookings per facility per user per WIB day'),
  ('checkin_open_before_minutes',       '15',             true,  0,    60,   'Check-in opens this many minutes before start'),
  ('checkin_close_after_minutes',       '15',             true,  5,    60,   'Check-in closes this many minutes after start'),
  ('user_cancel_cutoff_minutes',        '30',             true,  0,    240,  'Users may cancel until this many minutes before start'),
  ('notification_retention_days',       '90',             false, null, null, 'Notifications older than this are purged');

create table app.allowed_email_domains (
  id              uuid primary key default gen_random_uuid(),
  domain          text not null
                  check (domain = lower(domain)
                         and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  added_by        uuid references app.profiles (id),
  added_at        timestamptz not null default now(),
  removed_by      uuid references app.profiles (id),
  removed_at      timestamptz,
  removal_reason  text,
  check ((removed_at is null and removed_by is null)
         or (removed_at is not null and char_length(btrim(removal_reason)) >= 5))
);
create unique index allowed_email_domains_active_uq on app.allowed_email_domains (domain) where removed_at is null;

-- Initial allow-list (PO decision OD-27).
insert into app.allowed_email_domains (domain) values ('danamon.co.id'), ('adira.co.id'), ('homecredit.co.id');
