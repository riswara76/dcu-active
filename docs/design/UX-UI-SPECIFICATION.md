# DCU Active — UX / UI Specification

| Item | Value |
|---|---|
| Phase | Phase 1 — Solution Architecture and UX Design |
| Version | 1.0 (Draft for review) |
| Date | 2026-10-14 |
| Related | BRD §8–11 (FR-*), TRD §4 (routes), §16–17 (responsive, accessibility) |

Wireframes are low-fidelity (layout and content, not final visuals). Icons are written as plain characters: `!` warning, `i` info, `x` close/unavailable, `v` dropdown, `>` chevron, `*` notification bell, `+`/`-` rule met/not met, `o` checkbox. Mobile wireframes assume a 390 px wide screen; admin wireframes assume a 1280 px desktop.

---

## 1. Design principles

1. **Book in under a minute.** After choosing a facility: date → time → (duration) → confirm. No more than 5 taps (FR-UX-02).
2. **Occasional users first.** Plain words, no jargon, every screen answers "what can I do now?".
3. **Thumb-friendly.** Primary actions sit in a sticky bottom bar on mobile. Touch targets are at least 44 × 44 px.
4. **Never guess the time.** Every time is shown in WIB with the "WIB" label. "Today" comes from the server.
5. **Honest states.** Available, booked, unavailable, and past are always distinguished by text and icon, never by colour alone.
6. **Calm errors.** Say what happened and what to do next. Never show technical messages.

---

## 2. Information architecture

```
Public:  Login · Register · Verify email · Confirm email (link) · Forgot password · Reset password
User:    Home · Facilities → Facility booking (date + slots + duration) → Review (sheet) → Confirmed
         My bookings (Upcoming | History) → Booking detail
         Profile (+ Notifications, Change password, Privacy notice, Sign out)
Admin:   Dashboard · Bookings → Booking detail · Facility blocks · Users → User detail
         Settings (Booking settings | Email domains) · Audit log
Global:  Offline banner · Update prompt · Error page · Not found · Account disabled · Empty states
```

### 2.1 Navigation

| Context | Pattern |
|---|---|
| User, mobile | Bottom tab bar: **Home · Facilities · My bookings · Profile**. A notification bell with an unread badge sits in the top bar. |
| User, ≥ 768 px | The same four items in a top navigation bar |
| Admin, ≥ 1024 px | Left sidebar: Dashboard, Bookings, Facility blocks, Users, Settings, Audit log, plus "Back to booking app" |
| Admin, < 1024 px | Top bar with a menu button opening the same items in a drawer |
| Admin entry point | "Admin" item in the user top bar/profile, shown only to admins (the backend authorizes regardless) |

---

## 3. Visual design tokens

### 3.1 Colour

Contrast ratios were computed with the WCAG 2.x formula on 2026-10-14.

| Token | Hex | Use | Contrast |
|---|---|---|---|
| `--color-primary` | `#0B5CAD` | Primary buttons, links, selected date/slot | 6.67:1 on white (white text on it: 6.67:1) |
| `--color-primary-soft` | `#E8F1FB` | Selected backgrounds | primary text on it 5.85:1 |
| `--color-text` | `#111827` | Body text | 17.74:1 on white |
| `--color-text-muted` | `#4B5563` | Secondary text | 7.56:1 |
| `--color-text-subtle` | `#6B7280` | Captions, placeholders | 4.83:1 |
| `--color-disabled` | `#9CA3AF` | Disabled/decorative only (WCAG exempt) | 2.54:1 — **never for readable text** |
| `--color-surface` | `#F3F4F6` | Page background on desktop, cards | primary on it 6.06:1 |
| `--color-border` | `#D1D5DB` | Borders (non-text) | — |
| `--color-available` / `-bg` | `#14532D` / `#DCFCE7` | "Available" slot | 8.30:1 |
| `--color-booked` / `-bg` | `#374151` / `#E5E7EB` | "Booked" slot | 8.33:1 |
| `--color-success` | `#15803D` | Success icon/button | 5.02:1 |
| `--color-warning` / `-bg` | `#92400E` / `#FEF3C7` | Check-in banner, warnings | 6.37:1 |
| `--color-danger` / `-bg` | `#991B1B` / `#FEE2E2` | Errors, destructive actions | 6.80:1 (`#B91C1C` on white 6.47:1) |

