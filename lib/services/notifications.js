import { sql } from "@/lib/db";
import { sendEmail } from "@/lib/services/mailer";
import { NOTIFICATION_TYPES as SHARED_TYPES } from "@/lib/shared/constants";

// Re-export so server callers can import everything they need from one place.
export const NOTIFICATION_TYPES = SHARED_TYPES;
const NOTIFICATION_TYPE_LIST = Object.values(NOTIFICATION_TYPES);

// Maps notification type → the preferences column that gates its email.
// Keeping this in one place means the schema can evolve without the
// call sites caring.
const NOTIFICATION_PREF_COLUMN = {
  task_assigned: "email_task_assigned",
  task_updated: "email_task_updated",
  task_completed: "email_task_completed",
  project_updated: "email_project_updated",
  deadline_reminder: "email_deadline_reminder",
  comment_added: "email_comment_added",
  comment_mention: "email_comment_mention",
};

// Default preferences — used both as the seed for a missing row and as
// the shape of the GET /api/notifications/preferences response.
export const DEFAULT_NOTIFICATION_PREFS = {
  email_enabled: true,
  email_task_assigned: true,
  email_task_updated: false,
  email_task_completed: false,
  email_project_updated: false,
  email_deadline_reminder: true,
  email_comment_added: false,
  email_comment_mention: true,
};

export async function getNotificationPreferences(userId) {
  const [row] = await sql`
    SELECT * FROM notification_preferences WHERE user_id = ${userId}
  `;
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(row ?? {}) };
}

/**
 * Create one or more notifications and (best-effort) email the recipients.
 *
 *   userIds       — array of recipient ids; falsy entries skipped, dupes
 *                   collapsed, `actor_id` is auto-excluded so users don't
 *                   get notified about their own actions.
 *   type          — one of NOTIFICATION_TYPES
 *   title, body   — what the user sees in the bell + email subject/body
 *   link          — optional deep-link the UI can navigate to on click
 *   entity_*      — same convention as activity log; lets the UI render
 *                   contextual chips and the dedupe index work
 *   actor_id      — who triggered the event (excluded from recipients)
 *   sendEmail     — when false, force-skip the email channel
 */
export async function notify({
  userIds,
  type,
  title,
  body = null,
  link = null,
  entity_type = null,
  entity_id = null,
  actor_id = null,
  sendEmail: sendEmailFlag = true,
}) {
  if (!NOTIFICATION_TYPE_LIST.includes(type)) {
    throw new Error(`Unknown notification type: ${type}`);
  }

  // Normalise recipients: drop nulls/dupes and the actor themselves.
  const recipients = [
    ...new Set(
      (userIds ?? [])
        .filter(Boolean)
        .map(String)
        .filter((u) => u !== actor_id)
    ),
  ];
  if (recipients.length === 0) return [];

  const created = [];
  for (const userId of recipients) {
    // Resolve email + preferences in parallel to keep per-recipient
    // overhead tolerable as the cohort grows.
    const [[user], prefs] = await Promise.all([
      sql`SELECT id, email, name FROM users WHERE id = ${userId}`,
      getNotificationPreferences(userId),
    ]);
    if (!user) continue;

    const wantEmail =
      sendEmailFlag &&
      prefs.email_enabled &&
      prefs[NOTIFICATION_PREF_COLUMN[type]];

    // Insert pending first so the row exists even if the mailer is
    // slow/down.
    let row;
    try {
      [row] = await sql`
        INSERT INTO notifications
          (user_id, type, title, body, link, entity_type, entity_id, actor_id,
           email_status)
        VALUES
          (${userId}, ${type}, ${title}, ${body}, ${link},
           ${entity_type}, ${entity_id}, ${actor_id},
           ${wantEmail ? "pending" : "disabled"})
        RETURNING id, user_id, type, title, body, link,
                  entity_type, entity_id, actor_id,
                  read_at, email_status, email_sent_at, created_at
      `;
    } catch (err) {
      // Idempotency-guard collisions (e.g. deadline runner re-invoked)
      // are expected — swallow them so the rest of the batch goes
      // through.
      if (/unique constraint/i.test(String(err?.message))) continue;
      throw err;
    }

    if (!wantEmail) {
      created.push(row);
      continue;
    }

    try {
      const subject = title;
      const emailBody = `${title}${body ? `\n\n${body}` : ""}${
        link ? `\n\nOpen: ${link}` : ""
      }`;
      const result = await sendEmail({
        to: user.email,
        subject,
        body: emailBody,
      });
      await sql`
        UPDATE notifications
        SET email_status = ${result.status === "sent" ? "sent" : "skipped"},
            email_sent_at = ${result.status === "sent" ? new Date() : null}
        WHERE id = ${row.id}
      `;
      row.email_status = result.status === "sent" ? "sent" : "skipped";
      row.email_sent_at = result.status === "sent" ? new Date() : null;
    } catch (err) {
      await sql`
        UPDATE notifications
        SET email_status = 'failed', email_error = ${String(err.message ?? err)}
        WHERE id = ${row.id}
      `;
      row.email_status = "failed";
    }
    created.push(row);
  }
  return created;
}
