import { supabase } from './supabase';
import { ApiError, KNOWN_CODES, newReference } from './errors';
import type {
  AdminBooking, AdminBookingDetail, AdminUserDetail, AdminUserItem, AppConfig, AuditItem, Availability, BlockItem,
  BlockPreview, BookingView, DashboardMetrics, DomainItem, Facility, NotificationPage, Page, Profile, SettingItem,
  AdminClassDetail, AdminClassItem, ClassEnrolment, ClassMetrics, ClassParticipant, ClassPreview, ClassSchedule, ClassSession,
} from './types';

/** Calls an api.* RPC and converts failures into ApiError with a stable business code. */
export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ApiError('OFFLINE');
  let result;
  try {
    result = await supabase.rpc(fn, args);
  } catch {
    throw new ApiError('NETWORK_ERROR');
  }
  const { data, error } = result;
  if (error) {
    if (KNOWN_CODES.has(error.message)) {
      let details: Record<string, unknown> = {};
      try { details = error.details ? JSON.parse(error.details) : {}; } catch { /* keep empty */ }
      throw new ApiError(error.message, details);
    }
    if (!error.code && /fetch|network/i.test(error.message)) throw new ApiError('NETWORK_ERROR');
    const ref = newReference();
    console.error(`[rpc ${fn} ${ref}]`, error.code); // no message/details: may contain internals
    throw new ApiError('INTERNAL_ERROR', {}, ref);
  }
  return data as T;
}

