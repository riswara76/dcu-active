import { useState, type FormEvent } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDateTimeWib } from '../../lib/time';
import type { AuditItem } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';

const ACTIONS = ['BOOKING_ADMIN_CANCEL', 'BLOCK_CREATE', 'BLOCK_REMOVE', 'USER_DEACTIVATE', 'USER_ACTIVATE', 'ROLE_GRANT', 'ROLE_REVOKE',
  'SETTING_UPDATE', 'DOMAIN_ADD', 'DOMAIN_RENAME', 'DOMAIN_REMOVE', 'BOOKING_CREATE', 'BOOKING_CANCEL', 'BOOKING_CHECKIN', 'BOOKING_NO_SHOW', 'PROFILE_UPDATE'];

const human = (a: string) => a.replaceAll('_', ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function AuditRow({ item }: { item: AuditItem }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-xl border border-line bg-white p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p><strong>{human(item.action)}</strong> · {item.actor_name} <span className="text-muted">({item.actor_role.toLowerCase()})</span></p>
        <p className="text-muted">{formatDateTimeWib(item.occurred_at)}</p>
      </div>
      {item.reason && <p className="mt-1">Reason: {item.reason}</p>}
      <button type="button" className="mt-1 text-sm font-semibold text-primary underline" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? 'Hide details' : 'Show details'}
      </button>
      {open && (
        <pre className="mt-2 overflow-x-auto rounded-lg bg-surface p-2 text-xs">
          {JSON.stringify({ target: `${item.entity_type} ${item.entity_id}`, before: item.before, after: item.after }, null, 2)}
        </pre>
      )}
    </li>
  );
}

/** S28 — read-only audit log viewer (FR-ADM-10). */
export function AdminAuditPage() {
  const [draft, setDraft] = useState({ date_from: '', date_to: '', action: '' });
  const [filters, setFilters] = useState<Record<string, unknown>>({});
  const list = useInfiniteQuery({
    queryKey: ['admin', 'audit', filters],
    queryFn: ({ pageParam }) => api.auditLogs(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor,
  });
  const apply = (e: FormEvent) => {
    e.preventDefault();
    const f: Record<string, unknown> = {};
    if (draft.date_from) f.date_from = draft.date_from;
    if (draft.date_to) f.date_to = draft.date_to;
    if (draft.action) f.action = [draft.action];
    setFilters(f);
  };
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Every administrative change, with who, when and why. Entries cannot be edited." />
      <form onSubmit={apply} className="mb-4 grid gap-3 rounded-xl border border-line bg-white p-4 md:grid-cols-4">
        <TextField label="From" type="date" value={draft.date_from} onChange={(e) => setDraft({ ...draft, date_from: e.target.value })} />
        <TextField label="To" type="date" value={draft.date_to} onChange={(e) => setDraft({ ...draft, date_to: e.target.value })} />
        <SelectField label="Action" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })}>
          <option value="">All</option>
          {ACTIONS.map((a) => <option key={a} value={a}>{human(a)}</option>)}
        </SelectField>
        <div className="flex items-end"><Button type="submit">Apply</Button></div>
      </form>
      {list.isPending ? <Skeleton className="h-64" /> : list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : rows.length === 0 ? (
        <EmptyState title="No audit entries for these filters." />
      ) : (
        <>
          <ul className="space-y-2">{rows.map((r) => <AuditRow key={r.id} item={r} />)}</ul>
          {list.hasNextPage && <Button className="mt-3" variant="secondary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Load more</Button>}
        </>
      )}
    </div>
  );
}
