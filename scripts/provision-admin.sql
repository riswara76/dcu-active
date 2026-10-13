-- DCU Active — initial administrator provisioning (TR-AUTH-10, OD-04).
--
-- The person first registers and verifies their email in the app as a normal user.
-- An operator with database access then runs, for example:
--
--   psql "<database connection string>" -v email=ronny.iswara@danamon.co.id -f scripts/provision-admin.sql
--
-- The script refuses unknown, unverified, inactive or non-allowed-domain accounts and writes an audit row.

\set ON_ERROR_STOP on
select set_config('dcu.admin_email', lower(:'email'), false);

do $$
declare
  v_email text := current_setting('dcu.admin_email');
  p app.profiles;
begin
  select * into p from app.profiles where email = v_email for update;
  if not found then
    raise exception 'No DCU Active account for %. The person must register and verify first.', v_email;
  end if;
  if not private.email_verified(p.id) then
    raise exception 'Account % has not verified its email yet.', v_email;
  end if;
  if not p.is_active then
    raise exception 'Account % is deactivated.', v_email;
  end if;
  if not private.is_email_domain_allowed(v_email) then
    raise exception 'The email domain of % is not on the allowed list.', v_email;
  end if;
  if p.role = 'ADMIN' then
    raise notice '% is already an administrator. Nothing changed.', v_email;
    return;
  end if;

  update app.profiles set role = 'ADMIN' where id = p.id;
  perform private.write_audit(null, 'SYSTEM', 'ROLE_GRANT', 'profile', p.id::text,
    jsonb_build_object('role', 'USER'), jsonb_build_object('role', 'ADMIN'), 'Initial administrator provisioning');
  raise notice '% is now an administrator.', v_email;
end $$;
