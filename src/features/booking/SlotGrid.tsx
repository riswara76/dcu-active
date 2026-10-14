import { Ban, Check, User, Users, X } from 'lucide-react';
import type { Slot } from '../../lib/types';

interface Props {
  slots: Slot[];
  totalResources: number;
  selected: string | null;
  onSelect: (start: string) => void;
  showPast: boolean;
}

export function slotText(slot: Slot, totalResources: number): string {
  if (slot.state === 'PAST') return 'Past';
  if (slot.is_mine && slot.state !== 'AVAILABLE') return 'Your booking';
  if (slot.state === 'UNAVAILABLE') return slot.unavailable_label ? `Unavailable – ${slot.unavailable_label}` : 'Unavailable';
  if (slot.state === 'BOOKED') return totalResources > 1 ? 'Full' : 'Booked';
  return totalResources > 1 ? `${slot.available_count} left` : 'Available';
}

const GROUPS = [
  { label: 'Morning', from: '00:00', to: '11:59' },
  { label: 'Afternoon', from: '12:00', to: '16:59' },
  { label: 'Evening', from: '17:00', to: '23:59' },
];

/** Time-slot grid. State is always shown as text + icon, never colour alone (TR-A11Y-04/05). */
export function SlotGrid({ slots, totalResources, selected, onSelect, showPast }: Props) {
  const visible = slots.filter((s) => showPast || s.state !== 'PAST');
  return (
    <div className="space-y-5">
      {GROUPS.map((g) => {
        const items = visible.filter((s) => s.start_wib >= g.from && s.start_wib <= g.to);
        if (!items.length) return null;
        return (
          <section key={g.label} aria-label={g.label}>
            <h3 className="mb-2 text-sm font-semibold text-muted">{g.label}</h3>
            <ul className="grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-6">
              {items.map((slot) => {
                const text = slotText(slot, totalResources);
                const selectable = slot.state === 'AVAILABLE';
                const isSelected = selected === slot.start_wib && selectable;
                const style = isSelected
                  ? 'border-primary bg-primary text-white'
                  : slot.is_mine && !selectable
                    ? 'border-primary bg-primary-soft text-primary-soft-text'
                    : selectable
                      ? 'border-available/40 bg-available-bg text-available hover:border-available'
                      : slot.state === 'UNAVAILABLE'
                        ? 'border-line bg-surface text-muted [background-image:repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(0,0,0,0.04)_6px,rgba(0,0,0,0.04)_12px)]'
                        : 'border-line bg-booked-bg text-booked';
                const Icon = isSelected ? Check : slot.is_mine && !selectable ? User
                  : selectable ? (totalResources > 1 ? Users : Check)
                  : slot.state === 'UNAVAILABLE' ? Ban : X;
                return (
                  <li key={slot.start_wib}>
                    <button
                      type="button"
                      aria-pressed={selectable ? isSelected : undefined}
                      aria-disabled={!selectable || undefined}
                      aria-label={`${slot.start_wib} WIB, ${text}`}
                      onClick={() => selectable && onSelect(slot.start_wib)}
                      className={`flex min-h-14 w-full flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-center ${style} ${selectable ? '' : 'cursor-not-allowed'}`}
                    >
                      <span className="text-base font-bold tabular">{slot.start_wib}</span>
                      <span className="flex items-center gap-1 text-xs font-medium leading-tight">
                        <Icon className="size-3 shrink-0" aria-hidden="true" />
                        {text}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
