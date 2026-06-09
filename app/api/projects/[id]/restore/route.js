import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const [existing] = await sql`
      SELECT id, name, archived_at FROM projects WHERE id = ${id}
    `;
    if (!existing) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    if (!existing.archived_at) {
      return Response.json(
        { error: "Project is not archived." },
        { status: 409 }
      );
    }
    const [updated] = await sql`
      UPDATE projects SET archived_at = NULL, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, archived_at
    `;
    await logActivity({
      icon: "archive-restore",
      tone: "primary",
      message: `Project "${existing.name}" was restored`,
      actor_id: auth.user.id,
      action: "restore",
      entity_type: ENTITY_TYPES.PROJECT,
      entity_id: id,
    });
    return Response.json({ project: updated });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("restore project error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
