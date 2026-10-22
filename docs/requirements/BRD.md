# DCU Active — Business Requirement Document (BRD)

| Item | Value |
|---|---|
| Document | Business Requirement Document |
| Product | DCU Active — Sports & Recreational Facility Booking |
| Phase | Phase 4 — Integration, testing and hardening (as-built baseline) |
| Version | 1.1 (as built; adds Classes, CR-03) |
| Date | 2026-10-22 |
| Status | BASELINE. Describes the application as built and deployed to staging. Remaining decisions are listed in Section 0.4. |
| Companion documents | `TRD.md`, `REQUIREMENTS-TRACEABILITY-MATRIX.md`, `OPEN-DECISIONS.md`, `../user-manual/USER-MANUAL.md`, `../testing/TEST-RESULTS.md` |

## Change log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-10-13 | First draft. |
| 0.2 | 2026-10-13 | The Product Owner resolved all decisions needed before Phase 1 (see `OPEN-DECISIONS.md`, Decision Log). Three of them **change the original baseline**: (1) users may cancel only up to **30 minutes before** the start (BR-26); (2) the **Football Field** allows **30/60/90 minutes** (was 30); (3) registration is **restricted to approved company email domains** — `danamon.co.id`, `adira.co.id`, `homecredit.co.id` — which administrators can manage (FR-AUTH-12, FR-ADM-12); the baseline allowed any domain. In addition, an **admin settings screen is in V1 scope** (FR-ADM-13); the baseline deferred it. All other proposed defaults were accepted and are now APPROVED. |
| 1.1 | 2026-10-22 | **CR-03 Classes** approved and built: new Section 8.9 (FR-CLS-01…09), Section 0.6, roles updated, FE-16/17 added. |
| 1.0 | 2026-10-14 | **As-built baseline** after Phases 1–4. Adds Section 0 (delivery status, differences from v0.2, remaining decisions, and change requests under discussion). Updates FR-AVL-02 (pooled slot wording) and FR-BKG-01 (the duration choice stays on screen, UAT-01). Adds FR-AVL-06 (the grid highlights the whole selected block, UAT-02), FE-14 and FE-15. All PROPOSED items were accepted at the Phase 0 approval and implemented unless Section 0.3 says otherwise. |

## Requirement status labels

Every requirement in this document carries one of the following labels:

| Label | Meaning |
|---|---|
| **APPROVED** | Stated explicitly in the master project instruction (the approved baseline), or decided by the Product Owner on 2026-10-13 (shown as "APPROVED (PO, OD-xx)"). |
| **PROPOSED** | Introduced by the project team to make a baseline requirement complete or testable. Requires Product Owner confirmation, but will be used as the default if not rejected. |
| **OPEN DECISION** | A choice that cannot be defaulted safely. Tracked in `OPEN-DECISIONS.md` as `OD-xx`. |

> **v1.0:** all PROPOSED items were accepted at the Phase 0 approval (2026-10-13) and implemented as written, unless Section 0.3 lists a difference. The labels are kept for traceability.

Priority uses MoSCoW: **MUST HAVE**, **SHOULD HAVE**, **COULD HAVE**, **OUT OF SCOPE**.

---

## 0. Version 1.0 — As-Built Summary

This section summarises the application **as built** on 2026-10-14. The rest of the document keeps the requirement text and IDs from v0.2, so that traceability to tests (`REQUIREMENTS-TRACEABILITY-MATRIX.md`) is preserved. Where Section 0 and a later section differ, Section 0 describes the delivered behaviour.

### 0.1 Delivery status

| Phase | Status (2026-10-14) | Evidence |
|---|---|---|
| 0 Requirements | Approved by the Product Owner | `OPEN-DECISIONS.md` (Decision Log) |
| 1 Architecture & UX | Approved | `docs/architecture/`, `docs/design/` |
| 2 Backend & database | Built and tested | `docs/PHASE-2-REPORT.md` |
| 3 Frontend web app / PWA | Built and tested | `docs/PHASE-3-REPORT.md` |
| 4 Integration, testing & hardening | Local testing complete. **Staging is live**, and user acceptance testing (UAT) by the Product Owner has started. | `docs/testing/TEST-RESULTS.md`, `docs/operations/STAGING-SETUP.md` |
| 5 Production deployment | Not started. Depends on the decisions in 0.4. | — |
| 6 Handover | Not started. The User Manual is available (`docs/user-manual/`). | — |

### 0.2 What users get in Version 1.0

- **Web app / PWA** in a phone or desktop browser, which can be installed to the home screen. The interface is in English (Bahasa Indonesia is FE-12).
- **Registration and sign-in** with a company email (`@danamon.co.id`, `@adira.co.id`, `@homecredit.co.id`), password policy, email verification (code or link), and password reset.
- **Booking** of 6 facilities (8 bookable units). The booking is confirmed immediately. Times are in WIB, from 06:00 to 21:00, in 30-minute slots, up to 7 days ahead. Durations are 30/60/90 minutes for Tennis, the Court and Football, and 30 minutes for Table Tennis, Air Hockey and Foosball.
- **Fair-use rules enforced by the server:** at most 2 upcoming bookings, 1 booking per facility per day, cancellation up to 30 minutes before the start, check-in from 15 minutes before to 15 minutes after the start, and automatic no-show release.
- **Live availability** that refreshes automatically, with no booker identity shown. Double booking is impossible.
- **My bookings, booking details, notifications and profile.**
- **Administration:** dashboard with utilisation, booking search and cancellation with a reason, facility blocks with impact preview, user management (activate, deactivate, grant or revoke admin), booking settings, email-domain management, and an immutable audit log.
- **Staging environment:** https://dcu-active-staging.dcu-active.workers.dev. The first administrator, `ronny.iswara@danamon.co.id`, was provisioned on 2026-10-14 (audited).

### 0.3 Differences from v0.2 and decisions taken during the build

| Ref | Topic | v0.2 text | As built | Business impact |
|---|---|---|---|---|
| UAT-01 | Duration choice on phones | FR-BKG-01: durations that fit are selectable | Once a time is chosen, the 30/60/90 choice is shown in the bottom action bar, next to **Review booking**, so it is always on screen. | Found by the PO during UAT. Before the fix, Football looked bookable for 30 minutes only. |
| UAT-02 | Selected block in the grid | — (new) | After choosing a start time and duration, every covered slot is highlighted: the start slot reads "Selected" and later slots read "Included" (new FR-AVL-06). | The user sees exactly which slots the booking occupies. |
| FR-AVL-02 | Pooled facility wording | "2 tables available" / "1 table available" / "Fully booked" | "2 left" / "1 left" / "Full" | Shorter labels that fit a phone grid. Same meaning. |
| DV-01 | Booking request rate limit | Application-level `RATE_LIMITED` on booking | Not implemented in the database. The fair-use limits and Supabase platform limits apply, and sign-in/sign-up are rate-limited by Supabase Auth. | Low. To be revisited if abuse is observed (network-level limit). |
| DV-05 | Audit granularity | One audit row per admin action | One audit row **per affected record**. For example, a block that cancels 2 bookings writes 3 rows. | Each booking's history shows why it was cancelled. |
| DV-08 | Session revocation on deactivation | Optional immediate sign-out | A deactivated user is blocked on their next action. Sessions are not force-ended. | No access to data or actions after deactivation. |
| DV-12 | Table choice in block form | — | Air Hockey and Foosball tables 1–2 are fixed choices. Adding tables requires a database change (assumption A-03). | None while the inventory is unchanged. |
| DV-13 | Support contact | OD-10 | `DCU@danamon.co.id` is shown as a configurable placeholder. | Change by configuration once OD-10 is decided. |
| DV-14 | Privacy notice | Approved by Legal (OD-17) | Draft text, clearly marked "Draft". | Legal approval needed before go-live. |
| Staging email | Custom email templates | Branded templates from `DCU@danamon.co.id` | Staging uses Supabase's default templates and built-in sender, which only delivers to project members. Staging test accounts are therefore created by an administrator. | Self-registration with real email depends on OD-03 (SMTP). |

