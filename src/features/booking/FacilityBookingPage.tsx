import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Info, Radio } from 'lucide-react';
import { api } from '../../lib/api';
import { ApiError, errorMessage } from '../../lib/errors';
import { useAvailabilitySignal } from '../../lib/realtime';
import { useOnlineStatus } from '../../lib/online';
import { setReviewOpen } from '../../lib/ui-state';
import { addMinutesToTime, bookableDates, formatDate } from '../../lib/time';
import type { Facility, Slot } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { Banner, ErrorState, Skeleton } from '../../components/ui/Feedback';
import { Modal } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { NotFoundPage } from '../../pages/NotFoundPage';
import { useAppConfig, useFacilities } from './queries';
import { DateStrip } from './DateStrip';
import { SlotGrid } from './SlotGrid';
import { DurationChips } from './DurationChips';

/** S9–S12: facility details + date strip + slot grid + duration (one screen) and the review sheet. */
export function FacilityBookingPage() {
  const { code = '' } = useParams();
  const facilities = useFacilities();
  const config = useAppConfig();

  if (facilities.isPending || config.isPending) return <BookingSkeleton />;
  if (facilities.isError) return <ErrorState error={facilities.error} onRetry={() => void facilities.refetch()} />;
  if (config.isError) return <ErrorState error={config.error} onRetry={() => void config.refetch()} />;
  const facility = facilities.data.find((f) => f.code === code.toUpperCase());
  if (!facility) return <NotFoundPage />;
  return <BookingScreen key={facility.code} facility={facility} todayWib={config.data.today_wib}
    horizon={config.data.booking_horizon_days} cutoff={config.data.user_cancel_cutoff_minutes}
    checkinBefore={config.data.checkin_open_before_minutes} checkinAfter={config.data.checkin_close_after_minutes} />;
}

function BookingSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-16" />
      <Skeleton className="h-64" />
    </div>
  );
}

interface ScreenProps {
  facility: Facility;
  todayWib: string;
  horizon: number;
  cutoff: number;
  checkinBefore: number;
  checkinAfter: number;
}