Light theme only in V1. All colours are CSS variables, so DCU brand colours can replace them later. Any replacement must be re-checked for contrast.

### 3.2 Typography (system font stack, ADR-009)

`font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`

| Style | Size / line height | Weight |
|---|---|---|
| Display (page title) | 24 / 32 px | 700 |
| Heading | 20 / 28 px | 600 |
| Subheading | 17 / 24 px | 600 |
| Body | 16 / 24 px (minimum on mobile, avoids iOS zoom) | 400 |
| Small | 14 / 20 px | 400 |
| Caption | 13 / 18 px | 500 |

Tabular numbers (`font-variant-numeric: tabular-nums`) are used for times.

### 3.3 Spacing, shape, elevation

- **Spacing scale:** 4, 8, 12, 16, 24, 32, 48 px. The page gutter is 16 px on mobile and 24 px on tablet and desktop.
- **Radius:** 8 px for controls, 12 px for cards, 16 px for the top corners of bottom sheets.
- **Elevation:** cards are flat with a border. Sheets and dialogs use a single soft shadow.
- **Focus ring:** 3 px outline in `--color-primary` with a 2 px offset, always visible on keyboard focus.

### 3.4 Iconography

`lucide-react` icons, always paired with text labels for status (e.g. ✓ "Available", ⦸ "Unavailable").

---

## 4. Core components

| Component | Behaviour and accessibility |
|---|---|
| **DateStrip** | 8 horizontally scrollable chips (today … +7). Format "Wed 14". "Today" and "Tomorrow" labels. Arrow keys move between chips. `aria-pressed` on the selected chip. |
| **SlotGrid / SlotCell** | 30 cells (06:00–20:30), 3 columns on mobile and 6 on desktop. Each cell shows the time and state text: "Available", "2 left", "1 left", "Booked", "Unavailable", or "Your booking". Past slots are hidden by default ("Show earlier times" toggle). Accessible name: "17:00 WIB, available". Disabled cells are focusable for screen-reader context but not selectable. |
| **DurationChips** | 30 / 60 / 90 min. Durations that do not fit are disabled with the reason "Not free for 90 min". Hidden when only 30 is allowed. |
| **ReviewSheet** | Bottom sheet on mobile, modal on desktop. Focus is trapped. Esc closes. Shows the summary, the cancellation note, and the Confirm button with a loading state. |
| **StatusBadge** | Text plus icon: Upcoming, Check-in open, Checked in, Completed, Cancelled, Cancelled by DCU, No-show |
| **BookingCard** | Facility, activity, date, time WIB, table name (pooled facilities), status, primary action (Check in / Cancel) |
| **CheckInBanner** | Warning-coloured banner on Home while a booking is in its check-in window, showing a countdown "Check-in closes 18:15 WIB" |
| **OfflineBanner** | Fixed at the top: "You're offline. Booking, cancelling and check-in are paused until you're back online." `role="status"`. |
| **UpdateToast** | "A new version of DCU Active is available. [Reload]" (deferred during review) |
| **ConfirmDialog** | For destructive actions. Admin variants include a required reason textarea (5–500 chars) with a counter. |
| **DataTable (admin)** | Sortable headers, filters bar, pagination ("Load more"). Collapses to cards below 768 px. |
| **EmptyState** | Illustration-free: icon + one sentence + one action |
| **Toast** | Success/info messages (`role="status"`). Errors appear inline near the action, plus a toast for global errors. |

---

## 5. Screen specifications — public & authentication

### S1 Login (`/login`)

```
┌──────────────────────────────────┐
│          DCU Active              │
│  Book DCU sports facilities      │
│                                  │
│  Email                           │
│  [ name@danamon.co.id         ]  │
│  Password                        │
│  [ ••••••••••            (show) ]│
│                     Forgot password?
│  [         Sign in             ] │
│                                  │
│  New here?  Create an account    │
└──────────────────────────────────┘
```

- Errors: wrong credentials → "Email or password is incorrect." Unverified → go to S3 with "Please verify your email first".
- `?next=` is honoured only via `safeNext()`.

### S2 Register (`/register`)

