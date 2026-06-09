// GET /api/tasks/:id/assignments — full assignment history for a task.

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const [task] = await sql`SELECT id FROM tasks WHERE id = ${id}`;
    if (!task) {
      return Response.json({ error: "Task not found." }, { status: 404 });
    }
    const items = await sql`
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
    `;
    return Response.json({ items });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("list assignments error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
