-- DCU Active — 0012 Auth "Before User Created" hook: registration email domain allow-list (FR-AUTH-12, TR-AUTH-11)
-- Configured in supabase/config.toml: [auth.hook.before_user_created] uri = "pg-functions://postgres/private/hook_before_user_created"

create function private.hook_before_user_created(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_email text := event -> 'user' ->> 'email';
begin
  if private.is_email_domain_allowed(v_email) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'EMAIL_DOMAIN_NOT_ALLOWED'));
end $$;

revoke execute on function private.hook_before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.hook_before_user_created(jsonb) to supabase_auth_admin;
