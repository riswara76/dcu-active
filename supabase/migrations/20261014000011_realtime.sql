-- DCU Active — 0011 Realtime "something changed" signals (TRD §12, API-RPC-SPECIFICATION §7)
-- Payloads never contain user ids, names, booking ids or resource names (SEC-05).

create function private.safe_broadcast(p_payload jsonb, p_event text, p_topic text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send(p_payload, p_event, p_topic, true);
exception when others then
  -- A missed signal is tolerable (clients also poll); a failed booking is not (TR-RT-06).
  raise warning 'realtime broadcast failed for %: %', p_topic, sqlerrm;
end $$;

create function private.broadcast_booking_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
  if tg_op = 'UPDATE' and new.status = old.status then
    return null;
  end if;
  select code into v_code from app.facilities where id = new.facility_id;
  perform private.safe_broadcast(
    jsonb_build_object('facility_code', v_code, 'date_wib', to_char(new.booking_date, 'YYYY-MM-DD')),
    'availability_changed', 'availability:' || v_code);
  return null;
end $$;

create function private.broadcast_block_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_code text; v_day date;
begin
  select code into v_code from app.facilities where id = new.facility_id;
  for v_day in
    select d::date from generate_series(
      (new.start_at at time zone 'Asia/Jakarta')::date::timestamp,
      ((new.end_at - interval '1 second') at time zone 'Asia/Jakarta')::date::timestamp,
      interval '1 day') d
  loop
    perform private.safe_broadcast(
      jsonb_build_object('facility_code', v_code, 'date_wib', to_char(v_day, 'YYYY-MM-DD')),
      'availability_changed', 'availability:' || v_code);
  end loop;
  return null;
end $$;

create function private.broadcast_user_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.safe_broadcast(jsonb_build_object('type', new.type), 'notification', 'user:' || new.user_id::text);
  return null;
end $$;

create trigger bookings_broadcast after insert or update of status on app.bookings
  for each row execute function private.broadcast_booking_change();
create trigger facility_blocks_broadcast after insert or update of removed_at on app.facility_blocks
  for each row execute function private.broadcast_block_change();
create trigger notifications_broadcast after insert on app.notifications
  for each row execute function private.broadcast_user_notification();

revoke execute on function private.safe_broadcast(jsonb, text, text), private.broadcast_booking_change(),
  private.broadcast_block_change(), private.broadcast_user_notification() from public, anon, authenticated;

-- Realtime authorization: only active users may listen to availability topics; users only to their own topic.
-- No INSERT policy → clients cannot broadcast.
create policy dcu_availability_read on realtime.messages for select to authenticated
  using ((select realtime.topic()) like 'availability:%' and (select private.current_user_active()));

create policy dcu_user_topic_read on realtime.messages for select to authenticated
  using ((select realtime.topic()) = 'user:' || (select auth.uid())::text);
