import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import type { Facility } from '../../lib/types';
import { ErrorState, PageHeader, Skeleton } from '../../components/ui/Feedback';
import { useAppConfig, useFacilities } from './queries';

function TodayHint({ facility, today }: { facility: Facility; today: string }) {
  const { data } = useQuery({
    queryKey: ['availability', facility.code, today],
    queryFn: () => api.availability(facility.code, today),
    staleTime: 60_000,
  });
  if (!data) return <span className="text-sm text-subtle">Checking today…</span>;
  const next = data.slots.find((s) => s.state === 'AVAILABLE');
  return (
    <span className={`text-sm font-medium ${next ? 'text-available' : 'text-muted'}`}>
      {next ? `Available from ${next.start_wib} today` : 'Fully booked today'}
    </span>
  );
}

/** S8 — facility listing. */
export function FacilitiesPage() {
  const facilities = useFacilities();
  const config = useAppConfig();
  return (
    <div>
      <PageHeader title="Facilities" subtitle="Open daily 06:00–21:00 WIB" />
      {facilities.isPending ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
      ) : facilities.isError ? (
        <ErrorState error={facilities.error} onRetry={() => void facilities.refetch()} />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {facilities.data.map((f) => (
            <li key={f.code}>
              <Link to={`/facilities/${f.code}`} className="flex h-full items-center justify-between gap-3 rounded-xl border border-line bg-white p-4 hover:border-primary">
                <div>
                  <h2 className="text-lg font-bold text-ink">{f.name}</h2>
                  <p className="text-sm text-muted">
                    {f.allowed_durations.join(' · ')} min
                    {f.allocation_mode === 'AUTO_POOL' && ` · ${f.resource_count} tables`}
                    {f.activities.length > 1 && ` · ${f.activities.map((a) => a.name).join(' / ')}`}
                  </p>
                  {config.data && <div className="mt-1"><TodayHint facility={f} today={config.data.today_wib} /></div>}
                </div>
                <ChevronRight className="size-5 shrink-0 text-subtle" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