```
┌──────────────────────────────────┐
│ ← Create your account            │
│  Use your company email:         │
│  @danamon.co.id · @adira.co.id · │
│  @homecredit.co.id               │
│  Full name     [               ] │
│  Company email [               ] │
│  Password      [               ] │
│   + 8+ characters  + A–Z  + a–z  │
│   + 0–9  - symbol (!@#…)         │
│  Confirm password [            ] │
│  By creating an account you agree│
│  to the Privacy notice.          │
│  [       Create account        ] │
└──────────────────────────────────┘
```

- The domain list comes from `get_registration_domains`. An inline warning appears as soon as the typed domain is not in the list.
- The server error `EMAIL_DOMAIN_NOT_ALLOWED` shows the same message.
- Duplicate email: generic success ("Check your email") to avoid account enumeration.

### S3 Verify email (`/verify`)

```
┌──────────────────────────────────┐
│  Check your email                │
│  We sent a 6-digit code to       │
│  n***@danamon.co.id              │
│  [ _ ][ _ ][ _ ][ _ ][ _ ][ _ ]  │
│  [          Verify             ] │
│  Didn't get it? Resend (0:59)    │
│  Tip: check Junk/Quarantine.     │
│  Sender: DCU@danamon.co.id       │
└──────────────────────────────────┘
```

The code input uses `inputmode="numeric"` and `autocomplete="one-time-code"`. A pasted code auto-submits.

### S3b Confirm email link (`/auth/confirm`)

The link from the email shows: "Confirm your email for DCU Active" [**Confirm my email**]. Verification happens only after the click (scanner-safe), followed by a success message and Home.

### S4 Forgot password / S5 Reset password

- **S4:** an email field and "Send reset code". The response is always: "If an account exists for this email, we've sent a code."
- **S5:** code entry (or arrival via link), new password with live policy hints, confirm, "Update password". Then: "Password updated. Other devices were signed out."

### S6 Account disabled (`/account-disabled`)

"Your account has been disabled. If you think this is a mistake, contact DCU at {support contact (OD-10)}." Plus [Sign out].

---

## 6. Screen specifications — user

### S7 Home (`/`)

```
┌──────────────────────────────────┐
│ DCU Active                   *2 │
│ Hi, Rina                         │
│ ┌──────────────────────────────┐ │
│ │ ! Check-in open              │ │
│ │ Tennis · Today 18:00–19:00   │ │
│ │ Closes 18:15 WIB             │ │
│ │ [        Check in now      ] │ │
│ └──────────────────────────────┘ │
│ Your next booking                │
│ ┌──────────────────────────────┐ │
│ │ Air Hockey · Table 2         │ │
│ │ Thu 15 Oct · 12:00–12:30 WIB │ │
│ │ Upcoming            Details >│ │
│ └──────────────────────────────┘ │
│ Book a facility                  │
│ [Tennis][Court][Table Tennis]    │
│ [Football][Air Hockey][Foosball] │
│ You have 1 of 2 bookings in use. │
├──────────────────────────────────┤
│  Home  Facilities  Bookings  Me  │
└──────────────────────────────────┘
```

Empty state: "No upcoming bookings. Pick a facility to get started."

### S8 Facilities (`/facilities`)

A list of cards with name, durations ("30 · 60 · 90 min" or "30 min"), "2 tables" for pooled facilities, and today's hint ("Available from 15:30 today" / "Fully booked today").

### S9–S11 Facility booking (`/facilities/:code`) — consolidated screen

```
┌──────────────────────────────────┐
│ ← Basketball / Futsal Court      │
│ Activity                         │
│ ( Basketball )  ( Futsal )       │
│ Date                             │
│ [Today 14][Thu 15][Fri 16][Sat 17]>
│ Time (WIB)       Show earlier v  │
│ ┌────────┬────────┬────────┐     │
│ │ 15:30  │ 16:00  │ 16:30  │     │
│ │Booked  │Availab.│Availab.│     │
│ ├────────┼────────┼────────┤     │
│ │ 17:00  │ 17:30  │ 18:00  │     │
│ │Availab.│ Unavail│Your bkg│     │
│ │        │ Mainten│        │     │
│ └────────┴────────┴────────┘     │
│ Duration                         │
│ ( 30 min ) ( 60 min ) (90 x)     │
├──────────────────────────────────┤
│ 16:00–17:00 WIB · 60 min         │
│ [          Review booking      ] │
└──────────────────────────────────┘
```

