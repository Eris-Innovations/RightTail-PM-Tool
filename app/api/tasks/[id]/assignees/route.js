// POST /api/tasks/:id/assignees — add a co-assignee.
//
// The lead is managed via PATCH /api/tasks/:id (assignee_id); this
// endpoint is for additional people without disturbing the lead pointer.

import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { notify, NOTIFICATION_TYPES } from "@/lib/services/notifications";
import { getActiveAssignment, openAssignment } from "@/lib/validators/tasks";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await requireRole(request, "admin", "manager");
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.user_id ?? "").trim();
    if (!userId) {
      return Response.json({ error: "user_id is required." }, { status: 400 });
    }

    const [task] = await sql`
      SELECT t.id, t.title, t.assignee_id,
             p.name AS project_name, p.archived_at AS project_archived_at
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.id = ${id}
    `;
    if (!task) {
      return Response.json({ error: "Task not found." }, { status: 404 });
    }
    if (task.project_archived_at) {
      return Response.json(
        { error: "Cannot manage assignees on a task in an archived project." },
        { status: 409 }
      );
    }
    const [user] = await sql`SELECT id, name FROM users WHERE id = ${userId}`;
    if (!user) {
      return Response.json(
        { error: "Selected user does not exist." },
        { status: 400 }
      );
    }

    const active = await getActiveAssignment(id, userId);
    if (active) {
      return Response.json(
        { error: `${user.name} is already assigned to this task.` },
        { status: 409 }
      );
    }

    await openAssignment(id, userId, auth.user.id);

    await logActivity({
      icon: "user-plus",
      tone: "primary",
      message: `${user.name} added as co-assignee on task "${task.title}"`,
      actor_id: auth.user.id,
      action: "assign",
      entity_type: ENTITY_TYPES.TASK,
      entity_id: id,
    });
    await notify({
      userIds: [userId],
      type: NOTIFICATION_TYPES.TASK_ASSIGNED,
      title: `You were assigned to "${task.title}"`,
      body: `Project: ${task.project_name ?? ""} · Added as co-assignee`,
      link: `/tasks?id=${id}`,
      entity_type: ENTITY_TYPES.TASK,
      entity_id: id,
      actor_id: auth.user.id,
    });

    // Return the freshly-rebuilt active assignee list so the UI can
    // update without a follow-up GET.
    const assignees = await sql`
      SELECT
        ta.id AS assignment_id, ta.user_id,
        u.name AS user_name, u.email AS user_email, u.role AS user_role,
        ta.assigned_at, ta.assigned_by_id,
        ab.name AS assigned_by_name,
        (ta.user_id = ${task.assignee_id}) AS is_lead
      FROM task_assignments ta
      JOIN users u ON u.id = ta.user_id
      LEFT JOIN users ab ON ab.id = ta.assigned_by_id
      WHERE ta.task_id = ${id} AND ta.unassigned_at IS NULL
      ORDER BY (ta.user_id = ${task.assignee_id}) DESC, ta.assigned_at
    `;
    return Response.json({ assignees }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("add assignee error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
