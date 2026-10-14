import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !publishableKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. See .env.example.');
}

/**
 * Single Supabase client. Only the PUBLISHABLE key is used in the browser (SEC-06).
 * All business calls go to schema "api" (the only exposed schema).
 */
export const supabase = createClient(url, publishableKey, {
  db: { schema: 'api' },
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // email links are verified explicitly on /auth/confirm (scanner-safe)
  },
});
