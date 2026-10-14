# DCU Active — Phase 3 Report (Frontend Web/PWA Development)

| Item | Value |
|---|---|
| Phase | Phase 3 — Frontend Web/PWA Development |
| Date | 2026-10-14 |
| Decision requested | Accept Phase 3 and authorise Phase 4 (Integration, Testing and Hardening) |

---

## A. Summary (plain English)

The DCU Active app that people will use is built. It runs in any phone or desktop browser and can be "installed" to the home screen. It covers everything in the design:

- registration with company email and a 6-digit code;
- booking in a few taps with live availability;
- My bookings, cancellation and check-in;
- notifications and profile;
- the full admin area: dashboard, bookings, facility blocks, users, settings and email domains, and the audit log.

The app was tried end to end in a real browser against the local backend, using the production build with its security headers:

- signed in as a test user;
- booked the Futsal court for 60 minutes;
- saw the review sheet with the check-in window and cancel deadline, and the confirmation;
- saw the live notification badge appear;
- cancelled the booking;
- signed in as a test admin and opened the dashboard and settings.

No errors or security-policy violations appeared in the browser console.

---

## B. What was built

| Area | Delivered |
|---|---|
| Public & auth (S1–S6) | Login, Register (shows allowed domains, warns on other domains), Verify (6-digit code, auto-submit, 60-second resend cooldown), scanner-safe email-link page, Forgot/Reset password (code or link), Account disabled, Privacy notice (draft) |
| User (S7–S17) | Home (check-in banner, next booking, facility tiles, usage count), Facilities with today's hint, one-screen booking (activity, 8-day date strip, grouped time grid, durations, live updates with a 30-second fallback), review sheet, confirmation, My bookings (Upcoming/History, load more), Booking detail with timeline, Profile (edit name), Notifications (mark all read), Change password, How to book |
| Admin (S18–S21, S27–S28) | Dashboard (counts, utilization bars with text, active bookings), Bookings (search, filters, detail with history, cancel with reason), Facility blocks (check impact → conflicts → confirm; remove with reason), Users (search/filter, detail, activate/deactivate, make/remove admin with safeguards), Settings (ranges, change summary + reason), Email domains (add/rename/remove), Audit log (filters, details) |
| Global (S22–S26) | Offline banner and disabled actions, route error page with reference, empty states, PWA update prompt (waits while a review is open), iPhone "Add to Home Screen" hint, Not found (also for non-admins on admin URLs) |
| PWA | Manifest, icons (64/192/512, maskable, Apple touch), service worker caching static files only, update prompt |
| Security | Strict CSP and security headers generated per environment (`dist/_headers`), SPA fallback (`dist/_redirects`), open-redirect protection, no raw HTML, bundle secret scan in CI |
| Design | Red/grey/white palette with measured contrast, system font, 44 px touch targets, visible focus, skip link, mobile bottom navigation, desktop admin sidebar |
| Quality gates | ESLint (incl. accessibility rules and `react/no-danger`), TypeScript strict, 38 unit/component tests (incl. axe accessibility checks), production build, bundle scan. All wired into CI. |

---

## C. Results

| Check | Result |
|---|---|
| ESLint (incl. jsx-a11y, react-hooks 7) | 0 errors, 0 warnings |
| TypeScript strict | 0 errors |
| Unit & component tests (Vitest, jsdom, device timezone set to New York) | **38 / 38 passed** |
| Automated accessibility (axe) on login, register, slot grid | 0 serious/critical violations |
| Production build | Main bundle **211 KB gzip** (mandatory ≤ 300 KB; proposed objective ≤ 200 KB); admin code in a separate 9 KB chunk |
| Bundle secret scan (TEST-35) | Passed. Self-test with planted fake keys correctly fails. |
| Manual browser run (production build + CSP, local backend) | Login, booking, review, confirmation, live notification badge, cancel, admin dashboard, settings — all worked; 0 console errors |
| Database / API / concurrency suites (Phase 2) | Unchanged and passing |

---

## D. Deviations from the design (for review)

| # | Design said | Implemented | Reason |
|---|---|---|---|
| DV-09 | Forms with `react-hook-form` + `zod` | Light, hand-written validation (same pattern on every form) | Cut the main bundle from 246 KB to 211 KB gzip. The server remains the authority. |
| DV-10 | ESLint 10 | ESLint 9.39.5 | `eslint-plugin-react` and `eslint-plugin-jsx-a11y` do not support ESLint 10 yet |
| DV-11 | CSP `style-src 'self'` | `style-src 'self' 'unsafe-inline'` | Radix's scroll lock injects a computed `<style>` element. **Scripts remain strictly `'self'`**, which is what protects against XSS. |
| DV-12 | — | Table/court choices in the block form are fixed (Air Hockey 1–2, Foosball 1–2) | Inventory changes are made by migration (assumption A-03). Revisit if tables are added. |
| DV-13 | Support contact (OD-10) | `DCU@danamon.co.id` shown as a placeholder (`VITE_SUPPORT_CONTACT`) | Change by configuration once OD-10 is decided |
| DV-14 | Privacy notice approved by Legal (OD-17) | Draft text, clearly marked "Draft" | Pending Legal |

---

## E. Known issues / remaining work (Phase 4)

| # | Item | Plan |
|---|---|---|
| K-01 | After **Sign out** from the Profile page, the login URL keeps `?next=/profile`. Harmless, since the user returns to Profile after signing in again. | Polish in Phase 4 |
| K-02 | End-to-end tests (Playwright) for all journeys, two-browser Realtime test, offline test | Phase 4 |
| K-03 | Real-device tests (Android Chrome, iPhone Safari), PWA install, VoiceOver/TalkBack | Phase 4 |
| K-04 | Performance measurement on a mobile network against staging | Phase 4 (needs the staging project) |
| K-05 | Real email delivery from `DCU@danamon.co.id` | Waiting for OD-03 (Danamon IT) |

---

## F. How to run it locally

```bash
npm run db:start          # local Supabase (Docker)
npm run dev               # app at http://localhost:5173
npm run build && npm run preview   # production build with security headers at http://localhost:4173
```

Local test accounts are listed in `supabase/seed.sql`.

---

## G. Actions needed from the Product Owner

1. **Approve Phase 3** and authorise Phase 4 (integration, testing, hardening, UAT preparation).
2. **Staging (needed for Phase 4):** create a Supabase project in your account (region Southeast Asia/Singapore) and a hosting account (recommended: Cloudflare Pages), then share access.
3. **Email (OD-03):** the Danamon IT outcome for sending as `DCU@danamon.co.id`.
4. **Push to GitHub:** run `git push -u origin main` once in the project folder (the commits are ready).
5. **Optional:** a DCU logo file to replace the generated icon. A support contact (OD-10).
