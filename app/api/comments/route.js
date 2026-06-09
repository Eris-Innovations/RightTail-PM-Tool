// GET  /api/comments?entity_type=&entity_id= — list
// POST /api/comments                          — create
//
// Comments are generic over (entity_type, entity_id) — only "task" and
// "project" are wired today, but the schema and helpers don't care.
// Soft-delete is used so admins/authors can see "[deleted]"
// placeholders in the history pane.

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { notify, NOTIFICATION_TYPES } from "@/lib/services/notifications";
import { parseMentionHandles, resolveMentions } from "@/lib/services/mentions";
import {
  COMMENT_ENTITY_TYPES,
  MAX_COMMENT_LENGTH,
  commentSubscribers,
  serializeComment,
  loadCommentWithMentions,
} from "@/lib/services/comments";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  try {
    const sp = new URL(request.url).searchParams;
    const entity_type = (sp.get("entity_type") ?? "").trim();
    const entity_id = (sp.get("entity_id") ?? "").trim();
    const includeDeleted = sp.get("include_deleted") === "true";
    if (!COMMENT_ENTITY_TYPES.has(entity_type)) {
      return Response.json(
        { error: "entity_type must be 'task' or 'project'." },
        { status: 400 }
      );
    }
    if (!entity_id) {
      return Response.json(
        { error: "entity_id is required." },
        { status: 400 }
      );
    }
    // The deleted_at filter is split into two queries because using a
    // parameter alongside tagged-template SQL is awkward.
    const rows = includeDeleted
      ? await sql`
          SELECT c.*, u.name AS author_name, u.email AS author_email
          FROM comments c
          LEFT JOIN users u ON u.id = c.author_id
          WHERE c.entity_type = ${entity_type} AND c.entity_id = ${entity_id}
          ORDER BY c.created_at ASC
        `
      : await sql`
          SELECT c.*, u.name AS author_name, u.email AS author_email
          FROM comments c
          LEFT JOIN users u ON u.id = c.author_id
          WHERE c.entity_type = ${entity_type}
            AND c.entity_id = ${entity_id}
            AND c.deleted_at IS NULL
          ORDER BY c.created_at ASC
        `;
    // One query for all mentions instead of N+1.
    const ids = rows.map((r) => r.id);
    const mentionsByComment = new Map();
    if (ids.length > 0) {
      const mentions = await sql`
        SELECT cm.comment_id, cm.user_id, u.name, u.email
        FROM comment_mentions cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.comment_id = ANY(${ids})
      `;
      for (const m of mentions) {
        if (!mentionsByComment.has(m.comment_id)) {
          mentionsByComment.set(m.comment_id, []);
        }
        mentionsByComment.get(m.comment_id).push({
          user_id: m.user_id,
          name: m.name,
          email: m.email,
        });
      }
    }
    const items = rows.map((r) =>
      serializeComment(
        { ...r, mentions: mentionsByComment.get(r.id) ?? [] },
        auth.user.id,
        auth.user.role
      )
    );
    return Response.json({ items });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("list comments error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const entity_type = String(body?.entity_type ?? "").trim();
    const entity_id = String(body?.entity_id ?? "").trim();
    const text = String(body?.body ?? "").trim();
    if (!COMMENT_ENTITY_TYPES.has(entity_type)) {
      return Response.json(
        { error: "entity_type must be 'task' or 'project'." },
        { status: 400 }
      );
    }
    if (!entity_id) {
      return Response.json(
        { error: "entity_id is required." },
        { status: 400 }
      );
    }
    if (text.length === 0) {
      return Response.json(
        { error: "Comment body cannot be empty." },
        { status: 400 }
      );
    }
    if (text.length > MAX_COMMENT_LENGTH) {
      return Response.json(
        { error: `Comment too long (max ${MAX_COMMENT_LENGTH}).` },
        { status: 400 }
      );
    }

    // Verify the entity exists — friendlier than a dangling FK at
    // write time.
    if (entity_type === ENTITY_TYPES.TASK) {
      const [t] = await sql`SELECT id, project_id, title FROM tasks WHERE id = ${entity_id}`;
      if (!t) return Response.json({ error: "Task not found." }, { status: 404 });
    } else {
      const [p] = await sql`SELECT id, name FROM projects WHERE id = ${entity_id}`;
      if (!p) return Response.json({ error: "Project not found." }, { status: 404 });
    }

    const [created] = await sql`
      INSERT INTO comments (entity_type, entity_id, author_id, body)
      VALUES (${entity_type}, ${entity_id}, ${auth.user.id}, ${text})
      RETURNING id
    `;

    const mentionIds = await resolveMentions(parseMentionHandles(text));
    if (mentionIds.length > 0) {
      for (const userId of mentionIds) {
        await sql`
          INSERT INTO comment_mentions (comment_id, user_id)
          VALUES (${created.id}, ${userId})
          ON CONFLICT DO NOTHING
        `;
      }
    }

    await logActivity({
      icon: "message-circle",
      tone: "primary",
      message: `${auth.user.name ?? auth.user.email} commented on ${entity_type} ${entity_id}`,
      actor_id: auth.user.id,
      action: "comment",
      entity_type,
      entity_id,
    });

    // Notifications: mentions get a high-signal direct ping. Everyone
    // else subscribed to the entity gets a low-signal "new comment" —
    // minus the author and minus anyone already in the mention bucket
    // so they don't get two notifications for the same event.
    const entityTitle =
      entity_type === ENTITY_TYPES.TASK
        ? (await sql`SELECT title FROM tasks WHERE id = ${entity_id}`)[0]?.title
        : (await sql`SELECT name FROM projects WHERE id = ${entity_id}`)[0]?.name;
    const link =
      entity_type === ENTITY_TYPES.TASK
        ? `/tasks?id=${entity_id}`
        : `/projects?id=${entity_id}`;
    const preview = text.length > 160 ? `${text.slice(0, 157)}…` : text;

    if (mentionIds.length > 0) {
      await notify({
        userIds: mentionIds,
        type: NOTIFICATION_TYPES.COMMENT_MENTION,
        title: `${auth.user.name ?? auth.user.email} mentioned you`,
        body: `${entity_type === "task" ? "Task" : "Project"} "${entityTitle ?? entity_id}": ${preview}`,
        link,
        entity_type,
        entity_id,
        actor_id: auth.user.id,
      });
    }
    const subscribers = await commentSubscribers(entity_type, entity_id);
    const remaining = subscribers.filter((u) => !mentionIds.includes(u));
    if (remaining.length > 0) {
      await notify({
        userIds: remaining,
        type: NOTIFICATION_TYPES.COMMENT_ADDED,
        title: `New comment on "${entityTitle ?? entity_id}"`,
        body: `${auth.user.name ?? auth.user.email}: ${preview}`,
        link,
        entity_type,
        entity_id,
        actor_id: auth.user.id,
      });
    }

    const full = await loadCommentWithMentions(created.id);
    return Response.json(
      { comment: serializeComment(full, auth.user.id, auth.user.role) },
      { status: 201 }
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("create comment error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
