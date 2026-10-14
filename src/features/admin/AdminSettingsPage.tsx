import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs } from 'radix-ui';
import { api } from '../../lib/api';
import { errorMessage } from '../../lib/errors';
import { formatDateTimeWib } from '../../lib/time';
import type { DomainItem, SettingItem } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { Banner, Card, ErrorState, PageHeader, Skeleton } from '../../components/ui/Feedback';
import { TextField } from '../../components/ui/Field';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { ResponsiveTable } from './ResponsiveTable';

const LABELS: Record<string, { label: string; unit: string }> = {
  checkin_open_before_minutes: { label: 'Check-in opens before start', unit: 'min' },
  checkin_close_after_minutes: { label: 'Check-in closes after start', unit: 'min' },
  user_cancel_cutoff_minutes: { label: 'Cancellation allowed until … before start', unit: 'min' },
  booking_horizon_days: { label: 'Booking horizon', unit: 'days ahead' },
  max_active_bookings: { label: 'Max upcoming bookings per user', unit: '' },
  max_bookings_per_facility_per_day: { label: 'Max bookings per facility per day', unit: '' },
};

function BookingSettings() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: api.settings });
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);

  const editable = settings.data?.filter((s) => s.is_editable) ?? [];
  const readOnly = Object.fromEntries((settings.data ?? []).filter((s) => !s.is_editable).map((s) => [s.key, s.value]));
  const changes = editable
    .filter((s) => edits[s.key] !== undefined && edits[s.key] !== String(s.value))
    .map((s) => ({ s, value: Number(edits[s.key]) }));
  const invalid = (s: SettingItem) => {
    const raw = edits[s.key];
    if (raw === undefined) return undefined;
    const n = Number(raw);
    return raw === '' || !Number.isInteger(n) || n < (s.min_value ?? 0) || n > (s.max_value ?? 0)
      ? `Enter a whole number from ${s.min_value} to ${s.max_value}.` : undefined;
  };
  const anyInvalid = editable.some((s) => invalid(s));

  const save = useMutation({
    mutationFn: async (reason: string) => {
      for (const c of changes) await api.updateSetting(c.s.key, c.value, reason); // each change audited separately
    },
    onSuccess: () => {
      setConfirming(false);
      setEdits({});
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      void queryClient.invalidateQueries({ queryKey: ['config'] });
      toast({ tone: 'success', title: 'Settings saved', description: 'They apply to new actions immediately.' });
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] }),
  });

  if (settings.isPending) return <Skeleton className="h-64" />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  const last = [...settings.data].filter((s) => s.updated_by_name).sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];

  return (
    <Card>
      <div className="grid gap-4 md:grid-cols-2">
        {editable.map((s) => (
          <TextField key={s.key} type="number" inputMode="numeric" min={s.min_value ?? undefined} max={s.max_value ?? undefined}
            label={`${LABELS[s.key]?.label ?? s.key}${LABELS[s.key]?.unit ? ` (${LABELS[s.key].unit})` : ''}`}
            hint={`Allowed ${s.min_value}–${s.max_value}. Current: ${s.value}.`}
            value={edits[s.key] ?? String(s.value)}
            error={invalid(s)}
            onChange={(e) => setEdits({ ...edits, [s.key]: e.target.value })} />
        ))}
      </div>
      <p className="mt-4 text-sm text-muted">
        Read-only in V1: operating hours {String(readOnly.operating_open)}–{String(readOnly.operating_close)} WIB ·
        slot {String(readOnly.slot_minutes)} min · {String(readOnly.timezone)}.
      </p>
      {last && <p className="text-sm text-muted">Last changed {formatDateTimeWib(last.updated_at)} by {last.updated_by_name}.</p>}
      <div className="mt-4 flex gap-2">
        <Button disabled={!changes.length || anyInvalid} onClick={() => { save.reset(); setConfirming(true); }}>Save changes…</Button>
        {changes.length > 0 && <Button variant="secondary" onClick={() => setEdits({})}>Discard</Button>}
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Save these changes?"
        description="Changes apply immediately to new bookings, cancellations and check-ins. Existing bookings are not cancelled."
        confirmLabel="Save"
        cancelLabel="Back"
        requireReason
        loading={save.isPending}
        error={save.isError ? errorMessage(save.error) : undefined}
        onConfirm={(reason) => save.mutate(reason)}
      >
        <ul className="list-disc pl-5 text-sm">
          {changes.map((c) => <li key={c.s.key}>{LABELS[c.s.key]?.label ?? c.s.key}: {String(c.s.value)} → <strong>{c.value}</strong></li>)}
        </ul>
      </ConfirmDialog>
    </Card>
  );
}

type DomainAction = { kind: 'add'; domain: string } | { kind: 'rename'; item: DomainItem } | { kind: 'remove'; item: DomainItem } | null;

