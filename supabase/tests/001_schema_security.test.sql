-- Schema, privilege and function-security checks (TR-DB-07, TR-SEC-02/03, SECURITY-DESIGN §7, TEST-35-adjacent, TEST-52)
begin;
\ir _helpers.psql
select * from no_plan();

-- Schemas and exposure
select has_schema('api');
select has_schema('app');
select has_schema('private');
select is((select count(*)::int from pg_class c where c.relnamespace = 'api'::regnamespace and c.relkind in ('r', 'v', 'm', 'p')),
          0, 'schema api contains no tables or views (functions only)');

-- RLS on every app table
select is((select count(*)::int from pg_tables where schemaname = 'app' and not rowsecurity),
          0, 'RLS is enabled on every table in schema app');

-- No direct write privileges for client roles
select is((select count(*)::int from pg_tables t
           cross join (values ('anon'), ('authenticated')) r(role)
           cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
           where t.schemaname = 'app' and has_table_privilege(r.role, format('%I.%I', t.schemaname, t.tablename), p.priv)),
          0, 'anon/authenticated have no INSERT/UPDATE/DELETE/TRUNCATE on any app table');
select is((select count(*)::int from pg_tables t where t.schemaname = 'app'
           and has_table_privilege('anon', format('%I.%I', t.schemaname, t.tablename), 'SELECT')),
          0, 'anon cannot read any app table');

-- Function security
select is((select count(*)::int from pg_proc p
           where p.pronamespace in ('api'::regnamespace, 'private'::regnamespace)
             and not coalesce(p.proconfig @> array['search_path=""'], false)),
          0, 'every api/private function pins search_path to empty');
select set_eq($$select p.proname::text from pg_proc p
               where p.pronamespace = 'api'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')$$,
              array['get_registration_domains', 'health'],
              'anon can execute only get_registration_domains and health');
select is((select count(*)::int from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
           where p.pronamespace = 'api'::regnamespace and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
          0, 'no api function is executable by PUBLIC');
select is((select count(*)::int from pg_proc p
           where p.pronamespace = 'private'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')),
          0, 'anon cannot execute any private function');
select ok(not has_function_privilege('authenticated', 'private.hook_before_user_created(jsonb)', 'EXECUTE'),
          'clients cannot call the auth hook');
select ok(has_function_privilege('supabase_auth_admin', 'private.hook_before_user_created(jsonb)', 'EXECUTE'),
          'supabase_auth_admin can call the auth hook');

-- Core constraints
select ok(exists (select 1 from pg_constraint where conname = 'bookings_no_overlap_excl' and contype = 'x'),
          'bookings exclusion constraint exists');

-- Reference data
select is((select count(*)::int from app.facilities), 6, '6 facilities');
select is((select count(*)::int from app.activities), 7, '7 activities');
select is((select count(*)::int from app.physical_resources), 8, '8 physical resources (+ shared court counted once)');
select is((select allowed_durations from app.facilities where code = 'FOOTBALL'), '{30,60,90}'::smallint[],
          'Football Field allows 30/60/90 (OD-19)');
select is((select count(*)::int from app.physical_resources r join app.facilities f on f.id = r.facility_id where f.code = 'COURT'),
          1, 'Basketball and Futsal share one physical court');
select set_eq($$select domain from app.allowed_email_domains where removed_at is null$$,
              array['danamon.co.id', 'adira.co.id', 'homecredit.co.id'], 'initial allowed domains');

-- Auth hook (TEST-52, function level)
select is(private.hook_before_user_created('{"user":{"email":"rina@danamon.co.id"}}'), '{}'::jsonb, 'hook allows @danamon.co.id');
select is(private.hook_before_user_created('{"user":{"email":"Budi@ADIRA.co.id"}}'), '{}'::jsonb, 'hook is case-insensitive');
select is(private.hook_before_user_created('{"user":{"email":"x@homecredit.co.id"}}'), '{}'::jsonb, 'hook allows @homecredit.co.id');
select is(private.hook_before_user_created('{"user":{"email":"x@gmail.com"}}') -> 'error' ->> 'message',
          'EMAIL_DOMAIN_NOT_ALLOWED', 'hook rejects @gmail.com');
select is(private.hook_before_user_created('{"user":{"email":"x@branch.danamon.co.id"}}') -> 'error' ->> 'message',
          'EMAIL_DOMAIN_NOT_ALLOWED', 'hook rejects subdomains (OD-32)');
select is(private.hook_before_user_created('{"user":{"email":"x@danamon.co.id.evil.com"}}') -> 'error' ->> 'message',
          'EMAIL_DOMAIN_NOT_ALLOWED', 'hook rejects look-alike domains');
select is(private.hook_before_user_created('{"user":{"email":"a@b@danamon.co.id"}}') -> 'error' ->> 'http_code',
          '403', 'hook rejects malformed addresses with HTTP 403');

-- Profile creation trigger
select tests.create_user('00000000-0000-4000-8000-000000000001', 'New.Person@Danamon.co.id', true, 'New Person');
select is((select role::text from app.profiles where id = '00000000-0000-4000-8000-000000000001'), 'USER',
          'new users get role USER');
select is((select email from app.profiles where id = '00000000-0000-4000-8000-000000000001'), 'new.person@danamon.co.id',
          'profile email is stored lower-case');

-- Audit log immutability (TEST-33)
insert into app.audit_logs (actor_role, action, entity_type, entity_id) values ('SYSTEM', 'TEST', 'test', '1');
select throws_ok($$update app.audit_logs set action = 'X' where action = 'TEST'$$, 'P0001', 'AUDIT_LOG_IMMUTABLE',
                 'audit rows cannot be updated, even by the owner');
select throws_ok($$delete from app.audit_logs where action = 'TEST'$$, 'P0001', 'AUDIT_LOG_IMMUTABLE',
                 'audit rows cannot be deleted, even by the owner');

-- Time override is honoured only when explicitly enabled
select tests.set_now('2030-01-07 08:00:00+07');
select is(private.now(), '2030-01-07 08:00:00+07'::timestamptz, 'test clock works when override is on');
set local app.allow_time_override = 'off';
select isnt(private.now(), '2030-01-07 08:00:00+07'::timestamptz, 'test clock is ignored when override is off');

select * from finish();
rollback;