- The activity selector appears only for COURT. It is preselected when the user came from a specific activity.
- Pooled facilities show "2 left" / "1 left" / "Full" and no duration row.
- Selecting a slot selects the shortest duration that fits. The sticky bar shows the summary.
- Live updates: when a signal arrives, the grid refreshes. If the selected slot becomes unavailable, the selection is cleared with the toast "That time was just booked".

### S12 Review (bottom sheet)

```
┌──────────────────────────────────┐
│ Review your booking          x   │
│ Facility   Basketball / Futsal   │
│ Activity   Futsal                │
│ Date       Thu 15 Oct 2026       │
│ Time       16:00–17:00 WIB       │
│ Duration   60 min                │
│ i Check in 15:45–16:15 WIB.      │
│ i You can cancel until 15:30 WIB.│
│ [        Confirm booking       ] │
└──────────────────────────────────┘
```

If the start is less than 30 minutes away, a warning is shown instead: "This booking can't be cancelled because it starts in less than 30 minutes."

### S13 Booking confirmed (`/bookings/:id/confirmed`)

A success icon and "You're booked!", reference `DCU-261015-7K3Q`, the summary (with the allocated table for pooled facilities), "Check-in opens 15:45 WIB", and the buttons [View my bookings] [Book another].

### S14/S16 My bookings (`/bookings`, tabs Upcoming | History)