function EmailDomains() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showRemoved, setShowRemoved] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const [action, setAction] = useState<DomainAction>(null);
  const domains = useQuery({ queryKey: ['admin', 'domains', showRemoved], queryFn: () => api.domains(showRemoved) });
  const activeCount = domains.data?.filter((d) => !d.removed_at).length ?? 0;
  const valid = (d: string) => /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d.trim().toLowerCase());

  const run = useMutation({
    mutationFn: async (reason: string) => {
      if (!action) return;
      if (action.kind === 'add') return api.addDomain(action.domain, reason);
      if (action.kind === 'rename') return api.renameDomain(action.item.id, renameTo, reason);
      return api.removeDomain(action.item.id, reason);
    },
    onSuccess: () => {
      const kind = action?.kind;
      setAction(null);
      setNewDomain('');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'domains'] });
      void queryClient.invalidateQueries({ queryKey: ['registration-domains'] });
      toast({ tone: 'success', title: kind === 'add' ? 'Domain added' : kind === 'rename' ? 'Domain renamed' : 'Domain removed' });
    },
  });

  return (
    <Card>
      <Banner>Only these domains can register. Removing a domain does not affect people who already registered.</Banner>
      {domains.isPending ? <Skeleton className="mt-4 h-40" /> : domains.isError ? <ErrorState error={domains.error} /> : (
        <div className="mt-4">
          <ResponsiveTable caption="Allowed email domains" rows={domains.data} rowKey={(d) => d.id}
            columns={[
              { header: 'Domain', cell: (d) => <span className={d.removed_at ? 'text-muted line-through' : 'font-semibold'}>@{d.domain}</span> },
              { header: 'Users', cell: (d) => d.user_count },
              { header: 'Added', cell: (d) => `${formatDateTimeWib(d.added_at).split(',')[0]} · ${d.added_by_name}` },
              { header: 'Removed', cell: (d) => d.removed_at ? `${formatDateTimeWib(d.removed_at).split(',')[0]} · ${d.removed_by_name}` : '—' },
            ]}
            actions={(d) => !d.removed_at && (
              <>
                <Button size="sm" variant="secondary" onClick={() => { run.reset(); setRenameTo(d.domain); setAction({ kind: 'rename', item: d }); }}>Rename</Button>
                <Button size="sm" variant="danger" disabled={activeCount <= 1}
                  title={activeCount <= 1 ? 'At least one allowed domain is required' : undefined}
                  onClick={() => { run.reset(); setAction({ kind: 'remove', item: d }); }}>Remove</Button>
              </>
            )} />
        </div>
      )}
      <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (valid(newDomain)) { run.reset(); setAction({ kind: 'add', domain: newDomain.trim().toLowerCase() }); } }}>
        <div className="min-w-56 flex-1">
          <TextField label="New domain" placeholder="example.co.id" value={newDomain} onChange={(e) => setNewDomain(e.target.value)}
            error={newDomain && !valid(newDomain) ? 'Enter a domain such as example.co.id (without @).' : undefined} />
        </div>
        <Button type="submit" disabled={!valid(newDomain)}>Add domain…</Button>
      </form>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} /> Show removed domains
      </label>
      <ConfirmDialog
        open={action !== null}
        onOpenChange={(o) => { if (!o) setAction(null); }}
        title={action?.kind === 'add' ? `Allow @${action.domain}?` : action?.kind === 'rename' ? `Rename @${action.item.domain}` : action ? `Remove @${action.item.domain}?` : ''}
        description={action?.kind === 'remove' ? 'New registrations from this domain will be refused. Existing users keep their access.' : action?.kind === 'add' ? 'People with this email domain will be able to register immediately.' : undefined}
        confirmLabel={action?.kind === 'add' ? 'Add domain' : action?.kind === 'rename' ? 'Rename' : 'Remove domain'}
        cancelLabel="Back"
        destructive={action?.kind === 'remove'}
        requireReason
        loading={run.isPending}
        error={run.isError ? errorMessage(run.error) : undefined}
        onConfirm={(reason) => { if (action?.kind !== 'rename' || valid(renameTo)) run.mutate(reason); }}
      >
        {action?.kind === 'rename' && (
          <TextField label="New name" value={renameTo} onChange={(e) => setRenameTo(e.target.value)}
            error={!valid(renameTo) ? 'Enter a domain such as example.co.id (without @).' : undefined} />
        )}
      </ConfirmDialog>
    </Card>
  );
}

/** S27 — settings (FR-ADM-13) and allowed email domains (FR-ADM-12). */
export function AdminSettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" />
      <Tabs.Root defaultValue="booking">
        <Tabs.List aria-label="Settings" className="mb-4 inline-flex rounded-xl bg-white p-1 shadow-sm">
          <Tabs.Trigger value="booking" className="min-h-10 rounded-lg px-4 font-semibold text-muted data-[state=active]:bg-primary data-[state=active]:text-white">Booking settings</Tabs.Trigger>
          <Tabs.Trigger value="domains" className="min-h-10 rounded-lg px-4 font-semibold text-muted data-[state=active]:bg-primary data-[state=active]:text-white">Email domains</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="booking"><BookingSettings /></Tabs.Content>
        <Tabs.Content value="domains"><EmailDomains /></Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
