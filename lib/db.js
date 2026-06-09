// Postgres client (shared between Next.js route handlers and standalone
// /scripts). Uses porsager/postgres because it ships the same
// `sql`...`` tagged-template API the rest of the codebase already
// speaks, and works against any Postgres-compatible host — Supabase,
// Neon, RDS, local docker, you name it.
//
// Pool sizing is environment-aware:
//   - Local / long-lived Node server   max=10, idle_timeout=20s
//   - Vercel serverless function       max=1,  idle_timeout=5s
//     Each function instance handles one concurrent request at a
//     time, so a pool larger than 1 just wastes pooler slots. Short
//     idle timeouts keep us under Supabase's transaction-pooler
//     connection cap when traffic is bursty.
//
// `server-only` is intentionally NOT imported here so /scripts can
// reuse this exact module. The directive isn't needed because /lib/db.js
// is only ever imported from server-side modules (route handlers,
// services, scripts) — it's never reachable from a client component.

import "dotenv/config";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // Throw instead of process.exit so a single bad request doesn't take
  // down the whole Vercel function worker — Next will surface this as
  // a 500 with the message in the logs, and the build step gets a
  // clear failure if the project's env vars aren't configured.
  throw new Error(
    "DATABASE_URL is not set. Add it to .env locally or to the Vercel project's Environment Variables."
  );
}

// Supabase pooler hostnames look like `aws-0-<region>.pooler.supabase.com`
// and require SSL. Neon URLs already encode `sslmode=require`. We default
// to `require` so both work transparently.
const needsTls =
  /supabase\.(com|co)|neon\.tech/i.test(connectionString) ||
  /sslmode=require/i.test(connectionString);

// `VERCEL` is auto-set to "1" by Vercel inside a function invocation.
// `AWS_LAMBDA_FUNCTION_NAME` covers other serverless runtimes if we
// ever deploy there. Either way: shrink the pool.
const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
);

export const sql = postgres(connectionString, {
  ssl: needsTls ? "require" : false,
  // The Supabase transaction pooler (port 6543) disallows prepared
  // statements — disable them by default so the same code works
  // against direct connections AND the pooler.
  prepare: false,
  max: isServerless ? 1 : 10,
  idle_timeout: isServerless ? 5 : 20,
  // Fail fast if the DB is unreachable — better than a hung request.
  connect_timeout: 10,
});
