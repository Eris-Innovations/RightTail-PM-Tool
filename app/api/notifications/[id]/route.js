import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

export async function DELETE(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "Invalid notification id." }, { status: 400 });
  }
  try {
    const result = await sql`
      DELETE FROM notifications
      WHERE id = ${id} AND user_id = ${auth.user.id}
      RETURNING id
    `;
    if (result.length === 0) {
      return Response.json(
        { error: "Notification not found." },
        { status: 404 }
      );
    }
    return Response.json({ ok: true, id });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
