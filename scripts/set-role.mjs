/* eslint-disable no-console */
// One-shot role helper. Two purposes:
//
//   1. `node scripts/set-role.mjs --list`
//        Prints every user in the `users` table with their role / status
//        so you can see exactly who's an admin/manager/member and why
//        Create buttons aren't showing for a given account.
//
//   2. `node scripts/set-role.mjs <email> <role>`
//        Updates a single user's role. Role must be one of:
//          admin   - full access (create/edit/delete everything)
//          manager - create/edit projects, tasks, teams, milestones
//          member  - read-only except own task status/hours
//
// Why this exists: the app auto-provisions the *first* logged-in user
// as `admin` and every subsequent one as `member`. If you signed up
// second, third, etc., your Create buttons are silently hidden — this
// script is the canonical way to fix that.
//
// Usage examples:
//   node scripts/set-role.mjs --list
//   node scripts/set-role.mjs you@example.com admin
//   node scripts/set-role.mjs teammate@example.com manager

import "dotenv/config";
import { sql } from "../lib/db.js";

const VALID_ROLES = new Set(["admin", "manager", "member"]);

function usage() {
  console.log("Usage:");
  console.log("  node scripts/set-role.mjs --list");
  console.log("  node scripts/set-role.mjs <email> <admin|manager|member>");
}

async function listUsers() {
  const rows = await sql`
    SELECT id, name, email, role, status, last_login_at
    FROM users
    ORDER BY
      CASE role WHEN 'admin' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
      lower(email)
  `;
  if (rows.length === 0) {
    console.log("(no users yet — sign up first, then re-run this script)");
    return;
  }
  const pad = (s, n) => String(s ?? "").padEnd(n);
  console.log(
    pad("ID", 10),
    pad("ROLE", 8),
    pad("STATUS", 9),
    pad("EMAIL", 36),
    "NAME"
  );
  console.log("-".repeat(90));
  for (const u of rows) {
    console.log(
      pad(u.id, 10),
      pad(u.role, 8),
      pad(u.status, 9),
      pad(u.email, 36),
      u.name
    );
  }
  console.log("");
  console.log(`Total: ${rows.length} user${rows.length === 1 ? "" : "s"}`);
}

async function setRole(email, role) {
  const normalised = email.trim().toLowerCase();
  const [user] = await sql`
    SELECT id, name, email, role FROM users WHERE email = ${normalised}
  `;
  if (!user) {
    console.error(`No user found with email "${normalised}".`);
    console.error("Run `node scripts/set-role.mjs --list` to see who exists.");
    process.exit(1);
  }
  if (user.role === role) {
    console.log(`${user.email} is already ${role}. Nothing to do.`);
    return;
  }
  await sql`
    UPDATE users SET role = ${role}, updated_at = NOW() WHERE id = ${user.id}
  `;
  console.log(
    `OK — ${user.email} (${user.name}) is now "${role}" (was "${user.role}").`
  );
  console.log("Sign out and back in (or hard-refresh) to pick up the new role.");
}

const [, , arg1, arg2] = process.argv;

try {
  if (!arg1) {
    usage();
    process.exit(1);
  }
  if (arg1 === "--list" || arg1 === "-l" || arg1 === "list") {
    await listUsers();
  } else {
    const email = arg1;
    const role = (arg2 || "").toLowerCase();
    if (!VALID_ROLES.has(role)) {
      console.error(`Invalid role "${arg2}". Must be one of: admin, manager, member.`);
      process.exit(1);
    }
    await setRole(email, role);
  }
} catch (err) {
  console.error("[set-role] Failed:", err.message);
  process.exit(1);
} finally {
  await sql.end({ timeout: 5 });
}
