import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

// Distribution of tasks across the canonical statuses, with a
// "% of total" alongside each row so the donut/bar widget can render
// without doing math client-side. Statuses with zero tasks are
// included as 0 so the chart slots stay stable across renders.
export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  try {
    const STATUSES = ["To Do", "In Progress", "Done"];
    const raw = await sql`
      SELECT status, COUNT(*)::int AS count
      FROM tasks
      GROUP BY status
    `;
    const byStatus = Object.fromEntries(raw.map((r) => [r.status, r.count]));
    const total = raw.reduce((sum, r) => sum + r.count, 0);
    const items = STATUSES.map((status) => {
      const count = byStatus[status] ?? 0;
      return {
        status,
        count,
        percent: total > 0 ? Math.round((count / total) * 100) : 0,
      };
    });
    return Response.json({ items, total });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
