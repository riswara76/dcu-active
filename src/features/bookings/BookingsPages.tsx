import { Link, useLocation, useParams } from 'react-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Tabs } from 'radix-ui';
import { ArrowLeft, CalendarPlus, CheckCircle2, History } from 'lucide-react';
import { api } from '../../lib/api';
import type { BookingView } from '../../lib/types';
import { formatDate, formatDateTimeWib } from '../../lib/time';
import { useOnlineStatus } from '../../lib/online';
import { Button } from '../../components/ui/Button';
import { Banner, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '../../components/ui/Feedback';
import { BookingCard, bookingTitle } from './BookingCard';
import { useBookingActions } from './useBookingActions';

function BookingList({ scope }: { scope: 'UPCOMING' | 'HISTORY' }) {
  const actions = useBookingActions();
  const query = useInfiniteQuery({
    queryKey: ['my-bookings', scope, 'pages'],
    queryFn: ({ pageParam }) => api.myBookings(scope, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
    refetchInterval: scope === 'UPCOMING' ? 60_000 : false,
  });
  if (query.isPending) return <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28" />)}</div>;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const items = query.data.pages.flatMap((p) => p.items);
  if (!items.length) {
    return scope === 'UPCOMING'
      ? <EmptyState icon={<CalendarPlus className="size-8" />} title="No upcoming bookings."
          action={<Link to="/facilities" className="font-semibold text-primary underline">Find a time</Link>} />
      : <EmptyState icon={<History className="size-8" />} title="Your past bookings will appear here." />;
  }
  return (
    <div className="space-y-3">
      {items.map((b) => (
        <BookingCard key={b.id} booking={b} onCancel={actions.requestCancel} onCheckIn={actions.checkIn}
          checkingIn={actions.checkingIn === b.id} />
      ))}
      {query.hasNextPage && (
        <Button variant="secondary" block loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>Load more</Button>
      )}
      {actions.dialog}
    </div>
  );
}

/** S14/S16 — My bookings with Upcoming | History tabs. */
export function MyBookingsPage() {
  return (
    <div>
      <PageHeader title="My bookings" />
      <Tabs.Root defaultValue="UPCOMING">
        <Tabs.List aria-label="Bookings" className="mb-4 inline-flex rounded-xl bg-surface p-1">
          {(['UPCOMING', 'HISTORY'] as const).map((s) => (
            <Tabs.Trigger key={s} value={s}
              className="min-h-10 rounded-lg px-4 font-semibold text-muted data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-sm">
              {s === 'UPCOMING' ? 'Upcoming' : 'History'}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="UPCOMING"><BookingList scope="UPCOMING" /></Tabs.Content>
        <Tabs.Content value="HISTORY"><BookingList scope="HISTORY" /></Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function BookingDetails({ b }: { b: BookingView }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
      <dt className="text-muted">Reference</dt><dd className="font-mono font-semibold">{b.booking_ref}</dd>
      <dt className="text-muted">Facility</dt><dd className="font-semibold">{bookingTitle(b)}</dd>
      <dt className="text-muted">Date</dt><dd className="font-semibold">{formatDate(b.date_wib)}</dd>
      <dt className="text-muted">Time</dt><dd className="font-semibold tabular">{b.start_wib}–{b.end_wib} WIB</dd>
      <dt className="text-muted">Duration</dt><dd className="font-semibold">{b.duration_minutes} min</dd>
    </dl>
  );
}

/** S15 — booking detail with actions and timeline. */
export function BookingDetailPage() {
  const { id = '' } = useParams();
  const actions = useBookingActions();
  const online = useOnlineStatus();
  const query = useQuery({ queryKey: ['booking', id], queryFn: () => api.myBooking(id), refetchInterval: 60_000 });
  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const b = query.data;
  return (
    <div className="max-w-xl">
      <Link to="/bookings" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <ArrowLeft className="size-4" aria-hidden="true" /> My bookings
      </Link>
      <PageHeader title="Booking details" actions={<StatusBadge status={b.effective_status} />} />
      <Card><BookingDetails b={b} /></Card>
      <div className="mt-4 space-y-3">
        {b.status === 'CONFIRMED' && (
          <Banner>Check-in is open {b.checkin_opens_wib}–{b.checkin_closes_wib} WIB. Without check-in the booking is released as a no-show.</Banner>
        )}
        {b.status === 'CONFIRMED' && !b.can_cancel && b.effective_status !== 'NO_SHOW' && (
          <p className="text-sm text-muted">Cancellation closed at {b.cancel_until_wib} WIB.</p>
        )}
        {b.status === 'ADMIN_CANCELLED' && (
          <Banner tone="danger" title="Cancelled by DCU">{b.cancellation_reason}</Banner>
        )}
        <div className="flex flex-wrap gap-2">
          {b.can_check_in && <Button onClick={() => actions.checkIn(b)} loading={actions.checkingIn === b.id} disabled={!online}>Check in now</Button>}
          {b.can_cancel && <Button variant="danger" onClick={() => actions.requestCancel(b)} disabled={!online}>Cancel booking</Button>}
        </div>
        <section aria-labelledby="timeline-h">
          <h2 id="timeline-h" className="mb-2 mt-4 font-semibold">Timeline</h2>
          <ol className="space-y-1 text-sm text-muted">
            <li>Booked {formatDateTimeWib(b.created_at)}</li>
            {b.checked_in_at && <li>Checked in {formatDateTimeWib(b.checked_in_at)}</li>}
            {b.cancelled_at && <li>Cancelled {formatDateTimeWib(b.cancelled_at)}</li>}
          </ol>
        </section>
      </div>
      {actions.dialog}
    </div>
  );
}

/** S13 — booking confirmation. */
export function BookingConfirmedPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const fromState = (location.state as { booking?: BookingView } | null)?.booking;
  const query = useQuery({ queryKey: ['booking', id], queryFn: () => api.myBooking(id), initialData: fromState, enabled: !fromState });
  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError) return <ErrorState error={query.error} />;
  const b = query.data;
  return (
    <div className="mx-auto max-w-md text-center">
      <CheckCircle2 className="mx-auto size-14 text-success" aria-hidden="true" />
      <h1 className="mt-3 text-2xl font-bold">You&apos;re booked!</h1>
      <p className="mt-1 text-muted">Reference <span className="font-mono font-semibold text-ink">{b.booking_ref}</span></p>
      <Card className="mt-5 text-left"><BookingDetails b={b} /></Card>
      <p className="mt-4 font-semibold">Check-in opens {b.checkin_opens_wib} WIB</p>
      <p className="text-sm text-muted">You can cancel until {b.cancel_until_wib} WIB.</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link to="/bookings" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-hover">View my bookings</Link>
        <Link to="/facilities" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-line px-4 font-semibold hover:bg-surface">Book another</Link>
      </div>
    </div>
  );
}
