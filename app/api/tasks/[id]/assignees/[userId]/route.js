// DELETE /api/tasks/:id/assignees/:userId
//
// Any signed-in user may remove an assignment. Removing the lead also
// clears tasks.assignee_id to preserve the invariant.

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { getActiveAssignment, closeAssignment } from "@/lib/validators/tasks";

export const dynamic = "force-dynamic";

export async function DELETE(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam, userId: userIdParam } = await params;
  const id = String(idParam);
  const userId = String(userIdParam);

  try {
    const [task] = await sql`
      SELECT t.id, t.title, t.assignee_id,
             p.archived_at AS project_archived_at
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

    const active = await getActiveAssignment(id, userId);
    if (!active) {
      return Response.json(
        { error: "That user is not currently assigned to this task." },
        { status: 404 }
      );
    }

    await closeAssignment(id, userId, auth.user.id);

    // If we just removed the lead, clear the pointer too so the
    // invariant (lead ⇒ open audit row) is maintained.
    if (task.assignee_id === userId) {
      await sql`UPDATE tasks SET assignee_id = NULL, updated_at = NOW() WHERE id = ${id}`;
    }

    const [user] = await sql`SELECT name FROM users WHERE id = ${userId}`;
    const userName = user?.name ?? userId;
    await logActivity({
      icon: "user-minus",
      tone: "muted",
      message: `${userName} removed from task "${task.title}"`,
      actor_id: auth.user.id,
      action: "unassign",
      entity_type: ENTITY_TYPES.TASK,
      entity_id: id,
    });

    const assignees = await sql`
      SELECT
        ta.id AS assignment_id, ta.user_id,
        u.name AS user_name, u.email AS user_email, u.role AS user_role,
        ta.assigned_at, ta.assigned_by_id,
        ab.name AS assigned_by_name,
        (ta.user_id = (SELECT assignee_id FROM tasks WHERE id = ${id})) AS is_lead
      FROM task_assignments ta
      JOIN users u ON u.id = ta.user_id
      LEFT JOIN users ab ON ab.id = ta.assigned_by_id
      WHERE ta.task_id = ${id} AND ta.unassigned_at IS NULL
      ORDER BY is_lead DESC, ta.assigned_at
    `;
    return Response.json({ ok: true, assignees });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("remove assignee error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
