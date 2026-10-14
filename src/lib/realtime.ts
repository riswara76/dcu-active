import { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';

/**
 * Subscribes to the private "availability:<FACILITY>" channel while a facility screen is open (TR-RT-04).
 * Returns `live = false` when the channel is not subscribed, so callers poll as a fallback (TR-RT-05).
 * Payloads carry only { facility_code, date_wib } — never personal data.
 */
export function useAvailabilitySignal(
  facilityCode: string | undefined,
  onChange: (payload: { facility_code: string; date_wib: string }) => void,
): { live: boolean } {
  const [live, setLive] = useState(false);
  const handler = useRef(onChange);
  useEffect(() => {
    handler.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!facilityCode) return;
    const channel = supabase
      .channel(`availability:${facilityCode}`, { config: { private: true } })
      .on('broadcast', { event: 'availability_changed' }, (msg) => handler.current(msg.payload as never))
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [facilityCode]);

  return { live };
}

/** Per-user signals ("user:<uid>"): new notifications, admin cancellations, deactivation. */
export function useUserSignal(userId: string | undefined, onSignal: (type: string) => void): void {
  const handler = useRef(onSignal);
  useEffect(() => {
    handler.current = onSignal;
  }, [onSignal]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`user:${userId}`, { config: { private: true } })
      .on('broadcast', { event: 'notification' }, (msg) => handler.current(String((msg.payload as { type?: string })?.type ?? '')))
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}
