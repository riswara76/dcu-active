import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDate, formatDateTimeWib } from '../../lib/time';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Banner, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { bookingTitle } from '../bookings/BookingCard';
import { ResponsiveTable } from './ResponsiveTable';

function ActiveChip({ active }: { active: boolean }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${active ? 'bg-available-bg text-available' : 'bg-booked-bg text-booked'}`}>{active ? 'Active' : 'Deactivated'}</span>;
}

/** S21 — user list (FR-ADM-08). */
export function AdminUsersPage() {
  const [draft, setDraft] = useState({ q: '', status: '', role: '' });
  const [filters, setFilters] = useState(draft);
  const list = useInfiniteQuery({
    queryKey: ['admin', 'users', filters],
    queryFn: ({ pageParam }) => api.users(filters.q || null, filters.status || null, filters.role || null, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const apply = (e: FormEvent) => { e.preventDefault(); setFilters({ ...draft, q: draft.q.trim() }); };

  return (
    <div>
      <PageHeader title="Users" />
      <form onSubmit={apply} className="mb-4 grid gap-3 rounded-xl border border-line bg-white p-4 md:grid-cols-4">
        <div className="md:col-span-2"><TextField label="Search" placeholder="Name or email" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} /></div>
        <SelectField label="Status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
          <option value="">All</option><option value="ACTIVE">Active</option><option value="INACTIVE">Deactivated</option>
        </SelectField>
        <SelectField label="Role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
          <option value="">All</option><option value="USER">User</option><option value="ADMIN">Admin</option>
        </SelectField>
        <div className="md:col-span-4"><Button type="submit">Search</Button></div>
      </form>
      {list.isPending ? <Skeleton className="h-64" /> : list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : rows.length === 0 ? (
        <EmptyState title="No users found." />
      ) : (
        <>
          <ResponsiveTable caption="Users" rows={rows} rowKey={(u) => u.id}
            columns={[
              { header: 'Name', cell: (u) => <Link to={`/admin/users/${u.id}`} className="font-semibold text-primary underline-offset-2 hover:underline">{u.full_name}</Link> },
              { header: 'Email', cell: (u) => u.email },
              { header: 'Role', cell: (u) => u.role === 'ADMIN' ? 'Admin' : 'User' },
              { header: 'Status', cell: (u) => <ActiveChip active={u.is_active} /> },
              { header: 'Upcoming', cell: (u) => u.upcoming_count },
              { header: 'Joined', cell: (u) => formatDateTimeWib(u.created_at).split(',')[0] },
            ]} />
          {list.hasNextPage && <Button className="mt-3" variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Load more</Button>}
        </>
      )}
    </div>
  );
}

type Action = { kind: 'deactivate' | 'activate' | 'grant' | 'revoke' } | null;

/** S21 — user detail with activation and role actions (ROLE-03/04/06, BR-28). */
export function AdminUserDetailPage() {
  const { id = '' } = useParams();
  const { profile: me } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [action, setAction] = useState<Action>(null);
  const user = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api.user(id) });
  const run = useMutation({
    mutationFn: async (reason: string) => {
      if (!action) return;
      if (action.kind === 'deactivate' || action.kind === 'activate') return api.setUserActive(id, action.kind === 'activate', reason);
      return api.setUserRole(id, action.kind === 'grant' ? 'ADMIN' : 'USER', reason);
    },
    onSuccess: (result) => {
      const kind = action?.kind;
      setAction(null);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      const cancelled = (result as { cancelled_booking_ids?: string[] } | undefined)?.cancelled_booking_ids?.length ?? 0;
      toast({
        tone: 'success',
        title: kind === 'deactivate' ? 'User deactivated' : kind === 'activate' ? 'User activated' : kind === 'grant' ? 'Admin role granted' : 'Admin role removed',
        description: kind === 'deactivate' && cancelled ? `${cancelled} upcoming booking(s) cancelled.` : undefined,
      });
    },
  });

  if (user.isPending) return <Skeleton className="h-64" />;
  if (user.isError) return <ErrorState error={user.error} onRetry={() => void user.refetch()} />;
  const u = user.data;
  const self = me?.id === u.id;
  const upcoming = u.recent_bookings.filter((b) => b.effective_status === 'UPCOMING' || b.effective_status === 'CANCEL_CLOSED');

  const dialogs: Record<NonNullable<Action>['kind'], { title: string; label: string; destructive: boolean; body?: string }> = {
    deactivate: { title: `Deactivate ${u.full_name}?`, label: 'Deactivate', destructive: true,
      body: `Access is revoked immediately. ${u.stats.upcoming} upcoming booking(s) will be cancelled and released.` },
    activate: { title: `Activate ${u.full_name}?`, label: 'Activate', destructive: false, body: 'Previously cancelled bookings are not restored.' },
    grant: { title: `Make ${u.full_name} an administrator?`, label: 'Make admin', destructive: false },
    revoke: { title: `Remove admin role from ${u.full_name}?`, label: 'Remove admin', destructive: true },
  };
  const d = action ? dialogs[action.kind] : null;

  return (
    <div className="max-w-3xl">
      <Link to="/admin/users" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <ArrowLeft className="size-4" aria-hidden="true" /> Users
      </Link>
      <PageHeader title={u.full_name} subtitle={u.email} actions={<ActiveChip active={u.is_active} />} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Role</dt><dd>{u.role === 'ADMIN' ? 'Administrator' : 'User'}</dd>
            <dt className="text-muted">Domain</dt><dd>@{u.email_domain}{!u.email_domain_allowed && <span className="text-warning"> (no longer allowed)</span>}</dd>
            <dt className="text-muted">Joined</dt><dd>{formatDateTimeWib(u.created_at)}</dd>
            {!u.is_active && <><dt className="text-muted">Deactivated</dt><dd>{u.deactivated_at && formatDateTimeWib(u.deactivated_at)} — {u.deactivation_reason}</dd></>}
          </dl>
        </Card>
        <Card>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-muted">Bookings</dt><dd className="text-xl font-bold">{u.stats.total}</dd></div>
            <div><dt className="text-muted">Upcoming</dt><dd className="text-xl font-bold">{u.stats.upcoming}</dd></div>
            <div><dt className="text-muted">No-shows</dt><dd className="text-xl font-bold">{u.stats.no_shows}</dd></div>
            <div><dt className="text-muted">Cancelled</dt><dd className="text-xl font-bold">{u.stats.cancelled}</dd></div>
          </dl>
        </Card>
      </div>

      <section className="mt-4 space-y-2" aria-label="Actions">
        {self ? (
          <Banner>You can&apos;t change your own admin role or status.</Banner>
        ) : (
          <div className="flex flex-wrap gap-2">
            {u.is_active
              ? <Button variant="danger" onClick={() => { run.reset(); setAction({ kind: 'deactivate' }); }}>Deactivate</Button>
              : <Button variant="secondary" onClick={() => { run.reset(); setAction({ kind: 'activate' }); }}>Activate</Button>}
            {u.role === 'ADMIN'
              ? <Button variant="danger" onClick={() => { run.reset(); setAction({ kind: 'revoke' }); }}>Remove admin</Button>
              : <Button variant="secondary" disabled={!u.is_active || !u.email_domain_allowed}
                  onClick={() => { run.reset(); setAction({ kind: 'grant' }); }}>Make admin</Button>}
          </div>
        )}
        {!self && u.role !== 'ADMIN' && !u.email_domain_allowed && (
          <p className="text-sm text-muted">Admin role requires an email on an allowed domain.</p>
        )}
      </section>

      <section className="mt-6" aria-labelledby="recent-h">
        <h2 id="recent-h" className="mb-2 text-lg font-bold">Recent bookings</h2>
        {u.recent_bookings.length === 0 ? <p className="text-muted">No bookings yet.</p> : (
          <ResponsiveTable caption="Recent bookings" rows={u.recent_bookings} rowKey={(b) => b.id}
            columns={[
              { header: 'When', cell: (b) => `${formatDate(b.date_wib)} ${b.start_wib}–${b.end_wib}` },
              { header: 'Facility', cell: (b) => bookingTitle(b) },
              { header: 'Status', cell: (b) => <StatusBadge status={b.effective_status} /> },
            ]} />
        )}
      </section>

      {d && (
        <ConfirmDialog
          open={action !== null}
          onOpenChange={(o) => { if (!o) setAction(null); }}
          title={d.title}
          description={d.body}
          confirmLabel={d.label}
          cancelLabel="Back"
          destructive={d.destructive}
          requireReason
          loading={run.isPending}
          error={run.isError ? errorMessage(run.error) : undefined}
          onConfirm={(reason) => run.mutate(reason)}
        >
          {action?.kind === 'deactivate' && upcoming.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {upcoming.map((b) => <li key={b.id}>{bookingTitle(b)} · {formatDate(b.date_wib)} {b.start_wib}</li>)}
            </ul>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
