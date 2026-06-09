// PATCH /api/teams/:id/leader — promote a member to leader (or `null`
// to vacate). Admin/manager only.

import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { TEAM_LIST_COLUMNS } from "../../route";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = await requireRole(request, "admin", "manager");
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const body = await request.json().catch(() => ({}));
    const userId = body?.user_id == null ? null : String(body.user_id);

    const [team] = await sql`SELECT id, name, leader_id FROM teams WHERE id = ${id}`;
    if (!team) {
      return Response.json({ error: "Team not found." }, { status: 404 });
    }

    if (userId !== null) {
      // The new leader must already be a member.
      const [member] = await sql`
        SELECT user_id FROM team_members
        WHERE team_id = ${id} AND user_id = ${userId}
      `;
      if (!member) {
        return Response.json(
          {
            error:
              "Selected user must be a team member before being promoted to leader.",
          },
          { status: 409 }
        );
      }
    }

    await sql`
      UPDATE teams SET leader_id = ${userId}, updated_at = NOW() WHERE id = ${id}
    `;
    if (userId) {
      const [u] = await sql`SELECT name FROM users WHERE id = ${userId}`;
      await logActivity({
        icon: "crown",
        tone: "primary",
        message: `${u.name} is now leading "${team.name}"`,
        actor_id: auth.user.id,
        action: "leader_change",
        entity_type: ENTITY_TYPES.TEAM,
        entity_id: id,
      });
    } else {
      await logActivity({
        icon: "crown",
        tone: "muted",
        message: `Team "${team.name}" has no leader`,
        actor_id: auth.user.id,
        action: "leader_change",
        entity_type: ENTITY_TYPES.TEAM,
        entity_id: id,
      });
    }
    const [updated] = await sql.unsafe(
      `SELECT ${TEAM_LIST_COLUMNS} FROM teams t LEFT JOIN users l ON l.id = t.leader_id WHERE t.id = $1`,
      [id]
    );
    return Response.json({ team: updated });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("set leader error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
