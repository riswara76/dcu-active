# DCU Active

Booking platform for DCU sports and recreational facilities: a responsive web app/PWA on Supabase.

| Phase | Status |
|---|---|
| 0 Requirements | Approved (`docs/requirements/`) |
| 1 Architecture & UX | Approved (`docs/architecture/`, `docs/design/`, `docs/testing/TEST-PLAN.md`) |
| 2 Backend & database | Built and tested locally (`docs/PHASE-2-REPORT.md`) |
| 3 Frontend web/PWA | Built and tested locally (`docs/PHASE-3-REPORT.md`) |
| 4 Integration, testing & hardening | Not started |

## Repository layout

```
supabase/
  config.toml          local Supabase configuration (Auth policy, exposed schema "api", domain hook)
  migrations/          13 versioned SQL migrations (schemas, tables, RLS, RPCs, Realtime, hook, cron)
  tests/               pgTAP database tests (*.test.sql) + shared helpers (_helpers.psql)
  templates/           verification and password-reset email templates
  seed.sql             LOCAL test accounts only
src/                   React + TypeScript SPA (app/, features/, components/, lib/)
public/                icons, favicon
scripts/provision-admin.sql   promote the first administrator (staging/production)
tests/integration/     API and concurrency tests (Vitest + supabase-js + pg)
docs/                  requirements, architecture, design, test plan and results
```

## Local development

Requirements: Node.js ≥ 22.22 (24 LTS recommended), Docker Desktop running.

```bash
npm ci
npm run db:start          # starts the local Supabase stack, applies migrations and the local seed
npm run db:test           # pgTAP database tests
npm run test:integration  # API + concurrency tests against the local stack
npm run db:lint           # plpgsql_check lint
npm run db:reset          # rebuild the local database from migrations + seed
cp .env.example .env.local   # then set VITE_SUPABASE_PUBLISHABLE_KEY from `npx supabase status`
npm run dev               # app at http://localhost:5173
npm test                  # frontend unit/component tests
npm run lint && npm run typecheck
npm run build && npm run preview   # production build with security headers (http://localhost:4173)
```

- **Local services:** Studio at http://127.0.0.1:54323 and the mail catcher (verification codes) at http://127.0.0.1:54324.
- **Local test accounts** are listed in `supabase/seed.sql`. They exist only in the local database.

## Rules for contributors

- Business rules live in the database (`supabase/migrations`). The browser is never trusted.
- Tables are in schema `app` and are not exposed. Clients call only functions in schema `api`.
- Every migration that creates functions must end with explicit `revoke execute … from public, anon` plus the intended grants. `supabase/tests/001_schema_security.test.sql` fails otherwise.
- Never commit secrets. `.env*` files are git-ignored. Only the publishable key may reach the frontend.
