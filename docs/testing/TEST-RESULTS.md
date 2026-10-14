# DCU Active — Test Results

| Item | Value |
|---|---|
| Last updated | 2026-10-14 (end of Phase 2) |
| Environment | Local Supabase stack (Supabase CLI 2.120.0, PostgreSQL 17, Docker 29.8.2) on Windows 11 |
| Scope so far | Database, API, and concurrency levels. UI, E2E, device, accessibility, and performance-at-scale tests follow in Phases 3–4. |

## 1. Summary of runs

| Suite | Command | Result |
|---|---|---|
| pgTAP database tests (5 files) | `npm run db:test` | **197 / 197 passed** |
| API integration tests (real Auth, PostgREST, Realtime, Mailpit) | `npm run test:integration` (api.test.ts) | **9 / 9 passed** |
| Concurrency tests (independent sessions, simultaneous requests) | `npm run test:integration` (concurrency) | **8 / 8 scenarios passed**; 0 overlapping bookings |
| Database lint (`plpgsql_check`) | `npm run db:lint` | 0 errors, 0 warnings; 1 informational ("extra") note on a composite OUT parameter |
| TypeScript check of test code | `npx tsc -p tsconfig.json` | passed |

### 1.1 Phase 3 additions (2026-10-14)

| Suite | Command | Result |
|---|---|---|
| Frontend unit & component tests (jsdom, device timezone America/New_York) | `npm test` | **38 / 38 passed** (incl. axe checks: 0 serious/critical) |
| ESLint (jsx-a11y, react-hooks 7, `react/no-danger`) | `npm run lint` | 0 errors |
| TypeScript strict | `npm run typecheck` | 0 errors |
| Production build + bundle secret scan (TEST-35) | `npm run build:only && npm run scan:bundle` | Passed; scanner self-test with planted keys fails as expected |
| Manual run in browser (production build with CSP, local backend) | — | Login → Futsal 60 min booking → review → confirmation → live badge → cancel; admin dashboard and settings; 0 console errors |

Scenario updates from Phase 3:

- **TEST-27** ✔ unit: WIB formatting with a non-Jakarta device timezone.
- **TEST-35** ✔ CI scan.
- **TEST-50** ✔ unit: 9 malicious `next` values rejected, plus the login redirect.
- **TEST-47** ◐ unit: no raw error text; reference shown for unexpected errors.
- **TEST-32** ◐ automated axe on key components; manual screen-reader checks in Phase 4.
- **TEST-30 / TEST-31** ◐ offline banner, PWA manifest and service worker built; device verification in Phase 4.

### 1.2 Phase 4 — local part (2026-10-14)

| Suite / check | Result |
|---|---|
| **E2E (Playwright 1.64)** against the production build + local Supabase: Android/Pixel 7 (full, 27 scenarios), iPhone 14/WebKit and Desktop Chrome (smoke, 7 each) | **41 / 41 passed** |
| Lighthouse 13.5 mobile (simulated slow 4G, 4× CPU), login page | Performance 91, Accessibility 100, Best practices 100; LCP 2.6 s, CLS 0, TBT 210 ms |
| OWASP ZAP baseline (production build) | **0 FAIL**, 62 PASS, 5 low/informational warnings (style `unsafe-inline` = DV-11; missing COEP accepted; cache headers fixed; JS comments / modern-app informational) |
| `npm audit` (all and production-only) | 0 vulnerabilities |
| Regression: pgTAP 197/197, integration 17/17 (2 consecutive runs), unit 38/38 | Passed |

E2E scenarios covered: TEST-01, 02 (incl. K-01 fix), 03, 05, 08, 09, 17, 18, 22, 24, 25, 27, 30, 31, 32 (all public, user and admin pages: 0 serious/critical axe violations), 43 (live update < 3 s across two browsers), 48 (7 widths, no horizontal scroll; admin at 390 px), 49, 50, 52, 53, 54, FR-BKG-04, and the security headers.

**Observation:** in one regression run, 1 of the 17 integration tests failed and was not reproduced in the next two runs; its name was not captured. It is monitored (the CI keeps the full log). Two DB tests were also made independent of audit rows written by other suites.

