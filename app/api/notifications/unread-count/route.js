import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  try {
    const [{ unread_count }] = await sql`
      SELECT COUNT(*)::int AS unread_count
      FROM notifications
      WHERE user_id = ${auth.user.id} AND read_at IS NULL
    `;
    return Response.json({ unread_count });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
