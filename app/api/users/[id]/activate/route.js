import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { USER_PUBLIC_COLUMNS } from "@/lib/validators/users";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await requireRole(request, "admin");
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const [existing] = await sql`SELECT id, name, status FROM users WHERE id = ${id}`;
    if (!existing) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }
    if (existing.status === "Active") {
      return Response.json({ ok: true, alreadyActive: true });
    }
    await sql`
      UPDATE users SET status = 'Active', updated_at = NOW() WHERE id = ${id}
    `;
    await logActivity({
      icon: "user-check",
      tone: "primary",
      message: `${existing.name} activated`,
      actor_id: auth.user.id,
      action: "activate",
      entity_type: ENTITY_TYPES.USER,
      entity_id: id,
    });
    const [user] = await sql.unsafe(
      `SELECT ${USER_PUBLIC_COLUMNS} FROM users u WHERE u.id = $1`,
      [id]
    );
    return Response.json({ user });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("activate user error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
