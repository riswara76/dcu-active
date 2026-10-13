# DCU Active — Test Plan

| Item | Value |
|---|---|
| Phase | Phase 1 — Solution Architecture and UX Design |
| Version | 1.0 (Draft for review) |
| Date | 2026-10-14 |
| Related | `docs/requirements/REQUIREMENTS-TRACEABILITY-MATRIX.md` (54 mandatory scenarios), TRD §18, `SECURITY-DESIGN.md` §12 |

---

## 1. Scope

This plan covers all functional and non-functional requirements in BRD/TRD v0.2. The 54 mandatory test scenarios (TEST-01…54) are each specified in §6 and traced in the RTM.

**Out of scope:** load testing beyond the 50 concurrent-user profile (expected scale is small, BRD A-01), and penetration testing by an external party (recommended, but not part of this plan unless the PO requests it).

---

## 2. Test levels and tools

| Level | Tool | Where it runs | Owner | Phase |
|---|---|---|---|---|
| Database unit/integration | pgTAP via `supabase test db` | Local Supabase (Docker) + CI | Backend dev | 2 |
| Concurrency | Node + Vitest harness with N independent Supabase clients (separate sessions/users) | Local + staging | Backend dev | 2, 4 |
| Frontend unit/component | Vitest 5 + Testing Library + jsdom; MSW 3 for RPC mocks | CI | Frontend dev | 3 |
| Integration (SPA ↔ Supabase) | Vitest against local Supabase | CI | Full-stack | 3 |
| End-to-end | Playwright 1.64 (Chromium desktop, Pixel 7 emulation, WebKit iPhone emulation) | Staging (+ local) | QA | 4 |
| Real devices | Physical Android (Chrome) + iPhone (Safari), or a device cloud | Staging | QA | 4 |
| Accessibility | `@axe-core/playwright` 4.13 + manual (keyboard, TalkBack, VoiceOver) | Staging | QA | 3, 4 |
| Security | pgTAP privilege tests, function lint, bundle secret scan, `npm audit`, Supabase Security Advisor, OWASP ZAP baseline, manual review | CI + staging | Security / dev | 2–4 |
| Performance | Lighthouse CI (mobile), WebPageTest (Asia), k6 for RPC latency | Staging | Dev | 4 |
| UAT | Scripted scenarios, real users | Staging | PO + users | 4 |

---

## 3. Environments and test data

| Environment | Data | Email |
|---|---|---|
| Local | `supabase/seed.sql`: reference data; users `user.a@danamon.co.id`, `user.b@adira.co.id`, `user.c@homecredit.co.id`, `admin.one@danamon.co.id`, `admin.two@danamon.co.id`, `inactive.user@danamon.co.id`, `unverified@danamon.co.id` (test passwords stored only in the seed file) | Local mail catcher |
| Staging | Same synthetic users plus UAT accounts created by testers | Real delivery from `DCU@danamon.co.id` (after OD-03) |
| Production | Smoke test with a dedicated test account only; cancelled immediately | Real |

**Time control:**

- Database tests use `private.now()` with `app.test_now` (enabled only where `app.allow_time_override = on`), to simulate check-in windows, cancel cutoffs, horizon edges, and no-shows deterministically.
- E2E tests that need specific times create bookings relative to the current server time (e.g. "the next slot at least 45 minutes ahead") instead of overriding the clock.

**Reset:** `supabase db reset` before each pgTAP and integration run. Staging has a scripted data reset for test users.

---

## 4. Concurrency test harness design

1. Create N authenticated clients (each its own session and user, or the same user for the self-race tests).
2. Synchronise them with a barrier (all promises released at the same tick).
3. Fire `create_booking` (or `admin_create_block`) in parallel.
4. Collect the results. Assert the expected number of successes and the error codes of the failures.
5. Query the database directly (service role, test only) for overlaps: must be 0.
6. Repeat ≥ 50 iterations with fresh slots. Report any flake as a defect.

---

## 5. Entry and exit criteria

| Phase | Entry | Exit |
|---|---|---|
| 2 | Phase 1 approved; migrations scaffolded | All pgTAP + concurrency tests green in CI; Security Advisor clean |
| 3 | Phase 2 exit | Unit/component tests green; a11y automated checks green per screen |
| 4 | Phase 3 exit; staging deployed | TEST-01…54 all passed (or waived by the PO in writing); no open Critical/High defects; performance mandatory targets met; UAT signed off |
| 5 | Phase 4 exit | Production smoke tests pass; headers/CSP verified; backups and monitoring confirmed |

### 5.1 Defect severity