### 0.4 Decisions still required before go-live

| ID | Decision | Owner |
|---|---|---|
| OD-03 | Email sending method for `DCU@danamon.co.id` (Danamon relay or an authorised provider, with SPF/DKIM/DMARC) | Danamon IT + PO |
| OD-01 / OD-02 | Production hosting confirmation (Cloudflare is used for staging) and the production domain name | PO + IT |
| OD-09 | Paid Supabase plan with daily backups (RPO ≤ 24 h, RTO ≤ 4 h) | PO + Ops |
| OD-08 | Operational monitoring and alerting | PO + Ops |
| OD-10 | Support contact and onboarding material (QR posters, help text) | PO |
| OD-17 | Data retention, privacy notice text, and a data-sharing arrangement with the partner companies | Legal / DPO |
| OD-04 | A second administrator (recommended, to avoid lock-out) | PO |
| FR-AUTH-11 | Self-service account deletion (COULD) | PO + Legal |

### 0.5 Change requests under discussion (not in Version 1.0 scope)

| ID | Request (PO, 2026-10-14) | Assessment | Status |
|---|---|---|---|
| CR-01 | Register with a **mobile phone number** (OTP) instead of a company email | A phone number does not prove employment, which the email-domain rule currently guarantees (FR-AUTH-12). It also needs an SMS/WhatsApp provider (cost per OTP) and a UU PDP review. Recommended: keep company-email registration and optionally add the phone number to the profile for OTP login or notifications later (FE-14). | Awaiting PO decision |
| CR-02 | Allow booking **only when the user is at the DCU location** (geo-tag) | Device location can be spoofed, is inaccurate indoors and on laptops, and would remove advance booking (BR-07). Recommended alternative: keep booking from anywhere and require **location- or QR-verified check-in** at the facility (FE-01, FE-15). | Awaiting PO decision |

### 0.6 Change request approved after v1.0

| ID | Change | Status |
|---|---|---|
| CR-03 | **Classes** such as Yoga: admins create classes (one-off or weekly) at an existing facility or in a separate room; users join with limited places; admins monitor attendance (Section 8.9). | Built and tested locally on 2026-10-22; to be deployed to staging for UAT. |

---

## 1. Executive Summary

DCU Active is a web application that lets DCU participants and trainers book DCU sports and recreational facilities from a phone, tablet, or computer. No app store installation is required. Users can optionally "install" it to the home screen as a Progressive Web App (PWA).

The application covers the full reservation lifecycle:

1. Registration with mandatory email verification.
2. Real-time facility availability.
3. Instant, automatically confirmed booking.
4. Self-service cancellation.
5. In-app check-in with automatic no-show release.
6. Booking history.

Administrators get a dashboard, booking oversight, facility blocking for maintenance or events, and user access management.

The two most important business guarantees are:

1. **No double booking of any physical facility.** This includes the shared Basketball/Futsal court and the pooled Air Hockey and Foosball tables.
2. **Fair access.** Each user may hold at most 2 active/future bookings, at most 1 booking per facility per day, and may book only up to 7 days ahead.

The server enforces these rules, so they cannot be bypassed by using several browser tabs, sending simultaneous requests, or modifying the app.

Registration is limited to approved company email domains (initially `danamon.co.id`, `adira.co.id`, and `homecredit.co.id`). Administrators can maintain this list and adjust key booking settings (check-in window, booking limits, cancellation cutoff) from an admin settings screen.

Version 1 deliberately excludes payment, QR/GPS check-in, social features, native mobile apps, and third-party login (see Section 16).

---

## 2. Business Background

DCU provides sports and recreational facilities to participants and trainers. There is currently no effective self-service mechanism that lets users:

- see which facilities exist and when they are free,
- reserve a time slot without conflicting with others,
- manage (view/cancel) their own reservations, and
- confirm attendance (check in) when they arrive.

Administrators currently lack a central tool to:

- monitor reservations,
- block facilities for maintenance or events,
- cancel reservations when necessary,
- control who may use the system, and
- see how heavily facilities are used.

Many users are **occasional users** who may use DCU facilities only for a limited period. The solution must therefore be very easy to start using. A user should be able to open a URL or scan a QR code, register once, and book within minutes.

---

## 3. Business Objectives

| ID | Objective | Status |
|---|---|---|
| BO-01 | Provide convenient self-service sports facility booking. | APPROVED |
| BO-02 | Eliminate double booking of physical facilities. | APPROVED |
| BO-03 | Ensure fair access to limited facilities. | APPROVED |
| BO-04 | Reduce administrative work associated with reservations. | APPROVED |
| BO-05 | Provide accurate real-time facility availability. | APPROVED |
| BO-06 | Provide an effective facility check-in mechanism. | APPROVED |
| BO-07 | Enable administrators to monitor facility utilization. | APPROVED |
| BO-08 | Support access from Android, iPhone, tablets, and desktop browsers. | APPROVED |
| BO-09 | Provide secure and reliable access to booking information. | APPROVED |
| BO-10 | Create a maintainable platform that can be enhanced in future versions. | APPROVED |

---

## 4. Scope

### 4.1 In scope (Version 1)

| Area | Included |
|---|---|
| Application type | Responsive web application with optional PWA installation |
| Access | Public URL (also reachable via a QR code that points to the URL) |
| Users | DCU participants and trainers (role USER); DCU administrators (role ADMIN) |
| Authentication | Email + password; registration limited to approved email domains; mandatory email verification; password reset; account deactivation |
| Facilities | 6 facilities, 7 activities, 9 physical resources (Section 7) |
| Booking | Availability view, booking, cancellation, check-in, no-show handling, history |
| Administration | Dashboard, booking management, facility blocking, user management, allowed email domain management, booking settings |
| Notifications | In-app notifications only |
| Language | English user interface |
| Time | All business times in Asia/Jakarta (WIB, UTC+7) |
| Connectivity | Internet required for every booking transaction |

### 4.2 Out of scope

See Section 16.

---

## 5. Stakeholders

| Stakeholder | Interest / responsibility | Involvement |
|---|---|---|
| Product Owner (DCU) | Approves requirements, priorities, open decisions, and phase gates | Approver at every phase gate |
| DCU Facility Management | Owns facility inventory, operating hours, blocking policy | Requirement source; UAT participant |
| DCU Administrators | Day-to-day operation of bookings and users | Primary admin users; UAT participants |
| Participants | Book and use facilities | Primary end users; UAT sample |
| Trainers | Book and use facilities (same permissions as participants in V1) | Primary end users; UAT sample |
| DCU IT / Security (if applicable) | Hosting, domain, email sender domain, security review | Consulted on OD-01, OD-02, OD-03 |
| Data Protection Officer / Legal (if applicable) | Personal data handling under Indonesian Law No. 27 of 2022 on Personal Data Protection (UU PDP) | Consulted on OD-17 |
| Development team | Design, build, test, deploy | Responsible |

> **PROPOSED:** Trainers and participants share the single USER role in Version 1. The baseline grants them identical permissions, so no separate TRAINER role is introduced.

---

## 6. User Roles

### 6.1 Role: USER (participants and trainers) — APPROVED

| Can | Cannot |
|---|---|
| Register; verify email; log in/out; reset password | View another user's identity |
| View facilities and availability | View another user's booking details |
| Create reservations (subject to fair-use rules) | Manage facilities |
| View, cancel, and check in to **their own** reservations | Manage other users |
| View booking history and profile | Access administrative functions |

### 6.2 Role: ADMIN — APPROVED

Administrators can do everything a USER can. In addition they can:

- view all reservations and their owners,
- cancel any reservation with a recorded reason,
- create and remove facility blocks,
- search, activate, and deactivate users,
- grant and revoke administrator privileges, subject to safeguards,
- view utilization and the administrative dashboard,
- add, rename, and remove allowed registration email domains (APPROVED, PO),
- change booking settings such as the check-in window, booking limits, and cancellation cutoff (APPROVED, PO).

