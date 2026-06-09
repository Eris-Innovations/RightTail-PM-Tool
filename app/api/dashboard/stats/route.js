import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

const ACTIVE_USER_WINDOW_DAYS =
  Number(process.env.ACTIVE_USER_WINDOW_DAYS) || 30;

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  try {
    const [projectStats] = await sql`
      SELECT COUNT(*)::int AS total_projects
      FROM projects WHERE archived_at IS NULL
    `;
    const userStats = await sql`
      SELECT
        COUNT(*)::int                                          AS total,
        COUNT(*) FILTER (
          WHERE last_login_at >= NOW() - (${ACTIVE_USER_WINDOW_DAYS} || ' days')::interval
        )::int                                                 AS active
      FROM users
    `;
    const taskStats = await sql`
      SELECT
        COUNT(*) FILTER (WHERE TRUE)::int             AS total,
        COUNT(*) FILTER (WHERE status = 'Done')::int  AS done,
        COUNT(*) FILTER (WHERE status <> 'Done')::int AS pending,
        COUNT(*) FILTER (
          WHERE status <> 'Done'
            AND due_date IS NOT NULL
            AND due_date < CURRENT_DATE
        )::int                                        AS overdue
      FROM tasks
    `;
    const t = taskStats[0];
    const u = userStats[0];
    const completion = t.total > 0 ? Math.round((t.done / t.total) * 100) : 0;

    return Response.json({
      totalProjects: projectStats.total_projects,
      totalUsers: u.total,
      activeUsers: u.active,
      activeUserWindowDays: ACTIVE_USER_WINDOW_DAYS,
      totalTasks: t.total,
      completedTasks: t.done,
      pendingTasks: t.pending,
      overdueTasks: t.overdue,
      completionRate: completion,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
