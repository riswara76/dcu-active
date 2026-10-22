import { useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Dialog as RDialog } from 'radix-ui';
import {
  Bell, CalendarCheck, ClipboardList, Dumbbell, Gauge, GraduationCap, Home, Menu, Settings, ShieldCheck, Ban, User, Users, X, ArrowLeft,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthProvider';
import { OfflineBanner } from '../components/GlobalChrome';

function SkipLink() {
  return (
    <a href="#main" className="sr-only z-50 rounded bg-white px-3 py-2 font-semibold text-primary focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
      Skip to content
    </a>
  );
}

function Wordmark({ to = '/' }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-bold text-white">
      <img src="/favicon.svg" alt="" className="size-7" />
      <span>DCU Active</span>
    </Link>
  );
}

/** Public/auth pages: centred card. */
export function AuthLayout() {
  return (
    <div className="min-h-dvh bg-surface">
      <SkipLink />
      <OfflineBanner />
      <header className="bg-header px-4 py-3 pt-safe"><Wordmark to="/login" /></header>
      <main id="main" className="mx-auto w-full max-w-md px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

const USER_NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/facilities', label: 'Facilities', icon: Dumbbell, end: false },
  { to: '/classes', label: 'Classes', icon: Users, end: false },
  { to: '/bookings', label: 'My bookings', icon: CalendarCheck, end: false },
  { to: '/profile', label: 'Profile', icon: User, end: false },
];

function UnreadBell() {
  const { data } = useQuery({ queryKey: ['notifications', 'summary'], queryFn: () => api.notifications(), refetchInterval: 60_000 });
  const unread = data?.unread_count ?? 0;
  return (
    <Link to="/profile/notifications" className="relative rounded-lg p-2 text-white hover:bg-white/10"
      aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
      <Bell className="size-6" aria-hidden="true" />
      {unread > 0 && (
        <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-primary px-1 text-center text-xs font-bold leading-5 text-white ring-2 ring-header">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </Link>
  );
}

/** User area: top bar + bottom tab bar on mobile, top navigation from 768px (UX spec §2.1). */
export function UserLayout() {
  const { profile } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <SkipLink />
      <OfflineBanner />
      <header className="sticky top-0 z-20 bg-header pt-safe">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2.5">
          <Wordmark />
          <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
            {USER_NAV.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? 'bg-white/15 text-white' : 'text-white/90 hover:bg-white/10'}`}>
                {label}
              </NavLink>
            ))}
            {profile?.role === 'ADMIN' && (
              <NavLink to="/admin" className="rounded-lg px-3 py-2 text-sm font-semibold text-white/90 hover:bg-white/10">Admin</NavLink>
            )}
          </nav>
          <div className="flex items-center gap-1">
            {profile?.role === 'ADMIN' && (
              <Link to="/admin" className="rounded-lg p-2 text-white hover:bg-white/10 md:hidden" aria-label="Admin">
                <ShieldCheck className="size-6" aria-hidden="true" />
              </Link>
            )}
            <UnreadBell />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 md:pb-10">
        <Outlet />
      </main>
      <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white md:hidden">
        <ul className="grid grid-cols-5">
          {USER_NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end}
                className={({ isActive }) => `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-semibold ${isActive ? 'text-primary' : 'text-muted'}`}>
                <Icon className="size-6" aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

const ADMIN_NAV = [
  { to: '/admin', label: 'Dashboard', icon: Gauge, end: true },
  { to: '/admin/bookings', label: 'Bookings', icon: CalendarCheck, end: false },
  { to: '/admin/blocks', label: 'Facility blocks', icon: Ban, end: false },
  { to: '/admin/classes', label: 'Classes', icon: GraduationCap, end: false },
  { to: '/admin/users', label: 'Users', icon: Users, end: false },
  { to: '/admin/settings', label: 'Settings', icon: Settings, end: false },
  { to: '/admin/audit', label: 'Audit log', icon: ClipboardList, end: false },
];

function AdminNavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {ADMIN_NAV.map(({ to, label, icon: Icon, end }) => (
        <li key={to}>
          <NavLink to={to} end={end} onClick={onNavigate}
            className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-lg px-3 font-semibold ${isActive ? 'bg-white/15 text-white' : 'text-white/85 hover:bg-white/10'}`}>
            <Icon className="size-5" aria-hidden="true" />
            {label}
          </NavLink>
        </li>
      ))}
      <li className="pt-4">
        <NavLink to="/" onClick={onNavigate} className="flex min-h-11 items-center gap-3 rounded-lg px-3 font-semibold text-white/85 hover:bg-white/10">
          <ArrowLeft className="size-5" aria-hidden="true" />
          Back to booking app
        </NavLink>
      </li>
    </ul>
  );
}

/** Admin area: sidebar ≥ 1024px, drawer below (UX spec §2.1). */
export function AdminLayout() {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh bg-surface lg:flex">
      <SkipLink />
      <aside className="hidden w-64 shrink-0 bg-header p-4 lg:block">
        <div className="mb-6"><Wordmark to="/admin" /><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-white/70">Admin</p></div>
        <nav aria-label="Admin"><AdminNavList /></nav>
      </aside>
      <div className="min-w-0 flex-1">
        <OfflineBanner />
        <header className="sticky top-0 z-20 flex items-center justify-between bg-header px-4 py-2.5 pt-safe lg:hidden">
          <Wordmark to="/admin" />
          <RDialog.Root open={open} onOpenChange={setOpen}>
            <RDialog.Trigger className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Open admin menu">
              <Menu className="size-6" aria-hidden="true" />
            </RDialog.Trigger>
            <RDialog.Portal>
              <RDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
              <RDialog.Content className="fixed inset-y-0 left-0 z-50 w-72 bg-header p-4">
                <div className="mb-6 flex items-center justify-between">
                  <RDialog.Title className="font-bold text-white">Admin menu</RDialog.Title>
                  <RDialog.Description className="sr-only">Administration sections</RDialog.Description>
                  <RDialog.Close className="rounded-lg p-2 text-white hover:bg-white/10" aria-label="Close menu">
                    <X className="size-5" aria-hidden="true" />
                  </RDialog.Close>
                </div>
                <nav aria-label="Admin"><AdminNavList onNavigate={() => setOpen(false)} /></nav>
              </RDialog.Content>
            </RDialog.Portal>
          </RDialog.Root>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-bold text-ink">{title}</h1>
      {subtitle && <div className="mt-1 text-muted">{subtitle}</div>}
      <div className="mt-6">{children}</div>
    </div>
  );
}
