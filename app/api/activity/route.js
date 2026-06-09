import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

// GET /api/activity — filterable activity feed.
//
// Filters compose with AND. Returns `actor_name` joined from users so
// the UI doesn't need a second round-trip.
export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  try {
    const url = new URL(request.url);
    const sp = url.searchParams;
    const limit = Math.min(Number(sp.get("limit")) || 100, 500);

    // Build dynamic WHERE the safe way. Each $? marker is substituted
    // with a positional placeholder; the values land in `params` so
    // sql.unsafe() binds them as parameters (no interpolation).
    const filters = ["1=1"];
    const params = [];
    const push = (clause, value) => {
      params.push(value);
      filters.push(clause.replace("$?", `$${params.length}`));
    };

    const tone = sp.get("tone")?.trim() || null;
    const entityType = sp.get("entity_type")?.trim() || null;
    const entityId = sp.get("entity_id")?.trim() || null;
    const actorId = sp.get("actor_id")?.trim() || null;
    const action = sp.get("action")?.trim() || null;
    const since = sp.get("since")?.trim() || null;
    const until = sp.get("until")?.trim() || null;
    const q = sp.get("q")?.trim() || null;

    if (tone && tone !== "All") push("a.tone = $?", tone);
    if (entityType && entityType !== "all") push("a.entity_type = $?", entityType);
    if (entityId) push("a.entity_id = $?", entityId);
    if (actorId) push("a.actor_id = $?", actorId);
    if (action) push("a.action = $?", action);
    if (since) push("a.created_at >= $?", since);
    if (until) push("a.created_at < ($?::timestamptz + INTERVAL '1 day')", until);
    if (q) {
      // Search rendered message, actor name, and entity id.
      const like = `%${q}%`;
      params.push(like, like, like);
      const i = params.length;
      filters.push(
        `(a.message ILIKE $${i - 2}
           OR u.name ILIKE $${i - 1}
           OR a.entity_id ILIKE $${i})`
      );
    }

    params.push(limit);
    const text = `
      SELECT
        a.id, a.icon, a.tone, a.message, a.created_at,
        a.actor_id, a.action, a.entity_type, a.entity_id,
        u.name  AS actor_name,
        u.email AS actor_email,
        u.role  AS actor_role
      FROM activity a
      LEFT JOIN users u ON u.id = a.actor_id
      WHERE ${filters.join(" AND ")}
      ORDER BY a.created_at DESC
      LIMIT $${params.length}
    `;
    const rows = await sql.unsafe(text, params);
    return Response.json({ items: rows });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("list activity error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
