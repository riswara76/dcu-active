-- DCU Active — LOCAL DEVELOPMENT SEED ONLY (applied by `supabase db reset`; never run against staging/production).
-- Test accounts for local development and integration tests. Shared local test password: DcuLocal#2026
-- (also in tests/integration/env.ts). These accounts do not exist in any hosted environment.

create or replace function pg_temp.seed_user(p_id uuid, p_email text, p_name text, p_verified boolean default true)
returns void language plpgsql as $$
begin
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change, email_change_token_new)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
          extensions.crypt('DcuLocal#2026', extensions.gen_salt('bf')),
          case when p_verified then now() end,
          '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_name),
          now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), p_id, p_id::text,
          jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', p_verified),
          'email', now(), now(), now());
end $$;

select pg_temp.seed_user('10000000-0000-4000-8000-000000000001', 'admin.one@danamon.co.id',     'Admin One');
select pg_temp.seed_user('10000000-0000-4000-8000-000000000002', 'admin.two@danamon.co.id',     'Admin Two');
select pg_temp.seed_user('10000000-0000-4000-8000-000000000011', 'user.a@danamon.co.id',        'Rina Danamon');
select pg_temp.seed_user('10000000-0000-4000-8000-000000000012', 'user.b@adira.co.id',          'Budi Adira');
select pg_temp.seed_user('10000000-0000-4000-8000-000000000013', 'user.c@homecredit.co.id',     'Citra HomeCredit');
select pg_temp.seed_user('10000000-0000-4000-8000-000000000014', 'inactive.user@danamon.co.id', 'Inactive User');
select pg_temp.seed_user('10000000-0000-4000-8000-000000000015', 'unverified@danamon.co.id',    'Unverified User', false);

update app.profiles set role = 'ADMIN'
 where id in ('10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002');
update app.profiles set is_active = false, deactivated_at = now(), deactivation_reason = 'Seed: inactive test account'
 where id = '10000000-0000-4000-8000-000000000014';
