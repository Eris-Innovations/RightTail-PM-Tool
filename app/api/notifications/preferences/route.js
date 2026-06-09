// GET   /api/notifications/preferences — read current user's prefs (with
//                                          defaults filled in)
// PATCH /api/notifications/preferences — partial update; unknown keys
//                                          dropped silently for forward
//                                          compatibility.

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";
import {
  DEFAULT_NOTIFICATION_PREFS,
  getNotificationPreferences,
} from "@/lib/services/notifications";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  try {
    const prefs = await getNotificationPreferences(auth.user.id);
    return Response.json({ preferences: prefs });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  try {
    const body = (await request.json().catch(() => ({}))) ?? {};
    const allowed = Object.keys(DEFAULT_NOTIFICATION_PREFS);
    const updates = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = Boolean(body[key]);
    }
    if (Object.keys(updates).length === 0) {
      return Response.json(
        { error: "No preference fields supplied." },
        { status: 400 }
      );
    }
    const existing = await getNotificationPreferences(auth.user.id);
    const next = { ...existing, ...updates };
    await sql`
      INSERT INTO notification_preferences (
        user_id, email_enabled,
        email_task_assigned, email_task_updated, email_task_completed,
        email_project_updated, email_deadline_reminder,
        email_comment_added, email_comment_mention,
        updated_at
      ) VALUES (
        ${auth.user.id}, ${next.email_enabled},
        ${next.email_task_assigned}, ${next.email_task_updated}, ${next.email_task_completed},
        ${next.email_project_updated}, ${next.email_deadline_reminder},
        ${next.email_comment_added}, ${next.email_comment_mention},
        NOW()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        email_enabled            = EXCLUDED.email_enabled,
        email_task_assigned      = EXCLUDED.email_task_assigned,
        email_task_updated       = EXCLUDED.email_task_updated,
        email_task_completed     = EXCLUDED.email_task_completed,
        email_project_updated    = EXCLUDED.email_project_updated,
        email_deadline_reminder  = EXCLUDED.email_deadline_reminder,
        email_comment_added      = EXCLUDED.email_comment_added,
        email_comment_mention    = EXCLUDED.email_comment_mention,
        updated_at               = NOW()
    `;
    return Response.json({ preferences: next });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("update preferences error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
