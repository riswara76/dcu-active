# DCU Active — Requirements Traceability Matrix (RTM)

| Item | Value |
|---|---|
| Phase | Phase 0 |
| Version | 0.2 (PO decisions incorporated) |
| Date | 2026-10-13 |
| Sources | `BRD.md` (BO, FR, BR, NFR, SC), `TRD.md` (TR, TAC) |

**Chain:** Business Objective → Business Requirement / Rule → Technical Requirement → Acceptance Criteria → Test Scenario.

**Test IDs:** TEST-01…TEST-35 are the **mandatory** scenarios from the master instruction. TEST-36…TEST-51 close the coverage gaps identified in Section 4 and were **made mandatory by the Product Owner on 2026-10-13 (OD-24)**. TEST-52…TEST-54 cover the requirements added by PO decisions (email domains, settings screen). In the tables below, "(P)" marks tests from this added set.

---

## 1. Test scenario catalogue

### 1.1 Mandatory (APPROVED)

| ID | Scenario | Primary level |
|---|---|---|
| TEST-01 | Register and verify email | E2E + integration |
| TEST-02 | Login and logout | E2E |
| TEST-03 | Reset password | E2E + integration |
| TEST-04 | Book Tennis for 30 minutes | pgTAP + E2E |
| TEST-05 | Book Tennis for 60 minutes | pgTAP + E2E |
| TEST-06 | Book Tennis for 90 minutes | pgTAP + E2E |
| TEST-07 | Reject overlapping Tennis bookings | pgTAP + concurrency |
| TEST-08 | Reject Futsal when Basketball occupies the court | pgTAP + E2E |
| TEST-09 | Allocate two Air Hockey tables correctly | pgTAP + concurrency |
| TEST-10 | Reject a third simultaneous Air Hockey reservation | Concurrency |
| TEST-11 | Allocate two Foosball tables correctly | pgTAP + concurrency |
| TEST-12 | Reject a third simultaneous Foosball reservation | Concurrency |
| TEST-13 | Enforce maximum two active/future bookings | pgTAP + concurrency |
| TEST-14 | Enforce one booking per facility per day | pgTAP + concurrency |
| TEST-15 | Reject reservations beyond the booking horizon | pgTAP |
| TEST-16 | Reject reservations outside operating hours | pgTAP |
| TEST-17 | Cancel a booking and release its resource | pgTAP + E2E |
| TEST-18 | Check in during the permitted window | pgTAP (time override) + E2E |
| TEST-19 | Reject check-in outside the permitted window | pgTAP (time override) |
| TEST-20 | Handle no-show correctly | pgTAP (time override) + integration |
| TEST-21 | Create an administrative facility block | pgTAP + E2E |
| TEST-22 | Handle conflicts between blocks and existing bookings | pgTAP + concurrency + E2E |
| TEST-23 | Prevent unauthorized access to other users' reservations | pgTAP (RLS) + API |
| TEST-24 | Prevent unauthorized administrative access | pgTAP + API + E2E |
| TEST-25 | Immediately reject protected operations from deactivated users | pgTAP + integration |
| TEST-26 | Handle simultaneous booking requests | Concurrency |
| TEST-27 | Display correct WIB times when the device uses another timezone | E2E (`timezoneId`) + unit |
| TEST-28 | Operate correctly on Android Chrome | Real device |
| TEST-29 | Operate correctly on iPhone Safari | Real device |
| TEST-30 | Handle offline state safely | E2E (offline) |
| TEST-31 | Validate PWA installation where supported | Real device + Lighthouse |
| TEST-32 | Verify accessibility requirements | axe + manual |
| TEST-33 | Verify administrative audit logging | pgTAP + integration |
| TEST-34 | Verify booking conflicts cannot be bypassed through direct API calls | API/concurrency |
| TEST-35 | Verify no privileged keys in the production frontend bundle | CI bundle scan |

### 1.2 Added scenarios (mandatory by PO decision OD-24)

