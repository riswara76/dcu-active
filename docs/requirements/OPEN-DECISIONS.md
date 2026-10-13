# DCU Active — Open Decisions & Decision Log

| Item | Value |
|---|---|
| Phase | Phase 0 |
| Version | 0.2 (PO decisions recorded) |
| Date | 2026-10-13 |

On 2026-10-13 the Product Owner resolved **every decision needed before Phase 1**. They are recorded in the Decision Log (Part 1).

The decisions still open (Part 2) are needed only before Phase 2, production, or go-live. **None of them blocks Phase 1.**

---

## Part 1 — Decision Log (resolved 2026-10-13)

"Baseline change" marks a decision that changes the original master instruction.

| ID | Decision | Outcome | Baseline change? | Documents updated |
|---|---|---|---|---|
| OD-07 | Admin settings management | **Settings screen in V1.** Admins can change the check-in window, cancellation cutoff, booking horizon, and booking limits, with a reason and audit trail. Operating hours, slot length, and timezone stay read-only. | **Yes** (brief: "configurable in the future") | BRD FR-ADM-13, FR-CHK-03; TRD 6.2, 11.2; RTM TEST-54 |
| OD-11 | "Active/future" booking | CONFIRMED or CHECKED_IN, counted until the end time passes | No (clarification) | BRD BR-21 |
| OD-12 | Daily facility limit counting | Cancellations free the day; no-shows still count | No (clarification) | BRD BR-22 |
| OD-13 | User cancellation cutoff | **Up to 30 minutes before the start** (configurable; default 30) | No (clarification), but stricter than the proposed default | BRD FR-CXL-01, BR-26; TRD 11.1, 11.5 |
| OD-14 | Deactivated user's future bookings | Cancelled automatically (ADMIN_CANCELLED, "Account deactivated") | No (clarification) | BRD BR-28 |
| OD-15 | Block rules & visibility | 30-min aligned, multi-day allowed. Users see "Unavailable – Maintenance/Event/Operational" without reason text or admin name. | No | BRD BR-29; TRD 6.2 |
| OD-16 | Admins' own bookings | Same limits as users; no booking on behalf of others | No | BRD ROLE-05, BR-30 |
| OD-18 | No-show release | Released at start+15; re-bookable from the next half-hour (start+30) | No | BRD BR-25 |
| OD-19 | Football Field duration | **30, 60, or 90 minutes** | **Yes** (brief: 30 min max) | BRD Section 7, FR-BKG-01 |
| OD-20 | Profile editing | Name and password editable; email not editable | No | BRD FR-PRF-02 |
| OD-21 | Admin safeguards | No self-deactivation or self-demotion; at least 1 active admin | No | BRD ROLE-04 |
| OD-23 | Rescheduling | Not supported; cancel and rebook | No | BRD FR-BKG-09 |
| OD-24 | Additional tests | TEST-36…51 **mandatory**; TEST-52…54 added for the new requirements | No | RTM |
| OD-25 | Performance targets & KPIs | Approved as working targets; may be revised before go-live | No | BRD 13.2, NFR-03; TRD 15 |
| OD-26 | Utilization formula | Used minutes ÷ (operating minutes − blocked minutes), plus "reserved" utilization including no-shows | No | BRD FR-ADM-02 |
| OD-27 | Who may register | **Only `@danamon.co.id`, `@adira.co.id`, `@homecredit.co.id`.** Admins may add, rename, or remove domains. | **Yes** (brief: any domain, no corporate restriction) | BRD FR-AUTH-01, FR-AUTH-12, FR-ADM-12; TRD TR-AUTH-11/12, `allowed_email_domains`; RTM TEST-52/53 |
| OD-28 | Allocated table shown to owner | Yes, owner and admins only | No | BRD UJ-04 |
| OD-30 | Existing users when a domain is removed | **Stay active.** Only new registrations are blocked. Admins may deactivate individuals. | New rule | BRD FR-AUTH-12, FR-ADM-12; TRD TR-AUTH-12 |
| OD-31 | Admin accounts and domains | Admins **must** have an email on an allowed domain | New rule | BRD ROLE-06; TRD TR-AUTH-10/12 |
| OD-32 | Subdomains | **Not allowed.** Only exact domain matches (e.g. `x@branch.danamon.co.id` is rejected). | New rule | BRD FR-AUTH-12; TRD 6.2 |

