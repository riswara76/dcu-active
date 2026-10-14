interface Props {
  allowed: number[];
  bookable: number[];
  value: number | null;
  onChange: (minutes: number) => void;
}

/** Duration choice; durations that do not fit the chosen start are disabled with a reason (FR-BKG-01). */
export function DurationChips({ allowed, bookable, value, onChange }: Props) {
  return (
    <div role="radiogroup" aria-label="Duration" className="flex flex-wrap gap-2">
      {allowed.map((m) => {
        const ok = bookable.includes(m);
        const checked = value === m && ok;
        return (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-disabled={!ok || undefined}
            onClick={() => ok && onChange(m)}
            className={[
              'min-h-11 rounded-full border px-4 text-sm font-semibold',
              checked ? 'border-primary bg-primary text-white'
                : ok ? 'border-line bg-white text-ink hover:bg-surface'
                  : 'cursor-not-allowed border-line bg-surface text-subtle line-through',
            ].join(' ')}
          >
            {m} min
            {!ok && <span className="sr-only"> (not free for {m} minutes)</span>}
          </button>
        );
      })}
    </div>
  );
}
