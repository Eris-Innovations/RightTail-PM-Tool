// DELETE /api/teams/:id/members/:userId — remove a member (admin/manager).
//
// Removing a member also strips them from the leader slot if they held
// it — otherwise the team would point at a leader who isn't on the
// roster.

import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";

export const dynamic = "force-dynamic";

export async function DELETE(request, { params }) {
  const auth = await requireRole(request, "admin", "manager");
  if (auth instanceof Response) return auth;
  const { id: idParam, userId: userIdParam } = await params;
  const id = String(idParam);
  const userId = String(userIdParam);

  try {
    const [team] = await sql`SELECT id, name, leader_id FROM teams WHERE id = ${id}`;
    if (!team) {
      return Response.json({ error: "Team not found." }, { status: 404 });
    }
    const [member] = await sql`
      SELECT user_id FROM team_members WHERE team_id = ${id} AND user_id = ${userId}
    `;
    if (!member) {
      return Response.json(
        { error: "User is not on this team." },
        { status: 404 }
      );
    }

    await sql`DELETE FROM team_members WHERE team_id = ${id} AND user_id = ${userId}`;
    if (team.leader_id === userId) {
      await sql`
        UPDATE teams SET leader_id = NULL, updated_at = NOW() WHERE id = ${id}
      `;
    }

    const [user] = await sql`SELECT name FROM users WHERE id = ${userId}`;
    await logActivity({
      icon: "user-minus",
      tone: "muted",
      message: `${user?.name ?? userId} left team "${team.name}"`,
      actor_id: auth.user.id,
      action: "remove_member",
      entity_type: ENTITY_TYPES.TEAM,
      entity_id: id,
    });
    return Response.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("remove team member error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
