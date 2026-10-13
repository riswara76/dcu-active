# DCU Active — API / RPC Specification

| Item | Value |
|---|---|
| Phase | Phase 1 — Solution Architecture and UX Design |
| Version | 1.0 (Draft for review) |
| Date | 2026-10-14 |
| Related | `DATABASE-DESIGN.md` §6, `SECURITY-DESIGN.md`, TRD §11 |

---

## 1. Conventions

### 1.1 Transport

- All business operations are PostgreSQL functions in schema **`api`**, called through the Supabase Data API: `POST {SUPABASE_URL}/rest/v1/rpc/<name>` with the header `Content-Profile: api`.
- In the SPA they are always called through the typed wrapper: `supabase.schema('api').rpc('<name>', args)`.
- Authentication is via the user's access token (`Authorization: Bearer <JWT>`), sent automatically by supabase-js. The `apikey` header carries the **publishable** key.
- Authentication operations use the Supabase Auth API through supabase-js (§3).

### 1.2 Types used below

| Type | Format |
|---|---|
| `Instant` | ISO-8601 UTC string, e.g. `"2026-10-14T10:00:00Z"` |
| `DateWIB` | `"YYYY-MM-DD"` (business date in Asia/Jakarta) |
| `TimeWIB` | `"HH:MM"` (24 h, WIB) |
| `BookingStatus` | `CONFIRMED` \| `CHECKED_IN` \| `COMPLETED` \| `CANCELLED` \| `ADMIN_CANCELLED` \| `NO_SHOW` |
| `EffectiveStatus` | `UPCOMING` \| `CANCEL_CLOSED` \| `CHECKIN_OPEN` \| `IN_PROGRESS` \| `COMPLETED` \| `CANCELLED` \| `ADMIN_CANCELLED` \| `NO_SHOW` |
| `Cursor` | opaque string; `null` when there are no more pages |

### 1.3 Common response objects

```ts
type BookingView = {
  id: string; booking_ref: string;
  facility: { code: string; name: string };
  activity: { code: string; name: string };
  resource_name: string | null;        // owner and admins only; null in other contexts
  date_wib: DateWIB; start_wib: TimeWIB; end_wib: TimeWIB;
  start_at: Instant; end_at: Instant; duration_minutes: 30 | 60 | 90;
  status: BookingStatus; effective_status: EffectiveStatus;
  checkin_opens_wib: TimeWIB; checkin_closes_wib: TimeWIB;
  cancel_until_wib: TimeWIB;           // last moment the user may cancel
  can_cancel: boolean; can_check_in: boolean;   // computed with server time
  cancellation_reason: string | null;  // shown to the owner for ADMIN_CANCELLED
  created_at: Instant;
};
```

---

## 2. Error contract

Business errors are raised with `SQLSTATE P0001`. PostgREST returns **HTTP 400** with this body:

```json
{ "code": "P0001", "message": "SLOT_UNAVAILABLE", "details": "{\"facility_code\":\"TENNIS\",\"date\":\"2026-10-15\"}", "hint": null }
```

- `message` is always one of the codes in the table below.
- `details` is a JSON string with optional context.
- Any other error (SQLSTATE not `P0001`, or an HTTP 5xx) is treated by the SPA as `INTERNAL_ERROR`.
- Database error text is **never** displayed.

