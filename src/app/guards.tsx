import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { Spinner } from '../components/ui/Feedback';
import { NotFoundPage } from '../pages/NotFoundPage';

/** Public auth pages: a signed-in, verified user goes straight to Home. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { session, sessionLoading, profile } = useAuth();
  if (sessionLoading) return <Spinner />;
  if (session && profile?.email_verified && profile.is_active) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Requires a session, an active account and a verified email (BR-01). */
export function RequireUser() {
  const { session, sessionLoading, profile, profileLoading, signedOutByUser } = useAuth();
  const location = useLocation();
  if (sessionLoading || profileLoading) return <Spinner label="Loading your account" />;
  if (!session) {
    if (signedOutByUser) return <Navigate to="/login" replace />;
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  if (!profile) return <Spinner label="Loading your account" />;
  if (!profile.is_active) return <Navigate to="/account-disabled" replace />;
  if (!profile.email_verified) return <Navigate to={`/verify?email=${encodeURIComponent(profile.email)}`} replace />;
  return <Outlet />;
}

/** Admin area: non-admins see "Not found" (the backend authorises every call regardless, TEST-24). */
export function RequireAdmin() {
  const { profile } = useAuth();
  if (profile?.role !== 'ADMIN') return <NotFoundPage />;
  return <Outlet />;
}
