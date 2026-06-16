// GET  /api/tasks  — filterable list with running summaries
// POST /api/tasks  — create (admin/manager)

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { notify, NOTIFICATION_TYPES } from "@/lib/services/notifications";
import { generateTaskId } from "@/lib/utils/ids";
import {
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_SELECT_COLUMNS,
  TASK_FROM_CLAUSE,
  TASK_ORDER_CLAUSE,
  validateTaskInput,
  openAssignment,
} from "@/lib/validators/tasks";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  try {
    const sp = new URL(request.url).searchParams;
    const projectId = sp.get("project_id")?.trim() || null;
    const status = sp.get("status")?.trim() || null;
    const priority = sp.get("priority")?.trim() || null;
    const assigneeId = sp.get("assignee_id")?.trim() || null;
    const includeUnassigned = sp.get("unassigned") === "true";
    const dueFrom = sp.get("due_from") || null;
    const dueTo = sp.get("due_to") || null;
    const q = sp.get("q")?.trim() || null;
    const includeArchived = sp.get("include_archived") === "true";

    if (status && !TASK_STATUSES.includes(status)) {
      return Response.json(
        { error: `Invalid status filter: ${status}.` },
        { status: 400 }
      );
    }
    if (priority && !TASK_PRIORITIES.includes(priority)) {
      return Response.json(
        { error: `Invalid priority filter: ${priority}.` },
        { status: 400 }
      );
    }

    const where = ["1=1"];
    const params = [];
    const push = (clause, value) => {
      params.push(value);
      where.push(clause.replace("$?", `$${params.length}`));
    };
    if (projectId) push("t.project_id = $?", projectId);
    if (status) push("t.status = $?", status);
    if (priority) push("t.priority = $?", priority);
    if (assigneeId) push("t.assignee_id = $?", assigneeId);
    if (includeUnassigned) where.push("t.assignee_id IS NULL");
    if (dueFrom) push("(t.due_date IS NOT NULL AND t.due_date >= $?)", dueFrom);
    if (dueTo) push("(t.due_date IS NOT NULL AND t.due_date <= $?)", dueTo);
    if (q) {
      const like = `%${q}%`;
      params.push(like, like, like, q);
      const i = params.length;
      where.push(
        `(t.title ILIKE $${i - 3}
           OR t.description ILIKE $${i - 2}
           OR t.id ILIKE $${i - 1}
           OR $${i} = ANY(t.tags))`
      );
    }
    if (!includeArchived) where.push("p.archived_at IS NULL");

    const text = `
      SELECT ${TASK_SELECT_COLUMNS}
      ${TASK_FROM_CLAUSE}
      WHERE ${where.join(" AND ")}
      ${TASK_ORDER_CLAUSE}
    `;
    const rows = await sql.unsafe(text, params);

    const summary = await sql`
      SELECT t.status, COUNT(*)::int AS count
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE p.archived_at IS NULL
      GROUP BY t.status
    `;
    const prioritySummary = await sql`
      SELECT t.priority, COUNT(*)::int AS count
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE p.archived_at IS NULL
      GROUP BY t.priority
    `;
    const [{ overdue: overdueCount }] = await sql`
      SELECT COUNT(*)::int AS overdue
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE p.archived_at IS NULL
        AND t.status <> 'Done'
        AND t.due_date IS NOT NULL
        AND t.due_date < CURRENT_DATE
    `;
    return Response.json({ items: rows, summary, prioritySummary, overdueCount });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("list tasks error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const { errors, values } = validateTaskInput(body ?? {}, "create");
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    const [project] = await sql`
      SELECT id, name, archived_at FROM projects WHERE id = ${values.project_id}
    `;
    if (!project) {
      return Response.json(
        { error: "Selected project does not exist." },
        { status: 400 }
      );
    }
    if (project.archived_at) {
      return Response.json(
        { error: "Cannot add tasks to an archived project. Restore it first." },
        { status: 409 }
      );
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

    const id = await generateTaskId();
    const status = values.status ?? "To Do";
    const completedAt = status === "Done" ? new Date() : null;

    const inserted = await sql`
      INSERT INTO tasks (
        id, project_id, title, description, status, priority,
        due_date, assignee_id, assigner_id,
        estimated_hours, actual_hours, tags, completed_at
      )
      VALUES (
        ${id},
        ${values.project_id},
        ${values.title},
        ${values.description ?? null},
        ${status},
        ${values.priority ?? "Medium"},
        ${values.due_date ?? null},
        ${values.assignee_id ?? null},
        ${auth.user.id},
        ${values.estimated_hours ?? null},
        ${values.actual_hours ?? null},
        ${values.tags ?? []},
        ${completedAt}
      )
      RETURNING id
    `;

    // Mirror the initial lead-assignee into the audit table so the
    // assignment history starts from t=create instead of from the first
    // reassignment.
    if (values.assignee_id) {
      await openAssignment(inserted[0].id, values.assignee_id, auth.user.id);
    }

    const detailText = `SELECT ${TASK_SELECT_COLUMNS} ${TASK_FROM_CLAUSE} WHERE t.id = $1`;
    const [task] = await sql.unsafe(detailText, [inserted[0].id]);

    await logActivity({
      icon: "clipboard-list",
      tone: "primary",
      message: `Task "${task.title}" added to project "${project.name}"`,
      actor_id: auth.user.id,
      action: "create",
      entity_type: ENTITY_TYPES.TASK,
      entity_id: task.id,
    });
    if (task.assignee_name) {
      await logActivity({
        icon: "user-plus",
        tone: "primary",
        message: `Task "${task.title}" assigned to ${task.assignee_name}`,
        actor_id: auth.user.id,
        action: "assign",
        entity_type: ENTITY_TYPES.TASK,
        entity_id: task.id,
      });
      await notify({
        userIds: [values.assignee_id],
        type: NOTIFICATION_TYPES.TASK_ASSIGNED,
        title: `You were assigned to "${task.title}"`,
        body: `Project: ${project.name}${task.due_date ? ` · Due ${task.due_date}` : ""}`,
        link: `/tasks?id=${task.id}`,
        entity_type: ENTITY_TYPES.TASK,
        entity_id: task.id,
        actor_id: auth.user.id,
      });
    }

    return Response.json({ task }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("create task error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