### 6.3 Role rules

| ID | Rule | Status |
|---|---|---|
| ROLE-01 | Role and account status are enforced by the backend for every protected operation. Frontend role checks only control navigation and display. | APPROVED |
| ROLE-02 | Every new registration receives the USER role. A user can never assign themselves a role. | PROPOSED |
| ROLE-03 | The system must always retain at least one active administrator. Removing the role from, or deactivating, the final active administrator is rejected. | APPROVED |
| ROLE-04 | An administrator cannot remove their own admin role or deactivate their own account. Another administrator must do it. | APPROVED (PO, OD-21) |
| ROLE-05 | Fair-use booking limits apply to administrators' own personal bookings exactly as to users. Admins cannot book on behalf of other users in V1. | APPROVED (PO, OD-16) |
| ROLE-06 | The ADMIN role can be granted only to a user whose email domain is currently on the allowed list. | APPROVED (PO, OD-31) |

---

## 7. Facility Inventory

The data model distinguishes three separate concepts:

- **FACILITY** — what the user chooses, e.g. "Air Hockey".
- **ACTIVITY** — what is played, e.g. "Basketball" vs "Futsal".
- **PHYSICAL RESOURCE** — the actual court or table that is occupied, e.g. "Air Hockey Table 2".

| # | Facility | Activities | Physical resources | Allowed durations | Resource selection |
|---|---|---|---|---|---|
| F1 | Tennis Court | Tennis | Tennis Court 1 | 30, 60, 90 min | Single resource |
| F2 | Basketball / Futsal Court | Basketball, Futsal | Multipurpose Court 1 (**shared**) | 30, 60, 90 min | Single resource |
| F3 | Table Tennis | Table Tennis | Table Tennis 1 | 30 min | Single resource |
| F4 | Football Field | Football | Football Field 1 | 30, 60, 90 min | Single resource |
| F5 | Air Hockey | Air Hockey | Air Hockey Table 1, Air Hockey Table 2 | 30 min | **Auto-allocated** by the system |
| F6 | Foosball | Foosball | Foosball Table 1, Foosball Table 2 | 30 min | **Auto-allocated** by the system |

**Totals:** 6 facilities, 7 activities, 9 physical resources.

**Daily capacity:** each resource has 30 half-hour slots per day (06:00–21:00), so the maximum is 270 resource-slots per day across the whole site.

Key inventory rules (all APPROVED):

- Basketball and Futsal occupy the **same** physical court. A booking for either activity blocks the court for both during the overlapping time.
- For Air Hockey and Foosball the user does not choose a table. The system assigns any free table. Availability is shown as remaining capacity, for example "2 tables available", "1 table available", or "Fully booked".
- The Basketball/Futsal court counts as **one facility** for the once-per-facility-per-day rule (BR-18).

> **APPROVED (PO, OD-19) — baseline change:** the brief limited the Football Field to 30 minutes. The Product Owner changed this to 30, 60, or 90 minutes, the same as Tennis and the Basketball/Futsal court.

---

## 8. Functional Requirements

Each requirement lists: ID, description, rationale, priority, acceptance criteria (AC), role, dependencies, and status.

### 8.1 Authentication and account (AUTH)

| ID | Requirement | Rationale | Priority | Acceptance criteria | Role | Depends on | Status |
|---|---|---|---|---|---|---|---|
| FR-AUTH-01 | Registration with full name, email, password, and password confirmation. Only email addresses from an allowed domain are accepted (FR-AUTH-12). | Users must be identifiable before booking. | MUST | 1. Valid input creates an unverified account and sends a verification email. 2. Mismatched confirmation is rejected with a field error. 3. Re-registering an existing email does not reveal whether the email already exists (generic message). | Public | FR-AUTH-12 | APPROVED (AC3 PROPOSED) |
| FR-AUTH-12 | **Email domain restriction.** Registration is accepted only when the part after "@" exactly matches an active allowed domain (case-insensitive). Initial list: `danamon.co.id`, `adira.co.id`, `homecredit.co.id`. Subdomains (e.g. `branch.danamon.co.id`) are **not** accepted. The registration screen lists the allowed domains. Enforced by the authentication backend, not only the form. | Restrict access to the intended organisations and reduce multi-account abuse. **Baseline change** (brief allowed any domain). | MUST | 1. `name@danamon.co.id`, `name@ADIRA.co.id`, `name@homecredit.co.id` are accepted. 2. `name@gmail.com` and `name@branch.danamon.co.id` are rejected with `EMAIL_DOMAIN_NOT_ALLOWED`, also when calling the Auth API directly. 3. A domain removed by an admin can no longer register; **existing users from that domain stay active** (admins may deactivate them individually). | Public | FR-ADM-12 | APPROVED (PO, OD-27, OD-30, OD-32) |
| FR-AUTH-02 | Mandatory email verification. The email offers both a **verification link** and a **verification code**. | Ensures a reachable, owned email address. | MUST | 1. An unverified user cannot log in to booking functions. 2. Entering the correct code verifies the account. 3. Opening the link shows a page that requires an explicit "Confirm my email" click, so automated email scanners cannot consume the link. 4. Expired or used codes and links are rejected with guidance to resend. 5. Resending is rate-limited. | Public | FR-AUTH-01, OD-03 | APPROVED (AC3–5 detail PROPOSED) |
| FR-AUTH-03 | Login with email + password. | Standard access. | MUST | 1. Correct credentials for a verified, active user open Home. 2. Wrong credentials show a generic error that does not say which field was wrong. 3. A deactivated user is shown the "Account disabled" screen. | Public | FR-AUTH-02 | APPROVED |
| FR-AUTH-04 | Logout. | Shared-device safety. | MUST | Logout ends the session on that device. Protected pages then redirect to Login. | USER, ADMIN | — | APPROVED |
| FR-AUTH-05 | Forgot password: request a reset by email. | Self-service recovery. | MUST | 1. Response is identical whether or not the email exists. 2. A reset email containing an expiring token or OTP is sent to existing accounts. 3. Requests are rate-limited. | Public | OD-03 | APPROVED |
| FR-AUTH-06 | Password reset with a secure, expiring, single-use token or OTP. | Account security. | MUST | 1. A valid token allows setting a new password that meets the policy. 2. Expired or used tokens are rejected. 3. **PROPOSED:** after a reset, other sessions are signed out. | Public | FR-AUTH-05 | APPROVED |
| FR-AUTH-07 | Password policy: at least 8 characters, with at least one uppercase letter, one lowercase letter, one number, and one symbol. Enforced by the authentication backend. | Account security. | MUST | 1. A weak password is rejected by the **backend** even if the frontend check is bypassed. 2. The UI shows live policy hints. | Public | — | APPROVED |
| FR-AUTH-08 | Session management: sessions persist across page reloads, expire securely, and can be ended by logout. | Usability with security. | MUST | 1. The session survives a page reload. 2. An expired or invalid session redirects to Login and does not show a raw error. 3. **PROPOSED:** idle-session behaviour follows the TRD (TR-AUTH-06). | USER, ADMIN | — | APPROVED |
| FR-AUTH-09 | Account deactivation by an administrator. A deactivated user immediately loses the ability to perform protected operations, **including on already-open sessions**. | Access control. | MUST | 1. After deactivation, the next booking, cancel, or check-in call from that user's existing session is rejected with `ACCOUNT_DISABLED`. 2. The user is shown the Account disabled screen. | ADMIN | FR-ADM-04 | APPROVED |
| FR-AUTH-10 | Authorization by role (USER, ADMIN) enforced on the backend. | Prevent privilege escalation. | MUST | A USER calling any admin operation directly through the API receives `FORBIDDEN`. | All | — | APPROVED |
| FR-AUTH-11 | Self-service account deletion by the user. | Personal data rights under UU PDP. | COULD | To be defined. | USER | OD-17 | OPEN DECISION |