```
┌──────────────────────────────────┐
│ My bookings                      │
│ [ Upcoming ]  History            │
│ ┌──────────────────────────────┐ │
│ │ Tennis · Thu 15 Oct          │ │
│ │ 07:00–08:30 WIB · 90 min     │ │
│ │ Upcoming   [Cancel] Details >│ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │ Foosball · Table 1 · Today   │ │
│ │ 18:00–18:30 WIB              │ │
│ │ Check-in open [Check in now] │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

- The History tab shows Completed, Cancelled, Cancelled by DCU (with reason), and No-show.
- Empty states: "No upcoming bookings" with [Find a time]; "Your past bookings will appear here".

### S15 Booking detail (`/bookings/:id`)

- All fields, status badge, and a timeline (Booked 10:02 · Checked in 17:51).
- Action buttons depend on `can_cancel` / `can_check_in`.
- After the cutoff: "Cancellation closed at 15:30 WIB (30 minutes before start)."
- Cancel → ConfirmDialog "Cancel this booking? The time will be released for others." [Keep booking] [Cancel booking].

### S17 Profile (`/profile`)

- Shows name (editable), email (read-only), member since, and the role chip for admins.
- Links: Notifications, Change password, Privacy notice, How to book (help), Admin (admins only), Sign out.
- **Notifications:** a list newest first; unread items are bold. "Mark all as read".

---

## 7. Screen specifications — admin (desktop-first)

### S18 Dashboard (`/admin`)

```
┌────────────┬─────────────────────────────────────────────────────────────┐
│ DCU Active │ Dashboard                     [ Today v ] [14 Oct 2026 v]   │
│ Admin      ├─────────────────────────────────────────────────────────────┤
│ >Dashboard │ [Bookings 42] [Upcoming 18] [Checked in 9] [Cancelled 6]    │
│  Bookings  │ [No-show 2]   [Active users 315]                            │
│  Blocks    │ Utilization (used / available, excl. blocked time)          │
│  Users     │ Tennis      ███████████░░░░░░░░░  50%  (reserved 58%)       │
│  Settings  │ Court       ██████████████░░░░░░  71%  (reserved 75%)       │
│  Audit log │ Air Hockey  ████░░░░░░░░░░░░░░░░  22%  (reserved 25%)       │
│ ← Booking  │ Upcoming next 2 hours: table (time, facility, owner, status)│
│   app      │                                                             │
└────────────┴─────────────────────────────────────────────────────────────┘
```

Bars also carry a text percentage. A data-table alternative is offered for screen readers.

### S19 Booking management (`/admin/bookings`)

- **Filter bar:** date range, facility, activity, table/court, status (multi), search (ref, name, email).
- **Table:** Ref · Date · Time · Facility/Activity · Resource · Owner (name, email) · Status · Actions (View, Cancel).
- **Cancel:** dialog with a required reason → success toast; the row updates.

### S20 Facility blocks (`/admin/blocks`)

1. List of active and upcoming blocks, with a "Show removed" toggle. Columns: facility, resource (or "Whole facility"), start–end WIB, category, reason, created by.
2. **New block** form: facility, resource (optional), start date/time, end date/time (30-min steps), category, reason. Then [Check impact].
3. **Impact panel:** "This block overlaps 2 bookings. They will be cancelled and the owners notified." Table of the conflicts. A required checkbox "I understand these bookings will be cancelled". Then [Create block].
4. If conflicts changed: "Bookings changed while you were reviewing. The list has been refreshed." and the user re-confirms.
5. **Remove block:** dialog with a reason. The note says cancelled bookings are not restored.

### S21 Users (`/admin/users`, `/admin/users/:id`)

- **List:** search, status filter, role filter. Columns: name, email, domain, role, status, upcoming bookings, joined.
- **Detail:** profile, stats (bookings, no-shows, cancellations), recent bookings, and actions:
  - Deactivate/Activate (reason). The deactivate dialog lists the upcoming bookings that will be cancelled.
  - Make admin / Remove admin (reason). Disabled with an explanation for self or for a non-allowed domain.
  - Safeguard messages: "At least one active administrator is required." / "You can't change your own admin role or status."

### S27 Settings (`/admin/settings`) — tabs **Booking settings | Email domains**

```
Booking settings
┌──────────────────────────────────────────────────────────────────────┐
│ Check-in opens before start      [ 15 ] min   (0–60)                 │
│ Check-in closes after start      [ 15 ] min   (5–60)                 │
│ Cancellation allowed until       [ 30 ] min before start (0–240)     │
│ Booking horizon                  [  7 ] days ahead (0–30)            │
│ Max upcoming bookings per user   [  2 ]  (1–10)                      │
│ Max bookings per facility / day  [  1 ]  (1–5)                       │
│ Read-only: Operating hours 06:00–21:00 WIB · Slot 30 min · Asia/Jakarta│
│ Last changed 14 Oct 2026 09:12 WIB by A. Admin                       │
│                                         [ Save changes… ]            │
└──────────────────────────────────────────────────────────────────────┘
```

- Save opens a dialog that summarises the changes ("Cancellation cutoff: 30 → 60 min") and requires a reason. The note says changes apply immediately to new actions and existing bookings are not cancelled.

```
Email domains
┌──────────────────────────────────────────────────────────────────────┐
│ Only these domains can register. Existing users are not affected     │
│ when a domain is removed.                                            │
│ adira.co.id        Added 13 Oct 2026 (seed)       [Rename] [Remove]  │
│ danamon.co.id      Added 13 Oct 2026 (seed)       [Rename] [Remove]  │
│ homecredit.co.id   Added 13 Oct 2026 (seed)       [Rename] [Remove]  │
│ [ new-domain.co.id ]  [ Add domain… ]           o Show removed       │
└──────────────────────────────────────────────────────────────────────┘
```

- Add, rename, and remove each require a reason.
- Remove on the last domain is disabled with an explanation.
- Domain input is validated (lowercase, no "@", must contain a dot).

### S28 Audit log (`/admin/audit`)

A filterable table: time (WIB), actor, action, target, reason, and expandable before/after.

---

## 8. Global states

| ID | State | Behaviour |
|---|---|---|
| S22 | Offline | OfflineBanner. Action buttons are disabled with the tooltip "You're offline". Availability shows "Can't load times while offline" (never stale data). |
| S23 | Error | Route error boundary: "Something went wrong. Reference: 4F2A." [Try again] [Go home] |
| S24 | Empty | Per-screen EmptyState (see screens) |
| S25 | PWA update | UpdateToast |
| S26 | Not found | "This page doesn't exist." [Go home]. Also used for non-admins on `/admin/**`. |
| — | Loading | Skeletons for lists and grid (no spinners longer than 300 ms without a skeleton). Buttons show an inline spinner and disable during mutations. |
| — | iOS install hint | One-time card on iPhone Safari: "Add DCU Active to your Home Screen: tap Share → Add to Home Screen." |

---

## 9. Copy deck (error and status messages)

| Code / situation | Message |
|---|---|
| `SLOT_UNAVAILABLE` | Sorry — that time was just booked or is unavailable. Please choose another time. |
| `BOOKING_LIMIT_REACHED` | You already have {limit} upcoming bookings. Cancel one or wait until one has finished. |
| `FACILITY_DAILY_LIMIT_REACHED` | You already have a booking for this facility on that day. |
| `BOOKING_WINDOW_EXCEEDED` | You can book from today up to {horizon} days ahead. |
| `OUTSIDE_OPERATING_HOURS` | Bookings must be between 06:00 and 21:00 WIB. |
| `SLOT_IN_PAST` | That time has already started. Please choose a later time. |
| `INVALID_DURATION` | That duration isn't available for this facility. |
| `BOOKING_NOT_CANCELLABLE` | Bookings can be cancelled up to {cutoff} minutes before the start time. |
| `CHECKIN_TOO_EARLY` | Check-in opens at {time} WIB. |
| `CHECKIN_WINDOW_CLOSED` | The check-in window has closed. |
| `ACCOUNT_DISABLED` | Your account has been disabled. Please contact DCU. |
| `EMAIL_DOMAIN_NOT_ALLOWED` | Please register with your company email ({domain list}). |
| `RATE_LIMITED` | Too many attempts. Please wait a moment and try again. |
| `SYSTEM_BUSY` | The system is busy. Please try again. |
| `INTERNAL_ERROR` | Something went wrong. Reference: {id} |
| Booking success | You're booked! Check-in opens at {time} WIB. |
| Cancel success | Booking cancelled. The time is now free for others. |
| Check-in success | You're checked in. Enjoy your game! |
| Admin-cancelled notification | Your {facility} booking on {date} at {time} WIB was cancelled by DCU. Reason: {reason} |

---

## 10. Accessibility specification (WCAG 2.2 AA)

| Area | Requirement |
|---|---|
| Structure | One `<h1>` per page; landmarks (`header`, `nav`, `main`); skip link "Skip to content" |
| Forms | Visible labels; `autocomplete` (email, new-password, current-password, one-time-code); errors linked with `aria-describedby` and announced via a live region; never rely on placeholder text |
| Slot grid | Implemented as a list of buttons grouped by period ("Morning", "Afternoon", "Evening"); each has a full accessible name; selection uses `aria-pressed` |
| Dialogs and sheets | Radix Dialog: focus trap, Esc to close, focus returns to the trigger |
| Status changes | Toasts use `role="status"`; critical errors use `role="alert"` |
| Colour | Token contrasts in §3.1; state is never conveyed by colour alone |
| Motion | `prefers-reduced-motion` disables sheet and skeleton animations |
| Target size | ≥ 44 × 44 px primary; ≥ 24 × 24 px minimum (2.5.8) |
| Zoom | Usable at 200% text size and at 320 px width (reflow) |
| Time limits | No session timeout during a booking review; the check-in countdown is informational only |
| Testing | axe in CI; manual keyboard; TalkBack (Android Chrome) and VoiceOver (iOS Safari) on core journeys |

---

## 11. Responsive behaviour

| Element | < 768 px | 768–1023 px | ≥ 1024 px |
|---|---|---|---|
| Navigation | Bottom tab bar | Top bar | Top bar (user) / sidebar (admin) |
| Slot grid | 3 columns | 4 columns | 6 columns |
| Review | Bottom sheet | Modal | Modal |
| Facility list | 1 column cards | 2 columns | 3 columns |
| Admin tables | Cards | Table, horizontal scroll inside the container | Full table |
| Sticky action bar | Yes | Yes | No (inline button) |

---

## 12. Journey action counts (FR-UX-02)

Counted after selecting the facility.

| Journey | Actions | Count |
|---|---|---|
| Tennis 60 min | date → time → 60 min → Review → Confirm | 5 (4 if today and the default duration is kept) |
| Futsal 60 min | activity → date → time → 60 min → Review → Confirm | 6 (5 with today) |
| Air Hockey | date → time → Review → Confirm | 4 (3 with today) |

"Review" is a deliberate safety step. With today preselected, all journeys stay within the ≤ 6 limit.

---

## 13. Items for PO review

1. The palette is a neutral, accessible default. Provide DCU brand colours or a logo if available (they will be contrast-checked).
2. Support contact text for the Account disabled screen and help page (OD-10).
3. Privacy notice wording (OD-17, Legal).
