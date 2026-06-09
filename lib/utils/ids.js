import crypto from "node:crypto";
import { sql } from "@/lib/db";

// Random 12-char id used for *brand new* user accounts (signup, admin-
// create). Seed users keep their hand-picked USR-NNN ids.
export function generateUserId() {
  return (
    "USR-" +
    Buffer.from(crypto.getRandomValues(new Uint8Array(8)))
      .toString("base64")
      .replace(/\+/g, "0")
      .replace(/\//g, "1")
      .replace(/=+$/, "")
  );
}

// Generic monotonic id picker for resources that use the `<PREFIX>-NNN`
// convention. Scans the underlying table for the highest existing match
// and returns the next id, zero-padded. Keeps seeded and user-created
// ids in a single namespace so the UI shows them in obvious chronological
// order.
//
// The query is duplicated per-table rather than using a dynamic
// identifier because porsager/postgres only safely templates *values*,
// not table names. A literal-per-table query is the trade-off.
const pad = (n, w = 3) => String(n).padStart(w, "0");

export async function generateProjectId() {
  const [{ next }] = await sql`
    SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(id, '\D', '', 'g'), '')::int), 0) + 1 AS next
    FROM projects WHERE id ~ '^PRJ-[0-9]+$'
  `;
  return `PRJ-${pad(next)}`;
}

export async function generateTaskId() {
  const [{ next }] = await sql`
    SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(id, '\D', '', 'g'), '')::int), 0) + 1 AS next
    FROM tasks WHERE id ~ '^ASN-[0-9]+$'
  `;
  return `ASN-${pad(next)}`;
}

export async function generateMilestoneId() {
  const [{ next }] = await sql`
    SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(id, '\D', '', 'g'), '')::int), 0) + 1 AS next
    FROM milestones WHERE id ~ '^MIL-[0-9]+$'
  `;
  return `MIL-${pad(next)}`;
}

export async function generateTeamId() {
  const [{ next }] = await sql`
    SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(id, '\D', '', 'g'), '')::int), 0) + 1 AS next
    FROM teams WHERE id ~ '^TEAM-[0-9]+$'
  `;
  return `TEAM-${pad(next)}`;
}
