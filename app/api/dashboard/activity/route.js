import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  try {
    const rows = await sql`
      SELECT
        a.id, a.icon, a.tone, a.message, a.created_at,
        a.actor_id, a.action, a.entity_type, a.entity_id,
        u.name AS actor_name
      FROM activity a
      LEFT JOIN users u ON u.id = a.actor_id
      ORDER BY a.created_at DESC
      LIMIT 10
    `;
    return Response.json(rows);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
