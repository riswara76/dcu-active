import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Slot } from '../../lib/types';
import { SlotGrid, slotText } from './SlotGrid';
import { DateStrip } from './DateStrip';
import { DurationChips } from './DurationChips';
import { axeViolations } from '../../test/setup';

const slot = (start: string, over: Partial<Slot> = {}): Slot => ({
  start_wib: start, end_wib: '', start_at: '2030-01-08T00:00:00Z', state: 'AVAILABLE', available_count: 1,
  bookable_durations: [30], is_mine: false, unavailable_label: null, ...over,
});

describe('SlotGrid', () => {
  const slots = [
    slot('06:00', { state: 'PAST', available_count: 0, bookable_durations: [] }),
    slot('09:00'),
    slot('09:30', { state: 'BOOKED', available_count: 0, bookable_durations: [] }),
    slot('12:00', { state: 'UNAVAILABLE', available_count: 0, bookable_durations: [], unavailable_label: 'Maintenance' }),
    slot('17:00', { state: 'BOOKED', available_count: 0, bookable_durations: [], is_mine: true }),
  ];

  it('describes every state in words, not colour (TR-A11Y-04)', () => {
    expect(slotText(slots[1], 1)).toBe('Available');
    expect(slotText(slot('09:00', { available_count: 2 }), 2)).toBe('2 left');
    expect(slotText(slots[2], 2)).toBe('Full');
    expect(slotText(slots[3], 1)).toBe('Unavailable – Maintenance');
    expect(slotText(slots[4], 1)).toBe('Your booking');
  });

  it('hides past slots unless requested and groups by period', () => {
    const { rerender } = render(<SlotGrid slots={slots} totalResources={1} selected={null} onSelect={() => {}} showPast={false} />);
    expect(screen.queryByRole('button', { name: /06:00/ })).toBeNull();
    expect(screen.getByRole('region', { name: 'Morning' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Evening' })).toBeInTheDocument();
    rerender(<SlotGrid slots={slots} totalResources={1} selected={null} onSelect={() => {}} showPast />);
    expect(screen.getByRole('button', { name: '06:00 WIB, Past' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('only lets available slots be selected', async () => {
    const onSelect = vi.fn();
    render(<SlotGrid slots={slots} totalResources={1} selected={null} onSelect={onSelect} showPast={false} />);
    await userEvent.click(screen.getByRole('button', { name: '09:30 WIB, Booked' }));
    expect(onSelect).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '09:00 WIB, Available' }));
    expect(onSelect).toHaveBeenCalledWith('09:00');
  });

  it('has no serious accessibility violations', async () => {
    const { container } = render(<SlotGrid slots={slots} totalResources={1} selected="09:00" onSelect={() => {}} showPast />);
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('DateStrip', () => {
  const dates = ['2030-01-07', '2030-01-08', '2030-01-09'];
  it('labels Today/Tomorrow and supports arrow keys', async () => {
    const onChange = vi.fn();
    render(<DateStrip dates={dates} todayWib="2030-01-07" value="2030-01-07" onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'Date' });
    const today = within(group).getByRole('button', { name: /^Today/ });
    expect(today).toHaveAttribute('aria-pressed', 'true');
    expect(within(group).getByRole('button', { name: /^Tomorrow/ })).toBeInTheDocument();
    today.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith('2030-01-08');
  });
});

describe('DurationChips', () => {
  it('disables durations that do not fit and explains why', async () => {
    const onChange = vi.fn();
    render(<DurationChips allowed={[30, 60, 90]} bookable={[30, 60]} value={30} onChange={onChange} />);
    const ninety = screen.getByRole('radio', { name: /90 min/ });
    expect(ninety).toHaveAttribute('aria-disabled', 'true');
    expect(ninety).toHaveTextContent('not free for 90 minutes');
    await userEvent.click(ninety);
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('radio', { name: '60 min' }));
    expect(onChange).toHaveBeenCalledWith(60);
  });
});