| ID | Scenario | Closes gap for |
|---|---|---|
| TEST-36 | Admin dashboard metrics equal independent counts on a seeded dataset (incl. utilization formula) | FR-ADM-01, FR-ADM-02 |
| TEST-37 | Admin booking list: filters, search, owner and resource visible to admin only | FR-ADM-03 |
| TEST-38 | Removing a block restores availability. Block history retained. Cancelled bookings not restored. | FR-ADM-07 |
| TEST-39 | User management: activate/deactivate with reason; last-admin protection; no self-deactivation or self-demotion; deactivation cancels and releases future bookings | FR-ADM-08, ROLE-03/04, BR-28 |
| TEST-40 | Role grant/revoke audited; a user cannot self-escalate via any API | ROLE-02, FR-AUTH-10 |
| TEST-41 | In-app notifications for each event, delivered only to the correct user; mark-as-read | FR-NTF-01 |
| TEST-42 | Availability API and Realtime payloads contain no personal data; anon cannot subscribe | FR-AVL-03, TR-RT-02/03 |
| TEST-43 | Realtime refresh visible in a second browser ≤ 3 s; polling fallback when Realtime is blocked | FR-AVL-05, TR-RT-04/05 |
| TEST-44 | Idempotent booking: repeated submission with the same key creates one booking | FR-BKG-05 |
| TEST-45 | Status lifecycle: illegal transitions rejected; CHECKED_IN → COMPLETED after end; effective status correct before the job runs | FR-STS-01/02/03 |
| TEST-46 | Profile view and name edit; password change enforces policy | FR-PRF-01/02 |
| TEST-47 | Error, empty, not-found, and account-disabled states; no raw SQL or stack text under fault injection | FR-UX-05, SEC-14/15 |
| TEST-48 | Responsive: no horizontal scroll at defined widths; touch-target size; admin usable at 390 px; performance budget measured | FR-UX-01, FR-ADM-11, NFR-03 |
| TEST-49 | Scanner-safe verification/reset link: an HTTP GET of the link does not verify; the explicit click does | FR-AUTH-02, TR-AUTH-03 |
| TEST-50 | Open-redirect protection on auth redirects and `next` parameters | SEC-11, TR-AUTH-09 |
| TEST-51 | Weak password rejected when calling the Auth API directly (bypassing UI); auth rate limiting active | FR-AUTH-07, TR-AUTH-02/05 |
| TEST-52 | Email domain restriction: `@danamon.co.id`, `@adira.co.id`, `@homecredit.co.id` (any letter case) can register; `@gmail.com` and subdomains such as `@branch.danamon.co.id` are rejected with `EMAIL_DOMAIN_NOT_ALLOWED`, including via direct Auth API calls | FR-AUTH-12, TR-AUTH-11 |
| TEST-53 | Domain management: admin adds, renames, removes a domain (reason required, audited); new registrations follow the change immediately; existing users of a removed domain stay active; last active domain cannot be removed; ADMIN role cannot be granted to a user from a non-allowed domain; USER cannot call domain RPCs | FR-ADM-12, ROLE-06, TR-AUTH-12 |
| TEST-54 | Settings screen: admin changes each editable setting (reason required, audited with old/new value); out-of-range values rejected; the next booking/check-in/cancel follows the new value; existing bookings are not cancelled; read-only settings cannot be changed; USER cannot call settings RPCs. Includes the 30-minute cancellation cutoff boundary (17:30:00 allowed, 17:30:01 rejected for an 18:00 start) | FR-ADM-13, FR-CHK-03, FR-CXL-01, BR-26 |

---

## 2. Traceability by business objective

