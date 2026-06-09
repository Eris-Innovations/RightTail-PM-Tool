import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

// Per-project task aggregates + completion %. Dashboard renders this
// as a "Project Progress Overview" widget — each project's bar shows
// what % of its tasks are in the Done bucket.
export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  try {
    const rows = await sql`
      SELECT
        p.id,
        p.name,
        p.status,
        p.priority,
        u.name AS owner_name,
        COUNT(t.id)::int                                     AS total_tasks,
        COUNT(t.id) FILTER (WHERE t.status = 'Done')::int    AS done_tasks,
        COUNT(t.id) FILTER (WHERE t.status <> 'Done')::int   AS open_tasks,
        COUNT(t.id) FILTER (
          WHERE t.status <> 'Done'
            AND t.due_date IS NOT NULL
            AND t.due_date < CURRENT_DATE
        )::int                                               AS overdue_tasks,
        CASE
          WHEN COUNT(t.id) = 0 THEN 0
          ELSE ROUND(
            100.0 * COUNT(t.id) FILTER (WHERE t.status = 'Done') / COUNT(t.id)
          )::int
        END                                                  AS completion_pct
      FROM projects p
      LEFT JOIN tasks t  ON t.project_id = p.id
      LEFT JOIN users u  ON u.id = p.owner_id
      WHERE p.archived_at IS NULL
      GROUP BY p.id, p.name, p.status, p.priority, u.name
      ORDER BY completion_pct DESC, p.name
    `;
    return Response.json({ items: rows });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