### 8.2 Facilities and availability (FAC, AVL)

| ID | Requirement | Rationale | Priority | Acceptance criteria | Role | Depends on | Status |
|---|---|---|---|---|---|---|---|
| FR-FAC-01 | Facility listing showing all active facilities with name, allowed durations, and a short availability hint for today. | Entry point to booking. | MUST | All 6 facilities are listed. Inactive facilities are hidden from users. | USER | — | APPROVED (hint PROPOSED) |
| FR-FAC-02 | Facility details with activity selection when there is more than one activity (Basketball/Futsal). | Activity must be recorded. | MUST | F2 requires choosing an activity before booking. Other facilities skip this step automatically. | USER | FR-FAC-01 | APPROVED |
| FR-AVL-01 | Date selection limited to today through today + 7 (8 dates, WIB). | Booking horizon (BR-07). | MUST | Exactly 8 selectable dates are shown, based on server WIB date. | USER | — | APPROVED |
| FR-AVL-02 | Slot availability grid in 30-minute steps from 06:00 to 20:30 start times. Each slot shows Available, Booked, Unavailable (blocked/closed/past), or remaining capacity for pooled facilities. | Real-time availability (BO-05). | MUST | 1. States match the database. 2. Air Hockey/Foosball show "2 left", "1 left", or "Full" (v1.0 wording). 3. Slots that have already started are not selectable. | USER | — | APPROVED |
| FR-AVL-03 | Availability never reveals another booker's name, email, user ID, or personal details. | Privacy (SEC-05). | MUST | Availability responses contain no owner fields. Verified by an API inspection test. | USER | — | APPROVED |
| FR-AVL-04 | The user's **own** bookings are highlighted in the grid ("Your booking"). | Helps users avoid self-conflict. | SHOULD | Own bookings are marked. Others' bookings are just "Booked". | USER | — | PROPOSED |
| FR-AVL-06 | **v1.0 (UAT-02):** after a start time and duration are chosen, every slot covered by the booking is highlighted as one block ("Selected" for the start slot, "Included" for the following slots). The highlight follows changes of duration. | The user sees exactly what will be booked. | MUST | Choosing 13:30 + 90 min highlights 13:30, 14:00 and 14:30. Changing to 60 min highlights only 13:30 and 14:00. | USER | FR-BKG-01 | APPROVED (PO, 2026-10-14) |
| FR-AVL-05 | Availability refreshes automatically when bookings, cancellations, blocks, block removals, or no-show releases occur, with a periodic fallback. | BO-05. | MUST | A change made in one browser appears in another open availability view within the target time (TRD TR-RT-04). | USER | — | APPROVED |

### 8.3 Booking (BKG)

| ID | Requirement | Rationale | Priority | Acceptance criteria | Role | Depends on | Status |
|---|---|---|---|---|---|---|---|
| FR-BKG-01 | Duration selection limited to the facility's allowed durations. Only durations that fit (free, within hours) are selectable for the chosen start time. | BR-02. | MUST | Tennis, the Basketball/Futsal court, and the Football Field offer 30/60/90. Table Tennis, Air Hockey, and Foosball offer 30 only. Durations that do not fit are disabled. **v1.0 (UAT-01):** once a time is chosen, the duration choice is shown in the bottom action bar, so it is always visible without scrolling. | USER | — | APPROVED |
| FR-BKG-02 | Booking review summary showing facility, activity, date, start time, end time, and duration (WIB). | Prevent mistakes. | MUST | All 6 items are shown before confirmation. | USER | — | APPROVED |
| FR-BKG-03 | Confirmation creates an immediately **CONFIRMED** booking after backend validation. No admin approval. | BR-10. | MUST | A valid request returns a confirmation with a booking reference. The booking appears in My Bookings. | USER | — | APPROVED |
| FR-BKG-04 | If the slot became unavailable before confirmation, the booking is rejected with a clear message, and the user returns to slot selection with refreshed availability. | Step 14 of the journey. | MUST | A conflicting request yields `SLOT_UNAVAILABLE`, and the UI refreshes the grid. | USER | — | APPROVED |
| FR-BKG-05 | A double-tap or network retry of the same confirmation must not create two bookings. | Reliability. | MUST | Repeated submission with the same request key returns the same booking. | USER | — | PROPOSED |
| FR-BKG-06 | Booking confirmation screen with booking reference and next steps (check-in window). | Clarity. | MUST | Screen shows reference, details, and check-in opening time. | USER | — | APPROVED |
| FR-BKG-07 | My Bookings: upcoming bookings (with Cancel / Check in actions when allowed) and history (past, cancelled, no-show). | Self-service management. | MUST | The user sees only their own bookings, with correct effective status. | USER | — | APPROVED |
| FR-BKG-08 | Booking details view. | Self-service. | MUST | Shows all booking fields, status, and allowed actions. Another user's booking ID returns "not found". | USER | — | APPROVED |
| FR-BKG-09 | Changing (rescheduling) a booking is **not** supported. The user cancels and books again. | Simplicity. | — | — | USER | — | APPROVED (PO, OD-23) |

### 8.4 Cancellation (CXL)

| ID | Requirement | Rationale | Priority | Acceptance criteria | Role | Status |
|---|---|---|---|---|---|---|
| FR-CXL-01 | A user may cancel their own **CONFIRMED** booking up to **30 minutes before** its start time (cutoff is an admin setting, default 30). | Release unused capacity early enough for others to use it. | MUST | 1. For a booking starting at 18:00, cancelling at 17:30:00 or earlier → status CANCELLED, slot is free for others immediately. 2. Cancelling at 17:30:01 or later → rejected with `BOOKING_NOT_CANCELLABLE` ("Bookings can be cancelled up to 30 minutes before the start time"). 3. The Cancel button is hidden after the cutoff and the booking screen explains why. | USER | APPROVED (PO, OD-13) |
| FR-CXL-02 | Cancellation retains the booking record (no deletion) and records the cancellation time. | Audit/history. | MUST | The cancelled booking remains in history. The database has no hard-delete path. | USER, ADMIN | APPROVED |
| FR-CXL-03 | Admin cancellation of any CONFIRMED (and, PROPOSED, CHECKED_IN) future or in-progress booking, with a **mandatory reason**. The system records the administrator's identity, the time, and the reason. | Operational control. | MUST | 1. Without a reason → rejected. 2. With a reason → status ADMIN_CANCELLED, audit entry created, owner notified in-app. | ADMIN | APPROVED |

### 8.5 Check-in and status (CHK, STS)

| ID | Requirement | Rationale | Priority | Acceptance criteria | Role | Status |
|---|---|---|---|---|---|---|
| FR-CHK-01 | An in-app **Check in** button is available from 15 minutes before to 15 minutes after the booking start (inclusive window, server time). | BO-06. | MUST | 1. For a booking starting at 18:00, check-in succeeds from 17:45:00 to 18:15:00. 2. At 17:44 or 18:16 it is rejected (`CHECKIN_TOO_EARLY` / `CHECKIN_WINDOW_CLOSED`). | USER | APPROVED |
| FR-CHK-02 | If not checked in by the deadline (start + 15 min), the booking becomes **NO_SHOW** and the resource is released. | Reclaim unused capacity. | MUST | After the deadline, the booking shows NO_SHOW and the next 30-minute slot onward becomes bookable. | System | APPROVED |
| FR-CHK-03 | Check-in window lengths are configuration (default 15/15) that administrators can change from the settings screen (FR-ADM-13). | Operational flexibility. | MUST | Changing the value in the settings screen changes check-in behaviour without a code change or deployment. | ADMIN, System | APPROVED (PO, OD-07) |
| FR-STS-01 | Booking statuses supported: CONFIRMED, CHECKED_IN, COMPLETED, CANCELLED, ADMIN_CANCELLED, NO_SHOW. | Lifecycle clarity. | MUST | Only the transitions defined in Section 9.3 are possible. | System | APPROVED |
| FR-STS-02 | A checked-in booking becomes COMPLETED when its end time passes. | History accuracy. | MUST | After end time, history shows COMPLETED. | System | PROPOSED (trigger point) |
| FR-STS-03 | Displayed status is computed from server time, so a delayed background job never shows a wrong status. | Do not rely on frontend timers. | MUST | A booking past its check-in deadline shows "No-show" even before the background job runs. | System | APPROVED |

