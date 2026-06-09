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
    if (existing.status === "Completed") {
      return Response.json(
        { error: "Milestone is already completed." },
        { status: 409 }
      );
    }
    const [milestone] = await sql`
      UPDATE milestones SET
        status       = 'Completed',
        completed_at = NOW(),
        updated_at   = NOW()
      WHERE id = ${id}
      RETURNING id, project_id, title, description,
                due_date::text AS due_date,
                status, completed_at, created_at, updated_at
    `;
    await logActivity({
      icon: "check-circle",
      tone: "success",
      message: `Milestone "${milestone.title}" completed on project "${existing.project_name}"`,
      actor_id: auth.user.id,
      action: "complete",
      entity_type: ENTITY_TYPES.MILESTONE,
      entity_id: id,
    });
    return Response.json({ milestone });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("complete milestone error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