function BookingScreen({ facility, todayWib, horizon, cutoff, checkinBefore, checkinAfter }: ScreenProps) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const online = useOnlineStatus();
  const [params] = useSearchParams();

  const multiActivity = facility.activities.length > 1;
  const initialActivity = facility.activities.find((a) => a.code === params.get('activity'))?.code
    ?? (multiActivity ? null : facility.activities[0]?.code ?? null);
  const [activity, setActivity] = useState<string | null>(initialActivity);
  const dates = bookableDates(todayWib, horizon);
  const [date, setDate] = useState(todayWib);
  const [selected, setSelected] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [reviewKey, setReviewKey] = useState<string | null>(null); // idempotency key while the review is open
  const [reviewError, setReviewError] = useState<unknown>(null);
  const [startsSoon, setStartsSoon] = useState(false); // computed when the review opens (event time, not render time)

  const availabilityKey = ['availability', facility.code, date] as const;
  const { live } = useAvailabilitySignal(facility.code, (p) => {
    void queryClient.invalidateQueries({ queryKey: ['availability', facility.code, p.date_wib] });
  });
  const availability = useQuery({
    queryKey: availabilityKey,
    queryFn: () => api.availability(facility.code, date),
    staleTime: 15_000,
    refetchInterval: live ? false : 30_000, // polling fallback when Realtime is unavailable (TR-RT-05)
  });

  const slots = availability.data?.slots ?? [];
  const slot: Slot | undefined = slots.find((s) => s.start_wib === selected);
  const selectionValid = slot?.state === 'AVAILABLE';
  const lostSelection = Boolean(selected) && availability.isSuccess && !selectionValid;
  const bookable = selectionValid ? slot.bookable_durations : [];
  const effectiveDuration = duration && bookable.includes(duration) ? duration : bookable[0] ?? null;
  const canReview = Boolean(activity && selectionValid && effectiveDuration && online);

  const create = useMutation({
    mutationFn: () => api.createBooking({
      facility: facility.code, activity: activity!, date, start: selected!, duration: effectiveDuration!, key: reviewKey!,
    }),
    onSuccess: (booking) => {
      closeReview();
      void queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      void queryClient.invalidateQueries({ queryKey: ['availability', facility.code] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      navigate(`/bookings/${booking.id}/confirmed`, { state: { booking } });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'SLOT_UNAVAILABLE') {
        closeReview();
        setSelected(null);
        toast({ tone: 'error', title: 'That time was just booked', description: 'Please choose another time.' });
        void availability.refetch();
        return;
      }
      setReviewError(error);
    },
  });

  function openReview() {
    setReviewError(null);
    setReviewKey(crypto.randomUUID());
    setStartsSoon(slot ? Date.parse(slot.start_at) - Date.now() < cutoff * 60_000 : false);
    setReviewOpen(true);
    void availability.refetch(); // always re-check just before confirming
  }
  function closeReview() {
    setReviewKey(null);
    setReviewOpen(false);
  }

  const activityName = facility.activities.find((a) => a.code === activity)?.name;
  const end = selected && effectiveDuration ? addMinutesToTime(selected, effectiveDuration) : null;
  const cancelUntil = selected ? addMinutesToTime(selected, -cutoff) : null;

  return (
    <div>
      <Link to="/facilities" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <ArrowLeft className="size-4" aria-hidden="true" /> All facilities
      </Link>
      <h1 className="text-2xl font-bold">{facility.name}</h1>
      <p className="mt-1 text-muted">
        {facility.allowed_durations.join(' · ')} min
        {facility.allocation_mode === 'AUTO_POOL' && ` · ${facility.resource_count} tables, we pick a free one for you`}
      </p>

      {multiActivity && (
        <fieldset className="mt-5">
          <legend className="mb-2 font-semibold">Activity</legend>
          <div role="radiogroup" aria-label="Activity" className="flex flex-wrap gap-2">
            {facility.activities.map((a) => (
              <button key={a.code} type="button" role="radio" aria-checked={activity === a.code}
                onClick={() => setActivity(a.code)}
                className={`min-h-11 rounded-full border px-5 font-semibold ${activity === a.code ? 'border-primary bg-primary text-white' : 'border-line bg-white hover:bg-surface'}`}>
                {a.name}
              </button>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">Basketball and Futsal share the same court.</p>
        </fieldset>
      )}

      <section className="mt-5" aria-labelledby="date-h">
        <h2 id="date-h" className="mb-2 font-semibold">Date</h2>
        <DateStrip dates={dates} todayWib={todayWib} value={date} onChange={(d) => { setDate(d); setSelected(null); }} />
      </section>

      <section className="mt-5" aria-labelledby="time-h">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="time-h" className="font-semibold">Time (WIB) · {formatDate(date)}</h2>
          <div className="flex items-center gap-3 text-sm">
            <span className={`inline-flex items-center gap-1 ${live ? 'text-available' : 'text-muted'}`}>
              <Radio className="size-4" aria-hidden="true" />{live ? 'Live' : 'Refreshing every 30 s'}
            </span>
            {date === todayWib && (
              <button type="button" className="font-semibold text-primary underline" onClick={() => setShowPast((v) => !v)}>
                {showPast ? 'Hide earlier times' : 'Show earlier times'}
              </button>
            )}
          </div>
        </div>
        {availability.isPending ? (
          <Skeleton className="h-64" />
        ) : availability.isError ? (
          <ErrorState error={availability.error} onRetry={() => void availability.refetch()} />
        ) : slots.every((s) => s.state === 'PAST') && !showPast ? (
          <Banner title="No more times today">Choose another date.</Banner>
        ) : (
          <SlotGrid slots={slots} totalResources={availability.data.total_resources} selected={selected}
            onSelect={(s) => { setSelected(s); setDuration(null); }} showPast={showPast} />
        )}
        {lostSelection && (
          <div className="mt-3"><Banner tone="warning" title="That time was just booked">Please choose another time.</Banner></div>
        )}
      </section>

      {facility.allowed_durations.length > 1 && selectionValid && (
        <section className="mt-5" aria-labelledby="dur-h">
          <h2 id="dur-h" className="mb-2 font-semibold">Duration</h2>
          <DurationChips allowed={facility.allowed_durations} bookable={bookable} value={effectiveDuration} onChange={setDuration} />
        </section>
      )}

      {/* Sticky action bar (thumb zone on mobile, TR-RWD-04) */}
      <div className="fixed inset-x-0 bottom-14 z-10 border-t border-line bg-white/95 px-4 py-3 backdrop-blur md:static md:mt-6 md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <p className="text-sm text-muted" aria-live="polite">
            {!activity && multiActivity ? 'Choose an activity'
              : selectionValid && end ? <><strong className="text-ink tabular">{selected}–{end} WIB</strong> · {effectiveDuration} min</>
                : 'Choose a time'}
          </p>
          <Button onClick={openReview} disabled={!canReview}>Review booking</Button>
        </div>
      </div>

      <Modal
        variant="sheet"
        open={reviewKey !== null}
        onOpenChange={(open) => { if (!open && !create.isPending) closeReview(); }}
        title="Review your booking"
        footer={
          <Button block loading={create.isPending} disabled={!online || !selectionValid} onClick={() => create.mutate()}>
            Confirm booking
          </Button>
        }
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          <dt className="text-muted">Facility</dt><dd className="font-semibold">{facility.name}</dd>
          <dt className="text-muted">Activity</dt><dd className="font-semibold">{activityName}</dd>
          <dt className="text-muted">Date</dt><dd className="font-semibold">{formatDate(date)}</dd>
          <dt className="text-muted">Time</dt><dd className="font-semibold tabular">{selected}–{end} WIB</dd>
          <dt className="text-muted">Duration</dt><dd className="font-semibold">{effectiveDuration} min</dd>
        </dl>
        <div className="mt-4 space-y-2 text-sm">
          {selected && (
            <p className="flex gap-2 text-muted"><Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Check in {addMinutesToTime(selected, -checkinBefore)}–{addMinutesToTime(selected, checkinAfter)} WIB, or the booking is released as a no-show.</p>
          )}
          {startsSoon ? (
            <Banner tone="warning">This booking can&apos;t be cancelled because it starts in less than {cutoff} minutes.</Banner>
          ) : (
            <p className="flex gap-2 text-muted"><Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              You can cancel until {cancelUntil} WIB.</p>
          )}
        </div>
        {!selectionValid && <div className="mt-3"><Banner tone="warning" title="That time is no longer available" /></div>}
        {reviewError != null && <p role="alert" className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{errorMessage(reviewError)}</p>}
      </Modal>
    </div>
  );
}
