// GET    /api/projects/:id  — detail (project + tasks + team + milestones + activity)
// PATCH  /api/projects/:id  — partial update (admin/manager)
// DELETE /api/projects/:id  — hard delete (admin)

import { sql } from "@/lib/db";
import { requireUser, requireRole } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { notify, NOTIFICATION_TYPES } from "@/lib/services/notifications";
import { validateProjectInput } from "@/lib/validators/projects";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const [project] = await sql`
      SELECT
        p.id,
        p.name,
        p.description,
        p.status,
        p.priority,
        p.category,
        p.tags,
        p.start_date::text AS start_date,
        p.end_date::text   AS end_date,
        p.owner_id,
        p.team_id,
        p.archived_at,
        p.created_at,
        p.updated_at,
        u.name AS owner_name,
        u.email AS owner_email,
        tm.name AS team_name
      FROM projects p
      LEFT JOIN users u  ON u.id = p.owner_id
      LEFT JOIN teams tm ON tm.id = p.team_id
      WHERE p.id = ${id}
    `;
    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    const tasks = await sql`
      SELECT
        t.id,
        t.title,
        t.status,
        t.priority,
        t.due_date::text AS due_date,
        t.created_at,
        t.assignee_id,
        assignee.name AS assignee_name
      FROM tasks t
      LEFT JOIN users assignee ON assignee.id = t.assignee_id
      WHERE t.project_id = ${id}
      ORDER BY
        CASE t.status
          WHEN 'In Progress' THEN 1
          WHEN 'To Do'       THEN 2
          WHEN 'Done'        THEN 3
          ELSE 4
        END,
        t.due_date NULLS LAST,
        t.id
    `;
    const [{ total, done, overdue }] = await sql`
      SELECT
        COUNT(*)::int                                           AS total,
        COUNT(*) FILTER (WHERE status = 'Done')::int            AS done,
        COUNT(*) FILTER (
          WHERE status <> 'Done'
            AND due_date IS NOT NULL
            AND due_date < CURRENT_DATE
        )::int                                                  AS overdue
      FROM tasks
      WHERE project_id = ${id}
    `;
    const completion = total > 0 ? Math.round((done / total) * 100) : 0;

    // Team members = owner ∪ everyone with at least one assigned task
    // in this project. Per-row counts let the UI render a compact
    // workload card without an extra round-trip.
    const teamMembers = await sql`
      SELECT
        u.id, u.name, u.email, u.role,
        (u.id = ${project.owner_id})                                   AS is_owner,
        COUNT(t.id)::int                                                AS assigned_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'Done')::int               AS done_tasks,
        COUNT(t.id) FILTER (
          WHERE t.status <> 'Done'
            AND t.due_date IS NOT NULL
            AND t.due_date < CURRENT_DATE
        )::int                                                          AS overdue_tasks
      FROM users u
      LEFT JOIN tasks t ON t.project_id = ${id} AND t.assignee_id = u.id
      WHERE u.id = ${project.owner_id}
         OR EXISTS (
           SELECT 1 FROM tasks tt
           WHERE tt.project_id = ${id} AND tt.assignee_id = u.id
         )
      GROUP BY u.id, u.name, u.email, u.role
      ORDER BY is_owner DESC, assigned_tasks DESC, u.name
    `;

    const milestones = await sql`
      SELECT
        id, title, description,
        due_date::text AS due_date,
        status, completed_at, created_at, updated_at
      FROM milestones
      WHERE project_id = ${id}
      ORDER BY
        CASE status WHEN 'Completed' THEN 1 ELSE 0 END,
        due_date NULLS LAST,
        created_at
    `;
    const [{ ms_total, ms_done, ms_overdue }] = await sql`
      SELECT
        COUNT(*)::int                                                AS ms_total,
        COUNT(*) FILTER (WHERE status = 'Completed')::int            AS ms_done,
        COUNT(*) FILTER (
          WHERE status <> 'Completed'
            AND due_date IS NOT NULL
            AND due_date < CURRENT_DATE
        )::int                                                       AS ms_overdue
      FROM milestones
      WHERE project_id = ${id}
    `;
    const milestonePct =
      ms_total > 0 ? Math.round((ms_done / ms_total) * 100) : 0;

    const activity = await sql`
      SELECT id, icon, tone, message, created_at
      FROM activity
      WHERE message ILIKE ${"%\"" + project.name + "\"%"}
      ORDER BY created_at DESC
      LIMIT 20
    `;
    return Response.json({
      project,
      tasks,
      stats: {
        total,
        done,
        overdue,
        open: total - done,
        completionPct: completion,
      },
      teamMembers,
      milestones,
      milestoneStats: {
        total: ms_total,
        completed: ms_done,
        pending: ms_total - ms_done,
        overdue: ms_overdue,
        completionPct: milestonePct,
      },
      activity,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("get project error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const auth = await requireRole(request, "admin", "manager");
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const [existing] = await sql`SELECT * FROM projects WHERE id = ${id}`;
    if (!existing) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    if (existing.archived_at) {
      return Response.json(
        { error: "Cannot edit an archived project. Restore it first." },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { errors, values } = validateProjectInput(body ?? {}, "update");
    if (errors.length) {
      return Response.json(
        { error: errors[0], errors },
        { status: 400 }
      );
    }

    // If start/end weren't both supplied but one was, validate against
    // the other from the existing row so partial updates don't bypass
    // the check.
    const proposedStart =
      values.start_date !== undefined ? values.start_date : existing.start_date;
    const proposedEnd =
      values.end_date !== undefined ? values.end_date : existing.end_date;
    if (
      proposedStart &&
      proposedEnd &&
      new Date(proposedStart) > new Date(proposedEnd)
    ) {
      return Response.json(
        { error: "End date cannot be before start date." },
        { status: 400 }
      );
    }

    if (values.owner_id !== undefined) {
      const [owner] =
        await sql`SELECT id FROM users WHERE id = ${values.owner_id}`;
      if (!owner) {
        return Response.json(
          { error: "Selected project owner does not exist." },
          { status: 400 }
        );
      }
    }
    if (values.team_id !== undefined && values.team_id !== null) {
      const [team] =
        await sql`SELECT id FROM teams WHERE id = ${values.team_id}`;
      if (!team) {
        return Response.json(
          { error: "Selected team does not exist." },
          { status: 400 }
        );
      }
    }

    // Diff before mutating so the audit message is meaningful.
    const FIELDS = [
      "name", "description", "status", "priority",
      "category", "tags", "start_date", "end_date", "owner_id", "team_id",
    ];
    const changed = [];
    for (const f of FIELDS) {
      if (values[f] === undefined) continue;
      const before = existing[f];
      const after = values[f];
      const beforeS = Array.isArray(before) ? before.join(",") : String(before ?? "");
      const afterS = Array.isArray(after) ? after.join(",") : String(after ?? "");
      if (beforeS !== afterS) changed.push(f);
    }
    if (changed.length === 0) {
      // No-op update — return the existing row, don't pollute activity.
      return Response.json({ project: existing, changed: [] });
    }

    const next = { ...existing, ...values };

    const [updated] = await sql`
      UPDATE projects SET
        name        = ${next.name},
        description = ${next.description ?? null},
        status      = ${next.status},
        priority    = ${next.priority},
        category    = ${next.category ?? null},
        tags        = ${next.tags ?? []},
        start_date  = ${next.start_date ?? null},
        end_date    = ${next.end_date ?? null},
        owner_id    = ${next.owner_id ?? null},
        team_id     = ${next.team_id ?? null},
        updated_at  = NOW()
      WHERE id = ${id}
      RETURNING id, name, description, status, priority, category, tags,
                start_date::text AS start_date,
                end_date::text   AS end_date,
                owner_id, team_id, archived_at, created_at, updated_at
    `;

    await logActivity({
      icon: "pencil",
      tone: "warning",
      message: `Project "${updated.name}" updated (${changed.join(", ")})`,
      actor_id: auth.user.id,
      action: "update",
      entity_type: ENTITY_TYPES.PROJECT,
      entity_id: id,
    });

    // Project-update notifications go to owner + team + active task
    // assignees.
    const recipientRows = await sql`
      SELECT DISTINCT user_id FROM (
        SELECT ${updated.owner_id ?? null}::text AS user_id
        UNION
        SELECT tm.user_id
          FROM team_members tm
          WHERE tm.team_id = ${updated.team_id ?? null}
        UNION
        SELECT ta.user_id
          FROM task_assignments ta
          JOIN tasks t ON t.id = ta.task_id
          WHERE t.project_id = ${id} AND ta.unassigned_at IS NULL
      ) s
      WHERE s.user_id IS NOT NULL
    `;
    await notify({
      userIds: recipientRows.map((r) => r.user_id),
      type: NOTIFICATION_TYPES.PROJECT_UPDATED,
      title: `Project "${updated.name}" was updated`,
      body: `Fields changed: ${changed.join(", ")}`,
      link: `/projects?id=${id}`,
      entity_type: ENTITY_TYPES.PROJECT,
      entity_id: id,
      actor_id: auth.user.id,
    });

    return Response.json({ project: updated, changed });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("update project error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireRole(request, "admin");
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const [existing] =
      await sql`SELECT id, name FROM projects WHERE id = ${id}`;
    if (!existing) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }

    await sql`DELETE FROM projects WHERE id = ${id}`;

    await logActivity({
      icon: "folder-x",
      tone: "muted",
      message: `Project "${existing.name}" was deleted`,
      actor_id: auth.user.id,
      action: "delete",
      entity_type: ENTITY_TYPES.PROJECT,
      entity_id: id,
    });

    return Response.json({ ok: true, id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("delete project error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
