import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/time';
import { ErrorState, PageHeader, Skeleton, StatusBadge } from '../../components/ui/Feedback';
import { TextField } from '../../components/ui/Field';
import { useAppConfig } from '../booking/queries';
import { bookingTitle } from '../bookings/BookingCard';
import { ResponsiveTable } from './ResponsiveTable';

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="text-2xl font-bold tabular">{value}</p>
    </div>
  );
}

/** S18 — admin dashboard (FR-ADM-01/02). */
export function AdminDashboardPage() {
  const config = useAppConfig();
  const [date, setDate] = useState<string | null>(null);
  const day = date ?? config.data?.today_wib ?? null;
  const metrics = useQuery({ queryKey: ['admin', 'dashboard', day], queryFn: () => api.dashboard(day!, day!), enabled: Boolean(day), refetchInterval: 60_000 });
  const upcoming = useQuery({
    queryKey: ['admin', 'bookings', 'today', day],
    queryFn: () => api.adminBookings({ date_from: day, date_to: day, status: ['CONFIRMED', 'CHECKED_IN'] }, null, 100),
    enabled: Boolean(day),
    refetchInterval: 60_000,
  });

  return (
    <div>
      <PageHeader title="Dashboard" subtitle={day ? formatDate(day) : undefined}
        actions={<div className="w-44"><TextField label="Date" type="date" value={day ?? ''} onChange={(e) => setDate(e.target.value || null)} /></div>} />
      {metrics.isPending ? <Skeleton className="h-40" /> : metrics.isError ? <ErrorState error={metrics.error} onRetry={() => void metrics.refetch()} /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Stat label="Bookings" value={metrics.data.bookings.total} />
            <Stat label="Upcoming" value={metrics.data.bookings.upcoming} />
            <Stat label="Checked in" value={metrics.data.bookings.checked_in} />
            <Stat label="Cancelled" value={metrics.data.bookings.cancelled + metrics.data.bookings.admin_cancelled} />
            <Stat label="No-show" value={metrics.data.bookings.no_show} />
            <Stat label="Active users" value={metrics.data.active_users} />
          </div>
          <section className="mt-6 rounded-xl border border-line bg-white p-4" aria-labelledby="util-h">
            <h2 id="util-h" className="text-lg font-bold">Utilization</h2>
            <p className="text-sm text-muted">Used minutes ÷ available minutes (operating hours minus blocked time). Reserved also counts no-shows.</p>
            <ul className="mt-4 space-y-3">
              {metrics.data.utilization.map((u) => (
                <li key={u.facility_code}>
                  <div className="flex justify-between text-sm">
                    <span className="font-semibold">{u.facility_name}</span>
                    <span className="tabular">{u.used_pct}% <span className="text-muted">(reserved {u.reserved_pct}%)</span></span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface" aria-hidden="true">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, u.used_pct)}%` }} />
                  </div>
                  <p className="sr-only">{u.facility_name}: {u.used_minutes} of {u.available_minutes} minutes used</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      <section className="mt-6" aria-labelledby="up-h">
        <h2 id="up-h" className="mb-2 text-lg font-bold">Active bookings on this day</h2>
        {upcoming.isPending ? <Skeleton className="h-32" /> : upcoming.isError ? <ErrorState error={upcoming.error} /> : upcoming.data.items.length === 0 ? (
          <p className="text-muted">No active bookings.</p>
        ) : (
          <ResponsiveTable caption="Active bookings" rows={[...upcoming.data.items].sort((a, b) => a.start_at.localeCompare(b.start_at))} rowKey={(b) => b.id}
            columns={[
              { header: 'Time', cell: (b) => <span className="tabular">{b.start_wib}–{b.end_wib}</span> },
              { header: 'Facility', cell: (b) => bookingTitle(b) },
              { header: 'Owner', cell: (b) => b.owner.full_name },
              { header: 'Status', cell: (b) => <StatusBadge status={b.effective_status} /> },
            ]} />
        )}
      </section>
    </div>
  );
}
