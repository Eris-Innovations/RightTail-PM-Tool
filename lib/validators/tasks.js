import { sql } from "@/lib/db";

export const TASK_STATUSES = ["To Do", "In Progress", "Done"];
export const TASK_PRIORITIES = ["Low", "Medium", "High", "Critical"];

function normaliseTaskTags(input) {
  if (input == null) return [];
  const raw = Array.isArray(input) ? input : String(input).split(",");
  const cleaned = [];
  const seen = new Set();
  for (const item of raw) {
    const t = String(item).trim();
    if (!t || t.length > 32 || seen.has(t)) continue;
    seen.add(t);
    cleaned.push(t);
    if (cleaned.length >= 20) break;
  }
  return cleaned;
}

// Parses an hours input. Accepts numbers and numeric-looking strings;
// rejects negatives and overlarge values (~half a person-year max,
// plenty of headroom for a single task).
function parseHours(value, fieldLabel, errors) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) {
    errors.push(`${fieldLabel} must be a number.`);
    return undefined;
  }
  if (num < 0) {
    errors.push(`${fieldLabel} cannot be negative.`);
    return undefined;
  }
  if (num > 9999.99) {
    errors.push(`${fieldLabel} is unreasonably large.`);
    return undefined;
  }
  return Math.round(num * 100) / 100;
}

export function validateTaskInput(body, mode) {
  const errors = [];
  const values = {};

  if (mode === "create" || body.title !== undefined) {
    const title = String(body.title ?? "").trim();
    if (title.length < 2) errors.push("Task title must be at least 2 characters.");
    else if (title.length > 200) errors.push("Task title must be at most 200 characters.");
    else values.title = title;
  }
  if (body.description !== undefined) {
    const d = String(body.description ?? "").trim();
    values.description = d || null;
  }
  if (mode === "create" || body.status !== undefined) {
    const s = String(body.status ?? "To Do").trim();
    if (!TASK_STATUSES.includes(s)) {
      errors.push(`Status must be one of: ${TASK_STATUSES.join(", ")}.`);
    } else values.status = s;
  }
  if (mode === "create" || body.priority !== undefined) {
    const p = String(body.priority ?? "Medium").trim();
    if (!TASK_PRIORITIES.includes(p)) {
      errors.push(`Priority must be one of: ${TASK_PRIORITIES.join(", ")}.`);
    } else values.priority = p;
  }
  if (body.due_date !== undefined) {
    values.due_date = body.due_date || null;
  }
  if (body.assignee_id !== undefined) {
    const id = String(body.assignee_id ?? "").trim();
    values.assignee_id = id || null;
  }
  if (mode === "create" || body.project_id !== undefined) {
    const id = String(body.project_id ?? "").trim();
    if (!id) errors.push("project_id is required.");
    else values.project_id = id;
  }
  if (body.estimated_hours !== undefined) {
    const v = parseHours(body.estimated_hours, "Estimated hours", errors);
    if (v !== undefined) values.estimated_hours = v;
  }
  if (body.actual_hours !== undefined) {
    const v = parseHours(body.actual_hours, "Actual hours", errors);
    if (v !== undefined) values.actual_hours = v;
  }
  if (body.tags !== undefined) {
    values.tags = normaliseTaskTags(body.tags);
  }

  return { errors, values };
}

// ----- task_assignments helpers --------------------------------------------
// The audit table is the single source of truth for "who is/was on this
// task". tasks.assignee_id remains the *lead* pointer so existing
// queries (dashboard widgets, project detail teamMembers, list
// summaries) keep working unchanged.
//
// Invariant: if tasks.assignee_id is set, there is exactly one OPEN row
// in task_assignments for (task_id, assignee_id). These helpers
// preserve it.

export async function getActiveAssignment(taskId, userId) {
  const [row] = await sql`
    SELECT id FROM task_assignments
    WHERE task_id = ${taskId}
      AND user_id = ${userId}
      AND unassigned_at IS NULL
  `;
  return row || null;
}

export async function openAssignment(taskId, userId, byUserId) {
  if (!userId) return false;
  const existing = await getActiveAssignment(taskId, userId);
  if (existing) return false;
  await sql`
    INSERT INTO task_assignments (task_id, user_id, assigned_by_id)
    VALUES (${taskId}, ${userId}, ${byUserId ?? null})
  `;
  return true;
}

export async function closeAssignment(taskId, userId, byUserId) {
  if (!userId) return false;
  const result = await sql`
    UPDATE task_assignments SET
      unassigned_at    = NOW(),
      unassigned_by_id = ${byUserId ?? null}
    WHERE task_id = ${taskId}
      AND user_id = ${userId}
      AND unassigned_at IS NULL
    RETURNING id
  `;
  return result.length > 0;
}

// Shared SELECT — keeps every task response (list/detail/create/update)
// on the same field shape so the frontend doesn't need to handle
// variants. `active_assignees` is the running count from the audit
// table so list rows can render a "+N" badge without a follow-up fetch.
export const TASK_SELECT_COLUMNS = `
  t.id,
  t.project_id,
  t.title,
  t.description,
  t.status,
  t.priority,
  t.due_date::text AS due_date,
  t.estimated_hours,
  t.actual_hours,
  t.tags,
  t.assignee_id,
  t.assigner_id,
  t.completed_at,
  t.created_at,
  t.updated_at,
  p.name AS project_name,
  p.archived_at AS project_archived_at,
  assignee.name AS assignee_name,
  assignee.email AS assignee_email,
  assigner.name AS assigner_name,
  (
    SELECT COUNT(*)::int FROM task_assignments ta
    WHERE ta.task_id = t.id AND ta.unassigned_at IS NULL
  ) AS active_assignees
`;

export const TASK_FROM_CLAUSE = `
  FROM tasks t
  LEFT JOIN projects p     ON p.id = t.project_id
  LEFT JOIN users assignee ON assignee.id = t.assignee_id
  LEFT JOIN users assigner ON assigner.id = t.assigner_id
`;

export const TASK_ORDER_CLAUSE = `
  ORDER BY
    CASE t.status WHEN 'In Progress' THEN 1 WHEN 'To Do' THEN 2 WHEN 'Done' THEN 3 ELSE 4 END,
    t.due_date NULLS LAST,
    t.id
`;