| Severity | Definition | Go-live rule |
|---|---|---|
| Critical | Double booking, data leak, privilege escalation, booking impossible | Must be fixed |
| High | A core journey is blocked for a group of users; wrong status or limit enforcement | Must be fixed |
| Medium | Workaround exists; cosmetic issues in core flows | PO decides |
| Low | Minor cosmetic | Backlog |

---

## 6. Test case catalogue

**Level codes:** DB = pgTAP · CC = concurrency · INT = integration · E2E = Playwright · DEV = real device · A11Y · SEC · PERF · MAN = manual.

### 6.1 Authentication & account

| ID | Title | Level | Preconditions → steps → expected |
|---|---|---|---|
| TEST-01 | Register and verify email | E2E, INT | Allowed-domain email → register → code email received → enter code → signed in, profile role USER. Also via link: GET does not verify; Confirm click verifies. |
| TEST-02 | Login and logout | E2E | Verified user → login → Home. Logout → protected route redirects to Login. Wrong password → generic message. |
| TEST-03 | Reset password | E2E, INT | Forgot password → same message for existing and unknown email → code → new valid password → login works; other sessions signed out; old code reuse rejected. |
| TEST-49 | Scanner-safe links | INT, E2E | HTTP GET of the confirmation and reset links (no JS click) leaves the account unverified/unchanged; the explicit click succeeds. |
| TEST-50 | Open redirect | E2E, unit | `/login?next=https://evil.example`, `//evil`, `/\evil`, encoded variants → redirect to `/`; valid `/bookings` honoured. |
| TEST-51 | Backend password policy & rate limits | INT | Direct Auth API sign-up with `password1` → rejected. Repeated wrong logins → rate-limited response. |
| TEST-52 | Email domain restriction | INT, E2E | Sign-up `@danamon.co.id`, `@ADIRA.co.id`, `@homecredit.co.id` → accepted. `@gmail.com`, `@branch.danamon.co.id`, `@danamon.co.id.evil.com` → `EMAIL_DOMAIN_NOT_ALLOWED`, including via direct Auth API. |
| TEST-46 | Profile | E2E, DB | View profile; update name (2–100 chars) → saved + audit; invalid name rejected; change password enforces policy; email not editable. |

### 6.2 Booking