| BO | Business requirement / rule | Technical requirement | Acceptance criteria | Test |
|---|---|---|---|---|
| BO-01 Self-service booking | FR-FAC-01, FR-FAC-02, FR-AVL-01, FR-AVL-02, FR-BKG-01…08, FR-UX-02, BR-01, BR-02, BR-10 | TR-BKG-01…06, TR-API (`list_facilities`, `get_availability`, `create_booking`, `list_my_bookings`) | FR ACs; SC-M1, SC-M5 | TEST-04, 05, 06, 08, 09, 11, 17, 28, 29, 44 |
| BO-02 No double booking | BR-11, BR-12, BR-13, BR-17, BR-20, NFR-01 | TR-CON-01…08, TR-BKG-05, TR-DB-06 | SC-M2, TAC-02 | TEST-07, 08, 09, 10, 11, 12, 22, 26, 34 |
| BO-03 Fair access | BR-05, BR-06, BR-07, BR-18, BR-21, BR-22, BR-30 | TR-CON-04, TR-BKG-03, partial unique index (TRD 6.2) | FR-AVL-01; Section 10 of instruction | TEST-13, 14, 15, 34 |
| BO-04 Less admin work | BR-10 (no approval), FR-CXL-01, FR-CHK-02, FR-ADM-03…07 | TR-BKG-08, `process_booking_statuses` | SC-M7 | TEST-17, 20, 21, 22, 37, 38 |
| BO-05 Accurate real-time availability | FR-AVL-02, FR-AVL-05, FR-STS-03 | TR-RT-01…07, effective status (TRD 11.5) | TR-RT-04 target | TEST-17, 20, 43, 45 |
| BO-06 Effective check-in | FR-CHK-01…03, BR-25 | `check_in` RPC, TR-TEST-11, status processor | SC-M6, TAC-11 | TEST-18, 19, 20, 45 |
| BO-07 Utilization monitoring | FR-ADM-01, FR-ADM-02 | `admin_dashboard_metrics` | FR-ADM-01 AC | TEST-36 (PROPOSED) — **no mandatory test** |
| BO-08 Multi-device access | FR-UX-01, FR-UX-03, FR-UX-06, NFR-07, FR-ADM-11 | TR-RWD-01…05, TR-PWA-01…06 | SC-M10 | TEST-27, 28, 29, 31, 48 |
| BO-09 Secure & reliable | FR-AUTH-01…12, FR-AVL-03, NFR-02, ROLE-01…06, FR-ADM-12 | TR-AUTH-01…12, TR-RLS-01…09, TR-SEC-01…15 | SC-M3, SC-M4, SC-M9, TAC-04, 05, 09, 10 | TEST-01, 02, 03, 23, 24, 25, 30, 33, 34, 35, 39, 40, 42, 49, 50, 51, 52, 53 |
| BO-03 / BO-04 (settings) | FR-ADM-13, FR-CHK-03, BR-26 | `admin_update_setting`, `app_settings` ranges | FR-ADM-13 AC | TEST-54 |
| BO-10 Maintainable | NFR-08, AP-09 | TR-STK-01…03, TR-DB-02/03, TR-DEP-01…09, TR-OPS-01…06 | TAC-12 | CI pipeline (no scenario ID) — verified by inspection |

---

## 3. Detailed traceability (requirement → TR → AC → test)

### 3.1 Authentication & roles

