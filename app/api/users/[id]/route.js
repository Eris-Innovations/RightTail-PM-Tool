// GET    /api/users/:id — members can read their own row; admins anyone's
// PATCH  /api/users/:id — admin-only general update
// DELETE /api/users/:id — admin-only

import { sql } from "@/lib/db";
import { requireUser, requireRole } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { USER_PUBLIC_COLUMNS, validateUserPayload } from "@/lib/validators/users";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  if (auth.user.role !== "admin" && auth.user.id !== id) {
    return Response.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const [user] = await sql.unsafe(
      `SELECT ${USER_PUBLIC_COLUMNS} FROM users u WHERE u.id = $1`,
      [id]
    );
    if (!user) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }
    return Response.json({ user });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("get user error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  const auth = await requireRole(request, "admin");
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const [existing] = await sql`
      SELECT id, name, email, role, status, department, phone, avatar_url
      FROM users WHERE id = ${id}
    `;
    if (!existing) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const { errors, values } = validateUserPayload(body ?? {}, { partial: true });
    if (errors.length) {
      return Response.json({ error: errors.join(" ") }, { status: 400 });
    }

    // Last-admin guard: applies to role demotion AND deactivation, because
    // either one removes an admin from the active pool.
    const willLoseAdmin =
      existing.role === "admin" &&
      ((values.role !== undefined && values.role !== "admin") ||
        (values.status !== undefined && values.status !== "Active"));
    if (willLoseAdmin) {
      const [{ count }] = await sql`
        SELECT COUNT(*)::int AS count
        FROM users
        WHERE role = 'admin' AND status = 'Active'
      `;
      if (count <= 1) {
        return Response.json(
          {
            error:
              "Cannot demote or deactivate the last active admin. Promote another user first.",
          },
          { status: 409 }
        );
      }
    }

    if (values.email && values.email !== existing.email) {
      const [dup] = await sql`
        SELECT id FROM users WHERE email = ${values.email} AND id <> ${id}
      `;
      if (dup) {
        return Response.json(
          { error: "Email is already in use." },
          { status: 409 }
        );
      }
    }

    // Field-merge: `values` only contains fields explicitly present in
    // the request body, so anything missing falls back to existing.
    const next = { ...existing, ...values };
    await sql`
      UPDATE users SET
        name       = ${next.name},
        email      = ${next.email},
        role       = ${next.role},
        status     = ${next.status},
        department = ${next.department ?? null},
        phone      = ${next.phone ?? null},
        avatar_url = ${next.avatar_url ?? null},
        updated_at = NOW()
      WHERE id = ${id}
    `;

    const [user] = await sql.unsafe(
      `SELECT ${USER_PUBLIC_COLUMNS} FROM users u WHERE u.id = $1`,
      [id]
    );

    // High-signal activity entries for role and status pivots; one
    // generic "profile updated" line for anything else.
    if (values.role !== undefined && values.role !== existing.role) {
      await logActivity({
        icon: "shield",
        tone: "primary",
        message: `Role for ${user.name} changed to ${values.role}`,
        actor_id: auth.user.id,
        action: "role_change",
        entity_type: ENTITY_TYPES.USER,
        entity_id: id,
      });
    }
    if (values.status !== undefined && values.status !== existing.status) {
      await logActivity({
        icon: values.status === "Active" ? "user-check" : "user-x",
        tone: values.status === "Active" ? "primary" : "muted",
        message: `${user.name} ${values.status === "Active" ? "activated" : "deactivated"}`,
        actor_id: auth.user.id,
        action: values.status === "Active" ? "activate" : "deactivate",
        entity_type: ENTITY_TYPES.USER,
        entity_id: id,
      });
    }
    const profileFields = ["name", "email", "department", "phone", "avatar_url"];
    const profileChanged = profileFields.some(
      (k) => values[k] !== undefined && values[k] !== existing[k]
    );
    if (profileChanged) {
      await logActivity({
        icon: "user",
        tone: "muted",
        message: `${user.name}'s profile updated`,
        actor_id: auth.user.id,
        action: "update",
        entity_type: ENTITY_TYPES.USER,
        entity_id: id,
      });
    }

    return Response.json({ user });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("update user error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireRole(request, "admin");
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    if (id === auth.user.id) {
      return Response.json(
        { error: "You cannot delete yourself." },
        { status: 409 }
      );
    }
    const [existing] = await sql`SELECT id, name, role FROM users WHERE id = ${id}`;
    if (!existing) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    if (existing.role === "admin") {
      const [{ count }] = await sql`
        SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'
      `;
      if (count <= 1) {
        return Response.json(
          {
            error: "Cannot delete the last admin. Promote another user first.",
          },
          { status: 409 }
        );
      }
    }

    await sql`DELETE FROM users WHERE id = ${id}`;
    await logActivity({
      icon: "user-x",
      tone: "muted",
      message: `${existing.name} removed from the workspace`,
      actor_id: auth.user.id,
      action: "delete",
      entity_type: ENTITY_TYPES.USER,
      entity_id: id,
    });
    return Response.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("delete user error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