| ID | Title | Level | Preconditions → steps → expected |
|---|---|---|---|
| TEST-04 | Tennis 30 min | DB, E2E | Free slot → book 30 → CONFIRMED, end = start + 30, appears in My bookings, notification created. |
| TEST-05 | Tennis 60 min | DB, E2E | As above with 60; single continuous row (BR-17). |
| TEST-06 | Tennis 90 min | DB, E2E | As above with 90. Also: 20:00 + 90 → `OUTSIDE_OPERATING_HOURS`. Football 60/90 accepted; Table Tennis 60 → `INVALID_DURATION`. |
| TEST-07 | Overlapping Tennis rejected | DB, CC | Existing 17:00–18:30 → request 18:00–18:30 → `SLOT_UNAVAILABLE`. Direct INSERT of an overlap violates the exclusion constraint. 20 parallel requests for one slot → exactly 1 success. |
| TEST-08 | Shared court | DB, E2E | Basketball 16:00–17:00 → Futsal 16:30–17:00 → `SLOT_UNAVAILABLE`. The grid shows the court booked for both activities. |
| TEST-09 | Air Hockey allocation | DB, CC | Two users book the same slot → Table 1 and Table 2 assigned (lowest first). |
| TEST-10 | Third Air Hockey rejected | CC | 3 simultaneous requests → 2 successes on distinct tables, 1 `SLOT_UNAVAILABLE`. ≥ 50 iterations, 0 overlaps. |
| TEST-11 | Foosball allocation | DB, CC | As TEST-09 for Foosball. |
| TEST-12 | Third Foosball rejected | CC | As TEST-10 for Foosball. |
| TEST-13 | Max 2 active/future | DB, CC | User with 2 upcoming → 3rd → `BOOKING_LIMIT_REACHED`. After one completes or is cancelled → allowed. 10 parallel requests from one user → ≤ 2 succeed. Admin's own bookings follow the same limit. |
| TEST-14 | One per facility per day | DB, CC | Tennis 07:00 → Tennis 19:00 same day → `FACILITY_DAILY_LIMIT_REACHED`. Basketball then Futsal same day → rejected. After cancel → allowed. After no-show → still rejected. Different day → allowed. |
| TEST-15 | Booking horizon | DB | today+7 → ok; today+8 → `BOOKING_WINDOW_EXCEEDED`; yesterday → rejected; WIB date rollover at 00:00 WIB (17:00 UTC) handled. |
| TEST-16 | Operating hours & alignment | DB | 05:30 start, 20:30+60, 06:15 start → rejected with the correct codes. A slot that started 1 minute ago → `SLOT_IN_PAST`. |
| TEST-26 | Simultaneous requests | CC | Mixed scenario: 30 users × random slots on all facilities in parallel → no overlaps, all failures are business codes. |
| TEST-34 | No bypass via direct API | SEC, CC | Using the raw REST endpoint with a valid user JWT: tamper inputs (other user's id not accepted, past dates, 45-min duration, foreign resource) → all rejected; direct table access via REST → 404/permission denied (schema not exposed). |
| TEST-44 | Idempotency | DB, E2E | Same idempotency key twice → same booking id returned, one row. Double-tap Confirm in the UI → one booking. |

### 6.3 Cancellation, check-in, status

| ID | Title | Level | Preconditions → steps → expected |
|---|---|---|---|
| TEST-17 | Cancel releases resource | DB, E2E | Cancel 2 h before → CANCELLED, slot available to another user immediately; history retained; notification; Realtime signal. |
| TEST-18 | Check-in within window | DB (clock), E2E | Start 18:00: check-in at 17:45:00 and 18:15:00 → CHECKED_IN. Banner on Home during the window. |
| TEST-19 | Check-in outside window | DB (clock) | 17:44:59 → `CHECKIN_TOO_EARLY` (opens 17:45); 18:15:01 → `CHECKIN_WINDOW_CLOSED`; CANCELLED booking → `CHECKIN_NOT_ALLOWED`. With the setting changed to 10/10 → windows move accordingly. |
| TEST-20 | No-show | DB (clock), INT | No check-in by 18:15 → effective status NO_SHOW immediately; job sets NO_SHOW ≤ 1 min; 18:00 slot not bookable (started), 18:30 bookable by others; counts for the daily limit. |
| TEST-45 | Status integrity | DB | Illegal transitions (NO_SHOW→CHECKED_IN, CANCELLED→CONFIRMED, COMPLETED→ADMIN_CANCELLED) raise an error. CHECKED_IN → COMPLETED after end. Effective status table (TRD 11.5) verified at boundaries. |
| TEST-54 | Settings screen & cancel cutoff | DB, E2E | Start 18:00: cancel at 17:30:00 → ok; 17:30:01 → `BOOKING_NOT_CANCELLABLE`. Admin changes the cutoff to 60 (reason required) → audit with old/new; next cancel follows 60. Out-of-range values (e.g. horizon 31) → `VALIDATION_ERROR`. Read-only key → `SETTING_READ_ONLY`. Existing bookings untouched. USER calling → `FORBIDDEN`. |

### 6.4 Administration

| ID | Title | Level | Preconditions → steps → expected |
|---|---|---|---|
| TEST-21 | Create block | DB, E2E | Block Tennis 08:00–12:00 tomorrow (no conflicts) → slots show "Unavailable – Maintenance"; bookings in range rejected. Resource-level block on Air Hockey Table 1 → capacity shows "1 left". |
| TEST-22 | Block conflicts | DB, CC, E2E | Two bookings in range → preview lists them; create without confirm → `ADMIN_BLOCK_CONFLICT`; with confirm + matching ids → both ADMIN_CANCELLED (source BLOCK), owners notified, audit rows; a new booking made between preview and confirm → `BLOCK_CONFLICTS_CHANGED`. A booking racing a block → never both committed. |
| TEST-33 | Audit logging | DB, INT | Every admin mutation produces exactly one audit row with actor, time, entity, reason; UPDATE/DELETE on audit_logs fails for every role. |
| TEST-36 | Dashboard metrics | DB | Seeded dataset → counts and utilization equal independent SQL; the 900/120/390 → 50% example reproduced. |
| TEST-37 | Booking management | DB, E2E | Filters (date, facility, status, resource) and search (ref, name, email) combine correctly; owner and resource visible to admin only. |
| TEST-38 | Remove block | DB, E2E | Remove → slots available again; block kept with removed_by/reason; cancelled bookings stay cancelled. |
| TEST-39 | User activation & safeguards | DB, E2E | Deactivate user (reason) → future bookings ADMIN_CANCELLED (source DEACTIVATION), notification; self-deactivation → `SELF_MODIFICATION_NOT_ALLOWED`; deactivating the last admin → `LAST_ADMIN_PROTECTED`; reactivate → can book again. |
| TEST-40 | Roles & escalation | DB, SEC | Grant/revoke ADMIN audited; a user has no path to change own role (RPCs, direct REST, profile update); concurrent revocation of the two last admins → one fails. |
| TEST-53 | Domain management | DB, E2E | Add `example.co.id` → sign-up works immediately; rename audited; remove → new sign-ups rejected, existing users still log in and book; remove last domain → `LAST_DOMAIN_PROTECTED`; granting ADMIN to a user whose domain was removed → `EMAIL_DOMAIN_NOT_ALLOWED`; USER → `FORBIDDEN`. |

### 6.5 Security & privacy

| ID | Title | Level | Preconditions → steps → expected |
|---|---|---|---|
| TEST-23 | Others' reservations | DB, SEC | User B calls `get_my_booking(A's id)` → `BOOKING_NOT_FOUND`; `list_my_bookings` returns only own; RLS impersonation tests per role. |
| TEST-24 | Admin access | DB, SEC, E2E | USER calls each `admin_*` RPC → `FORBIDDEN`; `/admin` in the UI → Not found; RLS admin policies deny. |
| TEST-25 | Deactivated user, existing session | INT | Session open → admin deactivates → next `create_booking` / `cancel_my_booking` / `check_in` → `ACCOUNT_DISABLED`; UI shows Account disabled. |
| TEST-35 | No privileged keys in bundle | SEC (CI) | Build production → scan `dist/` → no `sb_secret_`, `service_role`, or non-anon JWT. |
| TEST-41 | Notifications | DB, E2E | Each event creates one notification for the right user only; unread badge; mark read. |
| TEST-42 | Privacy of availability & Realtime | DB, INT | `get_availability` JSON contains no user/booking identifiers; Realtime payload only `{facility_code, date_wib}`; anon subscribe to `availability:*` denied; user cannot subscribe to another `user:<uid>`. |
| TEST-47 | Error & empty states | E2E | Fault injection (500, network error, unknown code) → friendly messages with reference, no SQL/stack text; XSS payload in name/reason rendered as text. |

### 6.6 Platform, UX, non-functional

| ID | Title | Level | Preconditions → steps → expected |
|---|---|---|---|
| TEST-27 | WIB display in another timezone | E2E | Playwright `timezoneId: 'America/New_York'` and `'Asia/Tokyo'` → all times in WIB, "today" = server WIB date, booking stored at the correct instant. |
| TEST-28 | Android Chrome | DEV | Core journeys UJ-01…08 on a recent Android phone. |
| TEST-29 | iPhone Safari | DEV | Same on a recent iPhone (iOS 17+). |
| TEST-30 | Offline | E2E | Context offline → banner; Book/Cancel/Check-in disabled; availability shows the offline message (no cached data); back online → recovers. |
| TEST-31 | PWA installation & update | DEV, PERF | Lighthouse installability; install on Android; iOS Add-to-Home-Screen hint; new deploy → update prompt. |
| TEST-32 | Accessibility | A11Y | axe: 0 serious/critical on all screens; keyboard-only booking journey; TalkBack and VoiceOver journeys; 200% zoom and 320 px reflow. |
| TEST-43 | Realtime refresh & fallback | E2E | Two browsers: booking in A appears in B ≤ 3 s; with WebSocket blocked → refresh within 30 s via polling. |
| TEST-48 | Responsive & performance | E2E, PERF | No horizontal scroll at 360/390/414/768/1024/1280/1440; touch targets; admin at 390 px; mandatory performance targets (TRD §15) measured and recorded. |

---

## 7. Device and browser matrix (Phase 4)

| Platform | Browser | Method |
|---|---|---|
| Android 14+ (mid-tier phone) | Chrome (latest) | Real device |
| iOS 17+ (iPhone) | Safari | Real device |
| iPadOS (latest) | Safari | Real device or cloud |
| Windows 11 | Chrome, Edge (latest) | Playwright + manual |
| macOS | Safari, Chrome (latest) | Manual |
| Any | Firefox (latest) | Playwright smoke |

---

## 8. UAT plan (Phase 4)

- **Participants:** ≥ 5 users from at least two of the three companies, plus ≥ 2 admins (`@danamon.co.id`).
- **Script:** register, book (Tennis 60, Futsal, Air Hockey), cancel before and after the cutoff, check in, observe a no-show, admin block with conflict, change a setting, add/remove a test domain.
- **Success:** SC-M5 (≥ 4 of 5 complete their first booking unaided) and no open Critical/High defects.
- **Sign-off:** PO, in writing.

---

## 9. Reporting

- CI publishes pgTAP, Vitest, and Playwright reports per run.
- `docs/testing/TEST-RESULTS.md` (Phase 4) records each TEST-ID with the date, environment, result, evidence link, and defects.
- The RTM is updated with the final status per requirement.
