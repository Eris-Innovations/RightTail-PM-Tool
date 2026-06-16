// GET  /api/users — filterable list with role/status summaries.
// POST /api/users — admin creates a user-shell.
//
// Under Supabase Auth the user themselves finishes onboarding by
// signing up via the login page (or accepting an OAuth flow). We
// DON'T set a password here — Supabase owns credentials. The row gets
// linked to its auth.users counterpart on first sign-in via
// lib/auth/resolveAppUser.js.

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { generateUserId } from "@/lib/utils/ids";
import {
  USER_ROLES,
  USER_STATUSES,
  USER_PUBLIC_COLUMNS,
  validateUserPayload,
} from "@/lib/validators/users";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  try {
    const sp = new URL(request.url).searchParams;
    const filters = [];
    const params = [];
    let n = 0;
    const role = (sp.get("role") ?? "").trim();
    const status = (sp.get("status") ?? "").trim();
    const department = (sp.get("department") ?? "").trim();
    const q = (sp.get("q") ?? "").trim();
    if (role && USER_ROLES.includes(role)) {
      filters.push(`u.role = $${++n}`);
      params.push(role);
    }
    if (status && USER_STATUSES.includes(status)) {
      filters.push(`u.status = $${++n}`);
      params.push(status);
    }
    if (department) {
      filters.push(`u.department = $${++n}`);
      params.push(department);
    }
    if (q) {
      filters.push(
        `(u.name ILIKE $${++n} OR u.email ILIKE $${n} OR u.id ILIKE $${n} OR COALESCE(u.department, '') ILIKE $${n})`
      );
      params.push(`%${q}%`);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const text = `SELECT ${USER_PUBLIC_COLUMNS} FROM users u ${where} ORDER BY u.name`;
    const rows = await sql.unsafe(text, params);

    // Summary blocks are global (not filtered) so the chips always
    // show the workspace-wide split.
    const roleSummary = await sql`
      SELECT role, COUNT(*)::int AS count
      FROM users
      GROUP BY role
    `;
    const statusSummary = await sql`
      SELECT status, COUNT(*)::int AS count
      FROM users
      GROUP BY status
    `;
    const departments = await sql`
      SELECT DISTINCT department
      FROM users
      WHERE department IS NOT NULL AND department <> ''
      ORDER BY department
    `;
    return Response.json({
      items: rows,
      summary: roleSummary,
      statusSummary,
      departments: departments.map((d) => d.department),
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const { errors, values } = validateUserPayload(body ?? {});
    if (errors.length) {
      return Response.json({ error: errors.join(" ") }, { status: 400 });
    }

    const [existing] = await sql`SELECT id FROM users WHERE email = ${values.email}`;
    if (existing) {
      return Response.json(
        { error: "Email is already registered." },
        { status: 409 }
      );
    }

    const id = generateUserId();

    const [created] = await sql`
      INSERT INTO users (
        id, name, email, role, status, department, phone, avatar_url
      ) VALUES (
        ${id}, ${values.name}, ${values.email}, ${values.role}, ${values.status},
        ${values.department ?? null}, ${values.phone ?? null}, ${values.avatar_url ?? null}
      )
      RETURNING id
    `;

    const [user] = await sql.unsafe(
      `SELECT ${USER_PUBLIC_COLUMNS} FROM users u WHERE u.id = $1`,
      [created.id]
    );

    await logActivity({
      icon: "user-plus",
      tone: "primary",
      message: `${user.name} (${user.role}) added to the workspace`,
      actor_id: auth.user.id,
      action: "create",
      entity_type: ENTITY_TYPES.USER,
      entity_id: user.id,
    });

    return Response.json({ user }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("create user error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
