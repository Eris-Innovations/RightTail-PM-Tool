import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

// Distinct entity types + actors that have produced events. Used by
// the Activity Log filter UI so dropdowns only show options that will
// actually return results.
export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  try {
    const entityRows = await sql`
      SELECT entity_type, COUNT(*)::int AS count
      FROM activity
      WHERE entity_type IS NOT NULL
      GROUP BY entity_type
      ORDER BY count DESC, entity_type
    `;
    const actionRows = await sql`
      SELECT action, COUNT(*)::int AS count
      FROM activity
      WHERE action IS NOT NULL
      GROUP BY action
      ORDER BY count DESC, action
    `;
    const actorRows = await sql`
      SELECT u.id, u.name, u.email, COUNT(*)::int AS count
      FROM activity a
      JOIN users u ON u.id = a.actor_id
      GROUP BY u.id, u.name, u.email
      ORDER BY count DESC, u.name
      LIMIT 50
    `;
    return Response.json({
      entity_types: entityRows,
      actions: actionRows,
      actors: actorRows,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
