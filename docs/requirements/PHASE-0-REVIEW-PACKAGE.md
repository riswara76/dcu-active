# DCU Active — Phase 0 Review Package

| Item | Value |
|---|---|
| For | Product Owner, DCU Facility Management |
| Phase | Phase 0 — Business and Technical Requirements |
| Version | 0.2 (PO decisions incorporated) |
| Date | 2026-10-13 |
| Decision requested | Final approval of Phase 0 and authorisation of Phase 1 (Solution Architecture & UX Design) |

---

## A. Executive summary

DCU Active will let employees of **Danamon, Adira, and Home Credit** book DCU sports facilities from their phones in under a minute, without installing an app. Users register once with their company email, choose a facility, pick a date and time, and get an instant confirmation. They check in with one tap when they arrive. If they don't show up, the slot is released automatically for others.

Administrators get a dashboard, can see and cancel any booking, close facilities for maintenance or events, control who has access, maintain the list of allowed company email domains, and adjust booking settings.

The system is designed around two promises:

1. **A court or table can never be booked twice for the same time.** This holds even if many people press "Book" at the same moment.
2. **Booking is fair.** Each person can hold at most 2 upcoming bookings, at most 1 booking per facility per day, and can book only up to 7 days ahead. Admins can adjust these limits.

These rules are enforced by the server, so they cannot be bypassed.

All decisions needed before Phase 1 were made on 2026-10-13. Version 0.2 of the documents reflects them. No software has been built yet. **Recommendation: approve Phase 0 and start Phase 1.**

---

## B. BRD summary (`BRD.md`)

- **Users:** one USER role for participants and trainers, plus ADMIN. Registration is **limited to `@danamon.co.id`, `@adira.co.id`, `@homecredit.co.id`**. Admins can manage this list.
- **Facilities:** 6 facilities, 7 activities, 9 physical courts/tables:
  - Tennis, Basketball/Futsal (one shared court), and **Football Field**: 30/60/90 min.
  - Table Tennis, Air Hockey ×2 tables, Foosball ×2 tables: 30 min.
- **Hours:** 06:00–21:00 WIB daily, in 30-minute steps.
- **Functions:** 61 functional requirements across sign-up/login, availability, booking, cancellation, check-in/no-show, notifications, profile, and administration (including domain management and a settings screen).
- **Business rules:** 30 rules, all approved.
- **Success criteria:** 10 mandatory go-live criteria and 11 KPIs, approved as working targets.
- **Out of scope for V1:** payment, QR/GPS check-in, social features, third-party login/SSO, push/email notifications, native apps, offline booking.

## C. TRD summary (`TRD.md`)

- **Stack:**
  - React + TypeScript + Vite web app (installable as a PWA).
  - Supabase for login, database (PostgreSQL), and live updates.
  - Versions were checked against the npm registry on 2026-10-13.
- **Core design:** every booking is one database transaction that checks all rules, locks the relevant courts/tables, and writes the booking. A database "no overlap" constraint is a second safety net.
- **Email domains:** checked by the login service itself at sign-up, so the form cannot be bypassed.
- **Settings:** stored in the database with safe ranges. Every change is logged with the old value.
- **Security:** row-level security on every table; all changes go through controlled server functions; no secret keys in the browser; full audit trail; deactivation takes effect on the user's next action.

## D. Requirements coverage

| Item | Count / status |
|---|---|
| Business objectives | 10 (all traced) |
| Functional requirements | 61 |
| Business rules | 30 (all approved) |
| Technical requirements | 124 `TR-` items, each with approach + verification |
| Test scenarios | 54 mandatory: 35 from the brief, 16 gap-closing (approved), 3 for new requirements |
| Coverage gaps | None for MUST-HAVE requirements. FR-AUTH-11 (self-service deletion) awaits OD-17. |

## E. Key business rules (plain English)

1. Only people with a verified email on an allowed company domain can register and book.
2. Times start on the hour or half hour, between 06:00 and 21:00 WIB. A booking must end by 21:00.
3. Tennis, the Basketball/Futsal court, and the Football Field allow 30, 60, or 90 minutes. Table Tennis, Air Hockey, and Foosball allow 30 minutes.
4. Basketball and Futsal share one court. If either is booked, the court is taken.
5. Air Hockey and Foosball have 2 tables each. The system picks a free table and tells the booker which one.
6. Up to 2 upcoming bookings per person, 1 per facility per day, and only today through 7 days ahead (adjustable by admins).
7. No booking of a time that has already started.
8. Bookings are confirmed instantly.
9. **Cancellation is allowed up to 30 minutes before the start.** Cancelled slots open up immediately, and the user may rebook that facility the same day.
10. Check-in is open from 15 minutes before to 15 minutes after the start. Missing it means **No-show**: it counts as that day's booking, and the court is released from the next half hour.
11. Admins can close a facility or a single table. Affected bookings are cancelled only after the admin confirms. Users see "Unavailable – Maintenance/Event".
12. Deactivated users lose access immediately, and their upcoming bookings are cancelled.
13. Nothing is ever deleted. All cancellations and admin actions are kept in history.

