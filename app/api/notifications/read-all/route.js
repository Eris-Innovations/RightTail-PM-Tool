import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  try {
    const result = await sql`
      UPDATE notifications
      SET read_at = NOW()
      WHERE user_id = ${auth.user.id} AND read_at IS NULL
      RETURNING id
    `;
    return Response.json({ ok: true, marked: result.length });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
