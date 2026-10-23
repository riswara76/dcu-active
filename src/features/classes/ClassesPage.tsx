import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../auth/AuthProvider';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs } from 'radix-ui';
import { CalendarPlus, Clock, History, MapPin, Plus, Settings2, UserRound, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDate } from '../../lib/time';
import { useOnlineStatus } from '../../lib/online';
import type { ClassEnrolment, ClassSession } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Banner, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '../../components/ui/Feedback';
import { useToast } from '../../components/ui/Toast';

export function useMyUpcomingClasses() {
  return useQuery({ queryKey: ['classes', 'mine', 'UPCOMING'], queryFn: () => api.myClasses('UPCOMING'), refetchInterval: 60_000 });
}

/** Leave (with confirmation) and check-in for class places; shared by Home and Classes. */
export function useClassActions() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [toLeave, setToLeave] = useState<ClassEnrolment | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['classes'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
  const leave = useMutation({
    mutationFn: (e: ClassEnrolment) => api.cancelMyEnrolment(e.id),
    onSuccess: () => {
      setToLeave(null);
      refresh();
      toast({ tone: 'success', title: 'You left the class', description: 'Your place is now free for others.' });
    },
  });
  const checkIn = useMutation({
    mutationFn: (e: ClassEnrolment) => api.checkInClass(e.id),
    onSuccess: () => {
      refresh();
      toast({ tone: 'success', title: "You're checked in", description: 'Enjoy the class!' });
    },
    onError: (err) => toast({ tone: 'error', title: 'Check-in failed', description: errorMessage(err) }),
  });
  const dialog = (
    <ConfirmDialog
      open={toLeave !== null}
      onOpenChange={(o) => { if (!o) { setToLeave(null); leave.reset(); } }}
      title="Leave this class?"
      description={toLeave ? `${toLeave.class.title} · ${formatDate(toLeave.date_wib)}, ${toLeave.start_wib}–${toLeave.end_wib} WIB. Your place will be given to others.` : undefined}
      confirmLabel="Leave class"
      cancelLabel="Keep my place"
      destructive
      loading={leave.isPending}
      error={leave.isError ? errorMessage(leave.error) : undefined}
      onConfirm={() => toLeave && leave.mutate(toLeave)}
    />
  );
  return {
    requestLeave: (e: ClassEnrolment) => { leave.reset(); setToLeave(e); },
    checkIn: (e: ClassEnrolment) => checkIn.mutate(e),
    checkingIn: checkIn.isPending ? checkIn.variables?.id : undefined,
    dialog,
  };
}