export const api = {
  // public
  registrationDomains: () => rpc<{ domains: string[] }>('get_registration_domains'),
  // user
  myProfile: () => rpc<Profile>('get_my_profile'),
  updateMyProfile: (fullName: string) => rpc<Profile>('update_my_profile', { p_full_name: fullName }),
  appConfig: () => rpc<AppConfig>('get_app_config'),
  facilities: () => rpc<Facility[]>('list_facilities'),
  availability: (facilityCode: string, date: string) =>
    rpc<Availability>('get_availability', { p_facility_code: facilityCode, p_date: date }),
  createBooking: (a: { facility: string; activity: string; date: string; start: string; duration: number; key: string }) =>
    rpc<BookingView>('create_booking', {
      p_facility_code: a.facility, p_activity_code: a.activity, p_date: a.date, p_start_time: a.start,
      p_duration_minutes: a.duration, p_idempotency_key: a.key,
    }),
  myBookings: (scope: 'UPCOMING' | 'HISTORY', cursor?: string | null, limit = 20) =>
    rpc<Page<BookingView>>('list_my_bookings', { p_scope: scope, p_limit: limit, p_cursor: cursor ?? null }),
  myBooking: (id: string) => rpc<BookingView>('get_my_booking', { p_booking_id: id }),
  cancelMyBooking: (id: string) => rpc<BookingView>('cancel_my_booking', { p_booking_id: id }),
  checkIn: (id: string) => rpc<BookingView>('check_in', { p_booking_id: id }),
  notifications: (cursor?: string | null) =>
    rpc<NotificationPage>('list_my_notifications', { p_limit: 20, p_cursor: cursor ?? null }),
  markNotificationsRead: (ids?: string[]) => rpc<{ updated: number }>('mark_notifications_read', { p_ids: ids ?? null }),
  classSessions: (from: string | null, days = 14) => rpc<ClassSession[]>('list_class_sessions', { p_date_from: from, p_days: days }),
  enrolClass: (sessionId: string, key: string) =>
    rpc<ClassEnrolment>('enrol_class_session', { p_session_id: sessionId, p_idempotency_key: key }),
  myClasses: (scope: 'UPCOMING' | 'HISTORY') => rpc<ClassEnrolment[]>('list_my_class_enrolments', { p_scope: scope }),
  cancelMyEnrolment: (id: string) => rpc<ClassEnrolment>('cancel_my_enrolment', { p_enrolment_id: id }),
  checkInClass: (id: string) => rpc<ClassEnrolment>('check_in_class', { p_enrolment_id: id }),

  // admin
  dashboard: (from: string, to: string) => rpc<DashboardMetrics>('admin_dashboard_metrics', { p_date_from: from, p_date_to: to }),
  adminBookings: (filters: Record<string, unknown>, cursor?: string | null, limit = 50) =>
    rpc<Page<AdminBooking>>('admin_list_bookings', { p_filters: filters, p_limit: limit, p_cursor: cursor ?? null }),
  adminBooking: (id: string) => rpc<AdminBookingDetail>('admin_get_booking', { p_booking_id: id }),
  adminCancelBooking: (id: string, reason: string) => rpc<BookingView>('admin_cancel_booking', { p_booking_id: id, p_reason: reason }),
  previewBlock: (b: { facility: string; resource: string | null; start: string; end: string }) =>
    rpc<BlockPreview>('admin_preview_block', {
      p_facility_code: b.facility, p_resource_code: b.resource, p_start_at: b.start, p_end_at: b.end,
    }),
  createBlock: (b: {
    facility: string; resource: string | null; start: string; end: string; category: string; reason: string;
    confirm: boolean; expected: string[];
  }) =>
    rpc<{ block: { id: string }; cancelled_booking_ids: string[] }>('admin_create_block', {
      p_facility_code: b.facility, p_resource_code: b.resource, p_start_at: b.start, p_end_at: b.end,
      p_category: b.category, p_reason: b.reason, p_confirm_cancel_conflicts: b.confirm, p_expected_conflict_ids: b.expected,
    }),
  removeBlock: (id: string, reason: string) => rpc<unknown>('admin_remove_block', { p_block_id: id, p_reason: reason }),
  blocks: (filters: Record<string, unknown>, cursor?: string | null) =>
    rpc<Page<BlockItem>>('admin_list_blocks', { p_filters: filters, p_limit: 50, p_cursor: cursor ?? null }),
  users: (q: string | null, status: string | null, role: string | null, cursor?: string | null) =>
    rpc<Page<AdminUserItem>>('admin_list_users', { p_q: q, p_status: status, p_role: role, p_limit: 50, p_cursor: cursor ?? null }),
  user: (id: string) => rpc<AdminUserDetail>('admin_get_user', { p_user_id: id }),
  setUserActive: (id: string, active: boolean, reason: string) =>
    rpc<{ cancelled_booking_ids: string[] }>('admin_set_user_active', { p_user_id: id, p_active: active, p_reason: reason }),
  setUserRole: (id: string, role: 'USER' | 'ADMIN', reason: string) =>
    rpc<unknown>('admin_set_user_role', { p_user_id: id, p_role: role, p_reason: reason }),
  settings: () => rpc<SettingItem[]>('admin_get_settings'),
  updateSetting: (key: string, value: number, reason: string) =>
    rpc<unknown>('admin_update_setting', { p_key: key, p_value: value, p_reason: reason }),
  domains: (includeRemoved: boolean) => rpc<DomainItem[]>('admin_list_email_domains', { p_include_removed: includeRemoved }),
  addDomain: (domain: string, reason: string) => rpc<unknown>('admin_add_email_domain', { p_domain: domain, p_reason: reason }),
  renameDomain: (id: string, domain: string, reason: string) =>
    rpc<unknown>('admin_rename_email_domain', { p_domain_id: id, p_new_domain: domain, p_reason: reason }),
  removeDomain: (id: string, reason: string) => rpc<unknown>('admin_remove_email_domain', { p_domain_id: id, p_reason: reason }),
  classMetrics: (from: string, to: string) => rpc<ClassMetrics>('admin_class_metrics', { p_date_from: from, p_date_to: to }),
  adminClasses: (includeInactive: boolean) => rpc<AdminClassItem[]>('admin_list_classes', { p_include_inactive: includeInactive }),
  adminClass: (id: string) => rpc<AdminClassDetail>('admin_get_class', { p_class_id: id }),
  previewClassSchedule: (facility: string | null, schedule: ClassSchedule) =>
    rpc<ClassPreview>('admin_preview_class_schedule', { p_facility_code: facility, p_schedule: schedule }),
  createClass: (c: {
    title: string; description: string; instructor: string; facility: string | null; location: string | null;
    capacity: number; schedule: ClassSchedule; expected: string[];
  }) =>
    rpc<{ class_id: string; session_ids: string[]; cancelled_booking_ids: string[] }>('admin_create_class', {
      p_title: c.title, p_description: c.description, p_instructor: c.instructor, p_facility_code: c.facility,
      p_location_text: c.location, p_capacity: c.capacity, p_schedule: c.schedule,
      p_confirm_cancel_conflicts: true, p_expected_conflict_ids: c.expected,
    }),
  addClassSessions: (id: string, schedule: ClassSchedule, expected: string[]) =>
    rpc<{ session_ids: string[]; cancelled_booking_ids: string[] }>('admin_add_class_sessions', {
      p_class_id: id, p_schedule: schedule, p_confirm_cancel_conflicts: true, p_expected_conflict_ids: expected,
    }),
  updateClass: (id: string, c: { title: string; description: string; instructor: string; location: string | null; capacity: number }) =>
    rpc<unknown>('admin_update_class', {
      p_class_id: id, p_title: c.title, p_description: c.description, p_instructor: c.instructor,
      p_location_text: c.location, p_capacity: c.capacity,
    }),
  cancelClassSession: (id: string, reason: string) =>
    rpc<{ cancelled_enrolments: number }>('admin_cancel_class_session', { p_session_id: id, p_reason: reason }),
  cancelClass: (id: string, reason: string) =>
    rpc<{ cancelled_sessions: number; cancelled_enrolments: number }>('admin_cancel_class', { p_class_id: id, p_reason: reason }),
  sessionParticipants: (id: string) => rpc<ClassParticipant[]>('admin_list_session_participants', { p_session_id: id }),
  auditLogs: (filters: Record<string, unknown>, cursor?: string | null) =>
    rpc<Page<AuditItem>>('admin_list_audit_logs', { p_filters: filters, p_limit: 50, p_cursor: cursor ?? null }),
};
