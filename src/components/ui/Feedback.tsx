import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, Clock, Info, Loader2, XCircle } from 'lucide-react';
import type { EffectiveStatus } from '../../lib/types';
import { errorMessage } from '../../lib/errors';
import { Button } from './Button';

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-10 text-muted" role="status">
      <Loader2 className="size-6 animate-spin" aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-surface ${className}`} aria-hidden="true" />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, action }: { icon?: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center text-subtle" aria-hidden="true">
        {icon ?? <Info className="size-8" />}
      </div>
      <p className="text-muted">{title}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-danger-bg bg-danger-bg/40 px-5 py-6 text-center" role="alert">
      <AlertTriangle className="mx-auto mb-2 size-7 text-danger" aria-hidden="true" />
      <p className="font-medium text-ink">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>Try again</Button>
      )}
    </div>
  );
}

type Tone = 'info' | 'warning' | 'danger' | 'success';
const TONES: Record<Tone, string> = {
  info: 'bg-surface text-ink border-line',
  warning: 'bg-warning-bg text-warning border-warning/30',
  danger: 'bg-danger-bg text-danger border-danger/30',
  success: 'bg-available-bg text-available border-available/30',
};

export function Banner({ tone = 'info', title, children, icon }: { tone?: Tone; title?: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className={`flex gap-3 rounded-xl border px-4 py-3 ${TONES[tone]}`}>
      <div className="mt-0.5 shrink-0" aria-hidden="true">{icon ?? <Info className="size-5" />}</div>
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-sm">{children}</div>}
      </div>
    </div>
  );
}

const STATUS: Record<EffectiveStatus, { label: string; cls: string; icon: ReactNode }> = {
  UPCOMING: { label: 'Upcoming', cls: 'bg-surface text-ink', icon: <Clock className="size-3.5" /> },
  CANCEL_CLOSED: { label: 'Upcoming', cls: 'bg-surface text-ink', icon: <Clock className="size-3.5" /> },
  CHECKIN_OPEN: { label: 'Check-in open', cls: 'bg-warning-bg text-warning', icon: <AlertTriangle className="size-3.5" /> },
  IN_PROGRESS: { label: 'Checked in', cls: 'bg-available-bg text-available', icon: <CheckCircle2 className="size-3.5" /> },
  COMPLETED: { label: 'Completed', cls: 'bg-available-bg text-available', icon: <CheckCircle2 className="size-3.5" /> },
  CANCELLED: { label: 'Cancelled', cls: 'bg-booked-bg text-booked', icon: <XCircle className="size-3.5" /> },
  ADMIN_CANCELLED: { label: 'Cancelled by DCU', cls: 'bg-danger-bg text-danger', icon: <XCircle className="size-3.5" /> },
  NO_SHOW: { label: 'No-show', cls: 'bg-booked-bg text-booked', icon: <CircleSlash className="size-3.5" /> },
};

export function StatusBadge({ status }: { status: EffectiveStatus }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>
      <span aria-hidden="true">{s.icon}</span>
      {s.label}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-line bg-white p-4 ${className}`}>{children}</div>;
}