| Code | Meaning | Typical RPCs |
|---|---|---|
| `NOT_AUTHENTICATED` | No valid session | all except public |
| `EMAIL_NOT_VERIFIED` | Account email not verified | booking RPCs |
| `ACCOUNT_DISABLED` | Profile inactive | all user/admin RPCs |
| `FORBIDDEN` | Not an admin | `admin_*` |
| `VALIDATION_ERROR` | Malformed or out-of-range input; `details.fields` lists problems | any |
| `RATE_LIMITED` | Too many calls | `create_booking` |
| `SYSTEM_BUSY` | Lock or statement timeout; retry | mutations |
| `FACILITY_NOT_FOUND` / `ACTIVITY_INVALID` | Unknown or inactive facility; activity not of that facility | booking |
| `BOOKING_WINDOW_EXCEEDED` | Date outside today … today + horizon | availability, booking |
| `SLOT_MISALIGNED` | Start not at :00/:30 | booking |
| `OUTSIDE_OPERATING_HOURS` | Not within 06:00–21:00 WIB | booking, blocks |
| `SLOT_IN_PAST` | Start time already reached | booking |
| `INVALID_DURATION` | Duration not allowed for facility | booking |
| `BOOKING_LIMIT_REACHED` | Active/future limit reached (`details.limit`) | booking |
| `FACILITY_DAILY_LIMIT_REACHED` | Daily limit for facility reached (`details.limit`) | booking |
| `SLOT_UNAVAILABLE` | No free resource (booked or blocked) | booking |
| `BOOKING_NOT_FOUND` | Unknown or not owned | booking detail/actions |
| `BOOKING_NOT_CANCELLABLE` | Status not CONFIRMED, or past the cutoff (`details.cutoff_minutes`) | cancel |
| `CHECKIN_TOO_EARLY` | `details.opens_wib` | check-in |
| `CHECKIN_WINDOW_CLOSED` | Past the deadline | check-in |
| `CHECKIN_NOT_ALLOWED` | Wrong status | check-in |
| `ADMIN_BLOCK_CONFLICT` | `details.conflicts` = list of bookings | create block |
| `BLOCK_CONFLICTS_CHANGED` | Conflicts differ from `expected_conflict_ids` | create block |
| `BLOCK_NOT_FOUND`, `USER_NOT_FOUND`, `DOMAIN_NOT_FOUND` | Not found | admin |
| `LAST_ADMIN_PROTECTED` | Would leave no active admin | admin users |
| `SELF_MODIFICATION_NOT_ALLOWED` | Admin acting on own status/role | admin users |
| `EMAIL_DOMAIN_NOT_ALLOWED` | Sign-up or admin grant from a non-allowed domain | Auth hook, `admin_set_user_role` |
| `DOMAIN_ALREADY_EXISTS`, `LAST_DOMAIN_PROTECTED` | Domain management | admin domains |
| `REASON_REQUIRED` | Mandatory reason missing or shorter than 5 chars | admin mutations |
| `SETTING_READ_ONLY` | Setting not editable | `admin_update_setting` |

---

## 3. Authentication operations (Supabase Auth via supabase-js)

| Operation | Call | Notes |
|---|---|---|
| Register | `auth.signUp({ email, password, options: { data: { full_name }, emailRedirectTo: <origin>/auth/confirm } })` | The Before-User-Created hook rejects non-allowed domains (error message `EMAIL_DOMAIN_NOT_ALLOWED`). The password policy is enforced by Auth. |
| Verify by code | `auth.verifyOtp({ email, token, type: 'email' })` | 6-digit code from the email |
| Verify by link | `/auth/confirm?token_hash=…&type=signup` → user clicks **Confirm** → `auth.verifyOtp({ token_hash, type })` | Scanner-safe (TR-AUTH-03) |
| Resend code | `auth.resend({ type: 'signup', email })` | Rate-limited by Auth |
| Sign in | `auth.signInWithPassword({ email, password })` | Generic error on failure |
| Sign out | `auth.signOut()` (this device) | |
| Forgot password | `auth.resetPasswordForEmail(email, { redirectTo: <origin>/reset-password })` | Same response for any email |
| Reset password | Code (`verifyOtp type 'recovery'`) or link → `auth.updateUser({ password })` → `auth.signOut({ scope: 'others' })` | |
| Change password (signed in) | `auth.updateUser({ password })` | Policy enforced by Auth |

> The exact OTP `type` values for the sign-up code are confirmed against the Supabase Auth version during the Phase 2 spike. The email template must contain both `{{ .Token }}` and the `{{ .TokenHash }}` link.

---

## 4. Public RPCs (role `anon` and `authenticated`)

### 4.1 `get_registration_domains()`

| | |
|---|---|
| Purpose | Show allowed domains on the registration screen |
| Input | — |
| Output | `{ domains: string[] }` — e.g. `["adira.co.id","danamon.co.id","homecredit.co.id"]` (sorted) |
| Errors | — |
| Transaction | Read-only, `SECURITY DEFINER`, returns domain names only |

### 4.2 `health()`

| | |
|---|---|
| Purpose | Uptime monitoring |
| Output | `{ ok: true, db_time: Instant, status_job_last_run: Instant \| null, status_job_healthy: boolean }` |
| Notes | No personal data. `status_job_healthy = last successful run ≤ 5 min ago`. |

---

## 5. User RPCs (role `authenticated`, active user unless noted)

### 5.1 `get_my_profile()`

- **Output:** `{ id, email, full_name, role: 'USER'|'ADMIN', is_active, email_verified, created_at }`
- **Notes:** works for inactive users, so the SPA can route to *Account disabled*.
- **Security:** INVOKER (RLS).

### 5.2 `update_my_profile(p_full_name text)`

