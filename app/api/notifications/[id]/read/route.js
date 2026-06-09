import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "Invalid notification id." }, { status: 400 });
  }
  try {
    const result = await sql`
      UPDATE notifications
      SET read_at = NOW()
      WHERE id = ${id} AND user_id = ${auth.user.id} AND read_at IS NULL
      RETURNING id, read_at
    `;
    // 404 covers both "doesn't exist" and "belongs to someone else" —
    // the exact reason isn't worth leaking.
    if (result.length === 0) {
      return Response.json(
        { error: "Notification not found." },
        { status: 404 }
      );
    }
    return Response.json({ ok: true, id, read_at: result[0].read_at });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