| Requirement | Status | Technical requirement | Acceptance criteria (BRD) | Tests |
|---|---|---|---|---|
| FR-AUTH-01 Registration | APPROVED | TR-AUTH-01 | FR-AUTH-01 AC1–3 | TEST-01 |
| FR-AUTH-02 Email verification (link + code, scanner-safe) | APPROVED | TR-AUTH-03, TR-DEP-07 | AC1–5 | TEST-01, TEST-49 (P) |
| FR-AUTH-03 Login | APPROVED | TR-AUTH-01, TR-AUTH-07 | AC1–3 | TEST-02, TEST-25 |
| FR-AUTH-04 Logout | APPROVED | Supabase `signOut` | AC | TEST-02 |
| FR-AUTH-05 Forgot password | APPROVED | TR-AUTH-04, TR-AUTH-05 | AC1–3 | TEST-03 |
| FR-AUTH-06 Password reset | APPROVED | TR-AUTH-04 | AC1–3 | TEST-03, TEST-49 (P) |
| FR-AUTH-07 Password policy (backend) | APPROVED | TR-AUTH-02 | AC1–2 | TEST-01, TEST-51 (P) |
| FR-AUTH-08 Session management | APPROVED | TR-AUTH-06 | AC1–3 | TEST-02 (partial) — expiry behaviour covered only by TEST-47 (P) |
| FR-AUTH-09 Deactivation enforcement | APPROVED | TR-AUTH-07, TR-AUTH-08, TR-RLS (active check) | AC1–2 | TEST-25, TEST-39 (P) |
| FR-AUTH-10 Role authorization | APPROVED | TR-AUTH-07, TR-SEC-09 | AC | TEST-24, TEST-40 (P) |
| FR-AUTH-11 Self-service deletion | OPEN (OD-17) | — | — | — (pending decision) |
| FR-AUTH-12 Email domain restriction | APPROVED (PO) | TR-AUTH-11, `allowed_email_domains` | AC1–3 | TEST-52, TEST-53 |
| ROLE-06 Admin only from allowed domain | APPROVED (PO) | TR-AUTH-12 | — | TEST-53 |
| ROLE-02 Default USER role | PROPOSED | profile trigger (TRD 6.2) | — | TEST-40 (P) |
| ROLE-03 Keep ≥ 1 active admin | APPROVED | `admin_set_user_active`/`admin_set_user_role` locking | — | TEST-39 (P) — **no mandatory test** |
| ROLE-04 No self-demotion/deactivation | PROPOSED | same | — | TEST-39 (P) |

### 3.2 Facilities, availability, booking

| Requirement | Status | Technical requirement | Acceptance criteria | Tests |
|---|---|---|---|---|
| FR-FAC-01 Facility listing | APPROVED | `list_facilities` | AC | TEST-04 (journey); TEST-28/29 |
| FR-FAC-02 Activity selection | APPROVED | activities table; composite FK | AC | TEST-08 |
| FR-AVL-01 8-date horizon | APPROVED | `get_app_config`, BR-07 checks | AC | TEST-15 |
| FR-AVL-02 Slot grid & capacity | APPROVED | `get_availability` | AC1–3 | TEST-09, 10, 11, 12 (capacity), TEST-43 (P) |
| FR-AVL-03 No personal data in availability | APPROVED | TR-RT-02, `get_availability` output contract | AC | TEST-23 (partial), TEST-42 (P) |
| FR-AVL-04 Own bookings highlighted | PROPOSED | `is_mine` flag | AC | TEST-42 (P) |
| FR-AVL-05 Realtime refresh + fallback | APPROVED | TR-RT-01…05 | AC | TEST-43 (P) — **no mandatory test** |
| FR-BKG-01 Allowed durations | APPROVED | TR-BKG-03 (INVALID_DURATION) | AC | TEST-04, 05, 06 |
| FR-BKG-02 Review summary | APPROVED | UI | AC | TEST-04 (E2E) |
| FR-BKG-03 Instant confirmation | APPROVED | TR-BKG-01 | AC | TEST-04…06 |
| FR-BKG-04 Slot lost before confirm | APPROVED | SLOT_UNAVAILABLE | AC | TEST-07, 26 |
| FR-BKG-05 Idempotent submission | PROPOSED | TR-BKG-04 | AC | TEST-44 (P) |
| FR-BKG-06 Confirmation screen | APPROVED | TR-BKG-06 | AC | TEST-04 (E2E) |
| FR-BKG-07 My Bookings | APPROVED | `list_my_bookings` | AC | TEST-17, 23 |
| FR-BKG-08 Booking details | APPROVED | `get_my_booking` | AC | TEST-23 |
| FR-CXL-01 User cancel (≥ 30 min before start) | APPROVED (PO) | `cancel_my_booking` | AC1–3 | TEST-17, TEST-54 (boundary) |
| FR-CXL-02 No deletion | APPROVED | TR-DB-08 | AC | TEST-17, 33 |
| FR-CXL-03 Admin cancel with reason | APPROVED | `admin_cancel_booking` | AC1–2 | TEST-33, TEST-37 (P) |
| FR-CHK-01 Check-in window | APPROVED | `check_in`, TR-TEST-11 | AC1–2 | TEST-18, 19 |
| FR-CHK-02 No-show release | APPROVED | `process_booking_statuses`, lazy sweep | AC | TEST-20 |
| FR-CHK-03 Configurable window (admin settings screen) | APPROVED (PO) | `app_settings`, `admin_update_setting` | AC | TEST-19, TEST-54 |
| FR-STS-01 Status set & transitions | APPROVED | TR-BKG-09 | AC | TEST-45 (P) |
| FR-STS-02 Completed after end | PROPOSED | status processor | AC | TEST-45 (P) |
| FR-STS-03 Effective status by server time | APPROVED | TRD 11.5 | AC | TEST-20, TEST-45 (P) |

