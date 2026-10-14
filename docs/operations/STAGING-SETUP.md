# DCU Active — Staging Setup Guide

| Item | Value |
|---|---|
| Purpose | Create the staging environment (Supabase + Cloudflare Pages) for Phase 4 device, performance and UAT testing |
| Owner of the accounts | Product Owner (Supabase org `acwatdcjibghajhdxgph`, Cloudflare account `0f447146919e2ca8f83d3301ff33f2e2`) |
| Date | 2026-10-14 |

Steps marked **PO** must be done by the account owner: creating projects, passwords, signing in, and granting access. Steps marked **Dev** are done by the developer (Claude) after that.

---

## 0. Status (2026-10-14)

| Item | Status |
|---|---|
| Supabase project `dcu-active-staging` (ref `fuklxwviqczplonpreuh`, Singapore, Free) | Created by PO. **13 migrations applied**; Auth/API settings pushed |
| Hosting | Deployed: **https://dcu-active-staging.dcu-active.workers.dev** (Cloudflare static assets; Wrangler 4.150 hosts Pages-style sites on Workers) |
| Staging smoke tests (no accounts created) | 9/9 PASS: domain hook, weak password, tables not exposed, anon limits, health/cron |
| Supabase advisors | 0 ERROR; 23 WARN = intended SECURITY DEFINER RPCs (ADR-003); INFO only otherwise |
| Custom email templates | **Not possible on Free + built-in email.** Staging uses Supabase default templates (link only) until custom SMTP (OD-03). The built-in sender also only delivers to project team members. |
| First admin | Pending: PO creates the user in the dashboard (see 1.5) |

**Windows note:** PowerShell on this PC blocks `npx` scripts. Use `npx.cmd …` (no policy change needed).

## 1. Supabase staging project

### 1.1 Create the project (PO)

1. Open the Supabase dashboard → organisation → **New project**.
2. Name: `dcu-active-staging`. Region: **Southeast Asia (Singapore)**.
3. Database password: generate a strong one and store it in your password manager. **Do not send it to anyone.**
4. Plan: Free is acceptable for staging. Production must use a paid plan (OD-09).
5. When it is ready, open **Project Settings → API** and send the developer:
   - **Project URL** (`https://<ref>.supabase.co`), which is public;
   - **Publishable key** (`sb_publishable_…`), which is public by design;
   - **Project ref**, the `<ref>` part of the URL.
   - **Never** send the secret/service-role key or the database password.

### 1.2 Allow the developer's CLI to deploy (PO, once on this PC)

```bash
npx supabase login
```

A browser window opens; sign in with your Supabase account and approve. This stores an access token for this Windows user only.

### 1.3 Deploy the database (Dev)

```bash
npx supabase link --project-ref <ref>
npx supabase db push              # applies the 13 migrations (no seed data is sent)
```

### 1.4 Configure Auth for staging (Dev with PO review)

In **Authentication → Settings / Providers / URL configuration / Hooks / Email templates**:

| Setting | Value |
|---|---|
| Site URL | `https://dcu-active-staging.dcu-active.workers.dev` (or the custom staging domain) |
| Redirect URLs | `<site>/auth/confirm`, `<site>/reset-password` |
| Email provider | Enabled; **Confirm email ON**; other providers off |
| Password | Minimum 8; lower + upper + digits + symbols; leaked-password protection if available |
| Hook | **Before User Created** → Postgres function `private.hook_before_user_created` |
| Email templates | "Confirm signup" and "Reset password" from `supabase/templates/*.html` |
| SMTP | **Pending OD-03** (Danamon IT). Until then Supabase's built-in sender is used for staging only; it is heavily rate-limited and may only deliver to project members. |
| Data API → Exposed schemas | **`api` only** (remove `public`, `graphql_public`) |

### 1.5 First administrator (PO + Dev)

Because staging has no custom SMTP yet, the verification email may not arrive. Create the admin directly instead:

1. **PO:** Supabase dashboard → **Authentication → Users → Add user → Create new user**. Email `ronny.iswara@danamon.co.id`, a strong password of your choice, and tick **Auto Confirm User**.
2. **Dev:** promote that account with `scripts/provision-admin.sql` (audited).

### 1.6 Checks (Dev)

- Supabase **Security Advisor** and **Performance Advisor**: no errors.
- `select cron.schedule` jobs exist: `booking-status`, `purge-notifications`, `integrity-check`.
- `api.health()` returns `status_job_healthy: true` after a few minutes.

---

## 2. Cloudflare Pages (hosting)

### 2.1 Allow deployment from this PC (PO, once)

```bash
npx wrangler login
```

A browser window opens; sign in to Cloudflare and click **Allow**.

### 2.2 Create and deploy (Dev)

```bash
# environment for the staging build (public values only)
#   VITE_SUPABASE_URL=https://<ref>.supabase.co
#   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
#   VITE_APP_ENV=staging
npm run deploy:staging      # build (mode staging) → bundle scan → wrangler deploy (wrangler.jsonc)
```

The build writes `dist/_headers` (CSP, HSTS, security headers, cache rules) and `dist/_redirects` (SPA fallback), which Cloudflare Pages applies automatically.

### 2.3 Checks (Dev)

- `https://dcu-active-staging.dcu-active.workers.dev` loads over HTTPS. Response headers include the CSP and `Strict-Transport-Security`.
- Sign-up from an allowed domain works; a Gmail address is refused.
- The E2E suite can be pointed at staging for a smoke run.

---

## 3. What becomes possible once staging exists

| Phase 4 item | Needs |
|---|---|
| Real-device tests on Android Chrome and iPhone Safari (TEST-28, 29, 31) | Staging URL over HTTPS |
| Performance over a real mobile network (TRD §15) | Staging |
| Supabase Security Advisor on the hosted project | Staging |
| Real email delivery tests (SC-M4) | Staging + **OD-03** SMTP |
| UAT with ≥ 5 users and ≥ 2 admins | Staging (+ OD-03 for self-registration) |
