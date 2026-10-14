import { useState, type FormEvent } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDate, formatDateTimeWib } from '../../lib/time';
import type { AdminBooking } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';
import { ConfirmDialog, Modal } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { useFacilities } from '../booking/queries';
import { bookingTitle } from '../bookings/BookingCard';
import { ResponsiveTable } from './ResponsiveTable';

const STATUSES = ['CONFIRMED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'ADMIN_CANCELLED', 'NO_SHOW'];

/** S19 — booking management (FR-ADM-03/04). */
export function AdminBookingsPage() {
  const facilities = useFacilities();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState({ q: '', facility_code: '', status: '', date_from: '', date_to: '' });
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const [toCancel, setToCancel] = useState<AdminBooking | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const list = useInfiniteQuery({
    queryKey: ['admin', 'bookings', filters],
    queryFn: ({ pageParam }) => api.adminBookings(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });
  const detail = useQuery({ queryKey: ['admin', 'booking', detailId], queryFn: () => api.adminBooking(detailId!), enabled: Boolean(detailId) });
  const cancel = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.adminCancelBooking(id, reason),
    onSuccess: () => {
      setToCancel(null);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast({ tone: 'success', title: 'Booking cancelled', description: 'The owner has been notified.' });
    },
  });

  const apply = (e: FormEvent) => {
    e.preventDefault();
    const f: Record<string, unknown> = {};
    if (draft.q.trim()) f.q = draft.q.trim();
    if (draft.facility_code) f.facility_code = draft.facility_code;
    if (draft.status) f.status = [draft.status];
    if (draft.date_from) f.date_from = draft.date_from;
    if (draft.date_to) f.date_to = draft.date_to;
    setFilters(f);
  };

  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div>
      <PageHeader title="Bookings" />
      <form onSubmit={apply} className="mb-4 grid gap-3 rounded-xl border border-line bg-white p-4 md:grid-cols-6">
        <div className="md:col-span-2"><TextField label="Search" placeholder="Reference, name or email" value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} /></div>
        <SelectField label="Facility" value={draft.facility_code} onChange={(e) => setDraft({ ...draft, facility_code: e.target.value })}>
          <option value="">All</option>
          {facilities.data?.map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}
        </SelectField>
        <SelectField label="Status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
          <option value="">All</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ').toLowerCase()}</option>)}
        </SelectField>
        <TextField label="From" type="date" value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
        <TextField label="To" type="date" value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
        <div className="md:col-span-6 flex gap-2">
          <Button type="submit">Apply filters</Button>
          <Button type="button" variant="secondary" onClick={() => { setDraft({ q: '', facility_code: '', status: '', date_from: '', date_to: '' }); setFilters({}); }}>Reset</Button>
        </div>
      </form>

      {list.isPending ? <Skeleton className="h-64" /> : list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : rows.length === 0 ? (
        <EmptyState title="No bookings match these filters." />
      ) : (
        <>
          <ResponsiveTable caption="Bookings" rows={rows} rowKey={(b) => b.id}
            columns={[
              { header: 'Ref', cell: (b) => <span className="font-mono text-xs">{b.booking_ref}</span> },
              { header: 'Date', cell: (b) => formatDate(b.date_wib) },
              { header: 'Time', cell: (b) => <span className="tabular">{b.start_wib}–{b.end_wib}</span> },
              { header: 'Facility', cell: (b) => bookingTitle(b) },
              { header: 'Resource', cell: (b) => b.resource_name },
              { header: 'Owner', cell: (b) => <>{b.owner.full_name}<br /><span className="text-xs text-muted">{b.owner.email}</span></> },
              { header: 'Status', cell: (b) => <StatusBadge status={b.effective_status} /> },
            ]}
            actions={(b) => (
              <>
                <Button size="sm" variant="secondary" onClick={() => setDetailId(b.id)}>View</Button>
                {['UPCOMING', 'CANCEL_CLOSED', 'CHECKIN_OPEN', 'IN_PROGRESS'].includes(b.effective_status) && (
                  <Button size="sm" variant="danger" onClick={() => { cancel.reset(); setToCancel(b); }}>Cancel</Button>
                )}
              </>
            )} />
          {list.hasNextPage && <Button className="mt-3" variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Load more</Button>}
        </>
      )}

      <ConfirmDialog
        open={toCancel !== null}
        onOpenChange={(o) => { if (!o) setToCancel(null); }}
        title="Cancel this booking?"
        description={toCancel ? `${bookingTitle(toCancel)} · ${formatDate(toCancel.date_wib)} ${toCancel.start_wib}–${toCancel.end_wib} WIB · ${toCancel.owner.full_name}. The owner will be notified with your reason.` : undefined}
        confirmLabel="Cancel booking"
        cancelLabel="Keep booking"
        destructive
        requireReason
        loading={cancel.isPending}
        error={cancel.isError ? errorMessage(cancel.error) : undefined}
        onConfirm={(reason) => toCancel && cancel.mutate({ id: toCancel.id, reason })}
      />

      <Modal open={detailId !== null} onOpenChange={(o) => { if (!o) setDetailId(null); }} title="Booking details" wide>
        {detail.isPending ? <Skeleton className="h-40" /> : detail.isError ? <ErrorState error={detail.error} /> : (
          <div className="space-y-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted">Reference</dt><dd className="font-mono">{detail.data.booking_ref}</dd>
              <dt className="text-muted">Owner</dt><dd>{detail.data.owner.full_name} ({detail.data.owner.email})</dd>
              <dt className="text-muted">Facility</dt><dd>{bookingTitle(detail.data)} — {detail.data.resource_name}</dd>
              <dt className="text-muted">When</dt><dd>{formatDate(detail.data.date_wib)} {detail.data.start_wib}–{detail.data.end_wib} WIB</dd>
              <dt className="text-muted">Status</dt><dd><StatusBadge status={detail.data.effective_status} /></dd>
            </dl>
            <div>
              <h3 className="font-semibold">History</h3>
              <ol className="mt-1 space-y-1 text-sm">
                {detail.data.audit.map((a, i) => (
                  <li key={i}>{formatDateTimeWib(a.occurred_at)} · {a.actor_name} · {a.action.replaceAll('_', ' ').toLowerCase()}{a.reason ? ` — ${a.reason}` : ''}</li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