### 3.3 Business rules

| Rule | Technical enforcement | Tests |
|---|---|---|
| BR-01 Authenticated, verified, active | `create_booking` steps 1–2; RLS active check | TEST-25, TEST-01 |
| BR-02 Allowed durations | Step 6; CHECK constraint | TEST-04, 05, 06 (+ negative case in pgTAP; sub-case: Football 60/90 accepted, Table Tennis 60 rejected) |
| BR-03 30-min alignment | Step 5 `SLOT_MISALIGNED` | TEST-16 (pgTAP negative cases) — PROPOSED explicit sub-case |
| BR-04 Operating hours | Step 5 `OUTSIDE_OPERATING_HOURS` | TEST-16 |
| BR-05 Max 2 active/future | Step 7 + profile lock | TEST-13, 34 |
| BR-06 Once per facility per day | Step 7 + partial unique index | TEST-14, 34 |
| BR-07 Horizon today…+7 | Step 4 | TEST-15 |
| BR-08 Not limited to training period | No such check exists (negative requirement) | Inspection |
| BR-09 Single owner | `bookings.user_id` only | Inspection |
| BR-10 Immediate confirmation | Status CONFIRMED on insert | TEST-04 |
| BR-11 No overlap | Exclusion constraint + locks | TEST-07, 26 |
| BR-12 Shared court | One resource for two activities | TEST-08 |
| BR-13 Auto-allocation | Pool lock + ordered allocation | TEST-09…12 |
| BR-14 No started slots | Step 5 `SLOT_IN_PAST` | TEST-16 (PROPOSED sub-case: slot started 1 min ago) |
| BR-15 / BR-16 Backend authority | AP-01, AP-02 | TEST-34 |
| BR-17 Continuous interval | Single row, `end_at = start_at + duration` | TEST-05, 06 |
| BR-18 Court counts once/day | Daily limit keyed by facility | TEST-14 (PROPOSED sub-case: Basketball then Futsal same day → rejected) |
| BR-19 Asia/Jakarta | TR-BKG-02, TR-DB-04 | TEST-27, TEST-15 (date rollover sub-case) |
| BR-20 Concurrency safe | TR-CON-01…08 | TEST-26, 10, 12 |
| BR-21 "Active" definition | Step 7 query | TEST-13 |
| BR-22 Daily-limit statuses | Partial index predicate | TEST-14 (PROPOSED sub-cases: after cancel → allowed; after no-show → rejected) |
| BR-25 No-show re-booking from next half hour | Status processor + BR-14 | TEST-20 |
| BR-26 Cancel cutoff = 30 min before start | `cancel_my_booking` + `user_cancel_cutoff_minutes` | TEST-17, TEST-54 |
| BR-27 Lowest table first | Ordered allocation | TEST-09, 11 |
| BR-28 Deactivation releases bookings | `admin_set_user_active` | TEST-39 (P) |
| BR-29 Block alignment | `admin_create_block` validation | TEST-21 |
| BR-30 Limits apply to admins | Same RPC path | TEST-13 (PROPOSED admin sub-case) |

### 3.4 Administration

