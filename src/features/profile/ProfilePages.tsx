import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronRight, HelpCircle, KeyRound, LogOut, ShieldCheck, FileText } from 'lucide-react';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { authError, errorMessage, type ApiError } from '../../lib/errors';
import { formatDateTimeWib } from '../../lib/time';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui/Feedback';
import { TextField } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { PasswordForm } from '../auth/PasswordPages';
import { passwordMeetsPolicy } from '../auth/password';

/** S17 — profile. */
export function ProfilePage() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(profile?.full_name ?? '');
  const update = useMutation({
    mutationFn: (n: string) => api.updateMyProfile(n),
    onSuccess: (p) => {
      queryClient.setQueryData(['profile', p.id], p);
      toast({ tone: 'success', title: 'Name updated' });
    },
  });
  if (!profile) return <Skeleton className="h-64" />;
  const trimmed = name.trim();
  const nameError = trimmed.length < 2 || trimmed.length > 100 ? 'Enter 2–100 characters.' : undefined;

  const links = [
    { to: '/profile/notifications', label: 'Notifications', icon: Bell },
    { to: '/profile/password', label: 'Change password', icon: KeyRound },
    { to: '/help', label: 'How to book', icon: HelpCircle },
    { to: '/privacy', label: 'Privacy notice', icon: FileText },
    ...(profile.role === 'ADMIN' ? [{ to: '/admin', label: 'Admin', icon: ShieldCheck }] : []),
  ];

  return (
    <div className="max-w-xl">
      <PageHeader title="Profile" />
      <Card>
        <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); if (!nameError) update.mutate(trimmed); }}>
          <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
            error={update.isError ? errorMessage(update.error) : name !== profile.full_name ? nameError : undefined} />
          <div>
            <p className="text-sm font-semibold">Email</p>
            <p className="mt-1 text-ink">{profile.email}</p>
            <p className="text-sm text-muted">Email changes are not supported. Contact DCU if needed.</p>
          </div>
          <p className="text-sm text-muted">
            Member since {formatDateTimeWib(profile.created_at).split(',')[0]}
            {profile.role === 'ADMIN' && <span className="ml-2 rounded-full bg-header px-2 py-0.5 text-xs font-semibold text-white">Admin</span>}
          </p>
          <Button type="submit" variant="secondary" loading={update.isPending} disabled={name === profile.full_name || Boolean(nameError)}>
            Save name
          </Button>
        </form>
      </Card>
      <nav aria-label="Profile" className="mt-4">
        <ul className="divide-y divide-line rounded-xl border border-line bg-white">
          {links.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <Link to={to} className="flex min-h-12 items-center gap-3 px-4 hover:bg-surface">
                <Icon className="size-5 text-muted" aria-hidden="true" />
                <span className="flex-1 font-medium">{label}</span>
                <ChevronRight className="size-4 text-subtle" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Button className="mt-6" variant="secondary" block onClick={async () => { await signOut(); navigate('/login', { replace: true }); }}>
        <LogOut className="size-5" aria-hidden="true" /> Sign out
      </Button>
    </div>
  );
}

/** Notifications list (FR-NTF-01). */
export function NotificationsPage() {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ['notifications', 'pages'],
    queryFn: ({ pageParam }) => api.notifications(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });
  const markAll = useMutation({
    mutationFn: () => api.markNotificationsRead(),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const items = query.data.pages.flatMap((p) => p.items);
  const unread = query.data.pages[0]?.unread_count ?? 0;
  return (
    <div className="max-w-xl">
      <PageHeader title="Notifications" subtitle={unread ? `${unread} unread` : undefined}
        actions={unread > 0 && <Button size="sm" variant="secondary" loading={markAll.isPending} onClick={() => markAll.mutate()}>Mark all as read</Button>} />
      {items.length === 0 ? <EmptyState icon={<Bell className="size-8" />} title="No notifications yet." /> : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id} className={`rounded-xl border p-4 ${n.read_at ? 'border-line bg-white' : 'border-primary/30 bg-primary-soft'}`}>
              <p className={n.read_at ? 'font-medium' : 'font-bold'}>{n.title}{!n.read_at && <span className="sr-only"> (unread)</span>}</p>
              <p className="text-sm text-ink">{n.body}</p>
              <p className="mt-1 text-xs text-muted">{formatDateTimeWib(n.created_at)}</p>
              {n.booking_id && <Link to={`/bookings/${n.booking_id}`} className="mt-1 inline-block text-sm font-semibold text-primary">View booking</Link>}
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && <Button className="mt-3" variant="secondary" block onClick={() => void query.fetchNextPage()}>Load more</Button>}
    </div>
  );
}

/** Change password while signed in (FR-PRF-02). */
export function ChangePasswordPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!passwordMeetsPolicy(password) || password !== confirm) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) { setError(authError(err)); return; }
    toast({ tone: 'success', title: 'Password changed' });
    navigate('/profile');
  };
  return (
    <div className="max-w-md">
      <PageHeader title="Change password" />
      <Card>
        <PasswordForm password={password} confirm={confirm} setPassword={setPassword} setConfirm={setConfirm}
          touched={touched} busy={busy} error={error} onSubmit={submit} submitLabel="Change password" />
      </Card>
    </div>
  );
}

/** Help: how to book (OD-10). */
export function HelpPage() {
  const support = (import.meta.env.VITE_SUPPORT_CONTACT as string | undefined) ?? 'DCU';
  const steps = [
    'Open Facilities and choose a facility.',
    'For the Basketball / Futsal court, choose the activity.',
    'Pick a date (today up to 7 days ahead) and a free time.',
    'Choose the duration where offered, then Review and Confirm.',
    'Check in from 15 minutes before to 15 minutes after the start, or the booking is released as a no-show.',
    'You can cancel up to 30 minutes before the start.',
  ];
  return (
    <div className="max-w-xl">
      <PageHeader title="How to book" />
      <ol className="list-decimal space-y-2 pl-5">{steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <h2 className="mt-6 text-lg font-bold">Fair use</h2>
      <p className="text-muted">Up to 2 upcoming bookings, and 1 booking per facility per day. All times are WIB.</p>
      <h2 className="mt-6 text-lg font-bold">Need help?</h2>
      <p className="text-muted">Contact DCU at <strong>{support}</strong>.</p>
    </div>
  );
}

/** Privacy notice — DRAFT pending Legal/DPO approval (OD-17). */
export function PrivacyPage() {
  return (
    <div className="max-w-xl">
      <PageHeader title="Privacy notice" subtitle="Draft — wording to be approved by DCU Legal." />
      <div className="space-y-3 text-ink">
        <p>DCU Active stores your name, company email address, your bookings and in-app notifications so that you can book DCU facilities and so that DCU can manage fair access.</p>
        <p>Other users never see your name or bookings. DCU administrators can see bookings and account details to operate the facilities. Administrative actions are logged.</p>
        <p>Data is hosted by Supabase in Singapore. Bookings and audit records are kept for at least 2 years; notifications for 90 days.</p>
        <p>To ask about or correct your data, contact DCU.</p>
      </div>
    </div>
  );
}
