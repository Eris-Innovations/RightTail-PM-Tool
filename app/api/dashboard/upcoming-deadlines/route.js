import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

const UPCOMING_DEADLINE_DAYS =
  Number(process.env.UPCOMING_DEADLINE_DAYS) || 14;

// Tasks due in the next N days (default 14), excluding already-Done
// items. Returns due_in_days so the widget can show
// "Today / Tomorrow / In 3 days".
export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  try {
    const url = new URL(request.url);
    const horizon = Math.max(
      1,
      Math.min(60, Number(url.searchParams.get("days")) || UPCOMING_DEADLINE_DAYS)
    );
    const rows = await sql`
      SELECT
        t.id,
        t.title,
        t.status,
        t.priority,
        t.due_date,
        (t.due_date - CURRENT_DATE)::int AS due_in_days,
        p.id   AS project_id,
        p.name AS project_name,
        u.name AS assignee_name
      FROM tasks t
      LEFT JOIN projects p ON p.id = t.project_id
      LEFT JOIN users u    ON u.id = t.assignee_id
      WHERE t.status <> 'Done'
        AND t.due_date IS NOT NULL
        AND t.due_date BETWEEN CURRENT_DATE
                            AND CURRENT_DATE + (${horizon} || ' days')::interval
      ORDER BY t.due_date ASC, t.id
      LIMIT 25
    `;
    return Response.json({ items: rows, horizonDays: horizon });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
