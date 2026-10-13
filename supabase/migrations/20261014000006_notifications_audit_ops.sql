-- DCU Active — 0006 notifications, audit trail, operational tables

create table app.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references app.profiles (id),
  type        text not null check (type in ('BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'CHECKED_IN',
                                            'ADMIN_CANCELLED', 'NO_SHOW', 'ACCOUNT_DEACTIVATED')),
  title       text not null,
  body        text not null,
  booking_id  uuid references app.bookings (id),
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index notifications_user_recent on app.notifications (user_id, created_at desc);

create table app.audit_logs (
  id           bigint generated always as identity primary key,
  occurred_at  timestamptz not null default now(),
  actor_id     uuid references app.profiles (id),     -- null = SYSTEM
  actor_role   text not null check (actor_role in ('USER', 'ADMIN', 'SYSTEM')),
  action       text not null,
  entity_type  text not null,
  entity_id    text not null,
  before       jsonb,
  after        jsonb,
  reason       text
);
create index audit_logs_time   on app.audit_logs (occurred_at desc);
create index audit_logs_entity on app.audit_logs (entity_type, entity_id);
create index audit_logs_actor  on app.audit_logs (actor_id, occurred_at desc);

-- Append-only: no role may change or remove audit rows (TR-DB-08, SEC-18).
create function private.deny_audit_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = 'P0001', message = 'AUDIT_LOG_IMMUTABLE';
end $$;

create trigger audit_logs_immutable before update or delete on app.audit_logs
  for each row execute function private.deny_audit_mutation();
create trigger audit_logs_no_truncate before truncate on app.audit_logs
  for each statement execute function private.deny_audit_mutation();

create table app.integrity_check_runs (
  id          bigint generated always as identity primary key,
  ran_at      timestamptz not null default now(),
  check_name  text not null,
  violations  integer not null,
  sample      jsonb
);
