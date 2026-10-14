import { useRef, type KeyboardEvent } from 'react';
import { dateParts, formatDate, relativeDayLabel } from '../../lib/time';

interface Props {
  dates: string[];
  todayWib: string;
  value: string;
  onChange: (date: string) => void;
}

/** 8-day date strip (today … +7). Arrow keys move between dates (UX spec §4). */
export function DateStrip({ dates, todayWib, value, onChange }: Props) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = Math.min(dates.length - 1, Math.max(0, index + delta));
    onChange(dates[next]);
    refs.current[next]?.focus();
  };

  return (
    <div role="group" aria-label="Date" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:thin]">
      {dates.map((d, i) => {
        const parts = dateParts(d);
        const rel = relativeDayLabel(d, todayWib);
        const selected = d === value;
        return (
          <button
            key={d}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            aria-pressed={selected}
            aria-label={`${rel ? `${rel}, ` : ''}${formatDate(d)}`}
            tabIndex={selected ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, i)}
            onClick={() => onChange(d)}
            className={[
              'flex min-h-16 min-w-16 shrink-0 flex-col items-center justify-center rounded-xl border px-3 py-2',
              selected ? 'border-primary bg-primary text-white' : 'border-line bg-white text-ink hover:bg-surface',
            ].join(' ')}
          >
            <span className="text-xs font-semibold">{rel ?? parts.weekday}</span>
            <span className="text-lg font-bold leading-tight tabular">{parts.day}</span>
            <span className="text-xs">{parts.month}</span>
          </button>
        );
      })}
    </div>
  );
}
