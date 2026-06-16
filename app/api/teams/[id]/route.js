// GET    /api/teams/:id — full detail bundle (overview + members + projects +
//                          workload + performance)
// PATCH  /api/teams/:id — admin/manager
// DELETE /api/teams/:id — admin

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { TEAM_LIST_COLUMNS, validateTeamPayload } from "../route";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const [team] = await sql`
      SELECT
        t.id, t.name, t.description, t.leader_id,
        l.name  AS leader_name,
        l.email AS leader_email,
        l.role  AS leader_role,
        t.created_at, t.updated_at
      FROM teams t
      LEFT JOIN users l ON l.id = t.leader_id
      WHERE t.id = ${id}
    `;
    if (!team) {
      return Response.json({ error: "Team not found." }, { status: 404 });
    }

    // ---- members (with per-member workload) ------------------------------
    const members = await sql`
      SELECT
        tm.user_id,
        u.name, u.email, u.role, u.status, u.department, u.avatar_url,
        tm.added_at,
        tm.added_by_id,
        ab.name AS added_by_name,
        (tm.user_id = ${team.leader_id}) AS is_leader,
        (SELECT COUNT(*)::int FROM tasks tk
          WHERE tk.assignee_id = tm.user_id AND tk.status <> 'Done') AS active_tasks,
        (SELECT COUNT(*)::int FROM tasks tk
          WHERE tk.assignee_id = tm.user_id AND tk.status = 'Done')  AS completed_tasks,
        (SELECT COUNT(*)::int FROM tasks tk
          WHERE tk.assignee_id = tm.user_id
            AND tk.status <> 'Done'
            AND tk.due_date IS NOT NULL
            AND tk.due_date < CURRENT_DATE)                          AS overdue_tasks
      FROM team_members tm
      JOIN users u ON u.id = tm.user_id
      LEFT JOIN users ab ON ab.id = tm.added_by_id
      WHERE tm.team_id = ${id}
      ORDER BY is_leader DESC, u.name
    `;

    // ---- projects --------------------------------------------------------
    const projects = await sql`
      SELECT
        p.id, p.name, p.status, p.priority,
        p.start_date::text AS start_date,
        p.end_date::text   AS end_date,
        p.owner_id,
        o.name AS owner_name,
        p.archived_at,
        (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id) AS total_tasks,
        (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Done') AS completed_tasks
      FROM projects p
      LEFT JOIN users o ON o.id = p.owner_id
      WHERE p.team_id = ${id}
      ORDER BY p.archived_at NULLS FIRST, p.name
    `;

    // ---- workload roll-up -----------------------------------------------
    const peak = members.reduce((m, x) => Math.max(m, x.active_tasks), 0);
    const workload = {
      peak_active_tasks: peak,
      members: members.map((m) => ({
        user_id: m.user_id,
        name: m.name,
        is_leader: m.is_leader,
        active_tasks: m.active_tasks,
        completed_tasks: m.completed_tasks,
        overdue_tasks: m.overdue_tasks,
      })),
    };

    // ---- performance metrics --------------------------------------------
    const [perf] = await sql`
      SELECT
        COUNT(*)::int                                          AS total_tasks,
        COUNT(*) FILTER (WHERE tk.status = 'Done')::int        AS completed_tasks,
        COUNT(*) FILTER (WHERE tk.status <> 'Done'
                           AND tk.due_date IS NOT NULL
                           AND tk.due_date < CURRENT_DATE)::int AS overdue_tasks,
        COUNT(*) FILTER (WHERE tk.status = 'Done'
                           AND tk.due_date IS NOT NULL
                           AND tk.completed_at IS NOT NULL
                           AND tk.completed_at::date <= tk.due_date)::int AS on_time_completions
      FROM tasks tk
      WHERE tk.assignee_id IN (
        SELECT tm.user_id FROM team_members tm WHERE tm.team_id = ${id}
      )
    `;
    const performance = {
      total_tasks: perf.total_tasks,
      completed_tasks: perf.completed_tasks,
      overdue_tasks: perf.overdue_tasks,
      on_time_completions: perf.on_time_completions,
      completion_rate:
        perf.total_tasks > 0
          ? Math.round((perf.completed_tasks / perf.total_tasks) * 100)
          : 0,
      on_time_rate:
        perf.completed_tasks > 0
          ? Math.round((perf.on_time_completions / perf.completed_tasks) * 100)
          : 0,
    };

    return Response.json({ team, members, projects, workload, performance });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("get team error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const [existing] = await sql`
      SELECT id, name, description, leader_id FROM teams WHERE id = ${id}
    `;
    if (!existing) {
      return Response.json({ error: "Team not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { errors, values } = validateTeamPayload(body ?? {}, { partial: true });
    if (errors.length) {
      return Response.json({ error: errors.join(" ") }, { status: 400 });
    }

    if (values.name && values.name.toLowerCase() !== existing.name.toLowerCase()) {
      const [dup] = await sql`
        SELECT id FROM teams WHERE LOWER(name) = LOWER(${values.name}) AND id <> ${id}
      `;
      if (dup) {
        return Response.json(
          { error: "A team with that name already exists." },
          { status: 409 }
        );
      }
    }
    if (values.leader_id !== undefined && values.leader_id !== null) {
      const [u] = await sql`SELECT id FROM users WHERE id = ${values.leader_id}`;
      if (!u) {
        return Response.json(
          { error: "Leader user does not exist." },
          { status: 400 }
        );
      }
    }

    const next = { ...existing, ...values };
    await sql`
      UPDATE teams SET
        name        = ${next.name},
        description = ${next.description ?? null},
        leader_id   = ${next.leader_id ?? null},
        updated_at  = NOW()
      WHERE id = ${id}
    `;
    if (values.leader_id) {
      await sql`
        INSERT INTO team_members (team_id, user_id, added_by_id)
        VALUES (${id}, ${values.leader_id}, ${auth.user.id})
        ON CONFLICT (team_id, user_id) DO NOTHING
      `;
    }

    if (values.leader_id !== undefined && values.leader_id !== existing.leader_id) {
      const [lead] = values.leader_id
        ? await sql`SELECT name FROM users WHERE id = ${values.leader_id}`
        : [{ name: null }];
      await logActivity({
        icon: "crown",
        tone: "primary",
        message: lead.name
          ? `${lead.name} is now leading "${next.name}"`
          : `Team "${next.name}" has no leader`,
        actor_id: auth.user.id,
        action: "leader_change",
        entity_type: ENTITY_TYPES.TEAM,
        entity_id: id,
      });
    } else {
      await logActivity({
        icon: "users",
        tone: "muted",
        message: `Team "${next.name}" was updated`,
        actor_id: auth.user.id,
        action: "update",
        entity_type: ENTITY_TYPES.TEAM,
        entity_id: id,
      });
    }

    const [team] = await sql.unsafe(
      `SELECT ${TEAM_LIST_COLUMNS} FROM teams t LEFT JOIN users l ON l.id = t.leader_id WHERE t.id = $1`,
      [id]
    );
    return Response.json({ team });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("update team error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const [existing] = await sql`SELECT id, name FROM teams WHERE id = ${id}`;
    if (!existing) {
      return Response.json({ error: "Team not found." }, { status: 404 });
    }
    // ON DELETE CASCADE clears team_members; projects.team_id resets to NULL.
    await sql`DELETE FROM teams WHERE id = ${id}`;
    await logActivity({
      icon: "trash-2",
      tone: "muted",
      message: `Team "${existing.name}" was deleted`,
      actor_id: auth.user.id,
      action: "delete",
      entity_type: ENTITY_TYPES.TEAM,
      entity_id: id,
    });
    return Response.json({ ok: true, id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("delete team error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
