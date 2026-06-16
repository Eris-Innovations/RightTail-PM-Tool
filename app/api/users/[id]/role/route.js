// PATCH /api/users/:id/role — any signed-in user can change roles.
// Last-admin guard keeps at least one admin in the workspace at all times.

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { USER_ROLES } from "@/lib/validators/users";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const targetId = String(idParam ?? "");

  try {
    const body = await request.json().catch(() => ({}));
    const newRole = String(body?.role ?? "");

    if (!USER_ROLES.includes(newRole)) {
      return Response.json(
        { error: `Role must be one of: ${USER_ROLES.join(", ")}.` },
        { status: 400 }
      );
    }

    const [target] = await sql`
      SELECT id, name, email, role FROM users WHERE id = ${targetId}
    `;
    if (!target) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    if (target.role === newRole) {
      return Response.json({ user: target });
    }

    // Prevent demoting the last remaining admin — otherwise nobody can
    // ever promote anyone again.
    if (target.role === "admin" && newRole !== "admin") {
      const [{ count }] = await sql`
        SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'
      `;
      if (count <= 1) {
        return Response.json(
          {
            error: "Cannot demote the last admin. Promote another user first.",
          },
          { status: 409 }
        );
      }
    }

    const [updated] = await sql`
      UPDATE users SET role = ${newRole}
      WHERE id = ${targetId}
      RETURNING id, name, email, role, created_at, last_login_at
    `;

    await logActivity({
      icon: "shield",
      tone: "primary",
      message: `Role for ${updated.name} changed to ${newRole}`,
      actor_id: auth.user.id,
      action: "role_change",
      entity_type: ENTITY_TYPES.USER,
      entity_id: targetId,
    });

    return Response.json({ user: updated });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("update role error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
