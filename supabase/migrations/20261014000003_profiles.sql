-- DCU Active — 0003 profiles (one row per auth user)
-- Emails are stored lower-case as text (citext is avoided so functions with search_path = '' need no extension operators).

create table app.profiles (
  id                   uuid primary key references auth.users (id) on delete restrict,
  email                text not null unique check (email = lower(email) and position('@' in email) > 1),
  full_name            text not null check (char_length(btrim(full_name)) between 2 and 100),
  role                 app.app_role not null default 'USER',
  is_active            boolean not null default true,
  deactivated_at       timestamptz,
  deactivated_by       uuid references app.profiles (id),
  deactivation_reason  text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint profiles_deactivation_consistent check (
    (is_active and deactivated_at is null and deactivation_reason is null)
    or (not is_active and deactivated_at is not null and char_length(btrim(deactivation_reason)) >= 5)
  )
);

create index profiles_name_trgm  on app.profiles using gin (full_name extensions.gin_trgm_ops);
create index profiles_email_trgm on app.profiles using gin (email extensions.gin_trgm_ops);
create index profiles_active_admins on app.profiles (id) where role = 'ADMIN' and is_active;
