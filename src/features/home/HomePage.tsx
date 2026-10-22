import { Link } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../../auth/AuthProvider';
import { useOnlineStatus } from '../../lib/online';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { IosInstallHint } from '../../components/GlobalChrome';
import { useAppConfig, useFacilities, useUpcomingBookings } from '../booking/queries';
import { BookingCard, bookingTitle } from '../bookings/BookingCard';
import { useBookingActions } from '../bookings/useBookingActions';
import { EnrolmentCard, useClassActions, useMyUpcomingClasses } from '../classes/ClassesPage';

/** S7 — Home: check-in banner, next booking, facility tiles. */
export function HomePage() {
  const { profile } = useAuth();
  const online = useOnlineStatus();
  const config = useAppConfig();
  const facilities = useFacilities();
  const upcoming = useUpcomingBookings();
  const actions = useBookingActions();
  const classes = useMyUpcomingClasses();
  const classActions = useClassActions();
  const classCheckIn = classes.data?.find((e) => e.can_check_in);
  const nextClass = classes.data?.find((e) => e.id !== classCheckIn?.id);

  const items = upcoming.data?.items ?? [];
  const checkInNow = items.find((b) => b.can_check_in);
  const next = items.find((b) => b.id !== checkInNow?.id);
  const firstName = profile?.full_name.split(' ')[0];

  return (
    <div className="space-y-6">
      <IosInstallHint />
      <h1 className="text-2xl font-bold">Hi{firstName ? `, ${firstName}` : ''}</h1>

      {checkInNow && (
        <section aria-label="Check-in" className="rounded-xl border border-warning/30 bg-warning-bg p-4">
          <p className="flex items-center gap-2 font-bold text-warning"><AlertTriangle className="size-5" aria-hidden="true" />Check-in open</p>
          <p className="mt-1 text-ink">{bookingTitle(checkInNow)} · {checkInNow.start_wib}–{checkInNow.end_wib} WIB</p>
          <p className="text-sm text-warning">Closes {checkInNow.checkin_closes_wib} WIB</p>
          <Button className="mt-3" block onClick={() => actions.checkIn(checkInNow)} loading={actions.checkingIn === checkInNow.id} disabled={!online}>
            Check in now
          </Button>
        </section>
      )}

      <section aria-labelledby="next-h">
        <h2 id="next-h" className="mb-2 text-lg font-bold">Your next booking</h2>
        {upcoming.isPending ? <Skeleton className="h-28" />
          : upcoming.isError ? <ErrorState error={upcoming.error} onRetry={() => void upcoming.refetch()} />
            : next ? <BookingCard booking={next} onCancel={actions.requestCancel} onCheckIn={actions.checkIn} />
              : !checkInNow && <EmptyState title="No upcoming bookings. Pick a facility to get started." />}
      </section>

      {classCheckIn && (
        <section aria-label="Class check-in" className="rounded-xl border border-warning/30 bg-warning-bg p-4">
          <p className="flex items-center gap-2 font-bold text-warning"><AlertTriangle className="size-5" aria-hidden="true" />Class check-in open</p>
          <p className="mt-1 text-ink">{classCheckIn.class.title} · {classCheckIn.start_wib}–{classCheckIn.end_wib} WIB · {classCheckIn.location.name}</p>
          <p className="text-sm text-warning">Closes {classCheckIn.checkin_closes_wib} WIB</p>
          <Button className="mt-3" block onClick={() => classActions.checkIn(classCheckIn)} loading={classActions.checkingIn === classCheckIn.id} disabled={!online}>
            Check in to class
          </Button>
        </section>
      )}

      <section aria-labelledby="class-h">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 id="class-h" className="text-lg font-bold">Your next class</h2>
          <Link to="/classes" className="text-sm font-semibold text-primary">All classes</Link>
        </div>
        {classes.isPending ? <Skeleton className="h-24" />
          : classes.isError ? <ErrorState error={classes.error} onRetry={() => void classes.refetch()} />
            : nextClass ? <EnrolmentCard e={nextClass} onLeave={classActions.requestLeave} onCheckIn={classActions.checkIn} />
              : !classCheckIn && <EmptyState title="No upcoming classes. See what's on in Classes." />}
      </section>

      <section aria-labelledby="book-h">
        <h2 id="book-h" className="mb-2 text-lg font-bold">Book a facility</h2>
        {facilities.isPending ? <Skeleton className="h-32" /> : facilities.isError ? <ErrorState error={facilities.error} /> : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {facilities.data.map((f) => (
              <li key={f.code}>
                <Link to={`/facilities/${f.code}`} className="flex min-h-16 items-center justify-center rounded-xl border border-line bg-white px-3 py-3 text-center font-semibold hover:border-primary">
                  {f.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        {config.data && upcoming.data && (
          <p className="mt-3 text-sm text-muted">
            You have {items.length} of {config.data.max_active_bookings} upcoming bookings in use.
          </p>
        )}
      </section>
      {actions.dialog}
      {classActions.dialog}
    </div>
  );
}