### 8.6 Notifications (NTF)

| ID | Requirement | Priority | Acceptance criteria | Status |
|---|---|---|---|---|
| FR-NTF-01 | In-app notifications for: booking successful, booking cancelled, check-in successful, reservation unavailable, account deactivated, administrative cancellation (including block-caused cancellation). | MUST | 1. Each event produces the correct message for the correct user only. 2. **PROPOSED:** a notification list with unread badge. Notifications are kept for 90 days. "Reservation unavailable" and "Account deactivated" are shown inline (toast or screen) because they happen during the user's own action. | APPROVED (list/retention PROPOSED) |
| FR-NTF-02 | **PROPOSED:** a "Check-in now open" reminder banner on Home while the user has a booking in its check-in window. | SHOULD | The banner is shown during the window only. | PROPOSED |

### 8.7 Profile (PRF)

| ID | Requirement | Priority | Acceptance criteria | Status |
|---|---|---|---|---|
| FR-PRF-01 | The profile shows full name, email, role, and member-since date. | MUST | Shows the correct data for the logged-in user only. | APPROVED |
| FR-PRF-02 | The user can edit their full name and change their password while logged in. Email change is not supported in V1. | SHOULD | Name update is saved. Password change enforces the policy. | APPROVED (PO, OD-20) |

### 8.8 Global / UX (UX)

| ID | Requirement | Priority | Acceptance criteria | Status |
|---|---|---|---|---|
| FR-UX-01 | Mobile-first responsive UI for Android and iPhone, also usable on tablet and desktop. No horizontal scrolling. | MUST | Passes the responsive test set at 360, 390, 768, 1024, and 1440 px widths. | APPROVED |
| FR-UX-02 | The booking journey after selecting a facility takes no more than 6 major actions (activity → date → start time → duration → confirm). | MUST | Measured on the reference journey: Tennis takes 4 actions (date, time, duration, confirm), Basketball takes 5 (plus activity), Air Hockey takes 3 (date, time, confirm). | APPROVED |
| FR-UX-03 | All times are shown in WIB and labelled "WIB", regardless of device timezone. | MUST | A device set to a different timezone still shows WIB times (TEST-27). | APPROVED |
| FR-UX-04 | Offline state: the app clearly shows that it is offline and disables booking, cancel, and check-in. | MUST | With the network off, an offline banner appears and action buttons are disabled. No transaction is queued. | APPROVED |
| FR-UX-05 | Error, empty, not-found, and account-disabled states are shown with plain-English messages. Raw technical errors are never shown. | MUST | No SQL or stack text appears in the UI under fault injection. | APPROVED |
| FR-UX-06 | Installable PWA where supported, with an update prompt when a new version is available. | SHOULD | Installs on Android Chrome. iOS shows "Add to Home Screen" guidance. The update prompt appears after a deploy. | APPROVED |
| FR-UX-07 | Accessibility target: WCAG 2.2 Level AA for all user and admin screens. | MUST | Zero serious or critical automated axe violations. Manual keyboard and screen-reader checks pass. | PROPOSED (level), APPROVED (intent) |

---

### 8.9 Classes (CLS) — CR-03, APPROVED (PO, 2026-10-22)

Administrators run classes (for example Yoga). Users join a class session instead of booking a facility slot.

| ID | Requirement | Priority | Acceptance criteria | Role | Status |
|---|---|---|---|---|---|
| FR-CLS-01 | Create a class with name, optional instructor and description, capacity per session (1–200), and a location: **an existing facility** (its slots close during each session) or **a separate room** described in free text. | MUST | A facility class closes the facility for users ("Unavailable – Class: <name>"). A room class does not affect facility booking. | ADMIN | APPROVED |
| FR-CLS-02 | Schedule: one session, or weekly on chosen weekdays until an end date (max 26 weeks / 60 sessions per action). Sessions are 30–240 minutes, 30-minute aligned, within operating hours, and start in the future. More sessions can be added later. | MUST | Tue/Thu for two weeks creates 4 sessions. Invalid times are refused. | ADMIN | APPROVED |
| FR-CLS-03 | Before creating facility sessions, the admin reviews the bookings that overlap. They are cancelled only after explicit confirmation (same rule as blocks, FR-ADM-06). Two classes cannot use the same facility at the same time. | MUST | Without confirmation → refused; with confirmation → bookings ADMIN_CANCELLED and owners notified. | ADMIN | APPROVED |
| FR-CLS-04 | Users see the sessions of the next 14 days with time, location, instructor, description and free places, and join with one confirmation. Places are first come, first served. Other participants are never shown. | MUST | Places left decrease when a user joins. A full session cannot be joined. | USER | APPROVED |
| FR-CLS-05 | Class limit separate from facility bookings: at most **2 upcoming classes** per user (setting `max_active_class_enrolments`, 1–10). One place per person per session; two classes at the same time are refused. | MUST | The third class is refused with a clear message. Facility booking quota is unchanged. | USER | APPROVED |
| FR-CLS-06 | Leaving a class up to 30 minutes before the start, check-in from 15 minutes before to 15 minutes after the start, and automatic no-show, using the same settings as bookings. | MUST | Same results as TEST-15/17/18 for class places. | USER | APPROVED |
| FR-CLS-07 | Admin monitoring: per class, every session with places taken, checked in and no-shows; participant list per session; dashboard section "Classes" (sessions, places taken, attended, no-show, fill per class). | MUST | Numbers match the database. | ADMIN | APPROVED |
| FR-CLS-08 | Admin changes: edit name/instructor/description/room/capacity (capacity applies to upcoming sessions and cannot drop below places taken); cancel one session or end the whole class with a mandatory reason. Participants are notified; a facility block is released. Every change is audited. | MUST | Cancelled session → participants notified, facility bookable again. | ADMIN | APPROVED |
| FR-CLS-09 | Deactivating a user cancels their future class places (same as bookings, BR-28). | MUST | Places become free again. | ADMIN | APPROVED |

Waiting lists, recurring-class enrolment ("join all sessions") and instructor accounts are not in scope (FE-16, FE-17).

## 9. Booking Business Rules

### 9.1 Baseline rules (all APPROVED)

| ID | Rule |
|---|---|
| BR-01 | Booking is available only to authenticated, email-verified, active users. |
| BR-02 | Booking duration must be one of the facility's allowed durations. |
| BR-03 | Booking start times align to 30-minute boundaries (:00 or :30). |
| BR-04 | Bookings fall entirely within operating hours: 06:00–21:00 WIB, every day. The latest valid end is 21:00. |
| BR-05 | A user may hold at most **2** active/future reservations. |
| BR-06 | A user may reserve the same facility only **once per calendar day** (WIB). |
| BR-07 | The booking horizon is today through today + 7 calendar days (8 selectable dates). |
| BR-08 | Booking access is not restricted to a participant's training period. |
| BR-09 | Each reservation has exactly one owner/PIC. No list of additional players. |
| BR-10 | Valid, available reservations are confirmed immediately. No approval step. |
| BR-11 | Overlapping reservations of the same physical resource are impossible. |
| BR-12 | Basketball and Futsal share one physical resource's availability. |
| BR-13 | For Air Hockey and Foosball, the system allocates an available physical resource automatically. |
| BR-14 | A slot that has already started cannot be booked. |
| BR-15 | All business rules are enforced by the backend. |
| BR-16 | Frontend validation is for user experience only and is never the final authority. |
| BR-17 | A 60- or 90-minute reservation is one continuous interval on one resource (not several 30-minute bookings). |
| BR-18 | The once-per-facility-per-day restriction treats Basketball and Futsal as one facility. |
| BR-19 | All booking date and time calculations use Asia/Jakarta. |
| BR-20 | Concurrent booking requests must not create duplicate or conflicting reservations. |