**Ranges for editable settings (PROPOSED, part of FR-ADM-13; confirm or adjust in Phase 1):**

| Setting | Range |
|---|---|
| Check-in opens before start | 0–60 min |
| Check-in closes after start | 5–60 min |
| Cancellation cutoff | 0–240 min |
| Booking horizon | 0–30 days |
| Active bookings per user | 1–10 |
| Bookings per facility per day | 1–5 |

---

## Part 2 — Decisions still open

| ID | Decision | Proposed default | Needed before | Owner |
|---|---|---|---|---|
| OD-03 | Email delivery provider | Transactional SMTP provider (e.g. Resend, Postmark, Amazon SES, Brevo) on a DCU sender domain. **New in v0.2:** ask the IT teams of Danamon, Adira, and Home Credit to allow-list the sender so verification emails are not quarantined. | Phase 2 (realistic auth testing); mandatory for production | PO + IT |
| OD-04 | Initial administrator provisioning | Name 2+ initial admins **with emails on the allowed domains**. They register normally, then the operator promotes them via an audited script. | Phase 2 | PO |
| OD-05 | Check-in configuration | 15 min before / 15 min after (inclusive), now editable on the settings screen | Phase 2 (initial value) | PO |
| OD-06 | No-show processing mechanism | `pg_cron` every minute + lazy sweep in booking RPCs + effective status on read | Phase 2 | Tech lead |
| OD-22 | Supabase region / data residency | Southeast Asia (Singapore). Confirm that the partner companies have no requirement to keep employee data inside Indonesia. | Phase 2 | PO + IT/Legal |
| OD-29 | Source control and CI | Git repository on GitHub with GitHub Actions (the workspace is not a Git repository yet) | Start of Phase 1 implementation artefacts / Phase 2 | PO + IT |
| OD-01 | Production hosting provider | Cloudflare Pages (alternatives: Vercel, Netlify) | Production | PO + IT |
| OD-02 | Domain name | Subdomain of a DCU domain, e.g. `active.<dcu-domain>` | Production (staging URL earlier) | PO + IT |
| OD-08 | Operational monitoring | Frontend error tracking + uptime monitor + job-health alert + daily integrity check | Production | PO + Ops |
| OD-09 | Backups / Supabase plan | Paid Supabase plan with daily backups (RPO ≤ 24 h, RTO ≤ 4 h); add PITR if RPO must be minutes | Production | PO + Ops |
| OD-17 | Data retention & deletion (UU PDP) | Bookings and audit ≥ 2 years; notifications 90 days; deletion requests handled by admin anonymisation; privacy notice. **New in v0.2:** confirm whether the partner companies need a data-sharing arrangement, since their employees' data is processed. | Production | PO + Legal/DPO |
| OD-10 | Onboarding & account support | QR posters → URL; "How to book" help; support contact on Account disabled and error screens | Go-live | PO |

### Notes on the open decisions

**OD-03 — Email delivery (more important after the domain decision).** Every user now receives verification emails at one of three corporate mail systems. These often quarantine automated mail from unknown senders. A verified sender domain (SPF, DKIM, DMARC) plus an allow-list request to each company's IT team should be arranged early in Phase 2. Delivery to all three domains must be tested before go-live (BRD SC-M4).

**OD-04 — Initial administrators.** Because of OD-31, the first administrators must use an email on one of the three allowed domains. At least 2 admins are recommended to avoid lock-out.

**OD-17 — Personal data.** The users are employees of three companies. Legal should confirm whether DCU needs a data processing or sharing arrangement with those companies under UU PDP.
