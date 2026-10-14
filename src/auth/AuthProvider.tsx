import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import { useUserSignal } from '../lib/realtime';
import type { Profile } from '../lib/types';

interface AuthState {
  session: Session | null;
  sessionLoading: boolean;
  profile: Profile | undefined;
  profileLoading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<unknown>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      // Realtime private channels authorise with the user's access token.
      if (next?.access_token) void supabase.realtime.setAuth(next.access_token);
      if (!next) queryClient.clear(); // nothing of the previous user stays in memory
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [queryClient]);

  const userId = session?.user.id;
  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: api.myProfile,
    enabled: Boolean(userId),
    staleTime: 60_000,
    retry: 1,
  });

  // Live per-user signals: notifications, admin cancellations, deactivation (TR-RT-07).
  useUserSignal(userId, (type) => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    void queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
    if (type === 'ACCOUNT_DEACTIVATED') void queryClient.invalidateQueries({ queryKey: ['profile'] });
  });

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      sessionLoading,
      profile: profileQuery.data,
      profileLoading: Boolean(userId) && profileQuery.isPending,
      signOut,
      refreshProfile: profileQuery.refetch,
    }),
    [session, sessionLoading, profileQuery.data, profileQuery.isPending, profileQuery.refetch, userId, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
