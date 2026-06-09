# RightTail — Project Management Tool

A full-stack project management app built on **Next.js 14 (App Router)** with
**Supabase** for the database and auth. Manages projects, tasks, teams,
milestones, comments, mentions, notifications, and an audit-grade activity
log.

The codebase is intentionally framework-light: JavaScript (`.jsx` /
`.js`), Tailwind v4, no client-side router, no separate API server. The
Next.js Route Handlers under `app/api/**` *are* the backend.

---

## Stack

| Layer              | Choice                                                      |
| ------------------ | ----------------------------------------------------------- |
| Framework          | Next.js 14 (App Router)                                     |
| Language           | JavaScript (JSX)                                            |
| Styling            | Tailwind CSS v4 (`@tailwindcss/postcss`)                    |
| Auth               | Supabase Auth (cookie-based via `@supabase/ssr`)            |
| Database           | Supabase Postgres (porsager/`postgres` driver)              |
| Icons              | `lucide-react`                                              |
| Email transport    | Pluggable mailer (console driver default)                   |

There are **no Express routes left**. Every endpoint is a Next.js Route
Handler. The pre-migration Express server, Vite bundler, and React
Router code have been removed.

---

## Quick start

Prerequisites: Node.js 20+, a Supabase project (or any Postgres + a JWT
provider that mimics Supabase Auth, if you really want to swap it out).

```bash
# 1. Install deps
npm install

# 2. Configure environment
cp .env.example .env
# Then fill in DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL,
# NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and (recommended)
# SUPABASE_SERVICE_ROLE_KEY.

# 3. Create the schema
npm run db:migrate

# 4. (Optional) load a demo dataset
npm run db:seed:demo

# 5. Start the dev server
npm run dev
# → http://localhost:3000
```

The first user to log in is auto-provisioned in our `users` table with
role `admin` (only if no admin exists yet; subsequent first-time
sign-ins become `member`).

---

## Environment variables

| Variable                                  | Required | Notes                                                                                                                          |
| ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                            | Yes      | Supabase **transaction pooler** (port 6543). Percent-encode reserved chars in the password.                                    |
| `NEXT_PUBLIC_SUPABASE_URL`                | Yes      | Browser-facing Supabase URL. Inlined by Next at build time.                                                                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`    | Yes      | Browser-facing publishable key. Safe to ship — has no privileged access.                                                       |
| `SUPABASE_SERVICE_ROLE_KEY`               | No*      | Server-only. Required for `/api/auth/signup` (admin createUser) and `scripts/seed-user.mjs` admin mode. Never expose to client. |
| `ACTIVE_USER_WINDOW_DAYS`                 | No       | Window for "active users" rollups (default 30).                                                                                |
| `UPCOMING_DEADLINE_DAYS`                  | No       | Horizon for the dashboard's "upcoming deadlines" card (default 14).                                                            |
| `MAIL_DRIVER`                             | No       | `console` (default), `off`, or a future `smtp`/`sendgrid`/`ses` driver.                                                        |

\* Strongly recommended — without it, signups go through the public
Supabase endpoint which is rate-limited.

---

## Scripts

| Command                  | What it does                                                                  |
| ------------------------ | ----------------------------------------------------------------------------- |
| `npm run dev`            | Start Next.js in dev mode (hot reload).                                       |
| `npm run build`          | Production build (`.next/`).                                                  |
| `npm run start`          | Serve a production build on port 3000.                                        |
| `npm run lint`           | Run `eslint-config-next`.                                                     |
| `npm run db:migrate`     | Idempotent schema migration (safe to re-run).                                 |
| `npm run db:clear`       | Truncate every domain table (schema preserved).                               |
| `npm run db:seed:demo`   | Insert a small demo dataset (users, projects, tasks, activity).               |
| `npm run seed:user`      | Provision one Supabase Auth user. Admin mode if `SUPABASE_SERVICE_ROLE_KEY` is set, otherwise public signup. |
| `npm run confirm:user`   | Force-confirm a Supabase Auth user via direct SQL (dev convenience).          |
| `npm run test:auth`      | Self-contained auth suite (server contract + JWT round-trip + middleware).    |
| `npm run test:regression`| HTTP regression suite (legacy — needs rework for the Next.js endpoints).      |
| `npm run test:uat`       | UAT scenarios (legacy — needs rework for the Next.js endpoints).              |

> The `test:regression` and `test:uat` suites were written against the
> Express server's password-based auth. They still run against the new
> API surface but the auth-related scenarios will fail until they're
> rewritten on top of Supabase Auth.

---

## Directory layout

```
app/
  (auth)/                  Public auth pages (login, signup, forgot, reset)
  (app)/                   Authenticated app shell (dashboard, projects, …)
  api/                     Route Handlers — the backend
  layout.jsx               Root layout: AuthProvider + global styles
  globals.css              Tailwind entry + theme tokens
  not-found.jsx            Custom 404