## 2. Defects found and fixed during Phase 2

| # | Found by | Defect | Fix |
|---|---|---|---|
| D-01 | pgTAP `001` ("anon cannot execute any private function") | Four Realtime trigger helpers were executable by PUBLIC/anon. Per-schema `ALTER DEFAULT PRIVILEGES … REVOKE` does not remove PostgreSQL's built-in PUBLIC execute grant. | Explicit `REVOKE EXECUTE … FROM public, anon` in migration 0011. The ineffective default-privilege lines were removed. The test now guards every future migration. |
| D-02 | Database lint | Validation helpers declared IMMUTABLE/STABLE while raising errors via a VOLATILE function; untyped array literals; exception handlers the linter could not prove terminate | Volatility corrected, typed literals, direct `RAISE` in handlers |
| D-03 | Concurrency test design | The mixed-load scenario reused users across rounds, so limits (correctly) blocked later rounds | Test cleans up per round; system behaviour was correct |

## 3. Results per mandatory test scenario (level reached so far)

✔ = passed at the stated level. ◐ = partially covered; remaining part is in a later phase. ○ = scheduled for a later phase.

| Test | Status | Level / evidence |
|---|---|---|
| TEST-01 Register and verify email | ◐ | API: sign-up → 6-digit code from the mail catcher → `verifyOtp` → verified profile. UI flow in Phase 3/4. |
| TEST-02 Login and logout | ◐ | Sign-in used throughout the API tests; UI logout in Phase 3/4 |
| TEST-03 Reset password | ✔ API | Reset code → new password works, old password rejected |
| TEST-04/05/06 Tennis 30/60/90 | ✔ DB | pgTAP 002 (incl. 20:30–21:00 valid, 20:00 + 90 rejected, Football 90 accepted, Table Tennis 60 rejected) |
| TEST-07 Overlapping Tennis rejected | ✔ DB + concurrency | pgTAP 002 (incl. direct INSERT blocked by the exclusion constraint); 20 parallel requests × 50 iterations → exactly 1 success each |
| TEST-08 Shared court | ✔ DB | Futsal rejected while Basketball occupies the court |
| TEST-09/11 Two tables allocated | ✔ DB + concurrency | Table 1 then Table 2; concurrency: 2 successes on distinct tables × 50 iterations each |
| TEST-10/12 Third simultaneous request rejected | ✔ concurrency | 3 parallel requests × 50 iterations each for Air Hockey and Foosball |
| TEST-13 Max 2 active | ✔ DB + concurrency | 10 parallel requests from one user × 20 iterations → exactly 2 succeed |
| TEST-14 One per facility per day | ✔ DB + concurrency | Incl. Basketball→Futsal same day rejected, rebook after cancel allowed, no-show still counts; 5 parallel × 20 iterations → exactly 1 |
| TEST-15 Horizon | ✔ DB | today + 7 ok, + 8 and yesterday rejected; horizon setting change applies immediately |
| TEST-16 Operating hours / alignment / started slot | ✔ DB | 05:30, 06:15, malformed time, started slot, slot starting exactly now |
| TEST-17 Cancel releases resource | ✔ DB | Released slot immediately bookable by another user; history retained |
| TEST-18/19 Check-in window | ✔ DB | 17:44:59 too early; 17:45:00 and 18:15:00 allowed; double check-in refused |
| TEST-20 No-show | ✔ DB | Effective NO_SHOW immediately; stored NO_SHOW via in-transaction sweep; next half-hour bookable; started slot not; owner notified; counts toward daily limit |
| TEST-21 Create block | ✔ DB | Facility block shows "Unavailable – Maintenance"; resource-level block reduces pooled capacity to 1; alignment and hours enforced |
| TEST-22 Block conflicts | ✔ DB + concurrency | Preview, refusal without confirmation, stale list refused, confirmed cancellation with notifications and audit; block-vs-booking race × 30 iterations never leaves a booking inside a block |
| TEST-23 Others' reservations | ✔ DB | RLS row visibility; another user's booking returns `BOOKING_NOT_FOUND` |
| TEST-24 Admin access | ✔ DB | Users get `FORBIDDEN`; RLS hides audit logs. UI route guard in Phase 3. |
| TEST-25 Deactivated user, open session | ✔ DB + API | Next call with the still-valid session → `ACCOUNT_DISABLED`; bookings hidden |
| TEST-26 Simultaneous requests | ✔ concurrency | 30 users × 10 rounds across all facilities → 0 overlaps, only business error codes |
| TEST-27 WIB on foreign device timezone | ○ | Phase 3/4 (server already returns WIB strings) |
| TEST-28/29 Android / iPhone | ○ | Phase 4 |
| TEST-30 Offline | ○ | Phase 3/4 |
| TEST-31 PWA | ○ | Phase 3/4 |
| TEST-32 Accessibility | ○ | Phase 3/4 |
| TEST-33 Audit logging | ✔ DB | One audit row per affected entity, with actor and reason; audit rows immutable even for the owner |
| TEST-34 No bypass via direct API | ✔ DB + API | Tables unreachable via the Data API (`api`, `app`, `public`); input tampering rejected; parallel self-race limited |
| TEST-35 No privileged keys in bundle | ○ | Phase 3 (CI bundle scan) |
| TEST-36 Dashboard metrics | ✔ DB | 900 − 120 = 780 available, 390 used → 50.0% reproduced exactly |
| TEST-37 Booking management | ✔ DB | Search (name, email), facility/activity/date/status filters, owner and resource visible, literal `%`/`_`, pagination |
| TEST-38 Remove block | ✔ DB | Availability restored, history retained, cancellations not restored |
| TEST-39 User activation & safeguards | ✔ DB + concurrency | Future bookings cancelled (source DEACTIVATION), self-deactivation refused, reactivation; two admins deactivating each other simultaneously × 10 → exactly one succeeds, one admin always remains |
| TEST-40 Roles | ✔ DB | Grant/revoke audited and effective immediately; self-escalation and self-demotion refused |
| TEST-41 Notifications | ✔ DB | Correct recipient only, unread count, mark as read |
| TEST-42 Privacy of availability & Realtime | ✔ DB + API | No identity, booking reference or table in availability; Realtime payload only `{facility_code, date_wib}` (+ Realtime's own message id); anon cannot subscribe or call user RPCs |
| TEST-43 Realtime refresh | ◐ | Signal delivered < 3 s (API). Second-browser UI refresh and polling fallback in Phase 3/4. |
| TEST-44 Idempotency | ✔ DB | Same key → same booking, one row |
| TEST-45 Status integrity | ✔ DB | Illegal transitions and changes to booking times refused; CHECKED_IN → COMPLETED after end |
| TEST-46 Profile | ◐ | DB: view, update (trimmed, validated, audited). Password change UI in Phase 3. |
| TEST-47 Error & empty states | ○ | Phase 3/4 (all RPC errors already return stable business codes) |
| TEST-48 Responsive & performance | ◐ | DB execution measured locally: `get_availability` 3–12 ms, `create_booking` 12 ms, `list_my_bookings` 2 ms (targets ≤ 100/150 ms). End-to-end and UI in Phase 4. |
| TEST-49 Scanner-safe link | ○ | Email template contains code + link to `/auth/confirm` (Phase 3 page) |
| TEST-50 Open redirect | ○ | Phase 3 |
| TEST-51 Backend password policy | ✔ API | Weak password rejected by the Auth server |
| TEST-52 Domain restriction | ✔ DB + API | Real sign-ups: `@gmail.com`, subdomain, and look-alike rejected; `@ADIRA.co.id` accepted |
| TEST-53 Domain management | ✔ DB | Add/rename/remove, immediate effect on the hook, existing users unaffected, admin grant requires an allowed domain, last domain protected, audited |
| TEST-54 Settings & cancel cutoff | ✔ DB | 17:30:00 allowed / 17:30:01 refused; cutoff 60 applies immediately; ranges, read-only keys, reason, audit old/new; existing bookings untouched |
