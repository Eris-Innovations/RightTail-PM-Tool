import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

// Per-assignee task load. Only users who currently own at least one
// task are returned — keeps the workload chart focused on people doing
// the work and avoids long lists of 0s on a populated workspace.
export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  try {
    const rows = await sql`
      SELECT
        u.id,
        u.name,
        u.role,
        COUNT(t.id)::int                                       AS total,
        COUNT(t.id) FILTER (WHERE t.status = 'To Do')::int     AS todo,
        COUNT(t.id) FILTER (WHERE t.status = 'In Progress')::int AS in_progress,
        COUNT(t.id) FILTER (WHERE t.status = 'Done')::int      AS done,
        COUNT(t.id) FILTER (
          WHERE t.status <> 'Done'
            AND t.due_date IS NOT NULL
            AND t.due_date < CURRENT_DATE
        )::int                                                 AS overdue
      FROM users u
      JOIN tasks t ON t.assignee_id = u.id
      GROUP BY u.id, u.name, u.role
      ORDER BY total DESC, u.name
    `;
    const peak = rows.reduce((m, r) => Math.max(m, r.total), 0);
    return Response.json({ items: rows, peak });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
