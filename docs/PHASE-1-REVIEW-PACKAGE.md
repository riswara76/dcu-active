# DCU Active — Phase 1 Review Package

| Item | Value |
|---|---|
| For | Product Owner, DCU Facility Management |
| Phase | Phase 1 — Solution Architecture and UX Design |
| Date | 2026-10-14 |
| Decision requested | Approve the Phase 1 design and authorise Phase 2 (Backend and Database Development) |

---

## A. Executive summary

Phase 1 turns the approved requirements (BRD/TRD v0.2) into a complete design that developers can build without guessing. It covers:

- **How the system is put together** (solution architecture).
- **How data is stored** (database design with ERD).
- **Which operations the app can perform** (API/RPC specification).
- **How it is protected** (security design).
- **What every screen looks like** (UX/UI specification with wireframes).
- **How it will be tested** (test plan for all 54 mandatory tests).

As instructed, **no application code was written** and no Supabase project was created. A local Git repository now holds all documents.

The design keeps the two promises from Phase 0:

1. Courts and tables can never be double-booked.
2. Fair-use rules cannot be bypassed.

Both are enforced inside the database, so the phone app cannot get around them.

**Recommendation:** approve Phase 1 and start Phase 2.

---

## B. Deliverables

| Document | Path | Contents |
|---|---|---|
| Solution Architecture | `docs/architecture/SOLUTION-ARCHITECTURE.md` | Context and container diagrams, environments, frontend structure, backend conventions, lock order, scheduled jobs, 4 key flow diagrams, deployment pipeline, 12 architecture decisions, email-sender design |
| Database Design | `docs/architecture/DATABASE-DESIGN.md` (+ `diagrams/ERD.png`) | ERD, design-level DDL for 12 tables, status transition matrix, RLS policies and grants, function inventory (33 RPCs), seed data, migration plan (13 migrations), integrity checks, retention |
| API / RPC Specification | `docs/architecture/API-RPC-SPECIFICATION.md` | Calling conventions, 34 business error codes, authentication operations, input/output contract for every RPC, Realtime events |
| Security Design | `docs/architecture/SECURITY-DESIGN.md` | Data classification, trust boundaries, 22-item threat model, Auth configuration, authorization model, function security checklist, CSP and headers, email security (SPF/DKIM/DMARC), privacy (UU PDP), audit, incident outline |
| UX / UI Specification | `docs/design/UX-UI-SPECIFICATION.md` | Design principles, navigation, colour tokens with **measured** contrast ratios, typography, components, wireframes for all screens (user and admin), global states, copy deck, accessibility and responsive rules, tap counts per journey |
| Test Plan | `docs/testing/TEST-PLAN.md` | Tools per level, environments and test data, concurrency harness, entry/exit criteria, defect severity, all 54 tests specified, device matrix, UAT plan |
| Decision log | `docs/requirements/OPEN-DECISIONS.md` v0.3 | Decisions of 2026-10-14 recorded |
| Word versions | `docs/**/DCU-Active-*-v1.0.docx` | For offline review |

---

## C. Key design choices (plain English)

1. **Only "doors", no "windows".** The app can reach the database only through a fixed list of 33 approved operations. The tables themselves are not reachable from the internet. **[Refines TRD]**
2. **Two locks against double booking.** Each booking briefly "locks" the courts or tables involved, and the database also refuses overlapping bookings on its own.
3. **Every action re-checks the user's status.** Deactivation, role changes, and domain or settings changes take effect on the very next click.
4. **No-shows are released two ways:** a job every minute, plus an on-the-spot check whenever someone books.
5. **Company email check at sign-up**, inside the login service itself, not just on the form.
6. **Admins can change booking settings safely.** There are fixed safe ranges, a reason is required, and every change is logged with the old value.
7. **A booking takes 3–6 taps** after choosing a facility, including a review step that shows the cancellation deadline and the check-in time.
8. **Accessible by design.** Every colour pair was measured against WCAG AA. Status is always shown in words, not only colour.

### C.1 Refinements to the TRD (please note)

| Refinement | Why |
|---|---|
| Tables moved to a non-exposed schema (`app`); only functions are exposed (`api`) | Smaller attack surface; no accidental data exposure |
| Own-data reads run under row-level security (INVOKER); writes run as controlled functions (DEFINER) | Two independent protections for privacy |
| New `api.health` operation for uptime monitoring | Lets monitoring detect a stopped no-show job |
| New operational tables `rate_limit_counters` and `integrity_check_runs` | Implements TRD rate limiting and the daily integrity checks |
| Booking reference format `DCU-YYMMDD-XXXX` | Readable, unambiguous characters |

---

## D. Screens covered

- **Public:** Login, Register (shows the allowed domains), Verify email (6-digit code), Confirm-email link page, Forgot/Reset password, Account disabled.
- **User:** Home (check-in banner, next booking), Facilities, Facility booking (date strip + time grid + duration on one screen), Review sheet, Confirmation, My bookings (Upcoming/History), Booking detail, Profile and notifications.
- **Admin:** Dashboard, Bookings, Facility blocks (with conflict check), Users, Settings (Booking settings + Email domains), Audit log.
- **Global:** Offline, error, empty, update prompt, not found, loading.

---

## E. Risks to watch in Phase 2

| Risk | Mitigation |
|---|---|
| Verification emails from `DCU@danamon.co.id` blocked by corporate mail filters | Agree the sending method with Danamon IT early (Architecture §11); allow-list requests to Adira and Home Credit |
| Supabase "Before User Created" hook behaves differently than documented | Short spike at the start of Phase 2; a database-trigger fallback is designed |
| Very new library versions | Versions pinned; compatibility checked on npm (all peer dependencies satisfied); TypeScript held at 6.0.3 |
| Corporate users on old phones | Mobile-first, light pages; performance budgets in the test plan |

---

## F. Readiness for Phase 2

| Item | Status |
|---|---|
| Requirements and design complete | ✔ |
| Decisions needed for Phase 2 | ✔ region (Singapore), Git, admin domain, sender address |
| Development tools on this PC | ✔ Node 24.19.0, npm 11.17.0, Docker 29.8.2, Git 2.55.0 |
| Local Git repository | ✔ branch `main` |
| GitHub remote | ✖ GitHub CLI not installed. Needs an empty **private** repository URL, or permission to install the GitHub CLI. |
| Email sending method (OD-03) | ✖ Pending Danamon IT. Development can proceed with the local mail catcher; only real-email staging tests wait. |
| Names of the first 2 admins (`@danamon.co.id`) | ✖ Needed before the staging seed (mid Phase 2) |
| Supabase account/organisation for staging and production | ✖ Who creates it, and on which billing account? Needed when Phase 2 reaches staging. Local development does not need it. |

---

## G. Questions for the Product Owner

1. **Approve the Phase 1 design?** (architecture, database, API, security, screens, test plan)
2. **GitHub:** please create an empty private repository (e.g. `dcu-active`) and send the URL. Alternatively, allow installation of the GitHub CLI so it can be created from here.
3. **Supabase account:** who owns the Supabase organisation (and billing) for the staging and production projects?
4. **Danamon IT contact** for the email sending method of `DCU@danamon.co.id`.
5. **First 2 admins:** names and `@danamon.co.id` emails.
6. **Branding (optional):** DCU logo and brand colours. Without them, the accessible neutral palette is used.
7. **Setting ranges** (cancellation cutoff 0–240 min, horizon 0–30 days, etc.): accept as designed?

---

## H. Recommended decision

**APPROVE Phase 1** and authorise Phase 2.

Questions 2–5 can be answered during Phase 2. Local development (database, functions, tests) can start immediately without them.
