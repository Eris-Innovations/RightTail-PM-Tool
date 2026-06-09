// POST /api/notifications/run-deadline-reminders?days=N
//
// Designed to be called by an external scheduler (Vercel Cron, GitHub
// Actions, k8s CronJob, etc.) once a day. Sends one DEADLINE_REMINDER
// per (task, active assignee) where the task isn't Done and the due
// date is within `?days=N` (default 3). The partial-unique index on
// the notifications table makes re-invoking on the same day a no-op
// for already-notified pairs.
//
// Admin/manager only — operational tool, not a user-facing action.

import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth/requireUser";
import { notify, NOTIFICATION_TYPES } from "@/lib/services/notifications";
import { ENTITY_TYPES } from "@/lib/services/activityLog";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Bumped from the default to allow batches.

export async function POST(request) {
  const auth = await requireRole(request, "admin", "manager");
  if (auth instanceof Response) return auth;

  try {
    const sp = new URL(request.url).searchParams;
    const horizonDays = Math.max(
      1,
      Math.min(30, Number(sp.get("days")) || 3)
    );
    const rows = await sql`
      SELECT
        t.id, t.title, t.due_date::text AS due_date, t.project_id,
        p.name AS project_name,
        ta.user_id
      FROM tasks t
      JOIN task_assignments ta
        ON ta.task_id = t.id AND ta.unassigned_at IS NULL
      JOIN projects p ON p.id = t.project_id
      WHERE t.status <> 'Done'
        AND t.due_date IS NOT NULL
        AND t.due_date >= CURRENT_DATE
        AND t.due_date <= CURRENT_DATE + (${horizonDays} || ' days')::interval
        AND p.archived_at IS NULL
    `;
    let created = 0;
    let skipped = 0;
    for (const r of rows) {
      const result = await notify({
        userIds: [r.user_id],
        type: NOTIFICATION_TYPES.DEADLINE_REMINDER,
        title: `"${r.title}" is due on ${r.due_date}`,
        body: `Project: ${r.project_name}`,
        link: `/tasks?id=${r.id}`,
        entity_type: ENTITY_TYPES.TASK,
        entity_id: r.id,
        actor_id: null,
      });
      if (result.length > 0) created += result.length;
      else skipped += 1;
    }
    return Response.json({
      ok: true,
      horizon_days: horizonDays,
      scanned: rows.length,
      created,
      skipped,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("deadline runner error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
