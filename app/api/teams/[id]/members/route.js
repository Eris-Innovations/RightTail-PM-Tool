// POST /api/teams/:id/members — add a member (admin/manager).

import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await requireRole(request, "admin", "manager");
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.user_id ?? "").trim();
    if (!userId) {
      return Response.json({ error: "user_id is required." }, { status: 400 });
    }

    const [team] = await sql`SELECT id, name, leader_id FROM teams WHERE id = ${id}`;
    if (!team) {
      return Response.json({ error: "Team not found." }, { status: 404 });
    }
    const [user] = await sql`SELECT id, name FROM users WHERE id = ${userId}`;
    if (!user) {
      return Response.json({ error: "User does not exist." }, { status: 400 });
    }

    const [dup] = await sql`
      SELECT 1 FROM team_members WHERE team_id = ${id} AND user_id = ${userId}
    `;
    if (dup) {
      return Response.json(
        { error: `${user.name} is already on this team.` },
        { status: 409 }
      );
    }

    await sql`
      INSERT INTO team_members (team_id, user_id, added_by_id)
      VALUES (${id}, ${userId}, ${auth.user.id})
    `;
    await logActivity({
      icon: "user-plus",
      tone: "primary",
      message: `${user.name} joined team "${team.name}"`,
      actor_id: auth.user.id,
      action: "add_member",
      entity_type: ENTITY_TYPES.TEAM,
      entity_id: id,
    });
    return Response.json({ ok: true, user_id: userId }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("add team member error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