| Requirement | Technical requirement | Tests |
|---|---|---|
| FR-ADM-01 Dashboard | `admin_dashboard_metrics` | TEST-36 (P) |
| FR-ADM-02 Utilization | same (formula OD-26) | TEST-36 (P) |
| FR-ADM-03 Booking management | `admin_list_bookings` | TEST-24, TEST-37 (P) |
| FR-ADM-04 Admin cancel | `admin_cancel_booking` | TEST-33 |
| FR-ADM-05 Facility blocking | `admin_create_block` | TEST-21 |
| FR-ADM-06 Block conflicts | `admin_preview_block`, `admin_create_block` | TEST-22 |
| FR-ADM-07 Remove block | `admin_remove_block` | TEST-38 (P) |
| FR-ADM-08 User management | `admin_list_users`, `admin_set_user_active`, `admin_set_user_role` | TEST-25, TEST-39 (P), TEST-40 (P) |
| FR-ADM-09 Audit trail | `audit_logs` + triggers | TEST-33 |
| FR-ADM-10 Audit viewer | `admin_list_audit_logs` | TEST-33 (extension) |
| FR-ADM-11 Admin usable on mobile | TR-RWD-02 | TEST-48 (P) |
| FR-ADM-12 Allowed email domains | `admin_*_email_domain` RPCs | TEST-53 (P) |
| FR-ADM-13 Settings screen | `admin_get_settings`, `admin_update_setting` | TEST-54 (P) |

### 3.5 Notifications, profile, UX, NFR

| Requirement | Technical requirement | Tests |
|---|---|---|
| FR-NTF-01 In-app notifications | `notifications` table, TR-RT-07 | TEST-41 (P) — **no mandatory test** |
| FR-NTF-02 Check-in banner | UI | TEST-18 (E2E extension) |
| FR-PRF-01 Profile view | `get_my_profile` | TEST-46 (P) — **no mandatory test** |
| FR-PRF-02 Edit name / change password | `update_my_profile`, Auth `updateUser` | TEST-46 (P) |
| FR-UX-01 Responsive | TR-RWD-01…05 | TEST-28, 29, 48 (P) |
| FR-UX-02 ≤ 6 actions | UX design | TEST-04 E2E step count; UAT |
| FR-UX-03 WIB display | `Intl` formatting with `Asia/Jakarta` | TEST-27 |
| FR-UX-04 Offline | TR-PWA-03, TR-PWA-04 | TEST-30 |
| FR-UX-05 Error/empty states | TR-SEC-08, error contract | TEST-47 (P) |
| FR-UX-06 PWA install + update prompt | TR-PWA-01, 05, 06 | TEST-31 |
| FR-UX-07 WCAG 2.2 AA | TR-A11Y-01…07 | TEST-32 |
| NFR-01 Zero double bookings | TR-CON-*, TR-OPS-05 | TEST-07…12, 26 |
| NFR-02 Security & privacy | TR-SEC-*, TR-RLS-* | TEST-23, 24, 25, 33, 34, 35 |
| NFR-03 Performance | TRD Section 15 | TEST-48 (P) — **no mandatory test** |
| NFR-04 Availability | TR-OPS-02 | Monitoring evidence (no scenario) |
| NFR-05 Occasional-user usability | UX | UAT (SC-M5) |
| NFR-06 Accessibility | TR-A11Y | TEST-32 |
| NFR-07 Browser support | TR-TEST-05/06 | TEST-28, 29 |
| NFR-08 Maintainability | TR-STK, TR-DEP | CI inspection |
| NFR-09 Retention | `purge_notifications`, OD-17 | Inspection |
| NFR-10 Time correctness | TR-BKG-02 | TEST-27 |

### 3.6 Security requirements (instruction Section 25)

