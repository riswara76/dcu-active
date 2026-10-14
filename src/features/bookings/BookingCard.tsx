import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import type { BookingView } from '../../lib/types';
import { formatDate } from '../../lib/time';
import { useOnlineStatus } from '../../lib/online';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/Feedback';

const POOLED = new Set(['AIR_HOCKEY', 'FOOSBALL']);

/** "Basketball / Futsal Court · Futsal", "Air Hockey · Air Hockey Table 2", "Tennis Court". */
export function bookingTitle(b: BookingView): string {
  if (b.facility.code === 'COURT') return `${b.facility.name} · ${b.activity.name}`;
  if (POOLED.has(b.facility.code) && b.resource_name) return `${b.facility.name} · ${b.resource_name}`;
  return b.facility.name;
}

interface Props {
  booking: BookingView;
  onCancel?: (b: BookingView) => void;
  onCheckIn?: (b: BookingView) => void;
  checkingIn?: boolean;
}

export function BookingCard({ booking: b, onCancel, onCheckIn, checkingIn }: Props) {
  const online = useOnlineStatus();
  return (
    <article className="rounded-xl border border-line bg-white p-4" aria-labelledby={`b-${b.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`b-${b.id}`} className="font-bold text-ink">{bookingTitle(b)}</h3>
          <p className="text-sm text-muted">
            {formatDate(b.date_wib)} · <span className="tabular">{b.start_wib}–{b.end_wib} WIB</span> · {b.duration_minutes} min
          </p>
          {b.status === 'ADMIN_CANCELLED' && b.cancellation_reason && (
            <p className="mt-1 text-sm text-danger">Reason: {b.cancellation_reason}</p>
          )}
        </div>
        <StatusBadge status={b.effective_status} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {b.can_check_in && onCheckIn && (
          <Button size="sm" onClick={() => onCheckIn(b)} loading={checkingIn} disabled={!online}>Check in now</Button>
        )}
        {b.can_cancel && onCancel && (
          <Button size="sm" variant="danger" onClick={() => onCancel(b)} disabled={!online}>Cancel</Button>
        )}
        <Link to={`/bookings/${b.id}`} className="ml-auto inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-primary">
          Details <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
