-- DCU Active — UAT test accounts for STAGING (PO request 2026-10-22, while Danamon email/SMTP is not available).
--
-- Creates 2 ADMIN and 2 USER accounts (sign in on staging with the short usernames Admin1, Admin2, User1, User2) on the reserved test domain "dcu-active.test" (RFC 2606: can never receive
-- email). Accounts are created already confirmed, so no verification email is sent. The domain is added to the
-- registration allow-list (audited) so admin rules stay consistent; remove it in Admin → Settings → Email domains
-- after UAT, and deactivate the accounts.
--
-- The password is NOT stored here. The runner replaces __TEST_PASSWORD__ in a temporary copy, e.g.:
--   sed "s/__TEST_PASSWORD__/<password>/" scripts/create-test-accounts.sql > /tmp/x.sql
--   npx supabase db query --linked -f /tmp/x.sql
-- Re-running is safe: existing accounts get the password reset, are confirmed and keep their data.

do $$
declare
  v_password constant text := '__TEST_PASSWORD__';
  v_domain constant text := 'dcu-active.test';
  r record; v_id uuid; v_created integer := 0; v_updated integer := 0;
begin
  if v_password like '\_\_%' then
    raise exception 'Replace __TEST_PASSWORD__ before running this script';
  end if;

  if not exists (select 1 from app.allowed_email_domains where domain = v_domain and removed_at is null) then
    insert into app.allowed_email_domains (domain) values (v_domain);
    perform private.write_audit(null, 'SYSTEM', 'DOMAIN_ADD', 'email_domain', v_domain, null,
      jsonb_build_object('domain', v_domain), 'UAT test accounts (temporary, remove after UAT)');
  end if;

  for r in
    select * from (values
      ('admin1@dcu-active.test', 'Admin1', 'ADMIN'),
      ('admin2@dcu-active.test', 'Admin2', 'ADMIN'),
      ('user1@dcu-active.test',  'User1',  'USER'),
      ('user2@dcu-active.test',  'User2',  'USER')
    ) as t (email, full_name, role)
  loop
    select id into v_id from auth.users where email = r.email;
    if v_id is null then
      v_id := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                              confirmation_token, recovery_token, email_change, email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', r.email,
              extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', r.full_name),
              now(), now(), '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text,
              jsonb_build_object('sub', v_id::text, 'email', r.email, 'email_verified', true),
              'email', now(), now(), now());
      v_created := v_created + 1;
    else
      update auth.users
         set encrypted_password = extensions.crypt(v_password, extensions.gen_salt('bf')),
             email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
       where id = v_id;
      update app.profiles set full_name = r.full_name where id = v_id and full_name <> r.full_name;
      update app.profiles set is_active = true, deactivated_at = null, deactivated_by = null, deactivation_reason = null
       where id = v_id and not is_active;
      v_updated := v_updated + 1;
    end if;

    if r.role = 'ADMIN' and exists (select 1 from app.profiles where id = v_id and role <> 'ADMIN') then
      update app.profiles set role = 'ADMIN' where id = v_id;
      perform private.write_audit(null, 'SYSTEM', 'ROLE_GRANT', 'profile', v_id::text,
        jsonb_build_object('role', 'USER'), jsonb_build_object('role', 'ADMIN'), 'UAT test administrator');
    end if;
  end loop;

  raise notice 'UAT test accounts: % created, % updated', v_created, v_updated;
end $$;

select p.email, p.full_name, p.role, p.is_active, u.email_confirmed_at is not null as confirmed
from app.profiles p join auth.users u on u.id = p.id
where p.email like '%@dcu-active.test'
order by p.role, p.email;
