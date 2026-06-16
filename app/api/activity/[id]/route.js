// DELETE /api/activity/:id — remove an activity log entry.
//
// Open to any signed-in user (matches the rest of the workspace's
// member-can-do-everything model). We still record a meta-entry so a
// future audit can see who scrubbed what.

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";

export const dynamic = "force-dynamic";

export async function DELETE(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const [existing] = await sql`
      SELECT id, message FROM activity WHERE id = ${id}
    `;
    if (!existing) {
      return Response.json({ error: "Activity entry not found." }, { status: 404 });
    }

    await sql`DELETE FROM activity WHERE id = ${id}`;

    // Leave a breadcrumb so the audit trail stays meaningful even when
    // entries get removed. The new row references the original id so
    // a deletion can be cross-referenced if needed.
    await logActivity({
      icon: "trash-2",
      tone: "muted",
      message: `Activity entry #${id} was removed`,
      actor_id: auth.user.id,
      action: "delete",
      entity_type: ENTITY_TYPES.ACTIVITY,
      entity_id: id,
    });

    return Response.json({ ok: true, id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("delete activity error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
