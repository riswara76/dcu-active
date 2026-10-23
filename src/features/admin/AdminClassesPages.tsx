import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { ApiError, errorMessage } from '../../lib/errors';
import { addDays, formatDate, formatDateTimeWib, halfHourTimes } from '../../lib/time';
import type { AdminClassDetail, AdminClassSession, ClassPreview, ClassSchedule } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog, Modal } from '../../components/ui/Dialog';
import { Banner, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '../../components/ui/Feedback';
import { SelectField, TextAreaField, TextField } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { useAppConfig, useFacilities } from '../booking/queries';
import { ResponsiveTable } from './ResponsiveTable';

const WEEKDAYS = [
  { iso: 1, label: 'Mon' }, { iso: 2, label: 'Tue' }, { iso: 3, label: 'Wed' }, { iso: 4, label: 'Thu' },
  { iso: 5, label: 'Fri' }, { iso: 6, label: 'Sat' }, { iso: 7, label: 'Sun' },
];
const DURATIONS = [30, 60, 90, 120, 150, 180, 210, 240];

interface ScheduleForm { startDate: string; startTime: string; duration: number; repeat: boolean; weekdays: number[]; weeks: number }

const emptySchedule = (): ScheduleForm => ({ startDate: '', startTime: '18:00', duration: 60, repeat: false, weekdays: [], weeks: 8 });
const SCHEDULE_DAYS = 90; // first session can be chosen up to 90 days ahead
const WEEK_OPTIONS = Array.from({ length: 26 }, (_, i) => i + 1);

export function toSchedule(f: ScheduleForm): ClassSchedule {
  return {
    start_date: f.startDate, start_time: f.startTime, duration_minutes: f.duration,
    repeat_weekdays: f.repeat ? [...f.weekdays].sort((a, b) => a - b) : [],
    until_date: f.repeat && f.startDate ? addDays(f.startDate, f.weeks * 7 - 1) : null,
  };
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1;
}

function ScheduleFields({ value, onChange }: { value: ScheduleForm; onChange: (v: ScheduleForm) => void }) {
  const config = useAppConfig();
  const times = halfHourTimes(config.data?.operating_open, config.data?.operating_close);
  const set = (patch: Partial<ScheduleForm>) => onChange({ ...value, ...patch });
  const today = config.data?.today_wib;
  const days = today ? Array.from({ length: SCHEDULE_DAYS }, (_, i) => addDays(today, i)) : [];
  const lastDate = value.startDate ? addDays(value.startDate, value.weeks * 7 - 1) : null;
  return (
    <fieldset className="grid gap-3 md:grid-cols-3">
      <legend className="mb-2 font-semibold">Schedule (WIB)</legend>
      <SelectField label="First session date" value={value.startDate}
        onChange={(e) => set({ startDate: e.target.value, weekdays: value.weekdays.length || !e.target.value ? value.weekdays : [isoWeekday(e.target.value)] })}>
        <option value="">Choose a date…</option>
        {days.map((d) => <option key={d} value={d}>{formatDate(d)}</option>)}
      </SelectField>
      <SelectField label="Start time" value={value.startTime} onChange={(e) => set({ startTime: e.target.value })}>
        {times.map((t) => <option key={t} value={t}>{t}</option>)}
      </SelectField>
      <SelectField label="Duration" value={value.duration} onChange={(e) => set({ duration: Number(e.target.value) })}>
        {DURATIONS.map((m) => <option key={m} value={m}>{m} min</option>)}
      </SelectField>
      <label className="flex items-center gap-2 md:col-span-3">
        <input type="checkbox" className="size-5 accent-[var(--color-primary)]" checked={value.repeat}
          onChange={(e) => set({ repeat: e.target.checked })} />
        <span className="font-semibold">Repeat every week</span>
      </label>
      {value.repeat && (
        <>
          <div className="md:col-span-2">
            <p className="text-sm font-semibold" id="days-label">On these days</p>
            <div role="group" aria-labelledby="days-label" className="mt-1 flex flex-wrap gap-2">
              {WEEKDAYS.map((d) => {
                const on = value.weekdays.includes(d.iso);
                return (
                  <button key={d.iso} type="button" aria-pressed={on}
                    onClick={() => set({ weekdays: on ? value.weekdays.filter((x) => x !== d.iso) : [...value.weekdays, d.iso] })}
                    className={`min-h-11 min-w-12 rounded-full border px-3 text-sm font-semibold ${on ? 'border-primary bg-primary text-white' : 'border-line bg-white text-ink hover:bg-surface'}`}>
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
          <SelectField label="For how many weeks" value={value.weeks} onChange={(e) => set({ weeks: Number(e.target.value) })}
            hint={lastDate ? `Until ${formatDate(lastDate)}. Up to 60 sessions at once.` : 'Up to 26 weeks / 60 sessions at once.'}>
            {WEEK_OPTIONS.map((w) => <option key={w} value={w}>{w} {w === 1 ? 'week' : 'weeks'}</option>)}
          </SelectField>
        </>
      )}
    </fieldset>
  );
}

/** Shows the sessions that will be created and any bookings that would be cancelled. */
function PreviewPanel({ preview, understood, onUnderstood }: { preview: ClassPreview; understood: boolean; onUnderstood: (v: boolean) => void }) {
  const shown = preview.sessions.slice(0, 12);
  const clash = preview.class_clashes.length > 0;
  return (
    <div className="space-y-3" aria-live="polite">
      <Banner tone={clash ? 'danger' : preview.conflicts.length ? 'warning' : 'success'} title={preview.summary} />
      <p className="text-sm text-muted">
        {shown.map((s) => `${formatDate(s.date_wib)} ${s.start_wib}–${s.end_wib}`).join(' · ')}
        {preview.sessions.length > shown.length && ` · +${preview.sessions.length - shown.length} more`}
      </p>
      {clash && (
        <ResponsiveTable caption="Classes already using this facility" rows={preview.class_clashes} rowKey={(c) => `${c.date_wib}${c.start_wib}${c.class_title}`}
          columns={[
            { header: 'Class', cell: (c) => c.class_title },
            { header: 'When', cell: (c) => `${c.date_wib} ${c.start_wib}–${c.end_wib}` },
          ]} />
      )}
      {!clash && preview.conflicts.length > 0 && (
        <>
          <ResponsiveTable caption="Bookings that will be cancelled" rows={preview.conflicts} rowKey={(c) => c.booking_id}
            columns={[
              { header: 'Ref', cell: (c) => <span className="font-mono text-xs">{c.booking_ref}</span> },
              { header: 'When', cell: (c) => `${c.date_wib} ${c.start_wib}–${c.end_wib}` },
              { header: 'Owner', cell: (c) => `${c.owner_name} (${c.owner_email})` },
            ]} />
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1 size-5 accent-[var(--color-primary)]" checked={understood} onChange={(e) => onUnderstood(e.target.checked)} />
            <span>I understand these {preview.conflicts.length} booking(s) will be cancelled and the owners notified.</span>
          </label>
        </>
      )}
    </div>
  );
}

function scheduleError(f: ScheduleForm): string | null {
  if (!f.startDate) return 'Choose the date of the first session.';
  if (f.repeat && !f.weekdays.length) return 'Choose at least one day of the week.';
  return null;
}

/** Admin — list of classes (CR-03). */
export function AdminClassesPage() {
  const [showEnded, setShowEnded] = useState(false);
  const classes = useQuery({ queryKey: ['admin', 'classes', showEnded], queryFn: () => api.adminClasses(showEnded) });
  return (
    <div>
      <PageHeader title="Classes" subtitle="Classes such as Yoga, at a facility (its slots close) or in a separate room."
        actions={<Link to="/admin/classes/new" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-hover">
          <Plus className="size-5" aria-hidden="true" /> New class</Link>} />
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} /> Show ended classes
      </label>
      {classes.isPending ? <Skeleton className="h-40" /> : classes.isError ? <ErrorState error={classes.error} onRetry={() => void classes.refetch()} />
        : classes.data.length === 0 ? <EmptyState title="No classes yet." action={<Link to="/admin/classes/new" className="font-semibold text-primary underline">Create the first class</Link>} />
          : (
            <ResponsiveTable caption="Classes" rows={classes.data} rowKey={(c) => c.id}
              columns={[
                { header: 'Class', cell: (c) => <Link to={`/admin/classes/${c.id}`} className="font-semibold text-primary">{c.title}</Link> },
                { header: 'Location', cell: (c) => `${c.location.name}${c.location.type === 'FACILITY' ? ' (facility)' : ''}` },
                { header: 'Instructor', cell: (c) => c.instructor ?? '—' },
                { header: 'Next session', cell: (c) => c.next_session
                  ? <span>{formatDate(c.next_session.date_wib)} {c.next_session.start_wib} · <strong>{c.next_session.enrolled_count}/{c.next_session.capacity}</strong></span>
                  : <span className="text-muted">{c.is_active ? 'None scheduled' : 'Ended'}</span> },
                { header: 'Upcoming', cell: (c) => <span className="tabular">{c.upcoming_sessions}</span> },
              ]} />
          )}
    </div>
  );
}

/** Admin — create a class with its first sessions. */
export function AdminNewClassPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const facilities = useFacilities();
  const [form, setForm] = useState({ title: '', instructor: '', description: '', locationType: 'ROOM' as 'ROOM' | 'FACILITY', facility: '', room: '', capacity: '12' });
  const [schedule, setSchedule] = useState<ScheduleForm>(emptySchedule);
  const [preview, setPreview] = useState<ClassPreview | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const facilityCode = form.locationType === 'FACILITY' ? form.facility : null;

  const check = useMutation({
    mutationFn: () => api.previewClassSchedule(facilityCode, toSchedule(schedule)),
    onSuccess: (p) => { setPreview(p); setUnderstood(false); setFormError(null); },
    onError: (e) => { setPreview(null); setFormError(errorMessage(e)); },
  });
  const create = useMutation({
    mutationFn: () => api.createClass({
      title: form.title.trim(), description: form.description.trim(), instructor: form.instructor.trim(),
      facility: facilityCode, location: form.locationType === 'ROOM' ? form.room.trim() : null,
      capacity: Number(form.capacity), schedule: toSchedule(schedule), expected: preview?.conflicts.map((c) => c.booking_id) ?? [],
    }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      void queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast({ tone: 'success', title: 'Class created', description: `${r.session_ids.length} session(s) scheduled${r.cancelled_booking_ids.length ? `, ${r.cancelled_booking_ids.length} booking(s) cancelled` : ''}.` });
      navigate(`/admin/classes/${r.class_id}`);
    },
    onError: (e) => {
      setFormError(errorMessage(e));
      if (e instanceof ApiError && (e.code === 'BLOCK_CONFLICTS_CHANGED' || e.code === 'ADMIN_BLOCK_CONFLICT')) check.mutate();
    },
  });

  const reset = () => setPreview(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const cap = Number(form.capacity);
    const err = form.title.trim().length < 2 ? 'Enter a class name (at least 2 characters).'
      : form.locationType === 'FACILITY' && !form.facility ? 'Choose the facility.'
        : form.locationType === 'ROOM' && form.room.trim().length < 3 ? 'Describe where the room is (at least 3 characters).'
          : !Number.isInteger(cap) || cap < 1 || cap > 200 ? 'Capacity must be between 1 and 200.'
            : scheduleError(schedule);
    if (err) { setFormError(err); return; }
    check.mutate();
  };
  const blocked = Boolean(preview && (preview.class_clashes.length > 0 || (preview.conflicts.length > 0 && !understood)));

  return (
    <div className="max-w-4xl">
      <Link to="/admin/classes" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <ArrowLeft className="size-4" aria-hidden="true" /> Classes
      </Link>
      <PageHeader title="New class" subtitle="Fill in the class, choose where it takes place and when, then check and create." />
      <Card>
        <form onSubmit={submit} className="space-y-5" noValidate>
          <div className="grid gap-3 md:grid-cols-3">
            <TextField label="Class name" placeholder="e.g. Yoga for beginners" value={form.title} maxLength={80}
              onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <TextField label="Instructor (optional)" value={form.instructor} maxLength={80}
              onChange={(e) => setForm({ ...form, instructor: e.target.value })} />
            <TextField label="Capacity (places per session)" type="number" inputMode="numeric" min={1} max={200} value={form.capacity}
              onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            <div className="md:col-span-3">
              <TextAreaField label="Details for participants (optional)" maxLength={1000}
                placeholder="e.g. exact location and how to get there, what to bring, level, dress code"
                hint="Shown to users on the class schedule." value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 font-semibold">Location</legend>
            <div className="flex flex-wrap gap-4">
              {([['ROOM', 'Separate room'], ['FACILITY', 'Existing facility (its slots close during the class)']] as const).map(([v, label]) => (
                <label key={v} className="flex items-center gap-2">
                  <input type="radio" name="loc" className="size-5 accent-[var(--color-primary)]" checked={form.locationType === v}
                    onChange={() => { setForm({ ...form, locationType: v }); reset(); }} />
                  {label}
                </label>
              ))}
            </div>
            <div className="mt-3 max-w-md">
              {form.locationType === 'ROOM' ? (
                <TextField label="Room / location" placeholder="e.g. Studio, 2nd floor, DCU building" value={form.room} maxLength={120}
                  onChange={(e) => setForm({ ...form, room: e.target.value })} />
              ) : (
                <SelectField label="Facility" value={form.facility} onChange={(e) => { setForm({ ...form, facility: e.target.value }); reset(); }}>
                  <option value="">Choose…</option>
                  {facilities.data?.map((f) => <option key={f.code} value={f.code}>{f.name}</option>)}
                </SelectField>
              )}
            </div>
          </fieldset>

          <ScheduleFields value={schedule} onChange={(v) => { setSchedule(v); reset(); }} />
          <Button type="submit" variant="secondary" loading={check.isPending}>Check schedule</Button>
        </form>

        {formError && <p role="alert" className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{formError}</p>}
        {preview && (
          <div className="mt-4 space-y-3">
            <PreviewPanel preview={preview} understood={understood} onUnderstood={setUnderstood} />
            <Button loading={create.isPending} disabled={blocked} onClick={() => create.mutate()}>Create class</Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function sessionState(s: AdminClassSession): string {
  if (s.status === 'CANCELLED') return 'Cancelled';
  return s.is_past ? 'Done' : 'Scheduled';
}

function Participants({ sessionId }: { sessionId: string }) {
  const list = useQuery({ queryKey: ['admin', 'participants', sessionId], queryFn: () => api.sessionParticipants(sessionId) });
  if (list.isPending) return <Skeleton className="h-24" />;
  if (list.isError) return <ErrorState error={list.error} />;
  if (!list.data.length) return <p className="text-muted">No one has joined yet.</p>;
  return (
    <ul className="divide-y divide-line">
      {list.data.map((p) => (
        <li key={p.enrolment_id} className="flex items-start justify-between gap-3 py-2">
          <div className="min-w-0">
            <p className="font-semibold">{p.full_name}</p>
            <p className="truncate text-sm text-muted">{p.email} · joined {formatDateTimeWib(p.joined_at)}</p>
            {p.cancellation_reason && <p className="text-sm text-muted">Reason: {p.cancellation_reason}</p>}
          </div>
          <StatusBadge status={p.effective_status} />
        </li>
      ))}
    </ul>
  );
}

function EditClassDialog({ c, open, onOpenChange }: { c: AdminClassDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({ title: c.title, instructor: c.instructor ?? '', description: c.description ?? '', room: c.location_text ?? '', capacity: String(c.capacity) });
  const save = useMutation({
    mutationFn: () => api.updateClass(c.id, {
      title: form.title.trim(), instructor: form.instructor.trim(), description: form.description.trim(),
      location: c.location.type === 'ROOM' ? form.room.trim() : null, capacity: Number(form.capacity),
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      void queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast({ tone: 'success', title: 'Class updated', description: 'Capacity applies to upcoming sessions.' });
      onOpenChange(false);
    },
  });
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit class" wide
      footer={<>
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button loading={save.isPending} onClick={() => save.mutate()}>Save changes</Button>
      </>}>
      <div className="grid gap-3 md:grid-cols-2">
        <TextField label="Class name" value={form.title} maxLength={80} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <TextField label="Instructor (optional)" value={form.instructor} maxLength={80} onChange={(e) => setForm({ ...form, instructor: e.target.value })} />
        <TextField label="Capacity (upcoming sessions)" type="number" min={1} max={200} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
        {c.location.type === 'ROOM' && (
          <TextField label="Room / location" value={form.room} maxLength={120} onChange={(e) => setForm({ ...form, room: e.target.value })} />
        )}
        <div className="md:col-span-2">
          <TextAreaField label="Details for participants" value={form.description} maxLength={1000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </div>
      {save.isError && <p role="alert" className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{errorMessage(save.error)}</p>}
    </Modal>
  );
}

function AddSessions({ c }: { c: AdminClassDetail }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [schedule, setSchedule] = useState<ScheduleForm>(emptySchedule);
  const [preview, setPreview] = useState<ClassPreview | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = useMutation({
    mutationFn: () => api.previewClassSchedule(c.location.facility_code, toSchedule(schedule)),
    onSuccess: (p) => { setPreview(p); setUnderstood(false); setError(null); },
    onError: (e) => { setPreview(null); setError(errorMessage(e)); },
  });
  const add = useMutation({
    mutationFn: () => api.addClassSessions(c.id, toSchedule(schedule), preview?.conflicts.map((x) => x.booking_id) ?? []),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] });
      void queryClient.invalidateQueries({ queryKey: ['availability'] });
      void queryClient.invalidateQueries({ queryKey: ['classes'] });
      toast({ tone: 'success', title: `${r.session_ids.length} session(s) added` });
      setPreview(null);
      setSchedule(emptySchedule());
    },
    onError: (e) => {
      setError(errorMessage(e));
      if (e instanceof ApiError && (e.code === 'BLOCK_CONFLICTS_CHANGED' || e.code === 'ADMIN_BLOCK_CONFLICT')) check.mutate();
    },
  });
  const blocked = Boolean(preview && (preview.class_clashes.length > 0 || (preview.conflicts.length > 0 && !understood)));
  return (
    <Card>
      <h2 className="mb-3 text-lg font-bold">Add sessions</h2>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault();
        const err = scheduleError(schedule);
        if (err) { setError(err); return; }
        check.mutate();
      }}>
        <ScheduleFields value={schedule} onChange={(v) => { setSchedule(v); setPreview(null); }} />
        <Button type="submit" variant="secondary" loading={check.isPending}>Check schedule</Button>
      </form>
      {error && <p role="alert" className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-sm font-medium text-danger">{error}</p>}
      {preview && (
        <div className="mt-4 space-y-3">
          <PreviewPanel preview={preview} understood={understood} onUnderstood={setUnderstood} />
          <Button loading={add.isPending} disabled={blocked} onClick={() => add.mutate()}>Add sessions</Button>
        </div>
      )}
    </Card>
  );
}

/** Admin — one class: details, sessions with attendance, participants, cancellation. */
export function AdminClassDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [toCancel, setToCancel] = useState<AdminClassSession | null>(null);
  const [people, setPeople] = useState<AdminClassSession | null>(null);
  const query = useQuery({ queryKey: ['admin', 'class', id], queryFn: () => api.adminClass(id), refetchInterval: 60_000 });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin'] });
    void queryClient.invalidateQueries({ queryKey: ['availability'] });
    void queryClient.invalidateQueries({ queryKey: ['classes'] });
  };
  const cancelSession = useMutation({
    mutationFn: ({ sid, reason }: { sid: string; reason: string }) => api.cancelClassSession(sid, reason),
    onSuccess: (r) => {
      setToCancel(null);
      refresh();
      toast({ tone: 'success', title: 'Session cancelled', description: `${r.cancelled_enrolments} participant(s) notified.` });
    },
  });
  const endClass = useMutation({
    mutationFn: (reason: string) => api.cancelClass(id, reason),
    onSuccess: (r) => {
      setEnding(false);
      refresh();
      toast({ tone: 'success', title: 'Class ended', description: `${r.cancelled_sessions} upcoming session(s) cancelled, ${r.cancelled_enrolments} participant(s) notified.` });
    },
  });

  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  const c = query.data;
  const upcoming = c.sessions.filter((s) => s.status === 'SCHEDULED' && !s.is_past);

  return (
    <div>
      <Link to="/admin/classes" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
        <ArrowLeft className="size-4" aria-hidden="true" /> Classes
      </Link>
      <PageHeader title={c.title}
        subtitle={`${c.location.name}${c.location.type === 'FACILITY' ? ' (facility closes during sessions)' : ''}${c.instructor ? ` · ${c.instructor}` : ''} · ${c.capacity} places`}
        actions={c.is_active && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="danger" onClick={() => { endClass.reset(); setEnding(true); }}>End class</Button>
          </div>
        )} />
      {!c.is_active && <div className="mb-4"><Banner tone="danger" title="This class has ended." /></div>}
      {c.description && <p className="mb-4 max-w-3xl text-ink">{c.description}</p>}

      <h2 className="mb-2 text-lg font-bold">Sessions</h2>
      {c.sessions.length === 0 ? <EmptyState title="No sessions." /> : (
        <ResponsiveTable caption="Sessions" rows={c.sessions} rowKey={(s) => s.id}
          columns={[
            { header: 'Date', cell: (s) => formatDate(s.date_wib) },
            { header: 'Time', cell: (s) => <span className="tabular">{s.start_wib}–{s.end_wib}</span> },
            { header: 'Places taken', cell: (s) => <span className="tabular">{s.enrolled_count} / {s.capacity}</span> },
            { header: 'Checked in', cell: (s) => <span className="tabular">{s.checked_in_count}</span> },
            { header: 'No-show', cell: (s) => <span className="tabular">{s.no_show_count}</span> },
            { header: 'Status', cell: (s) => <span title={s.cancellation_reason ?? undefined}>{sessionState(s)}</span> },
          ]}
          actions={(s) => (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPeople(s)}>Participants</Button>
              {s.status === 'SCHEDULED' && !s.is_past && (
                <Button size="sm" variant="danger" onClick={() => { cancelSession.reset(); setToCancel(s); }}>Cancel</Button>
              )}
            </div>
          )} />
      )}
      <p className="mt-2 text-sm text-muted">{upcoming.length} upcoming session(s). Created by {c.created_by_name}.</p>

      {c.is_active && <div className="mt-6"><AddSessions c={c} /></div>}

      {editing && <EditClassDialog c={c} open={editing} onOpenChange={setEditing} />}
      <Modal open={people !== null} onOpenChange={(o) => { if (!o) setPeople(null); }} wide
        title={people ? `Participants · ${formatDate(people.date_wib)} ${people.start_wib}` : 'Participants'}>
        {people && <Participants sessionId={people.id} />}
      </Modal>
      <ConfirmDialog
        open={toCancel !== null}
        onOpenChange={(o) => { if (!o) setToCancel(null); }}
        title="Cancel this session?"
        description={toCancel ? `${formatDate(toCancel.date_wib)} ${toCancel.start_wib}–${toCancel.end_wib} WIB. ${toCancel.enrolled_count} participant(s) will be notified with your reason.${c.location.type === 'FACILITY' ? ' The facility becomes bookable again.' : ''}` : undefined}
        confirmLabel="Cancel session"
        cancelLabel="Keep session"
        destructive
        requireReason
        loading={cancelSession.isPending}
        error={cancelSession.isError ? errorMessage(cancelSession.error) : undefined}
        onConfirm={(reason) => toCancel && cancelSession.mutate({ sid: toCancel.id, reason })}
      />
      <ConfirmDialog
        open={ending}
        onOpenChange={setEnding}
        title="End this class?"
        description={`All ${upcoming.length} upcoming session(s) are cancelled and participants notified. The class is hidden from users.`}
        confirmLabel="End class"
        cancelLabel="Keep class"
        destructive
        requireReason
        loading={endClass.isPending}
        error={endClass.isError ? errorMessage(endClass.error) : undefined}
        onConfirm={(reason) => endClass.mutate(reason)}
      />
    </div>
  );
}