- **Validation:** trimmed length 2–100; no control characters.
- **Output:** profile.
- **Errors:** `VALIDATION_ERROR`, `ACCOUNT_DISABLED`.
- **Transaction:** update + audit `PROFILE_UPDATE`.

### 5.3 `get_app_config()`

**Output:**

```json
{ "timezone": "Asia/Jakarta", "now": "2026-10-14T02:13:00Z", "today_wib": "2026-10-14",
  "operating_open": "06:00", "operating_close": "21:00", "slot_minutes": 30,
  "booking_horizon_days": 7, "max_active_bookings": 2, "max_bookings_per_facility_per_day": 1,
  "checkin_open_before_minutes": 15, "checkin_close_after_minutes": 15, "user_cancel_cutoff_minutes": 30 }
```

### 5.4 `list_facilities()`

**Output:**

```json
[ { "code": "COURT", "name": "Basketball / Futsal Court", "description": null,
    "allowed_durations": [30,60,90], "allocation_mode": "SINGLE", "resource_count": 1,
    "activities": [ {"code":"BASKETBALL","name":"Basketball"}, {"code":"FUTSAL","name":"Futsal"} ] } ]
```

### 5.5 `get_availability(p_facility_code text, p_date date)`

- **Validation:** facility active; `p_date` within today … today + horizon (WIB).
- **Output:**

```json
{ "facility_code": "AIR_HOCKEY", "date_wib": "2026-10-15", "total_resources": 2,
  "slots": [
    { "start_wib": "06:00", "end_wib": "06:30", "start_at": "2026-10-14T23:00:00Z",
      "state": "AVAILABLE", "available_count": 2, "bookable_durations": [30],
      "is_mine": false, "unavailable_label": null },
    { "start_wib": "17:00", "end_wib": "17:30", "state": "BOOKED", "available_count": 0,
      "bookable_durations": [], "is_mine": true, "unavailable_label": null },
    { "start_wib": "08:00", "end_wib": "08:30", "state": "UNAVAILABLE", "available_count": 0,
      "bookable_durations": [], "is_mine": false, "unavailable_label": "Maintenance" }
  ] }
```

- **States:**
  - `AVAILABLE`: ≥ 1 free resource.
  - `BOOKED`: all resources occupied by bookings.
  - `UNAVAILABLE`: blocked; `unavailable_label` ∈ Maintenance/Event/Operational/null.
  - `PAST`: start ≤ now.
- **`bookable_durations`:** durations for which **one** resource is continuously free and the slot ends ≤ 21:00.
- **Privacy:** no user ids, names, booking ids, or resource names (TEST-42).
- **Security:** DEFINER (aggregates only).

### 5.6 `create_booking(p_facility_code text, p_activity_code text, p_date date, p_start_time text, p_duration_minutes int, p_idempotency_key uuid)`

| | |
|---|---|
| Validation & order | As TRD §7.2: auth → active/verified → idempotency → facility/activity → horizon → alignment/hours/not started → duration → (sweep) active limit → daily limit → (lock, sweep) allocation |
| Output | `BookingView` (with `resource_name`) |
| Errors | `NOT_AUTHENTICATED`, `ACCOUNT_DISABLED`, `EMAIL_NOT_VERIFIED`, `RATE_LIMITED`, `FACILITY_NOT_FOUND`, `ACTIVITY_INVALID`, `BOOKING_WINDOW_EXCEEDED`, `SLOT_MISALIGNED`, `OUTSIDE_OPERATING_HOURS`, `SLOT_IN_PAST`, `INVALID_DURATION`, `BOOKING_LIMIT_REACHED`, `FACILITY_DAILY_LIMIT_REACHED`, `SLOT_UNAVAILABLE`, `SYSTEM_BUSY` |
| Transaction | Atomic. Locks the profile and facility resources. Inserts booking + notification `BOOKING_CONFIRMED` + audit `BOOKING_CREATE`. Realtime signal after commit. Idempotent per key. |

### 5.7 `list_my_bookings(p_scope text, p_limit int default 20, p_cursor text default null)`

- **`p_scope`:**
  - `UPCOMING`: CONFIRMED/CHECKED_IN with `end_at > now`, ascending by start.
  - `HISTORY`: everything else, descending by start.
- **Validation:** `p_limit` 1–50.
- **Output:** `{ items: BookingView[], next_cursor: Cursor }`.
- **Security:** INVOKER (RLS own rows).

### 5.8 `get_my_booking(p_booking_id uuid)`

- **Output:** `BookingView`.
- **Errors:** `BOOKING_NOT_FOUND`, also for other users' bookings, so existence is never revealed.

### 5.9 `cancel_my_booking(p_booking_id uuid)`