### 9.2 Clarifying rules (APPROVED by the Product Owner on 2026-10-13)

BR-23, BR-24, and BR-27 have no decision reference because they only make the baseline precise; they are accepted with this document.

| ID | Rule | Reason / ambiguity resolved | Decision ref |
|---|---|---|---|
| BR-21 | **"Active/future" booking (BR-05)** means a booking whose status is CONFIRMED or CHECKED_IN **and** whose end time is still in the future. COMPLETED, CANCELLED, ADMIN_CANCELLED, and NO_SHOW bookings do not count. | The baseline does not define "active". Without this, it is unclear whether an in-progress booking blocks a new one. | OD-11 |
| BR-22 | **Daily facility limit (BR-06)** counts bookings with status CONFIRMED, CHECKED_IN, COMPLETED, or **NO_SHOW** on that WIB date. CANCELLED and ADMIN_CANCELLED do **not** count, so the user may rebook after a cancellation. | Counting NO_SHOW stops users from deliberately no-showing to rebook the same day. Not counting cancellations rewards releasing slots early. | OD-12 |
| BR-23 | **Calendar day** of a booking is the WIB date of its start time. Every booking lies within one day because of operating hours. | Removes ambiguity. | — |
| BR-24 | **Slot already started (BR-14):** a slot is bookable only if its start time is strictly later than the current server time. | Makes BR-14 testable. | — |
| BR-25 | **No-show release:** at the check-in deadline (start + 15 min), the whole booking is released. Because of BR-14, the earliest re-bookable time on that resource is the next 30-minute boundary, i.e. start + 30 min. For example, an 18:00–19:30 no-show frees 18:30, 19:00, and so on. | The baseline says "the next eligible 30-minute slot may become available". This rule states it precisely. | OD-18 |
| BR-26 | **User cancellation cutoff:** a user may cancel a CONFIRMED booking only until **30 minutes before** its start (configurable, FR-ADM-13). After the cutoff they cannot cancel and must either check in or become a no-show. A CHECKED_IN booking cannot be cancelled by the user. Consequence: a booking made less than 30 minutes before its start cannot be cancelled by the user; the review screen warns about this before confirmation. | "Eligible reservations" was undefined. The Product Owner chose a 30-minute cutoff. | OD-13 |
| BR-27 | **Resource preference for pooled facilities:** when several tables are free, the system assigns the lowest-numbered free table (Table 1 before Table 2). | Deterministic and testable allocation. | — |
| BR-28 | **Deactivation effect on bookings:** when a user is deactivated, their future CONFIRMED bookings are cancelled as ADMIN_CANCELLED (reason "Account deactivated"), and the slots are released. | Otherwise those slots would be held until each no-show deadline. | OD-14 |
| BR-29 | **Blocks** use 30-minute-aligned start and end times within operating hours, may cover several days, and may target the whole facility or one specific resource. | Keeps availability calculation consistent with the slot grid. | OD-15 |
| BR-30 | Fair-use limits (BR-05, BR-06, BR-07) apply to administrators' own bookings too. | Fairness. | OD-16 |

### 9.3 Booking status lifecycle (APPROVED statuses, PROPOSED transitions)

```
                 user check-in (start-15 … start+15)
   ┌───────────┐ ─────────────────────────────────▶ ┌────────────┐  end time passes  ┌───────────┐
   │ CONFIRMED │                                     │ CHECKED_IN │ ────────────────▶ │ COMPLETED │
   └───────────┘                                     └────────────┘                   └───────────┘
     │    │   │                                           │
     │    │   └─ deadline (start+15) passes, no check-in ─┼──────────────▶ NO_SHOW
     │    └───── user cancels ≥ 30 min before start ──────┼──────────────▶ CANCELLED
     └────────── admin cancel / block conflict / deactivation ─▶ ADMIN_CANCELLED ◀─ admin cancel (PROPOSED)
```

- Final (terminal) statuses: COMPLETED, CANCELLED, ADMIN_CANCELLED, NO_SHOW. No transition leaves a terminal status.
- Statuses that **occupy** the physical resource: CONFIRMED, CHECKED_IN (and COMPLETED, which is in the past).
- Each displayed status is computed from server time (FR-STS-03). The TRD defines stored vs effective status.

---

## 10. User Journeys

### UJ-01 First-time registration (participant)

1. The user scans a QR code or opens the URL and lands on Login.
2. Taps **Create account**, then enters name, company email (the screen shows the allowed domains, e.g. @danamon.co.id, @adira.co.id, @homecredit.co.id), password, and confirmation. Any other domain is rejected with a clear message.
3. Sees "Check your email" with a 6-digit code entry box.
4. Enters the code from the email, **or** opens the link in the email and taps **Confirm my email**.
5. The account is verified, and the user is signed in and taken to Home.

### UJ-02 Book Tennis for 60 minutes (target: 4 actions after choosing the facility)

1. Home → **Facilities** → **Tennis Court**.
2. Picks a date from the 8-day date strip (default: today). *(action 1)*
3. Taps an available start time, e.g. 17:00. *(action 2)*
4. Chooses **60 min**. Durations that do not fit are disabled. *(action 3)*
5. The review sheet shows "Tennis · Tennis Court · Wed 14 Oct 2026 · 17:00–18:00 WIB · 60 min".
6. Taps **Confirm booking**. *(action 4)* The confirmation screen shows reference `DCU-…` and "Check-in opens 16:45 WIB".

### UJ-03 Book Futsal on the shared court

As UJ-02, plus an **activity** choice (Basketball / Futsal) before the date. The grid shows the court as Booked if either activity occupies it.

### UJ-04 Book Air Hockey (pooled)

Date → start time (the grid shows "2 left", "1 left", or "Full") → Confirm. Duration is fixed at 30 minutes, so that step is skipped. The confirmation names the allocated table, e.g. "Air Hockey Table 2".

> **PROPOSED:** the allocated table is shown to the booking owner so they know where to go. Other users never see it.

### UJ-05 Slot taken during review

The user confirms, but another user took the slot moments earlier. The app shows "Sorry — that time was just booked. Please choose another time." and refreshes the grid. No booking is created.

### UJ-06 Cancel a booking

My Bookings → the booking → **Cancel booking** → confirm dialog → status "Cancelled". The slot is immediately free for others. From 30 minutes before the start, the Cancel button is no longer shown and the screen says "Cancellation closed 30 minutes before the start".

### UJ-07 Check in

Within the check-in window, Home shows a **Check in now** banner. The user taps it, and the status becomes "Checked in". Outside the window the button is disabled and shows when check-in opens or that it has closed.

### UJ-08 No-show

The user does not check in by start + 15 min. The booking shows "No-show" in history, and the court becomes bookable from the next half-hour.

### UJ-09 Forgot password

Login → **Forgot password** → enter email → "If an account exists, we've sent instructions". The user enters the code or opens the link → sets a new password that meets the policy → signs in.

### UJ-10 Deactivated user with an open session

The user's phone still has the app open. When they try to book, cancel, or check in, the server rejects the request and the app shows the **Account disabled** screen.

### UJ-11 Admin blocks the court for maintenance

1. Admin → **Facility blocks** → **New block**: Basketball/Futsal Court, Sat 17 Oct 2026, 08:00–12:00, reason "Maintenance – floor repair".
2. The system lists 2 conflicting bookings and explains that they will be cancelled and the owners notified.
3. The admin ticks "I understand" and confirms.
4. The block is created, the 2 bookings become ADMIN_CANCELLED with the reason, and an audit entry and owner notifications are recorded.

### UJ-12 Admin deactivates a user

Admin → **Users** → search → user → **Deactivate** → enter a reason → confirm. Access is revoked at once, and future bookings are cancelled and released (BR-28).

