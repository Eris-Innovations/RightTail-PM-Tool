// GET    /api/tasks/:id  — detail bundle (task + assignees + history + activity)
// PATCH  /api/tasks/:id  — partial update (any signed-in user)
// DELETE /api/tasks/:id  — any signed-in user

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { notify, NOTIFICATION_TYPES } from "@/lib/services/notifications";
import {
  TASK_SELECT_COLUMNS,
  TASK_FROM_CLAUSE,
  validateTaskInput,
  getActiveAssignment,
  openAssignment,
  closeAssignment,
} from "@/lib/validators/tasks";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const text = `SELECT ${TASK_SELECT_COLUMNS} ${TASK_FROM_CLAUSE} WHERE t.id = $1`;
    const rows = await sql.unsafe(text, [id]);
    const task = rows[0];
    if (!task) {
      return Response.json({ error: "Task not found." }, { status: 404 });
    }

    // Currently-active assignees. `is_lead` marks the user that
    // tasks.assignee_id points at — the rest are co-assignees.
    const assignees = await sql`
      SELECT
        ta.id              AS assignment_id,
        ta.user_id,
        u.name             AS user_name,
        u.email            AS user_email,
        u.role             AS user_role,
        ta.assigned_at,
        ta.assigned_by_id,
        ab.name            AS assigned_by_name,
        (ta.user_id = ${task.assignee_id}) AS is_lead
      FROM task_assignments ta
      JOIN users u  ON u.id = ta.user_id
      LEFT JOIN users ab ON ab.id = ta.assigned_by_id
      WHERE ta.task_id = ${id}
        AND ta.unassigned_at IS NULL
      ORDER BY (ta.user_id = ${task.assignee_id}) DESC, ta.assigned_at
    `;

    const assignmentHistory = await sql`
      SELECT
        ta.id,
        ta.user_id,
        u.name              AS user_name,
        ta.assigned_at,
        ta.assigned_by_id,
        ab.name             AS assigned_by_name,
        ta.unassigned_at,
        ta.unassigned_by_id,
        ub.name             AS unassigned_by_name
      FROM task_assignments ta
      JOIN users u  ON u.id = ta.user_id
      LEFT JOIN users ab ON ab.id = ta.assigned_by_id
      LEFT JOIN users ub ON ub.id = ta.unassigned_by_id
      WHERE ta.task_id = ${id}
      ORDER BY ta.assigned_at DESC, ta.id DESC
      LIMIT 50
    `;

    const activity = await sql`
      SELECT id, icon, tone, message, created_at
      FROM activity
      WHERE message ILIKE ${"%\"" + task.title + "\"%"}
        OR message ILIKE ${"%" + task.id + "%"}
      ORDER BY created_at DESC
      LIMIT 20
    `;
    return Response.json({ task, assignees, assignmentHistory, activity });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("get task error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const detailText = `SELECT ${TASK_SELECT_COLUMNS} ${TASK_FROM_CLAUSE} WHERE t.id = $1`;
    const existingRows = await sql.unsafe(detailText, [id]);
    const existing = existingRows[0];
    if (!existing) {
      return Response.json({ error: "Task not found." }, { status: 404 });
    }
    if (existing.project_archived_at) {
      return Response.json(
        { error: "Cannot edit tasks on an archived project." },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { errors, values } = validateTaskInput(body ?? {}, "update");
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    if (values.project_id && values.project_id !== existing.project_id) {
      const [p] = await sql`
        SELECT id, archived_at FROM projects WHERE id = ${values.project_id}
      `;
      if (!p) {
        return Response.json(
          { error: "Selected project does not exist." },
          { status: 400 }
        );
      }
      if (p.archived_at) {
        return Response.json(
          { error: "Cannot move a task into an archived project." },
          { status: 409 }
        );
      }
    }
    if (values.assignee_id) {
      const [u] = await sql`SELECT id FROM users WHERE id = ${values.assignee_id}`;
      if (!u) {
        return Response.json(
          { error: "Selected assignee does not exist." },
          { status: 400 }
        );
      }
    }

    // Diff for the activity log + sync completed_at with status.
    const FIELDS = [
      "title", "description", "status", "priority", "due_date",
      "assignee_id", "estimated_hours", "actual_hours", "tags", "project_id",
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
      return Response.json({ task: existing, changed: [] });
    }

    const next = { ...existing, ...values };
    let completedAt = existing.completed_at;
    if (values.status === "Done" && existing.status !== "Done") {
      completedAt = new Date();
    } else if (
      values.status &&
      values.status !== "Done" &&
      existing.status === "Done"
    ) {
      completedAt = null;
    }

    await sql`
      UPDATE tasks SET
        project_id      = ${next.project_id},
        title           = ${next.title},
        description     = ${next.description ?? null},
        status          = ${next.status},
        priority        = ${next.priority},
        due_date        = ${next.due_date ?? null},
        assignee_id     = ${next.assignee_id ?? null},
        estimated_hours = ${next.estimated_hours ?? null},
        actual_hours    = ${next.actual_hours ?? null},
        tags            = ${next.tags ?? []},
        completed_at    = ${completedAt},
        updated_at      = NOW()
      WHERE id = ${id}
    `;

    // Keep the assignment audit in sync with the lead-assignee change.
    //   • assign     ∅  → B (B fresh)  : open B's row.
    //   • assign     ∅  → B (B active) : no-op.
    //   • hand-off   A  → B (B fresh)  : close A, open B.
    //   • promote    A  → B (B active) : flip the lead pointer only.
    //   • unassign   A  → ∅            : close A's row only.
    if (changed.includes("assignee_id")) {
      if (next.assignee_id) {
        const alreadyActive = await getActiveAssignment(id, next.assignee_id);
        if (!alreadyActive) {
          if (existing.assignee_id) {
            await closeAssignment(id, existing.assignee_id, auth.user.id);
          }
          await openAssignment(id, next.assignee_id, auth.user.id);
        }
      } else if (existing.assignee_id) {
        await closeAssignment(id, existing.assignee_id, auth.user.id);
      }
    }

    const [task] = await sql.unsafe(detailText, [id]);

    // Recipient pool for task-level notifications: every active
    // assignee on the task + the project owner, minus the actor.
    async function taskNotificationRecipients() {
      const rows = await sql`
        SELECT ta.user_id
        FROM task_assignments ta
        WHERE ta.task_id = ${id} AND ta.unassigned_at IS NULL
        UNION
        SELECT p.owner_id AS user_id
        FROM projects p WHERE p.id = ${task.project_id}
      `;
      return rows.map((r) => r.user_id);
    }

    // Bespoke activity messages for the high-signal state transitions,
    // plus a generic fallback for everything else.
    if (changed.includes("status") && values.status === "Done") {
      await logActivity({
        icon: "check-circle",
        tone: "success",
        message: `Task "${task.title}" marked complete`,
        actor_id: auth.user.id,
        action: "complete",
        entity_type: ENTITY_TYPES.TASK,
        entity_id: id,
      });
      await notify({
        userIds: await taskNotificationRecipients(),
        type: NOTIFICATION_TYPES.TASK_COMPLETED,
        title: `Task "${task.title}" was completed`,
        body: `Project: ${task.project_name ?? ""} · Completed by ${auth.user.name ?? auth.user.email}`,
        link: `/tasks?id=${id}`,
        entity_type: ENTITY_TYPES.TASK,
        entity_id: id,
        actor_id: auth.user.id,
      });
    } else if (
      changed.includes("status") &&
      existing.status === "Done" &&
      values.status !== "Done"
    ) {
      await logActivity({
        icon: "rotate-ccw",
        tone: "muted",
        message: `Task "${task.title}" reopened (now ${values.status})`,
        actor_id: auth.user.id,
        action: "reopen",
        entity_type: ENTITY_TYPES.TASK,
        entity_id: id,
      });
      await notify({
        userIds: await taskNotificationRecipients(),
        type: NOTIFICATION_TYPES.TASK_UPDATED,
        title: `Task "${task.title}" was reopened`,
        body: `Status: ${values.status}`,
        link: `/tasks?id=${id}`,
        entity_type: ENTITY_TYPES.TASK,
        entity_id: id,
        actor_id: auth.user.id,
      });
    } else if (changed.includes("status")) {
      await logActivity({
        icon: "activity",
        tone: "primary",
        message: `Task "${task.title}" moved to ${values.status}`,
        actor_id: auth.user.id,
        action: "status_change",
        entity_type: ENTITY_TYPES.TASK,
        entity_id: id,
      });
      await notify({
        userIds: await taskNotificationRecipients(),
        type: NOTIFICATION_TYPES.TASK_UPDATED,
        title: `Task "${task.title}" moved to ${values.status}`,
        body: `Updated by ${auth.user.name ?? auth.user.email}`,
        link: `/tasks?id=${id}`,
        entity_type: ENTITY_TYPES.TASK,
        entity_id: id,
        actor_id: auth.user.id,
      });
    }
    if (changed.includes("assignee_id")) {
      const fromName = existing.assignee_name;
      const toName = task.assignee_name;
      let message, icon, tone, action;
      if (fromName && toName) {
        message = `Task "${task.title}" reassigned from ${fromName} to ${toName}`;
        icon = "user-plus";
        tone = "primary";
        action = "reassign";
      } else if (toName) {
        message = `Task "${task.title}" assigned to ${toName}`;
        icon = "user-plus";
        tone = "primary";
        action = "assign";
      } else {
        message = `Task "${task.title}" unassigned from ${fromName}`;
        icon = "user-minus";
        tone = "muted";
        action = "unassign";
      }
      await logActivity({
        icon,
        tone,
        message,
        actor_id: auth.user.id,
        action,
        entity_type: ENTITY_TYPES.TASK,
        entity_id: id,
      });
      // Notify the *new* lead specifically.
      if (next.assignee_id) {
        await notify({
          userIds: [next.assignee_id],
          type: NOTIFICATION_TYPES.TASK_ASSIGNED,
          title: `You were assigned to "${task.title}"`,
          body: `Project: ${task.project_name ?? ""}${task.due_date ? ` · Due ${task.due_date}` : ""}`,
          link: `/tasks?id=${id}`,
          entity_type: ENTITY_TYPES.TASK,
          entity_id: id,
          actor_id: auth.user.id,
        });
      }
    }
    // Catch-all so non-status / non-assignee edits still leave a trail.
    const otherChanges = changed.filter(
      (c) => c !== "status" && c !== "assignee_id"
    );
    if (otherChanges.length > 0) {
      await logActivity({
        icon: "pencil",
        tone: "warning",
        message: `Task "${task.title}" updated (${otherChanges.join(", ")})`,
        actor_id: auth.user.id,
        action: "update",
        entity_type: ENTITY_TYPES.TASK,
        entity_id: id,
      });
      await notify({
        userIds: await taskNotificationRecipients(),
        type: NOTIFICATION_TYPES.TASK_UPDATED,
        title: `Task "${task.title}" was updated`,
        body: `Fields changed: ${otherChanges.join(", ")}`,
        link: `/tasks?id=${id}`,
        entity_type: ENTITY_TYPES.TASK,
        entity_id: id,
        actor_id: auth.user.id,
      });
    }

    return Response.json({ task, changed });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("update task error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const [existing] = await sql`SELECT id, title FROM tasks WHERE id = ${id}`;
    if (!existing) {
      return Response.json({ error: "Task not found." }, { status: 404 });
    }
    await sql`DELETE FROM tasks WHERE id = ${id}`;
    await logActivity({
      icon: "trash-2",
      tone: "muted",
      message: `Task "${existing.title}" was deleted`,
      actor_id: auth.user.id,
      action: "delete",
      entity_type: ENTITY_TYPES.TASK,
      entity_id: id,
    });
    return Response.json({ ok: true, id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("delete task error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
