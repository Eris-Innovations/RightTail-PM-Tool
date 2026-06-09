// POST /api/projects/:id/milestones — create a milestone (admin/manager)

import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { generateMilestoneId } from "@/lib/utils/ids";
import { validateMilestoneInput } from "@/lib/validators/milestones";

export const dynamic = "force-dynamic";

export async function POST(request, { params }) {
  const auth = await requireRole(request, "admin", "manager");
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const projectId = String(idParam);

  try {
    const [project] = await sql`
      SELECT id, name, archived_at FROM projects WHERE id = ${projectId}
    `;
    if (!project) {
      return Response.json({ error: "Project not found." }, { status: 404 });
    }
    if (project.archived_at) {
      return Response.json(
        { error: "Cannot add milestones to an archived project. Restore it first." },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { errors, values } = validateMilestoneInput(body ?? {}, "create");
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }
    const status = values.status ?? "Pending";
    const id = await generateMilestoneId();

    const [milestone] = await sql`
      INSERT INTO milestones (id, project_id, title, description, due_date, status, completed_at)
      VALUES (
        ${id},
        ${projectId},
        ${values.title},
        ${values.description ?? null},
        ${values.due_date ?? null},
        ${status},
        ${status === "Completed" ? new Date() : null}
      )
      RETURNING id, project_id, title, description,
                due_date::text AS due_date,
                status, completed_at, created_at, updated_at
    `;

    await logActivity({
      icon: "flag",
      tone: "primary",
      message: `Milestone "${values.title}" added to project "${project.name}"`,
      actor_id: auth.user.id,
      action: "create",
      entity_type: ENTITY_TYPES.MILESTONE,
      entity_id: milestone.id,
    });

    return Response.json({ milestone }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("create milestone error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