## F. Technical architecture recommendations

1. **Put all rules in the database**, with the web app as a thin, friendly layer.
2. **Use a database "no overlap" constraint** in addition to locking, so a double booking is impossible even after a coding mistake.
3. **Release no-shows two ways:** a job every minute plus an on-the-spot check during booking.
4. **Check account status and email domain on the server**, never only on the screen.
5. **Merge some screens** so a booking takes 3–5 taps.
6. **Arrange email delivery early.** Use a professional email provider with DCU's own sender domain, and ask the three companies' IT teams to allow-list it. Corporate mail filters are the biggest risk to registration.
7. **Use a paid Supabase plan in production**, for backups and to avoid automatic pausing.
8. **Do not use the "Nathan" vibe-coding skill for this project.** Its stack conflicts with the approved design.

## G. Major risks

| # | Risk | Level | Mitigation |
|---|---|---|---|
| R-01 | A defect allows a double booking | Low / High | Two independent safeguards + concurrency tests + daily integrity check |
| R-02 | Verification emails blocked by the three companies' mail filters | **Medium / High** | Verified sender domain; allow-list request to each company's IT; 6-digit code; delivery test to all three domains |
| R-03 | No-show job stops | Medium / Medium | On-the-spot release + job-health alert |
| R-04 | Very new library versions | Medium / Medium | Compatibility check at the start of Phase 2 |
| R-05 | iPhone PWA limitations | High / Low | Works fully in Safari; install optional |
| R-06 | Free-tier hosting pauses or loses data | Medium / High | Paid plan + backups (OD-09) |
| R-07 | A wrong admin setting disrupts booking | Low / Medium | Safe ranges, mandatory reason, audit log with old values |
| R-08 | Personal data of partner-company employees (UU PDP) | Medium / Medium | Data minimisation, retention policy, legal review of data sharing (OD-17) |
| R-09 | Timezone mistakes on phones set to another timezone | Medium / Medium | Server-side WIB calculations; TEST-27 |

## H. Open decisions

All decisions needed before Phase 1 are resolved (see `OPEN-DECISIONS.md`, Decision Log). The remaining decisions are:

| When needed | Decisions |
|---|---|
| Before Phase 2 | OD-03 email provider (+ allow-listing at the 3 companies), OD-04 initial admins (on allowed domains), OD-05 initial check-in values, OD-06 no-show mechanism, OD-22 data region, OD-29 Git/CI |
| Before Production | OD-01 hosting, OD-02 domain, OD-08 monitoring, OD-09 backups/plan, OD-17 data retention and data sharing |
| Before Go-live | OD-10 onboarding & support |

## I. Proposed development plan

| Phase | Main outputs | Gate |
|---|---|---|
| 0 Requirements *(this package)* | BRD, TRD, RTM, Decision log (v0.2) | PO approval |
| 1 Architecture & UX | Architecture doc, final ERD + DDL design, RPC contract, security design, wireframes for all screens (incl. settings and domain management), test plan, Git repository (on approval) | PO approval |
| 2 Backend & database | Migrations, RLS, RPCs, Auth domain hook, status job, pgTAP + concurrency tests, local + staging Supabase | Tests green; PO review |
| 3 Frontend web/PWA | All screens, PWA, offline handling, unit/component tests | Demo; PO review |
| 4 Integration, testing & hardening | TEST-01…54 in staging, real-device tests, accessibility & security review, performance measurement, UAT | UAT sign-off |
| 5 Staging & production deployment | Hosting, domain, HTTPS, headers, email, backups, monitoring, smoke tests | Go/no-go |
| 6 Go-live & handover | User/Admin/Operations guides, admin provisioning, hypercare | Handover sign-off |

## J. Questions requiring Product Owner approval

None are needed before Phase 1.

To be answered before Phase 2 starts:

1. **Email provider (OD-03):** can DCU provide a sender domain? Who will contact the IT teams of Danamon, Adira, and Home Credit about allow-listing?
2. **Initial admins (OD-04):** who are the first 2 administrators? Their emails must be on an allowed domain.
3. **Data region (OD-22):** is Singapore hosting acceptable for the three companies?
4. **Git repository (OD-29):** may we create a GitHub repository for the project?

## K. Recommended approval decision

**Recommendation: APPROVE Phase 0 (version 0.2)** and authorise Phase 1 (Solution Architecture & UX Design).

The four Phase 2 questions in Section J can be answered during Phase 1.