components/                React components by domain
  layout/                  Sidebar, AppLayout, AuthShell, SplashScreen
  auth/ activity/ …        Domain folders
lib/
  api/                     Browser-side fetch wrapper + endpoint map
  auth/                    requireUser, requireRole, resolveAppUser, AuthProvider
  hooks/                   useApi, usePagination
  services/                activityLog, notifications, comments, mailer, mentions
  supabase/                SSR clients: client / server / admin / middleware
  validators/              Per-domain input validation
  utils/                   ids, etc.
  shared/constants.js      Shared enums (roles, statuses, priorities)
  db.js                    Postgres pool (porsager/postgres)
  formatters.js            Date / time-ago helpers
middleware.js              Refreshes Supabase session cookies on every request
scripts/
  db/                      migrate / clear / seed (demo data)
  test-auth.mjs            Auth smoke suite
  seed-user.mjs            One-shot user provisioner
  confirm-user.mjs         Force-confirm a user via SQL
  regression.mjs           Legacy regression suite
  uat.mjs                  Legacy UAT scenarios
```

---

## Authentication flow

1. The browser logs in via `@supabase/supabase-js` (in `lib/auth/AuthProvider.jsx`).
2. `@supabase/ssr` persists the session in cookies that the Next.js
   middleware (`middleware.js`) refreshes on every request.
3. Route Handlers under `app/api/**` call `requireUser(request)` from
   `lib/auth/requireUser.js`, which:
   - Reads the session from the cookie (server-side).
   - Falls back to a `Bearer <jwt>` header (for scripts/tests).
   - Verifies the JWT via Supabase.
   - Looks up (or auto-provisions) the matching row in our `users`
     table via `resolveAppUser`.
   - Returns `{ user, supabaseUser }` or a 401/403 `Response` for the
     handler to return directly.
4. `requireRole("admin", "manager")` is the same flow plus an RBAC check.

The first row in `users` becomes `admin`. Every subsequent
auto-provision is `member`. Pre-existing rows are linked to the
Supabase auth user by email (case-insensitive) — no duplicates.

The deprecated password-based endpoints (`/api/auth/login`, `/api/auth/signup`,
`/api/auth/logout`, `/api/auth/forgot-password`, `/api/auth/reset-password`,
`/api/auth/change-password`) are still mounted but return **410 Gone**.
Clients drive those flows directly through Supabase.

---

## Database

Schema is owned by `scripts/db/migrate.mjs`. Every statement uses
`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`, so the runner doubles as
the first-time installer and as an in-place upgrade. The structured
audit fields on `activity` (`actor_id`, `action`, `entity_type`,
`entity_id`) and the partial-unique index on `task_assignments`
(`WHERE unassigned_at IS NULL`) are the two most opinionated bits —
both are required by the application code, so don't drop them.

Domain entities:

- `users` — application users (TEXT `USR-001` ids), linked to
  `auth.users` via `auth_user_id` (UUID).
- `projects` / `tasks` / `milestones` — work hierarchy. Tasks track
  current assignee and an append-only `task_assignments` audit log.
- `teams` / `team_members` — optional grouping; projects may belong to
  one team.
- `comments` / `comment_versions` / `comment_mentions` — threaded
  discussion on tasks or projects, with edit history and `@handle`
  mentions resolved server-side.
- `notifications` / `notification_preferences` — per-user in-app +
  email notifications. A partial-unique index dedupes the daily
  deadline reminder.
- `activity` — append-only audit log with structured filter fields.

---

## Deploying to Vercel

The project is a single Next.js 14 app — frontend pages, backend API
(Route Handlers under `app/api/**`), and middleware all ship in one
deployable unit. There is no separate server to host. Supabase
provides the managed Postgres database and auth.

### 1. Prepare Supabase

1. Create a Supabase project (Postgres + Auth are bundled).
2. Copy the **transaction pooler** connection string from
   *Project Settings → Database → Connection string → Transaction*
   (port `6543`). Percent-encode any reserved characters in the
   password (`#`, `$`, `!`, `@`, …).
3. From *Project Settings → API* grab:
   - The project URL (`https://<ref>.supabase.co`)
   - The publishable (anon) key
   - The service-role key (server-only; never expose to the browser)

### 2. Run the schema migration once

```bash
DATABASE_URL='<your prod pooler url>' npm run db:migrate
```

The migration is idempotent (`CREATE TABLE IF NOT EXISTS` everywhere),
so re-running it on later deploys is safe.

### 3. Import the repo on Vercel

Either click **Add New… → Project** in the dashboard, or run
`vercel link` + `vercel` from the project root. Vercel auto-detects
Next.js — no overrides needed. The framework, region, function memory,
function timeouts, and cron schedule are all declared in
[`vercel.json`](./vercel.json).

### 4. Configure environment variables

In **Project Settings → Environment Variables** add:

| Name                                   | Scope                                  | Notes                                                                       |
| -------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`                         | Production, Preview, Development       | Supabase transaction pooler URL (port 6543).                                |
| `NEXT_PUBLIC_SUPABASE_URL`             | Production, Preview, Development       | Supabase project URL. Inlined at build time.                                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production, Preview, Development       | Browser-safe anon/publishable key.                                          |
| `SUPABASE_SERVICE_ROLE_KEY`            | Production, Preview                    | Admin key. Never expose to client. Required by `/api/auth/signup`.          |
| `CRON_SECRET`                          | Production                             | Random string (e.g. `openssl rand -hex 32`). Authenticates the daily cron.  |
| `ACTIVE_USER_WINDOW_DAYS` (optional)   | as needed                              | Default 30.                                                                 |
| `UPCOMING_DEADLINE_DAYS` (optional)    | as needed                              | Default 14.                                                                 |
| `MAIL_DRIVER` (optional)               | as needed                              | `console` (default), `off`, or future driver.                               |

Re-deploy after adding env vars so they're picked up by the build.

### 5. Daily deadline reminders (Vercel Cron)

`vercel.json` already wires a daily cron that hits
`/api/notifications/run-deadline-reminders?days=3` at `08:00 UTC`. The
route accepts either a logged-in admin/manager session **or** an
`Authorization: Bearer ${CRON_SECRET}` header — Vercel Cron sends that
header automatically once `CRON_SECRET` is set on the project.

Crons run only on the Production deployment. The Hobby plan allows
one cron per project, which this configuration respects.

### Notes on the serverless runtime

- The Postgres pool in `lib/db.js` detects the `VERCEL` env var and
  shrinks to `max: 1, idle_timeout: 5s` — one connection per function
  instance, keeping you well under Supabase's pooler cap.
- `postgres` is listed in `experimental.serverComponentsExternalPackages`
  inside `next.config.mjs` so it's never pulled into the Edge bundle.
- Middleware (`middleware.js`) runs on the Edge runtime and only
  touches Supabase Auth cookies — no Postgres access there.
- All `app/api/**` route handlers are explicitly `dynamic = "force-dynamic"`
  so Vercel never tries to statically pre-render them.

---

## License

Proprietary — internal use only.
