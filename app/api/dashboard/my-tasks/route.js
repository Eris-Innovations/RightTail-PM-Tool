import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

// "Assigned Tasks Summary" for the signed-in user — the personal lens
// of the dashboard. Includes the next 5 tasks coming due.
export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const userId = auth.user.id;

  try {
    const [summary] = await sql`
      SELECT
        COUNT(*)::int                                          AS total,
        COUNT(*) FILTER (WHERE status = 'To Do')::int          AS todo,
        COUNT(*) FILTER (WHERE status = 'In Progress')::int    AS in_progress,
        COUNT(*) FILTER (WHERE status = 'Done')::int           AS done,
        COUNT(*) FILTER (
          WHERE status <> 'Done'
            AND due_date IS NOT NULL
            AND due_date < CURRENT_DATE
        )::int                                                 AS overdue,
        COUNT(*) FILTER (
          WHERE status <> 'Done'
            AND due_date IS NOT NULL
            AND due_date BETWEEN CURRENT_DATE
                              AND CURRENT_DATE + INTERVAL '7 days'
        )::int                                                 AS due_this_week
      FROM tasks
      WHERE assignee_id = ${userId}
    `;
    const upNext = await sql`
      SELECT
        t.id, t.title, t.status, t.priority, t.due_date,
        p.id AS project_id, p.name AS project_name
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.assignee_id = ${userId}
        AND t.status <> 'Done'
      ORDER BY
        t.due_date NULLS LAST,
        CASE t.priority
          WHEN 'High'   THEN 1
          WHEN 'Medium' THEN 2
          WHEN 'Low'    THEN 3
          ELSE 4
        END,
        t.id
      LIMIT 5
    `;
    return Response.json({ summary, upNext });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
