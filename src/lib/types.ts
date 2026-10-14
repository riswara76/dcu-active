// Response types of the api.* RPCs (API-RPC-SPECIFICATION §1.3, §4–6).

export type BookingStatus = 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'CANCELLED' | 'ADMIN_CANCELLED' | 'NO_SHOW';
export type EffectiveStatus =
  | 'UPCOMING' | 'CANCEL_CLOSED' | 'CHECKIN_OPEN' | 'IN_PROGRESS'
  | 'COMPLETED' | 'CANCELLED' | 'ADMIN_CANCELLED' | 'NO_SHOW';
export type Role = 'USER' | 'ADMIN';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface AppConfig {
  timezone: string;
  now: string;
  today_wib: string;
  operating_open: string;
  operating_close: string;
  slot_minutes: number;
  booking_horizon_days: number;
  max_active_bookings: number;
  max_bookings_per_facility_per_day: number;
  checkin_open_before_minutes: number;
  checkin_close_after_minutes: number;
  user_cancel_cutoff_minutes: number;
}

export interface Facility {
  code: string;
  name: string;
  description: string | null;
  allowed_durations: number[];
  allocation_mode: 'SINGLE' | 'AUTO_POOL';
  resource_count: number;
  activities: { code: string; name: string }[];
}

export type SlotState = 'AVAILABLE' | 'BOOKED' | 'UNAVAILABLE' | 'PAST';

export interface Slot {
  start_wib: string;
  end_wib: string;
  start_at: string;
  state: SlotState;
  available_count: number;
  bookable_durations: number[];
  is_mine: boolean;
  unavailable_label: string | null;
}

export interface Availability {
  facility_code: string;
  date_wib: string;
  total_resources: number;
  slots: Slot[];
}

export interface BookingView {
  id: string;
  booking_ref: string;
  facility: { code: string; name: string };
  activity: { code: string; name: string };
  resource_name: string | null;
  date_wib: string;
  start_wib: string;
  end_wib: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  status: BookingStatus;
  effective_status: EffectiveStatus;
  checkin_opens_wib: string;
  checkin_closes_wib: string;
  cancel_until_wib: string;
  can_cancel: boolean;
  can_check_in: boolean;
  cancel_source: 'USER' | 'ADMIN' | 'BLOCK' | 'DEACTIVATION' | null;
  cancellation_reason: string | null;
  checked_in_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  booking_id: string | null;
  created_at: string;
  read_at: string | null;
}

export interface NotificationPage extends Page<NotificationItem> {
  unread_count: number;
}

// ---- Admin ----
export interface Owner { id: string; full_name: string; email: string }
export interface AdminBooking extends BookingView { owner: Owner }
export interface AdminBookingDetail extends AdminBooking {
  audit: { occurred_at: string; actor_name: string; actor_role: string; action: string; reason: string | null }[];
}

export interface DashboardMetrics {
  range: { from: string; to: string };
  bookings: { total: number; upcoming: number; checked_in: number; completed: number; cancelled: number; admin_cancelled: number; no_show: number };
  active_users: number;
  utilization: {
    facility_code: string; facility_name: string; available_minutes: number; used_minutes: number;
    reserved_minutes: number; used_pct: number; reserved_pct: number;
  }[];
}

export interface Conflict {
  booking_id: string; booking_ref: string; owner_name: string; owner_email: string; resource_name: string;
  date_wib: string; start_wib: string; end_wib: string; status: BookingStatus;
}

export interface BlockPreview { conflicts: Conflict[]; affected_users: number; summary: string }

export interface BlockItem {
  id: string; facility_code: string; facility_name: string; resource_name: string;
  start_at: string; end_at: string; start_wib: string; end_wib: string;
  category: 'MAINTENANCE' | 'EVENT' | 'OPERATIONAL' | 'OTHER'; reason: string;
  created_by_name: string; created_at: string; removed_at: string | null; removed_by_name: string | null;
  removal_reason: string | null; cancelled_bookings: number;
}

export interface AdminUserItem {
  id: string; full_name: string; email: string; email_domain: string; role: Role; is_active: boolean;
  created_at: string; upcoming_count: number;
}

export interface AdminUserDetail extends Omit<AdminUserItem, 'upcoming_count'> {
  deactivated_at: string | null; deactivation_reason: string | null; email_domain_allowed: boolean;
  stats: { total: number; upcoming: number; no_shows: number; cancelled: number };
  recent_bookings: BookingView[];
}

export interface SettingItem {
  key: string; value: number | string; is_editable: boolean; min_value: number | null; max_value: number | null;
  description: string; updated_at: string; updated_by_name: string | null;
}

export interface DomainItem {
  id: string; domain: string; added_at: string; added_by_name: string; removed_at: string | null;
  removed_by_name: string | null; removal_reason: string | null; user_count: number;
}

export interface AuditItem {
  id: number; occurred_at: string; actor_name: string; actor_role: string; action: string;
  entity_type: string; entity_id: string; before: unknown; after: unknown; reason: string | null;
}
