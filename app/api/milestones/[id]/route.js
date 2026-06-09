// PATCH  /api/milestones/:id — partial update
// DELETE /api/milestones/:id — remove

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { validateMilestoneInput } from "@/lib/validators/milestones";

export const dynamic = "force-dynamic";

// Single-milestone helpers all need the project name for the activity
// log, so they share this lookup.
async function loadMilestoneWithProject(milestoneId) {
  const [row] = await sql`
    SELECT
      m.id, m.project_id, m.title, m.description,
      m.due_date::text AS due_date,
      m.status, m.completed_at, m.created_at, m.updated_at,
      p.name AS project_name, p.archived_at AS project_archived_at
    FROM milestones m
    JOIN projects p ON p.id = m.project_id
    WHERE m.id = ${milestoneId}
  `;
  return row || null;
}

export async function PATCH(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const existing = await loadMilestoneWithProject(id);
    if (!existing) {
      return Response.json({ error: "Milestone not found." }, { status: 404 });
    }
    if (existing.project_archived_at) {
      return Response.json(
        { error: "Cannot edit milestones on an archived project." },
        { status: 409 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { errors, values } = validateMilestoneInput(body ?? {}, "update");
    if (errors.length) {
      return Response.json({ error: errors[0], errors }, { status: 400 });
    }

    // If the user is flipping status via PATCH, keep completed_at in
    // sync so there's only one source of truth.
    let completedAt = existing.completed_at;
    if (values.status === "Completed" && existing.status !== "Completed") {
      completedAt = new Date();
    } else if (values.status === "Pending" && existing.status !== "Pending") {
      completedAt = null;
    }

    const next = { ...existing, ...values };

    const [milestone] = await sql`
      UPDATE milestones SET
        title        = ${next.title},
        description  = ${next.description ?? null},
        due_date     = ${next.due_date ?? null},
        status       = ${next.status},
        completed_at = ${completedAt},
        updated_at   = NOW()
      WHERE id = ${id}
      RETURNING id, project_id, title, description,
                due_date::text AS due_date,
                status, completed_at, created_at, updated_at
    `;

    await logActivity({
      icon: "pencil",
      tone: "warning",
      message: `Milestone "${milestone.title}" updated on project "${existing.project_name}"`,
      actor_id: auth.user.id,
      action: "update",
      entity_type: ENTITY_TYPES.MILESTONE,
      entity_id: id,
    });

    return Response.json({ milestone });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("update milestone error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const existing = await loadMilestoneWithProject(id);
    if (!existing) {
      return Response.json({ error: "Milestone not found." }, { status: 404 });
    }

    await sql`DELETE FROM milestones WHERE id = ${id}`;
    await logActivity({
      icon: "trash-2",
      tone: "muted",
      message: `Milestone "${existing.title}" removed from project "${existing.project_name}"`,
      actor_id: auth.user.id,
      action: "delete",
      entity_type: ENTITY_TYPES.MILESTONE,
      entity_id: id,
    });
    return Response.json({ ok: true, id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("delete milestone error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