function Meta({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1"><span aria-hidden="true" className="text-subtle">{icon}</span>{children}</span>;
}

export function EnrolmentCard({ e, onLeave, onCheckIn, checkingIn }: {
  e: ClassEnrolment; onLeave?: (e: ClassEnrolment) => void; onCheckIn?: (e: ClassEnrolment) => void; checkingIn?: boolean;
}) {
  const online = useOnlineStatus();
  return (
    <article className="rounded-xl border border-line bg-white p-4" aria-labelledby={`e-${e.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`e-${e.id}`} className="font-bold text-ink">{e.class.title}</h3>
          <p className="text-sm text-muted">
            {formatDate(e.date_wib)} · <span className="tabular">{e.start_wib}–{e.end_wib} WIB</span>
          </p>
          <p className="text-sm text-muted"><Meta icon={<MapPin className="size-3.5" />}>{e.location.name}</Meta></p>
          {e.status === 'ADMIN_CANCELLED' && e.cancellation_reason && (
            <p className="mt-1 text-sm text-danger">Reason: {e.cancellation_reason}</p>
          )}
        </div>
        <StatusBadge status={e.effective_status} />
      </div>
      {(e.can_check_in || e.can_cancel) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {e.can_check_in && onCheckIn && (
            <Button size="sm" onClick={() => onCheckIn(e)} loading={checkingIn} disabled={!online}>Check in now</Button>
          )}
          {e.can_cancel && onLeave && (
            <Button size="sm" variant="danger" onClick={() => onLeave(e)} disabled={!online}>Leave class</Button>
          )}
        </div>
      )}
    </article>
  );
}

function SessionCard({ s, onJoin, isAdmin }: { s: ClassSession; onJoin: (s: ClassSession) => void; isAdmin: boolean }) {
  const online = useOnlineStatus();
  const mine = s.my_enrolment;
  return (
    <article className="rounded-xl border border-line bg-white p-4" aria-labelledby={`s-${s.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`s-${s.id}`} className="font-bold text-ink">{s.class.title}</h3>
          <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted">
            <Meta icon={<Clock className="size-3.5" />}><span className="tabular">{s.start_wib}–{s.end_wib} WIB</span></Meta>
            <Meta icon={<MapPin className="size-3.5" />}>{s.location.name}</Meta>
            {s.class.instructor && <Meta icon={<UserRound className="size-3.5" />}>{s.class.instructor}</Meta>}
          </p>
          {s.class.description && <p className="mt-1 text-sm text-ink">{s.class.description}</p>}
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
          s.spots_left === 0 ? 'bg-booked-bg text-booked' : 'bg-available-bg text-available'}`}>
          <Users className="size-3.5" aria-hidden="true" />
          {s.spots_left === 0 ? 'Full' : `${s.spots_left} of ${s.capacity} left`}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {mine ? (
          <p className="text-sm font-semibold text-available">You&apos;re in this class · see My classes</p>
        ) : (
          <Button size="sm" onClick={() => onJoin(s)} disabled={!s.can_enrol || !online}>
            {s.spots_left === 0 ? 'Class full' : 'Join class'}
          </Button>
        )}
        {isAdmin && (
          <Link to={`/admin/classes/${s.class.id}`} className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-primary">
            <Settings2 className="size-4" aria-hidden="true" /> Manage
          </Link>
        )}
      </div>
    </article>
  );
}

function Schedule({ isAdmin }: { isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [toJoin, setToJoin] = useState<{ s: ClassSession; key: string } | null>(null);
  const sessions = useQuery({ queryKey: ['classes', 'sessions'], queryFn: () => api.classSessions(null, 14), refetchInterval: 30_000 });
  const join = useMutation({
    mutationFn: (j: { s: ClassSession; key: string }) => api.enrolClass(j.s.id, j.key),
    onSuccess: (e) => {
      setToJoin(null);
      void queryClient.invalidateQueries({ queryKey: ['classes'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({ tone: 'success', title: "You're in!", description: `${e.class.title} · check in from ${e.checkin_opens_wib} WIB.` });
    },
    onSettled: () => void sessions.refetch(),
  });

  if (sessions.isPending) return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}</div>;
  if (sessions.isError) return <ErrorState error={sessions.error} onRetry={() => void sessions.refetch()} />;
  if (!sessions.data.length) {
    return <EmptyState icon={<CalendarPlus className="size-8" />} title="No classes scheduled in the next two weeks."
      action={isAdmin ? <Link to="/admin/classes/new" className="font-semibold text-primary underline">Add a class</Link> : undefined} />;
  }

  const days = [...new Set(sessions.data.map((s) => s.date_wib))];
  const j = toJoin?.s;
  return (
    <div className="space-y-6">
      {days.map((d) => (
        <section key={d} aria-labelledby={`d-${d}`}>
          <h2 id={`d-${d}`} className="mb-2 font-bold">{formatDate(d)}</h2>
          <div className="space-y-3">
            {sessions.data.filter((s) => s.date_wib === d).map((s) => (
              <SessionCard key={s.id} s={s} isAdmin={isAdmin} onJoin={(x) => { join.reset(); setToJoin({ s: x, key: crypto.randomUUID() }); }} />
            ))}
          </div>
        </section>
      ))}
      <ConfirmDialog
        open={toJoin !== null}
        onOpenChange={(o) => { if (!o && !join.isPending) setToJoin(null); }}
        title="Join this class?"
        description={j ? `${j.class.title} · ${formatDate(j.date_wib)}, ${j.start_wib}–${j.end_wib} WIB · ${j.location.name}` : undefined}
        confirmLabel="Join class"
        cancelLabel="Not now"
        loading={join.isPending}
        error={join.isError ? errorMessage(join.error) : undefined}
        onConfirm={() => toJoin && join.mutate(toJoin)}
      >
        <p className="text-sm text-muted">Check in from 15 minutes before to 15 minutes after the start, or your place is released as a no-show. You can leave up to 30 minutes before the start.</p>
      </ConfirmDialog>
    </div>
  );
}

function MyClasses() {
  const actions = useClassActions();
  const upcoming = useMyUpcomingClasses();
  const history = useQuery({ queryKey: ['classes', 'mine', 'HISTORY'], queryFn: () => api.myClasses('HISTORY') });
  return (
    <div className="space-y-6">
      <section aria-labelledby="my-up-h">
        <h2 id="my-up-h" className="mb-2 font-bold">Upcoming</h2>
        {upcoming.isPending ? <Skeleton className="h-28" /> : upcoming.isError ? <ErrorState error={upcoming.error} onRetry={() => void upcoming.refetch()} />
          : upcoming.data.length === 0 ? <EmptyState icon={<CalendarPlus className="size-8" />} title="You haven't joined any upcoming classes." />
            : (
              <div className="space-y-3">
                {upcoming.data.map((e) => (
                  <EnrolmentCard key={e.id} e={e} onLeave={actions.requestLeave} onCheckIn={actions.checkIn} checkingIn={actions.checkingIn === e.id} />
                ))}
              </div>
            )}
      </section>
      <section aria-labelledby="my-hist-h">
        <h2 id="my-hist-h" className="mb-2 font-bold">History</h2>
        {history.isPending ? <Skeleton className="h-28" /> : history.isError ? <ErrorState error={history.error} />
          : history.data.length === 0 ? <EmptyState icon={<History className="size-8" />} title="Your past classes will appear here." />
            : <div className="space-y-3">{history.data.map((e) => <EnrolmentCard key={e.id} e={e} />)}</div>}
      </section>
      {actions.dialog}
    </div>
  );
}

/** Classes run by DCU (e.g. Yoga): schedule with free places, joining, and the user's own places (CR-03). */
export function ClassesPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'ADMIN';
  const upcoming = useMyUpcomingClasses();
  const checkInOpen = upcoming.data?.find((e) => e.can_check_in);
  return (
    <div>
      <PageHeader title="Classes" subtitle="Join a class run by DCU. Places are first come, first served."
        actions={isAdmin && (
          <Link to="/admin/classes/new" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-hover">
            <Plus className="size-5" aria-hidden="true" /> Add a class
          </Link>
        )} />
      {checkInOpen && (
        <div className="mb-4">
          <Banner tone="warning" title={`Check-in open: ${checkInOpen.class.title}`}>
            Check in under My classes before {checkInOpen.checkin_closes_wib} WIB.
          </Banner>
        </div>
      )}
      <Tabs.Root defaultValue={checkInOpen ? 'MINE' : 'SCHEDULE'}>
        <Tabs.List aria-label="Classes" className="mb-4 inline-flex rounded-xl bg-surface p-1">
          {([['SCHEDULE', 'Schedule'], ['MINE', 'My classes']] as const).map(([v, label]) => (
            <Tabs.Trigger key={v} value={v}
              className="min-h-10 rounded-lg px-4 font-semibold text-muted data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm">
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="SCHEDULE"><Schedule isAdmin={isAdmin} /></Tabs.Content>
        <Tabs.Content value="MINE"><MyClasses /></Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
