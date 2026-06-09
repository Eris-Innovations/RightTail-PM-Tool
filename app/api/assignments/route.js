// GET /api/assignments — workspace-wide view of every task + who's on it.

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  try {
    const rows = await sql`
      SELECT
        t.id,
        t.title,
        t.status,
        t.priority,
        t.due_date,
        p.name           AS project_name,
        assignee.name    AS assignee_name,
        assigner.name    AS assigner_name
      FROM tasks t
      LEFT JOIN projects p     ON p.id = t.project_id
      LEFT JOIN users assignee ON assignee.id = t.assignee_id
      LEFT JOIN users assigner ON assigner.id = t.assigner_id
      ORDER BY t.id
    `;
    const summary = await sql`
      SELECT status, COUNT(*)::int AS count
      FROM tasks
      GROUP BY status
    `;
    return Response.json({ items: rows, summary });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
