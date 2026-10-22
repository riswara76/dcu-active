import { describe, expect, it } from 'vitest';
import { isoWeekday, toSchedule } from './AdminClassesPages';

describe('class schedule helpers (CR-03)', () => {
  it('returns ISO weekdays (Monday = 1, Sunday = 7) independent of the device timezone', () => {
    expect(isoWeekday('2026-10-26')).toBe(1);
    expect(isoWeekday('2026-10-23')).toBe(5);
    expect(isoWeekday('2026-10-25')).toBe(7);
  });

  it('sends a one-off session without repeat days', () => {
    expect(toSchedule({ startDate: '2026-10-23', startTime: '18:00', duration: 60, repeat: false, weekdays: [5], untilDate: '2026-12-01' }))
      .toEqual({ start_date: '2026-10-23', start_time: '18:00', duration_minutes: 60, repeat_weekdays: [], until_date: null });
  });

  it('sends sorted weekdays and the end date for a weekly class', () => {
    expect(toSchedule({ startDate: '2026-10-23', startTime: '07:00', duration: 90, repeat: true, weekdays: [5, 2], untilDate: '2026-12-18' }))
      .toEqual({ start_date: '2026-10-23', start_time: '07:00', duration_minutes: 90, repeat_weekdays: [2, 5], until_date: '2026-12-18' });
  });
});