---

## 11. Administrative Requirements

| ID | Requirement | Priority | Acceptance criteria | Status |
|---|---|---|---|---|
| FR-ADM-01 | **Dashboard** for a chosen date (default today, WIB) showing: reservations today, upcoming reservations, checked-in, cancelled (user + admin), no-show counts, number of active users, and facility utilization per facility. | MUST | Each metric equals an independent SQL count on a seeded dataset (TEST-36). | APPROVED |
| FR-ADM-02 | **Utilization** definition: booked-and-used resource-minutes ÷ available resource-minutes (operating minutes minus blocked minutes) for the period. Shown alongside a "reserved" utilization that includes no-shows. | MUST | Formula and figures match the test fixture. Example: Tennis open 900 min, blocked 120 min → 780 min available; 390 min used → 50%. | APPROVED (PO, OD-26) |
| FR-ADM-03 | **Booking management**: list all bookings with filters (date range, facility, activity, status, resource) and search (owner name/email, booking reference). Shows owner and allocated resource. | MUST | Filters combine correctly. Results are paginated. A USER cannot call this operation (TEST-24). | APPROVED |
| FR-ADM-04 | **Admin cancel** with a mandatory reason. Records admin, time, and reason. Owner notified. | MUST | See FR-CXL-03. Audit entry verified (TEST-33). | APPROVED |
| FR-ADM-05 | **Facility blocking** with category (Maintenance, Event, Operational restriction, Other), a free-text reason, the whole facility or a specific resource, and a start/end. | MUST | A block makes the affected slots "Unavailable" for users. | APPROVED |
| FR-ADM-06 | **Block conflict handling**: before creating a block, show the conflicting reservations and the impact, require explicit confirmation, then cancel the affected reservations (ADMIN_CANCELLED) with an audit trail. If the conflicts changed between preview and confirm, the block is not created and the preview refreshes. | MUST | TEST-21, TEST-22. | APPROVED (race handling PROPOSED) |
| FR-ADM-07 | **Remove block**: a block is ended or removed (kept in history with who/when/why). Cancelled bookings are **not** restored. | MUST | Slots become available again. The block history is retained. | APPROVED (no-restore PROPOSED) |
| FR-ADM-08 | **User management**: search users by name/email, view details (profile, status, role, booking counts, recent bookings), activate/deactivate with a reason, grant/revoke the admin role with a reason. | MUST | Every change is audited. ROLE-03 and ROLE-04 safeguards hold. | APPROVED |
| FR-ADM-09 | **Audit trail** for every administrative action (cancel, block create/remove, user activate/deactivate, role change, settings change, email domain add/rename/remove): actor, time, action, target, before/after, reason. The audit trail is read-only and cannot be edited or deleted through the application. | MUST | TEST-33. | APPROVED |
| FR-ADM-10 | **PROPOSED:** an audit log viewer (read-only list with filters) for administrators. | SHOULD | Admins can view audit entries. | PROPOSED |
| FR-ADM-11 | Admin screens are optimized for desktop but remain usable on mobile. | MUST | Admin screens pass the responsive test at 390 px without horizontal page scroll. Tables collapse to cards. | APPROVED |
| FR-ADM-12 | **Allowed email domain management:** administrators can view, add, rename, and remove allowed registration domains, with a mandatory reason. Domains are stored in lowercase and validated as a domain name. Removal is a soft removal kept in history. At least one active domain must always remain. Removing a domain does **not** deactivate existing users. | MUST | 1. Adding `example.co.id` allows new registrations from it immediately. 2. Removing a domain blocks new registrations from it immediately; existing users stay active. 3. Removing the last active domain is rejected (`LAST_DOMAIN_PROTECTED`). 4. Every change is audited. 5. A USER cannot call these operations. | APPROVED (PO, OD-27, OD-30) |
| FR-ADM-13 | **Booking settings screen:** administrators can change (with a mandatory reason, audited): check-in opens before start (0–60 min, default 15), check-in closes after start (5–60 min, default 15), user cancellation cutoff (0–240 min, default 30), booking horizon (0–30 days, default 7), maximum active/future bookings per user (1–10, default 2), maximum bookings per facility per user per day (1–5, default 1). Operating hours, slot length, timezone, and facility inventory are shown **read-only** in V1. A change applies to actions from the moment it is saved; existing bookings are never cancelled because of a settings change. | MUST | 1. Out-of-range values are rejected (`VALIDATION_ERROR`). 2. After saving, the next booking/check-in/cancel follows the new value. 3. Each change appears in the audit trail with old and new value. 4. A USER cannot call these operations. | APPROVED (PO, OD-07); ranges PROPOSED |

---

## 12. Non-Functional Business Requirements

| ID | Requirement | Priority | Measure | Status |
|---|---|---|---|---|
| NFR-01 | Correctness: zero double bookings of any physical resource under any request pattern. | MUST | 0 overlaps in the concurrency test suite and in a production data audit query. | APPROVED |
| NFR-02 | Security & privacy: users access only their own booking data. Admin access is role-controlled and audited. Personal data is handled in line with UU PDP. | MUST | Security test set TEST-23, 24, 25, 34, 35 passes. | APPROVED |
| NFR-03 | Responsiveness on mobile networks. | MUST | See TRD Section 15. | APPROVED (PO, OD-25) |
| NFR-04 | Availability of the service. | SHOULD | PROPOSED target 99.5% monthly, subject to the hosting/Supabase plan (OD-01, OD-09). | PROPOSED |
| NFR-05 | Usability for occasional users: first booking without help. | MUST | ≥ 4 of 5 UAT participants complete UJ-01 + UJ-02 unaided. | PROPOSED |
| NFR-06 | Accessibility: WCAG 2.2 AA. | MUST | See FR-UX-07. | PROPOSED level |
| NFR-07 | Browser support: latest 2 major versions of Chrome (Android, desktop), Safari (iOS 17+, macOS), Edge, and Firefox. | MUST | The test matrix passes. | PROPOSED |
| NFR-08 | Maintainability: typed codebase, automated tests, documented migrations, no secrets in source control. | MUST | CI runs tests on every change. A secret scan is clean. | APPROVED |
| NFR-09 | Data retention: bookings and audit logs are retained (never hard-deleted by the app). PROPOSED retention: bookings and audit logs ≥ 2 years, notifications 90 days. | SHOULD | Retention job or policy is documented. | PROPOSED (OD-17) |
| NFR-10 | Time correctness: all business times are in WIB regardless of device timezone. | MUST | TEST-27. | APPROVED |

---

## 13. Business Success Criteria

### 13.1 Mandatory acceptance criteria (must be met for go-live)

| # | Area | Criterion |
|---|---|---|
| SC-M1 | Booking completion | A verified, active user can complete UJ-02, UJ-03, and UJ-04 end to end on Android Chrome and iPhone Safari (TEST-04 to TEST-12, TEST-28, TEST-29). |
| SC-M2 | Double-booking prevention | 0 overlapping occupying bookings per resource in all concurrency tests (TEST-07 to TEST-12, TEST-26) and in a pre-go-live database integrity query. |
| SC-M3 | Transaction reliability | 100% of mandatory test scenarios TEST-01 to TEST-35 pass in staging. Every rejected booking returns a defined business error code. No raw database errors reach the UI. |
| SC-M4 | Registration | TEST-01, TEST-03 pass with the production email provider, including the link-scanner-safe flow. Verification emails are confirmed to arrive at all three allowed company domains. Disallowed domains are rejected (TEST-52). |
| SC-M5 | Journey usability | The booking journey meets FR-UX-02 (≤ 6 major actions). ≥ 4 of 5 UAT users complete a first booking unaided. |
| SC-M6 | Check-in reliability | TEST-18 to TEST-20 pass. The no-show status is applied no later than 2 minutes after the deadline in staging, and the displayed status is correct immediately. |
| SC-M7 | Administrative efficiency | An admin can create a block with conflicts, cancel a booking with a reason, change a setting, and add or remove an email domain, each in ≤ 5 actions, with audit entries present (TEST-21, 22, 33, 53, 54). |
| SC-M8 | Availability (operational) | Monitoring and alerting are configured before go-live (OD-08). |
| SC-M9 | Security & privacy | TEST-23, 24, 25, 34, 35 pass. A pre-production security review has no open Critical/High findings. |
| SC-M10 | Mobile usability | Responsive and accessibility tests pass (TEST-32, FR-UX-01). No horizontal scroll at 360 px. |

