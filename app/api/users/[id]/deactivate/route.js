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
    if (id === auth.user.id) {
      return Response.json(
        { error: "You cannot deactivate yourself." },
        { status: 409 }
      );
    }
    const [existing] = await sql`
      SELECT id, name, role, status FROM users WHERE id = ${id}
    `;
    if (!existing) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }
    if (existing.status === "Inactive") {
      return Response.json({ ok: true, alreadyInactive: true });
    }

    if (existing.role === "admin") {
      const [{ count }] = await sql`
        SELECT COUNT(*)::int AS count
        FROM users WHERE role = 'admin' AND status = 'Active'
      `;
      if (count <= 1) {
        return Response.json(
          { error: "Cannot deactivate the last active admin." },
          { status: 409 }
        );
      }
    }

    await sql`
      UPDATE users SET status = 'Inactive', updated_at = NOW() WHERE id = ${id}
    `;
    await logActivity({
      icon: "user-x",
      tone: "muted",
      message: `${existing.name} deactivated`,
      actor_id: auth.user.id,
      action: "deactivate",
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
    console.error("deactivate user error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