| SEC | Technical requirement | Tests |
|---|---|---|
| SEC-01 Supabase Auth | TR-AUTH-01 | TEST-01, 02 |
| SEC-02 RLS | TR-DB-07, TR-RLS-* | TEST-23 |
| SEC-03 Own records only | TR-RLS-03 | TEST-23 |
| SEC-04 Admin by role | TR-AUTH-07 | TEST-24 |
| SEC-05 No owner identity in availability | TR-RT-02/03, FR-AVL-03 | TEST-42 (P) |
| SEC-06 No secret keys in browser | TR-SEC-01 | TEST-35 |
| SEC-07 Server-side validation | AP-01/02 | TEST-34 |
| SEC-08 No unauthorized admin ops | TR-AUTH-07 | TEST-24 |
| SEC-09 HTTPS | TR-SEC-12 | Deployment check |
| SEC-10 CSP | TR-SEC-04 | Header test (TAC-04) |
| SEC-11 Open redirects | TR-AUTH-09 | TEST-50 (P) |
| SEC-12 No unsafe HTML | TR-SEC-06 | Lint + TEST-47 (P) XSS case |
| SEC-13 Protect auth flows | TR-AUTH-03/04/05 | TEST-03, 49 (P), 51 (P) |
| SEC-14/15 Safe errors | TR-SEC-08, TRD 11.4 | TEST-47 (P) |
| SEC-16 Privilege escalation | TR-SEC-03, TR-SEC-09 | TEST-24, 40 (P) |
| SEC-17 Sessions | TR-AUTH-06 | TEST-02 |
| SEC-18 Audit trail | TR-SEC-11 | TEST-33 |
| SEC-19 Deactivated sessions | TR-AUTH-07/08 | TEST-25 |
| SEC-20 Security testing | TR-SEC-14 | Security test report |

---

## 4. Coverage gap analysis

Requirements that are **MUST HAVE** but have **no corresponding mandatory test** in TEST-01…35. Each is covered only by a PROPOSED test, or by inspection:

| # | Requirement | Gap | Proposed closure |
|---|---|---|---|
| G-01 | FR-ADM-01 / FR-ADM-02 Dashboard & utilization (BO-07) | No mandatory test for metric correctness | TEST-36 |
| G-02 | FR-ADM-03 Booking management filters/search | Only access control (TEST-24) is tested | TEST-37 |
| G-03 | FR-ADM-07 Block removal | Not tested | TEST-38 |
| G-04 | ROLE-03 Last active admin protection; FR-ADM-08 user management | Not tested | TEST-39, TEST-40 |
| G-05 | FR-NTF-01 In-app notifications | Not tested | TEST-41 |
| G-06 | FR-AVL-03 / SEC-05 No identity leak in availability & Realtime | Only indirectly (TEST-23 covers bookings, not availability/Realtime) | TEST-42 |
| G-07 | FR-AVL-05 Realtime refresh & fallback | Not tested | TEST-43 |
| G-08 | FR-STS-01…03 Status transitions & effective status | Only no-show is tested | TEST-45 |
| G-09 | FR-PRF-01/02 Profile | Not tested | TEST-46 |
| G-10 | FR-UX-05 / SEC-14/15 Error handling, no raw SQL | Not tested | TEST-47 |
| G-11 | FR-UX-01 / NFR-03 Responsive & performance targets | Only device smoke tests (TEST-28/29) | TEST-48 |
| G-12 | FR-AUTH-02 Scanner-safe verification link | TEST-01 does not distinguish scanner GET from click | TEST-49 |
| G-13 | SEC-11 Open redirects | Not tested | TEST-50 |
| G-14 | FR-AUTH-07 Backend password enforcement | TEST-01 may pass with only UI validation | TEST-51 |
| G-15 | BR-03, BR-14, BR-18, BR-22, BR-26, BR-30 edge cases | Covered only as sub-cases inside broader tests | Add explicit pgTAP sub-cases (listed in Section 3.3) |
| G-16 | NFR-04 Availability, NFR-08 Maintainability, BR-08, BR-09 | Not testable as scenarios | Verified by monitoring evidence or inspection |
| G-17 | FR-AUTH-11 Self-service deletion | Pending OD-17 | Define a test once decided |

**Result (v0.2):** the Product Owner approved TEST-36…TEST-51 as mandatory (OD-24), closing gaps G-01…G-14. The requirements added in v0.2 (FR-AUTH-12, FR-ADM-12, FR-ADM-13, ROLE-06, revised BR-26) are covered by TEST-52…TEST-54. Every MUST-HAVE business requirement now has at least one verification method. Only FR-AUTH-11 (pending OD-17) has no test yet.