### 13.2 Operational KPIs (approved by the Product Owner on 2026-10-13 as working targets, OD-25; there is no historical baseline, so targets may be revised before go-live)

| # | KPI | Definition | PROPOSED target |
|---|---|---|---|
| KPI-1 | Booking success rate | Confirmed bookings ÷ booking confirmations attempted (excluding rule-based rejections such as limits) | ≥ 95% |
| KPI-2 | Double bookings in production | Count of overlapping occupying bookings per resource | 0 (hard) |
| KPI-3 | Booking API error rate | Unexpected (non-business) errors ÷ booking calls | < 0.5% |
| KPI-4 | Registration completion | Accounts verified within 24 h ÷ accounts registered | ≥ 80% |
| KPI-5 | Time to book | Median time from opening a facility to confirmation | ≤ 60 s |
| KPI-6 | Check-in rate | CHECKED_IN or COMPLETED ÷ (bookings past their check-in deadline, excluding cancellations) | Monitor; target ≥ 80% after first month |
| KPI-7 | No-show rate | NO_SHOW ÷ same denominator as KPI-6 | Monitor; target ≤ 15% |
| KPI-8 | Admin effort | Admin cancellations and blocks per week, and median handling time | Baseline after month 1 |
| KPI-9 | Service availability | Monthly uptime of app URL + booking API | ≥ 99.5% (depends on OD-01, OD-09) |
| KPI-10 | Security incidents | Confirmed unauthorized data access incidents | 0 |
| KPI-11 | Mobile share & experience | % sessions on mobile; p75 LCP on mobile | Monitor; LCP ≤ 2.5 s |

---

## 14. Business Acceptance Criteria (phase gates)

| Gate | Accepted when |
|---|---|
| Phase 0 | BRD, TRD, traceability matrix, open decisions, and review package are approved, and the Phase-1-blocking open decisions are answered or their defaults accepted. |
| Phase 1 | Architecture, ERD, API/RPC specification, security design, UX wireframes, and the test plan are approved. |
| Phase 2 | The database, RLS, and RPCs are implemented. Database, security, and concurrency tests pass locally and in CI. |
| Phase 3 | All screens in Section 31 of the instruction are implemented and pass unit and component tests. |
| Phase 4 | TEST-01 to TEST-35 (+ approved proposed tests) pass in staging. UAT is signed off. The security review is clean of Critical/High findings. |
| Phase 5 | Production is deployed with HTTPS, headers, backups, and monitoring. Smoke tests pass. |
| Phase 6 | User, admin, and operations guides are handed over. The initial admins are provisioned. Hypercare is complete. |

---

## 15. Assumptions and Dependencies

### 15.1 Assumptions (PROPOSED — please confirm or correct)

| ID | Assumption |
|---|---|
| A-01 | Expected scale is small: fewer than 2,000 registered users and fewer than 270 bookings/day (the physical maximum). The design is not scale-limited at this size. |
| A-02 | Operating hours are the same for all facilities and all days, with no public-holiday closures. Holidays and closures are handled with admin blocks. |
| A-03 | Facility inventory changes (adding a court or table) are rare and are made by the development/operations team via a database migration. There is no admin UI for inventory in V1. |
| A-04 | Users have smartphones with a modern browser and mobile data or Wi-Fi at the facility. |
| A-05 | The product owner can provide a sender email domain (or accept the provider's domain) for authentication emails. |
| A-06 | Asia/Jakarta has no daylight-saving time, so UTC+7 is fixed. The design still uses named-timezone conversion. |
| A-07 | One person (the PIC) checking in is sufficient evidence of facility use. No presence verification is needed (APPROVED: GPS/QR/biometric are out of scope). |
| A-08 | Registration is limited to approved company domains (APPROVED, PO). People with several mailboxes on allowed domains could still hold more than one account; this residual risk is accepted and handled by admin deactivation. |
| A-09 | The three initial domains (`danamon.co.id`, `adira.co.id`, `homecredit.co.id`) receive external email reliably, so verification codes reach users. Corporate mail filters may need the sender domain allow-listed (see OD-03). |

### 15.2 Dependencies

| ID | Dependency | Needed by |
|---|---|---|
| D-01 | Supabase organisation and projects (development, staging, production) | Phase 2 |
| D-02 | Email delivery provider with a verified sender domain (SPF/DKIM/DMARC) | Phase 2 testing of auth; mandatory for production |
| D-03 | Hosting provider and domain name with HTTPS | Phase 5 (staging earlier) |
| D-04 | Names/emails of initial administrators | Phase 2 (seed) / Phase 6 |
| D-05 | Facility photos/icons and DCU branding assets (optional) | Phase 3 |
| D-06 | UAT participants (≥ 5 users, ≥ 2 admins) | Phase 4 |

---

## 16. Out-of-Scope Items (Version 1) — APPROVED

Payment · GPS validation · QR check-in · Chat · Social networking · Tournament management · Matchmaking · Equipment rental · Google login · Apple login · Corporate SSO · Calendar integration · Push notifications · Gamification · Offline booking · Native Android APK · Native iOS application · Email notifications beyond authentication · Biometric verification · Physical presence detection.

> **Baseline change:** the brief listed "corporate email restrictions" as not required. The Product Owner brought an email **domain allow-list** into V1 scope (FR-AUTH-12). Corporate SSO remains out of scope.

**Additional items PROPOSED as out of scope for V1:**

- booking on behalf of another user,
- rescheduling (use cancel + rebook),
- recurring bookings,
- waitlists,
- admin UI for facility inventory or operating hours,
- multi-language UI,
- user self-service account deletion (OD-17),
- automatic re-allocation of pooled bookings when one table is blocked.

---

## 17. Future Enhancements (backlog candidates)

| ID | Enhancement | Rationale |
|---|---|---|
| FE-01 | QR-code check-in at the facility | Stronger presence evidence |
| FE-02 | Push / email reminders before check-in | Lower no-show rate |
| FE-03 | Editable operating hours from the settings screen (read-only in V1) | Operational flexibility |
| FE-04 | Per-facility and holiday operating hours | Real-world schedules |
| FE-05 | Waitlist with automatic offer on cancellation or no-show | Better utilization |
| FE-06 | No-show penalties (e.g. temporary booking suspension after N no-shows) | Fairness |
| FE-07 | Corporate SSO login (e.g. Microsoft Entra ID) for the partner companies | Stronger identity assurance than email domain checks |
| FE-08 | Calendar (ICS) export | Convenience |
| FE-09 | Equipment rental; tournaments; matchmaking | Engagement |
| FE-10 | Automatic re-allocation to another pooled table when one table is blocked | Fewer admin cancellations |
| FE-11 | Utilization analytics export (CSV) and trends | Management reporting |
| FE-12 | Bahasa Indonesia UI | Accessibility for local users |
| FE-13 | Admin booking on behalf of users | Front-desk use |
| FE-14 | Mobile number on the profile, with OTP login or WhatsApp notifications (see CR-01) | Convenience. Requires an SMS/WhatsApp provider and a UU PDP review. |
| FE-15 | Location- or QR-verified check-in at the facility (see CR-02) | Confirms presence without blocking advance booking |
| FE-16 | Waiting list for full class sessions, with automatic offer when a place frees up | Fuller classes |
| FE-17 | Join all sessions of a recurring class at once; instructor accounts that can see their participant lists | Convenience for regular participants and instructors |
