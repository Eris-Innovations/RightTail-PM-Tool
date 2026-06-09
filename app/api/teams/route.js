// GET  /api/teams — filterable list with roll-up counts.
// POST /api/teams — create (admin/manager).
//
// `teams` is the org-chart layer over users. A team has one optional
// leader and many members; projects can optionally belong to one team.
// The leader is also automatically a member (we keep both in sync so
// membership queries don't need a UNION).

import { sql } from "@/lib/db";
import { requireUser, requireRole } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { generateTeamId } from "@/lib/utils/ids";

export const dynamic = "force-dynamic";

// Single source of truth for the team list-row shape. Counts come from
// scalar subqueries so the response is one round-trip regardless of
// how many teams exist.
export const TEAM_LIST_COLUMNS = `
  t.id,
  t.name,
  t.description,
  t.leader_id,
  l.name  AS leader_name,
  l.email AS leader_email,
  t.created_at,
  t.updated_at,
  (SELECT COUNT(*)::int FROM team_members tm WHERE tm.team_id = t.id)                       AS member_count,
  (SELECT COUNT(*)::int FROM projects p WHERE p.team_id = t.id AND p.archived_at IS NULL)   AS active_project_count,
  (
    SELECT COUNT(*)::int
    FROM tasks tk
    JOIN team_members tm ON tm.user_id = tk.assignee_id
    WHERE tm.team_id = t.id AND tk.status <> 'Done'
  ) AS active_task_count
`;

export function validateTeamPayload(body, { partial = false } = {}) {
  const errors = [];
  const values = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (name.length < 2) errors.push("Team name must be at least 2 characters.");
    else if (name.length > 80) errors.push("Team name must be 80 characters or fewer.");
    else values.name = name;
  }
  if (body.description !== undefined) {
    const desc = body.description === null ? null : String(body.description).trim();
    if (desc && desc.length > 1000) {
      errors.push("Description must be 1000 characters or fewer.");
    } else {
      values.description = desc || null;
    }
  }
  if (body.leader_id !== undefined) {
    values.leader_id = body.leader_id === null ? null : String(body.leader_id);
  }
  return { errors, values };
}

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  try {
    const sp = new URL(request.url).searchParams;
    const filters = [];
    const params = [];
    let n = 0;
    const q = (sp.get("q") ?? "").trim();
    const leaderId = (sp.get("leader_id") ?? "").trim();
    const memberId = (sp.get("member_id") ?? "").trim();
    if (q) {
      filters.push(`(t.name ILIKE $${++n} OR t.id ILIKE $${n})`);
      params.push(`%${q}%`);
    }
    if (leaderId) {
      filters.push(`t.leader_id = $${++n}`);
      params.push(leaderId);
    }
    if (memberId) {
      filters.push(
        `EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id = t.id AND tm.user_id = $${++n})`
      );
      params.push(memberId);
    }
    const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const text = `
      SELECT ${TEAM_LIST_COLUMNS}
      FROM teams t
      LEFT JOIN users l ON l.id = t.leader_id
      ${where}
      ORDER BY t.name
    `;
    const items = await sql.unsafe(text, params);
    return Response.json({ items });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("list teams error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireRole(request, "admin", "manager");
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const { errors, values } = validateTeamPayload(body ?? {});
    if (errors.length) {
      return Response.json({ error: errors.join(" ") }, { status: 400 });
    }

    if (values.leader_id) {
      const [u] = await sql`SELECT id FROM users WHERE id = ${values.leader_id}`;
      if (!u) {
        return Response.json(
          { error: "Leader user does not exist." },
          { status: 400 }
        );
      }
    }

    // Name uniqueness (case-insensitive) — better UX than a raw DB error.
    const [dup] = await sql`
      SELECT id FROM teams WHERE LOWER(name) = LOWER(${values.name})
    `;
    if (dup) {
      return Response.json(
        { error: "A team with that name already exists." },
        { status: 409 }
      );
    }

    const id = await generateTeamId();
    await sql`
      INSERT INTO teams (id, name, description, leader_id)
      VALUES (${id}, ${values.name}, ${values.description ?? null}, ${values.leader_id ?? null})
    `;
    // Mirror the leader into team_members so the roster is consistent.
    if (values.leader_id) {
      await sql`
        INSERT INTO team_members (team_id, user_id, added_by_id)
        VALUES (${id}, ${values.leader_id}, ${auth.user.id})
        ON CONFLICT (team_id, user_id) DO NOTHING
      `;
    }
    const [team] = await sql.unsafe(
      `SELECT ${TEAM_LIST_COLUMNS} FROM teams t LEFT JOIN users l ON l.id = t.leader_id WHERE t.id = $1`,
      [id]
    );
    await logActivity({
      icon: "users",
      tone: "primary",
      message: `Team "${team.name}" created`,
      actor_id: auth.user.id,
      action: "create",
      entity_type: ENTITY_TYPES.TEAM,
      entity_id: team.id,
    });
    return Response.json({ team }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("create team error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
