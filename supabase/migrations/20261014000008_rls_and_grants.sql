-- DCU Active — 0008 Row Level Security and privileges (DATABASE-DESIGN §5, TRD §10)
-- Clients never write tables directly: no INSERT/UPDATE/DELETE grants for anon/authenticated.

revoke all on all tables in schema app from public, anon, authenticated;
revoke all on all sequences in schema app from public, anon, authenticated;

-- Read privileges for SECURITY INVOKER functions (rows still filtered by RLS below).
grant select on app.profiles, app.facilities, app.activities, app.physical_resources, app.bookings,
                app.notifications, app.facility_blocks, app.audit_logs, app.allowed_email_domains,
                app.app_settings
  to authenticated;

-- service_role: server-side only (CI, tests, operations). Bypasses RLS by design.
grant all on all tables in schema app to service_role;
grant all on all sequences in schema app to service_role;

-- Helpers that RLS policies and invoker functions call.
revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.current_user_active(), private.is_admin(), private.assert_active_user(), private.assert_admin(),
  private.now(), private.today_wib(), private.fmt_time_wib(timestamptz), private.fmt_date_wib(timestamptz),
  private.setting_int(text), private.booking_view(app.bookings, boolean), private.effective_status(app.bookings),
  private.raise_business_error(text, jsonb)
  to authenticated;

alter table app.profiles              enable row level security;
alter table app.facilities            enable row level security;
alter table app.activities            enable row level security;
alter table app.physical_resources    enable row level security;
alter table app.bookings              enable row level security;
alter table app.facility_blocks       enable row level security;
alter table app.notifications         enable row level security;
alter table app.audit_logs            enable row level security;
alter table app.app_settings          enable row level security;
alter table app.allowed_email_domains enable row level security;
alter table app.integrity_check_runs  enable row level security;   -- no policies: definer functions only

create policy profiles_select on app.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

create policy bookings_select on app.bookings for select to authenticated
  using ((user_id = (select auth.uid()) and (select private.current_user_active()))
         or (select private.is_admin()));

create policy notifications_select on app.notifications for select to authenticated
  using (user_id = (select auth.uid()) and (select private.current_user_active()));

create policy facilities_select on app.facilities for select to authenticated
  using ((select private.current_user_active()) and (is_active or (select private.is_admin())));
create policy activities_select on app.activities for select to authenticated
  using ((select private.current_user_active()) and (is_active or (select private.is_admin())));
create policy resources_select on app.physical_resources for select to authenticated
  using ((select private.current_user_active()) and (is_active or (select private.is_admin())));

create policy blocks_admin_select   on app.facility_blocks       for select to authenticated using ((select private.is_admin()));
create policy audit_admin_select    on app.audit_logs            for select to authenticated using ((select private.is_admin()));
create policy settings_admin_select on app.app_settings          for select to authenticated using ((select private.is_admin()));
create policy domains_admin_select  on app.allowed_email_domains for select to authenticated using ((select private.is_admin()));