| | |
|---|---|
| Validation | Owner; status CONFIRMED; `now ≤ start_at − user_cancel_cutoff_minutes` |
| Output | `BookingView` (status CANCELLED) |
| Errors | `BOOKING_NOT_FOUND`, `BOOKING_NOT_CANCELLABLE` (`details: { cutoff_minutes, cancel_until_wib }`), `ACCOUNT_DISABLED` |
| Transaction | Lock profile → booking. Update + notification `BOOKING_CANCELLED` + audit. Realtime signal. |

### 5.10 `check_in(p_booking_id uuid)`

| | |
|---|---|
| Validation | Owner; status CONFIRMED; `start − open_before ≤ now ≤ start + close_after` (inclusive) |
| Output | `BookingView` (status CHECKED_IN) |
| Errors | `BOOKING_NOT_FOUND`, `CHECKIN_TOO_EARLY` (`details.opens_wib`), `CHECKIN_WINDOW_CLOSED`, `CHECKIN_NOT_ALLOWED`, `ACCOUNT_DISABLED` |
| Transaction | Lock profile → booking. Update + notification `CHECKED_IN` + audit. |

### 5.11 `list_my_notifications(p_limit int default 20, p_cursor text default null)` / `mark_notifications_read(p_ids uuid[] default null)`

- **List output:** `{ items: [{ id, type, title, body, booking_id, created_at, read_at }], unread_count, next_cursor }`.
- **Mark read:** `p_ids = null` marks all as read. Returns `{ updated: int }`.

---

## 6. Admin RPCs (active ADMIN only; otherwise `FORBIDDEN`)

All admin mutations require `p_reason text` (5–500 chars) unless noted, and write one audit row in the same transaction.

### 6.1 `admin_dashboard_metrics(p_date_from date, p_date_to date)`

- **Validation:** range ≤ 31 days.
- **Output:**

```json
{ "range": {"from":"2026-10-14","to":"2026-10-14"},
  "bookings": { "total": 42, "upcoming": 18, "checked_in": 9, "completed": 7, "cancelled": 5,
                "admin_cancelled": 1, "no_show": 2 },
  "active_users": 315,
  "utilization": [ { "facility_code": "TENNIS", "available_minutes": 780, "used_minutes": 390,
                     "reserved_minutes": 450, "used_pct": 50.0, "reserved_pct": 57.7 } ] }
```

- **Utilization (OD-26):** `used_pct = used ÷ (operating − blocked)`. `reserved_pct` also counts no-shows. Both are per resource-minute.

### 6.2 `admin_list_bookings(p_filters jsonb, p_limit int default 50, p_cursor text default null)`

- **Filters:** `date_from`, `date_to` (≤ 92 days), `facility_code`, `activity_code`, `resource_code`, `status[]`, `q` (booking ref, owner name or email, trigram search).
- **Output:** `{ items: [BookingView & { owner: { id, full_name, email } }], next_cursor }`.

### 6.3 `admin_get_booking(p_booking_id uuid)`

- **Output:** `BookingView & { owner, audit: [{ occurred_at, actor_name, action, reason }] }`.

### 6.4 `admin_cancel_booking(p_booking_id uuid, p_reason text)`

- **Validation:** status CONFIRMED or CHECKED_IN; `end_at > now`.
- **Effect:** status ADMIN_CANCELLED (source ADMIN), owner notified (`ADMIN_CANCELLED`, reason included), audit, signal.
- **Errors:** `BOOKING_NOT_FOUND`, `BOOKING_NOT_CANCELLABLE`, `REASON_REQUIRED`.

### 6.5 `admin_preview_block(p_facility_code text, p_resource_code text default null, p_start_at timestamptz, p_end_at timestamptz)`

- **Validation:** 30-min aligned; each covered day within 06:00–21:00 WIB; `end > start`.
- **Output:** `{ conflicts: [{ booking_id, booking_ref, owner_name, owner_email, resource_name, date_wib, start_wib, end_wib, status }], affected_users: int, summary: string }`.

### 6.6 `admin_create_block(p_facility_code, p_resource_code, p_start_at, p_end_at, p_category, p_reason, p_confirm_cancel_conflicts boolean default false, p_expected_conflict_ids uuid[] default '{}')`

- **Behaviour:**
  1. Lock resources.
  2. Recompute conflicts.
  3. If there are conflicts and they are not confirmed → `ADMIN_BLOCK_CONFLICT` (with list).
  4. If the set ≠ expected → `BLOCK_CONFLICTS_CHANGED`.
  5. Otherwise cancel the conflicts (ADMIN_CANCELLED, source BLOCK, `block_id`), insert the block, notify, audit, signal.
