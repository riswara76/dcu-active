import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { ApiError, errorMessage } from '../../lib/errors';
import { halfHourTimes, wibInstant } from '../../lib/time';
import type { BlockItem, BlockPreview } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { Banner, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { useAppConfig, useFacilities } from '../booking/queries';
import { ResponsiveTable } from './ResponsiveTable';

const CATEGORIES = [
  { value: 'MAINTENANCE', label: 'Maintenance' },
  { value: 'EVENT', label: 'Event' },
  { value: 'OPERATIONAL', label: 'Operational restriction' },
  { value: 'OTHER', label: 'Other' },
];
// Class blocks are created from the Classes screen; shown here read-only.
const LABELS: Record<string, string> = { ...Object.fromEntries(CATEGORIES.map((c) => [c.value, c.label])), CLASS: 'Class' };
const RESOURCES: Record<string, { code: string; name: string }[]> = {
  AIR_HOCKEY: [{ code: 'AIR_HOCKEY_1', name: 'Air Hockey Table 1' }, { code: 'AIR_HOCKEY_2', name: 'Air Hockey Table 2' }],
  FOOSBALL: [{ code: 'FOOSBALL_1', name: 'Foosball Table 1' }, { code: 'FOOSBALL_2', name: 'Foosball Table 2' }],
};

/** S20 — facility blocking with conflict review (FR-ADM-05/06/07). */
export function AdminBlocksPage() {
  const facilities = useFacilities();
  const config = useAppConfig();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showRemoved, setShowRemoved] = useState(false);
  const [form, setForm] = useState({ facility: '', resource: '', startDate: '', startTime: '08:00', endDate: '', endTime: '12:00', category: 'MAINTENANCE', reason: '' });
  const [preview, setPreview] = useState<BlockPreview | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<BlockItem | null>(null);

  const blocks = useQuery({ queryKey: ['admin', 'blocks', showRemoved], queryFn: () => api.blocks({ include_removed: showRemoved }) });
  const startTimes = halfHourTimes(config.data?.operating_open, config.data?.operating_close);
  const endTimes = [...startTimes.slice(1), config.data?.operating_close ?? '21:00'];
  const target = () => ({
    facility: form.facility,
    resource: form.resource || null,
    start: wibInstant(form.startDate, form.startTime),
    end: wibInstant(form.endDate || form.startDate, form.endTime),
  });

  const check = useMutation({
    mutationFn: () => api.previewBlock(target()),
    onSuccess: (p) => { setPreview(p); setUnderstood(false); setFormError(null); },
    onError: (e) => setFormError(errorMessage(e)),
  });
  const create = useMutation({
    mutationFn: () => api.createBlock({ ...target(), category: form.category, reason: form.reason.trim(), confirm: true,
      expected: preview?.conflicts.map((c) => c.booking_id) ?? [] }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      toast({ tone: 'success', title: 'Block created', description: r.cancelled_booking_ids.length ? `${r.cancelled_booking_ids.length} booking(s) cancelled and owners notified.` : undefined });
      setPreview(null);
      setForm((f) => ({ ...f, reason: '' }));
    },
    onError: (e) => {
      if (e instanceof ApiError && (e.code === 'BLOCK_CONFLICTS_CHANGED' || e.code === 'ADMIN_BLOCK_CONFLICT')) {
        setFormError(errorMessage(e));
        check.mutate(); // refresh the conflict list
        return;
      }
      setFormError(errorMessage(e));
    },
  });
  const remove = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.removeBlock(id, reason),
    onSuccess: () => {
      setToRemove(null);
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast({ tone: 'success', title: 'Block removed', description: 'Slots are available again. Cancelled bookings are not restored.' });
    },
  });

  const submitCheck = (e: FormEvent) => {
    e.preventDefault();
    if (!form.facility || !form.startDate || form.reason.trim().length < 5) {
      setFormError('Choose a facility and start date, and enter a reason (at least 5 characters).');
      return;
    }
    check.mutate();
  };
  const conflicts = preview?.conflicts ?? [];

  return (
    <div>
      <PageHeader title="Facility blocks" subtitle="Close a facility or a single table for maintenance, events or other reasons." />
      <Card>
        <h2 className="mb-3 text-lg font-bold">New block</h2>
        <form onSubmit={submitCheck} className="grid gap-3 md:grid-cols-4" noValidate>
          <SelectField label="Facility" value={form.facility} onChange={(e) => { setForm({ ...form, facility: e.target.value, resource: '' }); setPreview(null); }}>
            <option value="">Choose…</option>
            {facilities.data?.map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}
          </SelectField>
          <SelectField label="Table / court" value={form.resource} onChange={(e) => { setForm({ ...form, resource: e.target.value }); setPreview(null); }}
            disabled={!RESOURCES[form.facility]}>
            <option value="">Whole facility</option>
            {RESOURCES[form.facility]?.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
          </SelectField>
          <SelectField label="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </SelectField>
          <div className="hidden md:block" />
          <TextField label="Start date" type="date" value={form.startDate} min={config.data?.today_wib}
            onChange={(e) => { setForm({ ...form, startDate: e.target.value }); setPreview(null); }} />
          <SelectField label="Start time (WIB)" value={form.startTime} onChange={(e) => { setForm({ ...form, startTime: e.target.value }); setPreview(null); }}>
            {startTimes.map((t) => <option key={t} value={t}>{t}</option>)}
          </SelectField>
          <TextField label="End date" type="date" value={form.endDate || form.startDate} min={form.startDate}
            onChange={(e) => { setForm({ ...form, endDate: e.target.value }); setPreview(null); }} />
          <SelectField label="End time (WIB)" value={form.endTime} onChange={(e) => { setForm({ ...form, endTime: e.target.value }); setPreview(null); }}>
            {endTimes.map((t) => <option key={t} value={t}>{t}</option>)}
          </SelectField>
          <div className="md:col-span-4">
            <TextAreaField label="Reason (shown to admins; users only see the category)" value={form.reason} maxLength={500}
              onChange={(e) => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="md:col-span-4"><Button type="submit" variant="secondary" loading={check.isPending}>Check impact</Button></div>
        </form>

        {formError && <p role="alert" className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{formError}</p>}

        {preview && (
          <div className="mt-4 space-y-3" aria-live="polite">
            <Banner tone={conflicts.length ? 'warning' : 'success'} title={preview.summary} />
            {conflicts.length > 0 && (
              <>
                <ResponsiveTable caption="Bookings that will be cancelled" rows={conflicts} rowKey={(c) => c.booking_id}
                  columns={[
                    { header: 'Ref', cell: (c) => <span className="font-mono text-xs">{c.booking_ref}</span> },
                    { header: 'When', cell: (c) => `${c.date_wib} ${c.start_wib}–${c.end_wib}` },
                    { header: 'Resource', cell: (c) => c.resource_name },
                    { header: 'Owner', cell: (c) => `${c.owner_name} (${c.owner_email})` },
                  ]} />
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1 size-5 accent-[var(--color-primary)]" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                  <span>I understand these {conflicts.length} booking(s) will be cancelled and the owners notified.</span>
                </label>
              </>
            )}
            <Button loading={create.isPending} disabled={conflicts.length > 0 && !understood} onClick={() => create.mutate()}>Create block</Button>
          </div>
        )}
      </Card>

      <div className="mb-3 mt-8 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Blocks</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} /> Show removed
        </label>
      </div>
      {blocks.isPending ? <Skeleton className="h-40" /> : blocks.isError ? <ErrorState error={blocks.error} /> : blocks.data.items.length === 0 ? (
        <EmptyState title="No blocks." />
      ) : (
        <ResponsiveTable caption="Facility blocks" rows={blocks.data.items} rowKey={(b) => b.id}
          columns={[
            { header: 'Facility', cell: (b) => `${b.facility_name} · ${b.resource_name}` },
            { header: 'From', cell: (b) => b.start_wib },
            { header: 'To', cell: (b) => b.end_wib },
            { header: 'Category', cell: (b) => LABELS[b.category] },
            { header: 'Reason', cell: (b) => b.reason },
            { header: 'By', cell: (b) => b.removed_at ? <span className="text-muted">Removed by {b.removed_by_name}</span> : b.created_by_name },
          ]}
          actions={(b) => !b.removed_at && (b.category === 'CLASS'
            ? <span className="text-sm text-muted">Managed in Classes</span>
            : <Button size="sm" variant="danger" onClick={() => { remove.reset(); setToRemove(b); }}>Remove</Button>)} />
      )}

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(o) => { if (!o) setToRemove(null); }}
        title="Remove this block?"
        description="The slots become bookable again. Bookings that were cancelled by this block are not restored."
        confirmLabel="Remove block"
        cancelLabel="Keep block"
        destructive
        requireReason
        loading={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : undefined}
        onConfirm={(reason) => toRemove && remove.mutate({ id: toRemove.id, reason })}
      />
    </div>
  );
}
