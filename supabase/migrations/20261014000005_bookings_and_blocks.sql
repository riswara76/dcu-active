-- DCU Active — 0005 facility blocks and bookings

create table app.facility_blocks (
  id              uuid primary key default gen_random_uuid(),
  facility_id     smallint not null references app.facilities (id),
  resource_id     smallint,                                   -- null = whole facility
  start_at        timestamptz not null,
  end_at          timestamptz not null,
  time_range      tstzrange generated always as (tstzrange(start_at, end_at, '[)')) stored,
  category        app.block_category not null,
  reason          text not null check (char_length(btrim(reason)) between 5 and 500),
  created_by      uuid not null references app.profiles (id),
  created_at      timestamptz not null default now(),
  removed_at      timestamptz,
  removed_by      uuid references app.profiles (id),
  removal_reason  text,
  foreign key (resource_id, facility_id) references app.physical_resources (id, facility_id),
  check (end_at > start_at),
  -- 30-minute aligned; valid for WIB because UTC+7 is a whole-hour offset
  check (extract(epoch from start_at)::bigint % 1800 = 0 and extract(epoch from end_at)::bigint % 1800 = 0),
  check ((removed_at is null and removed_by is null and removal_reason is null)
         or (removed_at is not null and removed_by is not null and char_length(btrim(removal_reason)) >= 5))
);
create index facility_blocks_active_range on app.facility_blocks
  using gist (facility_id, time_range) where removed_at is null;

create table app.bookings (
  id                   uuid primary key default gen_random_uuid(),
  booking_ref          text not null unique check (booking_ref ~ '^DCU-[0-9]{6}-[A-HJ-NP-Z2-9]{4}$'),
  user_id              uuid not null references app.profiles (id),
  facility_id          smallint not null references app.facilities (id),
  activity_id          smallint not null,
  resource_id          smallint not null,
  booking_date         date not null,
  start_at             timestamptz not null,
  end_at               timestamptz not null,
  duration_minutes     smallint not null check (duration_minutes in (30, 60, 90)),
  time_range           tstzrange generated always as (tstzrange(start_at, end_at, '[)')) stored,
  status               app.booking_status not null default 'CONFIRMED',
  idempotency_key      uuid not null,
  checked_in_at        timestamptz,
  completed_at         timestamptz,
  no_show_at           timestamptz,
  cancelled_at         timestamptz,
  cancelled_by         uuid references app.profiles (id),
  cancel_source        app.cancel_source,
  cancellation_reason  text,
  block_id             uuid references app.facility_blocks (id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  foreign key (activity_id, facility_id) references app.activities (id, facility_id),
  foreign key (resource_id, facility_id) references app.physical_resources (id, facility_id),
  unique (user_id, idempotency_key),
  check (end_at = start_at + make_interval(mins => duration_minutes::integer)),
  check (extract(epoch from start_at)::bigint % 1800 = 0),
  check (status <> 'CHECKED_IN' or checked_in_at is not null),
  check (status <> 'COMPLETED'  or (checked_in_at is not null and completed_at is not null)),
  check (status <> 'NO_SHOW'    or (no_show_at is not null and checked_in_at is null)),
  check (status not in ('CANCELLED', 'ADMIN_CANCELLED') or (cancelled_at is not null and cancel_source is not null)),
  check (status <> 'ADMIN_CANCELLED' or char_length(btrim(cancellation_reason)) >= 5),
  check (status <> 'CANCELLED' or cancel_source = 'USER'),

  -- BR-11: overlapping occupying bookings on the same physical resource are impossible.
  constraint bookings_no_overlap_excl exclude using gist (
    resource_id with =,
    time_range  with &&
  ) where (status in ('CONFIRMED', 'CHECKED_IN', 'COMPLETED'))
);

create index bookings_facility_date on app.bookings (facility_id, booking_date);
create index bookings_user_daily    on app.bookings (user_id, facility_id, booking_date);
create index bookings_user_active   on app.bookings (user_id, end_at) where status in ('CONFIRMED', 'CHECKED_IN');
create index bookings_status_due    on app.bookings (status, start_at) where status in ('CONFIRMED', 'CHECKED_IN');
create index bookings_created_desc  on app.bookings (created_at desc);
create index bookings_block         on app.bookings (block_id) where block_id is not null;
