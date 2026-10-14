import type { ReactNode } from 'react';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '../lib/errors';
import { supabase } from '../lib/supabase';
import { AuthProvider } from '../auth/AuthProvider';
import { ToastProvider } from '../components/ui/Toast';

/**
 * Global handling of two session-level outcomes from any RPC:
 *  - ACCOUNT_DISABLED  → show the Account disabled screen (TEST-25)
 *  - NOT_AUTHENTICATED → sign out locally and return to Login
 */
function handleGlobalError(error: unknown) {
  if (!(error instanceof ApiError)) return;
  if (error.code === 'ACCOUNT_DISABLED' && window.location.pathname !== '/account-disabled') {
    window.location.assign('/account-disabled');
  }
  if (error.code === 'NOT_AUTHENTICATED') {
    void supabase.auth.signOut();
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleGlobalError }),
  mutationCache: new MutationCache({ onError: handleGlobalError }),
  defaultOptions: {
    queries: {
      retry: (count, error) => !(error instanceof ApiError && error.code !== 'NETWORK_ERROR') && count < 2,
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    },
    mutations: {
      networkMode: 'online', // never queue a booking/cancel/check-in while offline (TR-PWA-04)
      retry: false,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
