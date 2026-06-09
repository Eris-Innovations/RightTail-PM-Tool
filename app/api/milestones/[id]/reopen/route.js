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
    const [existing] = await sql`
      SELECT m.id, m.title, m.status, p.name AS project_name
      FROM milestones m
      JOIN projects p ON p.id = m.project_id
      WHERE m.id = ${id}
    `;
    if (!existing) {
      return Response.json({ error: "Milestone not found." }, { status: 404 });
    }
    if (existing.status === "Pending") {
      return Response.json(
        { error: "Milestone is already pending." },
        { status: 409 }
      );
    }
    const [milestone] = await sql`
      UPDATE milestones SET
        status       = 'Pending',
        completed_at = NULL,
        updated_at   = NOW()
      WHERE id = ${id}
      RETURNING id, project_id, title, description,
                due_date::text AS due_date,
                status, completed_at, created_at, updated_at
    `;
    await logActivity({
      icon: "rotate-ccw",
      tone: "muted",
      message: `Milestone "${milestone.title}" reopened on project "${existing.project_name}"`,
      actor_id: auth.user.id,
      action: "reopen",
      entity_type: ENTITY_TYPES.MILESTONE,
      entity_id: id,
    });
    return Response.json({ milestone });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("reopen milestone error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
