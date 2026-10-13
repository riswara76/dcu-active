# DCU Active — Phase 2 Report (Backend and Database Development)

| Item | Value |
|---|---|
| Phase | Phase 2 — Backend and Database Development |
| Date | 2026-10-14 |
| Decision requested | Accept Phase 2 and authorise Phase 3 (Frontend web/PWA development) |

---

## A. Summary (plain English)

The "engine room" of DCU Active is built and tested. It holds:

- the database;
- all booking rules;
- login with the company-email check;
- the admin functions;
- automatic no-show handling;
- live update signals.

Everything runs on this computer in a local copy of Supabase. The automated tests prove that:

- **No double booking** happens even when 20 people press "Book" for the same court at the same moment. This was repeated 50 times, plus mixed scenarios with 30 users.
- **Air Hockey and Foosball** give two people the two tables and refuse a third, every time.
- **Fair-use limits** (2 upcoming bookings, 1 per facility per day, 7 days ahead) cannot be bypassed, even by sending many requests at once.
- **Only company emails** (`@danamon.co.id`, `@adira.co.id`, `@homecredit.co.id`) can register. A Gmail address, a sub-domain, or a look-alike domain is refused by the login service itself.
- **The 30-minute cancellation rule**, check-in window, and no-show release behave exactly as specified, to the second.
- **Admins** can block facilities, cancel bookings, manage users, change settings, and manage email domains. Everything is recorded in an audit trail that nobody can edit.
- **Privacy:** the availability screen and live updates never reveal who booked.

**Test totals:** 197 database tests, 9 API tests, and 8 concurrency scenarios. **All pass.** The tests also found one real security weakness during development, which was fixed (see D-01 in `TEST-RESULTS.md`).

---

## B. What was built

| Area | Delivered |
|---|---|
| Database schema | 12 tables in schema `app` (incl. `allowed_email_domains`, `app_settings`, append-only `audit_logs`), enums, constraints including the GiST "no overlap" exclusion constraint |
| Business logic | 33 RPC functions in schema `api` (2 public, 12 user, 19 admin), following `API-RPC-SPECIFICATION.md` |
| Security | RLS on every table; no direct table writes for client roles; only schema `api` exposed; all functions with fixed `search_path`; explicit grants |
| Auth | Password policy (8+ chars, upper, lower, digit, symbol); email confirmation required; Before-User-Created hook enforcing the domain allow-list; email templates with a 6-digit code and scanner-safe link |
| Scheduling | `pg_cron` jobs: status processing every minute (no-show / completed), daily notification purge, daily integrity checks |
| Live updates | Realtime private broadcast signals for availability and per-user notifications |
| Operations | `api.health` for uptime monitoring; `scripts/provision-admin.sql` for the first administrator |
| Tests | pgTAP (5 files, 197 assertions), API integration (9), concurrency (8 scenarios) |
| CI | `.github/workflows/ci.yml`: starts Supabase, lints, runs all database, API, and concurrency tests on every push |
| Developer docs | `README.md` |

Files: `supabase/migrations/20261014000001…000013_*.sql`, `supabase/tests/*.test.sql`, `tests/integration/**`, `supabase/config.toml`, `supabase/templates/*.html`, `supabase/seed.sql` (local only).

---

## C. Measured results

| Measure | Target (TRD §15, DB part) | Measured (local) |
|---|---|---|
| `get_availability` execution | ≤ 100 ms | 3–12 ms |
| `create_booking` execution | ≤ 150 ms | 12 ms |
| `list_my_bookings` execution | — | 2 ms |
| Overlapping bookings across all concurrency runs | 0 | **0** |
| Realtime signal delivery after booking | ≤ 3 s | < 3 s (tested) |

End-to-end timings over a mobile network are measured in Phase 4 against staging.

---

## D. Deviations from the Phase 1 design (for review)

| # | Design said | Implemented | Reason |
|---|---|---|---|
| DV-01 | `rate_limit_counters` table and `RATE_LIMITED` on `create_booking` (TR-SEC-13) | **Not implemented** | A counter inside the booking transaction is rolled back whenever the request fails, so it would only count successful bookings, which are already limited by the fair-use rules. Effective rate limiting must happen before the database (API gateway). **Proposal:** rely on the fair-use limits and Supabase's platform limits for V1. Revisit in Phase 4 hardening (an Edge Function or network-level limit) if abuse is observed. Auth endpoints remain rate-limited by Supabase Auth. |
| DV-02 | `citext` for emails/domains | `text` stored lower-case with CHECK constraints | Avoids extension-operator lookups in functions with an empty `search_path`; same behaviour |
| DV-03 | Test clock honoured when the *database* setting is on | Honoured only when the **session** sets `app.allow_time_override = on` | Only direct database sessions (tests, operators) can do that. API clients cannot set it. Production behaviour is unaffected. |
| DV-04 | `ALTER DEFAULT PRIVILEGES` to keep new functions private | Explicit `REVOKE … FROM public, anon` per migration, enforced by a test | PostgreSQL cannot remove the PUBLIC default per schema (found by test, D-01) |
| DV-05 | "Exactly one audit row per admin action" | One audit row **per affected entity** (e.g. a block that cancels 2 bookings writes 1 block row + 2 booking rows) | Each booking's history shows why it was cancelled. TEST-33 updated accordingly. |
| DV-06 | `audit_logs.request_id` | Omitted | Not needed until request tracing is introduced; can be added without breaking changes |
| DV-07 | Realtime payload `{facility_code, date_wib}` | Same, plus Realtime's own message `id` | Added by Supabase Realtime; not personal data |
| DV-08 | Optional Edge Function to revoke sessions on deactivation (SHOULD) | Deferred | The database check already blocks deactivated users on their next action (TEST-25 passes). Can be added in Phase 4. |

---

## E. What is not done yet (by design)

- **Staging Supabase project.** Needs the PO's Supabase account (OD-33). Everything is ready to `supabase db push` once the project exists.
- **Real email delivery from `DCU@danamon.co.id`** (OD-03, PO arranging with Danamon IT). Locally, emails go to the built-in mail catcher.
- **The frontend** (Phase 3).
- **GitHub push.** The repository is committed locally. The first push needs the owner's GitHub sign-in on this PC (see §G).

---

## F. Risks and notes

| Risk | Status |
|---|---|
| Double booking | Mitigated and verified (constraint + locks + about 2,100 concurrent booking attempts, 0 overlaps) |
| Auth hook availability | Verified working with Supabase CLI 2.120.0 locally. Re-verify on the hosted project at staging setup. |
| Email deliverability to corporate mailboxes | Open (OD-03). Highest remaining risk for go-live. |
| Docker Desktop on this PC | Was stuck at session start and had to be restarted. Worked normally afterwards. |
| Only one named administrator | Recommend naming a second `@danamon.co.id` admin before go-live, to avoid lock-out |

---

## G. Actions needed from the Product Owner

1. **Approve Phase 2** and authorise Phase 3 (frontend).
2. **Push to GitHub** (one-time sign-in). In a terminal in the project folder, run `git push -u origin main`. A GitHub sign-in window will open; after that, pushes work automatically.
3. **Staging (when convenient during Phase 3):** create a Supabase project in your account (region Southeast Asia/Singapore), then share the project reference, or invite the developer account.
4. **Email (OD-03):** the Danamon IT outcome for sending as `DCU@danamon.co.id`.
5. **Second administrator (recommended):** a second `@danamon.co.id` address.
6. **DV-01:** accept "no database-level rate limiting in V1", or ask for an API-gateway limit in Phase 4.
