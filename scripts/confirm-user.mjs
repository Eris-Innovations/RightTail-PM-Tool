/* eslint-disable no-console */
// Force-confirm a Supabase Auth user via direct SQL.
//
// Use this when "Confirm email" is enabled in the Supabase project but you
// want to log in as a freshly-created user without going through the email
// click-through (e.g. dev seed accounts, or in this case because the
// Supabase Site URL is misconfigured for the deployment).
//
// Connects with DATABASE_URL (the Supabase Postgres pooler) and sets
// auth.users.email_confirmed_at = now() for the given email. That single
// flag is what gates signInWithPassword; once it is set, the account is
// fully usable.
//
// Usage:
//   node scripts/confirm-user.mjs <email>

import "dotenv/config";
import postgres from "postgres";

const [, , email] = process.argv;
if (!email) {
  console.error("Usage: node scripts/confirm-user.mjs <email>");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("[confirm-user] DATABASE_URL not set in .env");
  process.exit(1);
}

const needsTls = !/sslmode=/.test(connectionString);
const sql = postgres(connectionString, {
  ssl: needsTls ? "require" : false,
  prepare: false,
  max: 1,
  idle_timeout: 5,
});

try {
  console.log(`[confirm-user] Looking up ${email} in auth.users ...`);
  const rows = await sql`
    SELECT id, email, email_confirmed_at, created_at
    FROM auth.users
    WHERE lower(email) = lower(${email})
  `;
  if (rows.length === 0) {
    console.error(
      `[confirm-user] No auth user found for ${email}. Run seed-user.mjs first.`
    );
    process.exit(1);
  }
  const u = rows[0];
  console.log(
    `[confirm-user] Found id=${u.id} created_at=${u.created_at.toISOString()} confirmed=${u.email_confirmed_at ? "yes" : "NO"}`
  );

  if (u.email_confirmed_at) {
    console.log("[confirm-user] Already confirmed - nothing to do.");
  } else {
    await sql`
      UPDATE auth.users
      SET email_confirmed_at = now(),
          confirmed_at       = COALESCE(confirmed_at, now())
      WHERE id = ${u.id}
    `;
    console.log(
      "[confirm-user] OK - email_confirmed_at set. The account can now log in."
    );
  }
} catch (err) {
  console.error("[confirm-user] Failed:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}