- **Output:** `{ block: {...}, cancelled_booking_ids: uuid[] }`.

### 6.7 `admin_remove_block(p_block_id uuid, p_reason text)` / `admin_list_blocks(p_filters jsonb, p_limit, p_cursor)`

- **Remove:** soft removal. Cancelled bookings are not restored. Signal.
- **List filters:** date range, facility, `include_removed`.

### 6.8 `admin_list_users(p_q text, p_status text, p_role text, p_limit, p_cursor)` / `admin_get_user(p_user_id uuid)`

- **List output:** `{ items: [{ id, full_name, email, role, is_active, email_domain, created_at, upcoming_count }], next_cursor }`.
- **Detail adds:** booking stats (total, no-shows, cancellations) and the last 10 bookings.

### 6.9 `admin_set_user_active(p_user_id uuid, p_active boolean, p_reason text)`

- **Validation:** not self; deactivating the last active admin is rejected.
- **Effect on deactivate:**
  - Profile becomes inactive.
  - All CONFIRMED future bookings → ADMIN_CANCELLED (source DEACTIVATION, reason "Account deactivated").
  - Notification `ACCOUNT_DEACTIVATED`; audit; signals.
- **Effect on activate:** profile active; audit. Cancelled bookings are not restored.
- **Output:** `{ user, cancelled_booking_ids }`.
- **Errors:** `USER_NOT_FOUND`, `SELF_MODIFICATION_NOT_ALLOWED`, `LAST_ADMIN_PROTECTED`, `REASON_REQUIRED`.

### 6.10 `admin_set_user_role(p_user_id uuid, p_role text, p_reason text)`

- **Validation:**
  - Not self.
  - Granting ADMIN requires the target to be active, verified, and from a currently allowed domain (`EMAIL_DOMAIN_NOT_ALLOWED`).
  - Revoking must keep ≥ 1 active admin.
- **Locking:** all active ADMIN profiles `FOR UPDATE` (ordered) → race-safe.

### 6.11 `admin_get_settings()` / `admin_update_setting(p_key text, p_value jsonb, p_reason text)`

- **Get output:** `[{ key, value, is_editable, min_value, max_value, description, updated_at, updated_by_name }]`.
- **Update validation:** key exists and is editable (`SETTING_READ_ONLY`); integer within range (`VALIDATION_ERROR`).
- **Audit:** `SETTING_UPDATE` with before/after.

### 6.12 Email domains

| RPC | Input | Validation | Errors |
|---|---|---|---|
| `admin_list_email_domains(p_include_removed boolean default false)` | — | — | — |
| `admin_add_email_domain(p_domain text, p_reason text)` | domain | Lowercased; hostname pattern; not an active duplicate | `VALIDATION_ERROR`, `DOMAIN_ALREADY_EXISTS` |
| `admin_rename_email_domain(p_domain_id uuid, p_new_domain text, p_reason text)` | id, new name | As add | + `DOMAIN_NOT_FOUND` |
| `admin_remove_email_domain(p_domain_id uuid, p_reason text)` | id | ≥ 1 active domain remains | `LAST_DOMAIN_PROTECTED`, `DOMAIN_NOT_FOUND` |

Existing users of a removed domain are **not** affected (OD-30).

### 6.13 `admin_list_audit_logs(p_filters jsonb, p_limit, p_cursor)`

- **Filters:** date range, `actor_id`, `action[]`, `entity_type`, `entity_id`.
- **Output:** `{ items: [{ id, occurred_at, actor_name, actor_role, action, entity_type, entity_id, before, after, reason }], next_cursor }`.

---

## 7. Realtime events

| Topic (private) | Event | Payload | Emitted when | Client action |
|---|---|---|---|---|
| `availability:<FACILITY_CODE>` | `availability_changed` | `{ "facility_code": "TENNIS", "date_wib": "2026-10-15" }` | Booking created/cancelled/admin-cancelled/no-show; block created/removed | Invalidate `['availability', code, date]` |
| `user:<uid>` | `notification` | `{ "type": "ADMIN_CANCELLED" }` | Notification inserted for that user | Invalidate notifications + my-bookings; on `ACCOUNT_DEACTIVATED` → re-check profile |

---

## 8. Versioning and compatibility

- RPC signatures are part of the contract. Breaking changes require a new function name (e.g. `create_booking_v2`), with the old one kept for one release.
- TypeScript types are generated from the database with `supabase gen types typescript --schema api` in CI. The build fails if the wrappers drift.
