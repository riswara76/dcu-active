-- DCU Active — 0001 extensions, schemas, enum types
-- Schema layout (SOLUTION-ARCHITECTURE §3.1):
--   api     : RPC functions only — the ONLY schema exposed through the Data API (config.toml [api].schemas)
--   app     : business tables (not exposed), RLS enabled
--   private : helpers, trigger functions, auth hook, scheduled jobs (not exposed)

create extension if not exists btree_gist with schema extensions;  -- '=' on scalar columns inside GiST exclusion constraints
create extension if not exists pg_trgm    with schema extensions;  -- admin search
create extension if not exists pgcrypto   with schema extensions;  -- gen_random_bytes for booking references

create schema if not exists app;
create schema if not exists api;
create schema if not exists private;

revoke all on schema app, api, private from public;

-- api: callable surface. anon may only reach functions explicitly granted to it.
grant usage on schema api to anon, authenticated, service_role;
-- app: needed so SECURITY INVOKER read functions can read tables (subject to RLS).
grant usage on schema app to authenticated, service_role;
-- private: needed so RLS policies / invoker functions can call the few helpers granted below.
grant usage on schema private to authenticated, service_role;

-- NOTE: PostgreSQL grants EXECUTE on new functions to PUBLIC, and per-schema ALTER DEFAULT PRIVILEGES cannot
-- remove that. Every migration that creates functions therefore ends with an explicit
-- "revoke execute ... from public, anon" followed by the intended grants. Test 001 enforces this.

create type app.app_role        as enum ('USER', 'ADMIN');
create type app.booking_status  as enum ('CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'ADMIN_CANCELLED', 'NO_SHOW');
create type app.cancel_source   as enum ('USER', 'ADMIN', 'BLOCK', 'DEACTIVATION');
create type app.block_category  as enum ('MAINTENANCE', 'EVENT', 'OPERATIONAL', 'OTHER');
create type app.allocation_mode as enum ('SINGLE', 'AUTO_POOL');
