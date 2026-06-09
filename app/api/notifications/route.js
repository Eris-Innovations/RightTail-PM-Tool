// GET /api/notifications — scoped to the current user.
//
// There is no admin view into other users' streams — that would be a
// privacy issue. Reads always pin to auth.user.id server-side.

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";
import { NOTIFICATION_TYPES } from "@/lib/services/notifications";

export const dynamic = "force-dynamic";

const NOTIFICATION_TYPE_LIST = Object.values(NOTIFICATION_TYPES);

// Bell badge + filters all need the same row shape — one column list so
// it's impossible to drift between endpoints.
const NOTIFICATION_COLUMNS = `
  n.id, n.user_id, n.type, n.title, n.body, n.link,
  n.entity_type, n.entity_id, n.actor_id,
  n.read_at, n.email_status, n.email_sent_at, n.created_at,
  u.name AS actor_name
`;

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  try {
    const sp = new URL(request.url).searchParams;
    const filters = ["n.user_id = $1"];
    const params = [auth.user.id];
    const push = (clause, value) => {
      params.push(value);
      filters.push(clause.replace("$?", `$${params.length}`));
    };
    const type = sp.get("type")?.trim() || null;
    const unread = sp.get("unread") === "true";
    if (type && type !== "all") {
      if (!NOTIFICATION_TYPE_LIST.includes(type)) {
        return Response.json(
          { error: `Unknown type: ${type}` },
          { status: 400 }
        );
      }
      push("n.type = $?", type);
    }
    if (unread) filters.push("n.read_at IS NULL");
    const limit = Math.min(Number(sp.get("limit")) || 100, 500);
    params.push(limit);
    const text = `
      SELECT ${NOTIFICATION_COLUMNS}
      FROM notifications n
      LEFT JOIN users u ON u.id = n.actor_id
      WHERE ${filters.join(" AND ")}
      ORDER BY n.created_at DESC
      LIMIT $${params.length}
    `;
    const items = await sql.unsafe(text, params);
    const [{ unread_count }] = await sql`
      SELECT COUNT(*)::int AS unread_count
      FROM notifications
      WHERE user_id = ${auth.user.id} AND read_at IS NULL
    `;
    return Response.json({ items, unread_count });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("list notifications error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
