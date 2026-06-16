// PATCH  /api/comments/:id — edit (any signed-in user)
// DELETE /api/comments/:id — soft-delete (any signed-in user)

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { notify, NOTIFICATION_TYPES } from "@/lib/services/notifications";
import { parseMentionHandles, resolveMentions } from "@/lib/services/mentions";
import {
  MAX_COMMENT_LENGTH,
  serializeComment,
  loadCommentWithMentions,
} from "@/lib/services/comments";

export const dynamic = "force-dynamic";

export async function PATCH(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "Invalid comment id." }, { status: 400 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const nextBody = String(body?.body ?? "").trim();
    if (nextBody.length === 0) {
      return Response.json(
        { error: "Comment body cannot be empty." },
        { status: 400 }
      );
    }
    if (nextBody.length > MAX_COMMENT_LENGTH) {
      return Response.json(
        { error: `Comment too long (max ${MAX_COMMENT_LENGTH}).` },
        { status: 400 }
      );
    }
    const [existing] = await sql`SELECT * FROM comments WHERE id = ${id}`;
    if (!existing) {
      return Response.json({ error: "Comment not found." }, { status: 404 });
    }
    if (existing.deleted_at) {
      return Response.json(
        { error: "Cannot edit a deleted comment." },
        { status: 409 }
      );
    }
    if (existing.body === nextBody) {
      const full = await loadCommentWithMentions(id);
      return Response.json({
        comment: serializeComment(full, auth.user.id, auth.user.role),
        changed: false,
      });
    }

    // Snapshot the previous body, update the live row, and recompute
    // mentions so newly-added @handles still notify.
    await sql`
      INSERT INTO comment_versions (comment_id, body, editor_id)
      VALUES (${id}, ${existing.body}, ${auth.user.id})
    `;
    await sql`
      UPDATE comments
      SET body = ${nextBody}, edited_at = NOW()
      WHERE id = ${id}
    `;
    const previousMentions = await sql`
      SELECT user_id FROM comment_mentions WHERE comment_id = ${id}
    `;
    const previousSet = new Set(previousMentions.map((r) => r.user_id));
    await sql`DELETE FROM comment_mentions WHERE comment_id = ${id}`;
    const newMentionIds = await resolveMentions(parseMentionHandles(nextBody));
    for (const userId of newMentionIds) {
      await sql`
        INSERT INTO comment_mentions (comment_id, user_id)
        VALUES (${id}, ${userId})
        ON CONFLICT DO NOTHING
      `;
    }

    await logActivity({
      icon: "pencil",
      tone: "warning",
      message: `${auth.user.name ?? auth.user.email} edited a comment on ${existing.entity_type} ${existing.entity_id}`,
      actor_id: auth.user.id,
      action: "comment_edit",
      entity_type: existing.entity_type,
      entity_id: existing.entity_id,
    });

    // Only ping newly-introduced mentions — re-pinging existing ones
    // on every edit would be noisy.
    const freshlyMentioned = newMentionIds.filter((u) => !previousSet.has(u));
    if (freshlyMentioned.length > 0) {
      const entityTitle =
        existing.entity_type === ENTITY_TYPES.TASK
          ? (await sql`SELECT title FROM tasks WHERE id = ${existing.entity_id}`)[0]?.title
          : (await sql`SELECT name FROM projects WHERE id = ${existing.entity_id}`)[0]?.name;
      const preview =
        nextBody.length > 160 ? `${nextBody.slice(0, 157)}…` : nextBody;
      await notify({
        userIds: freshlyMentioned,
        type: NOTIFICATION_TYPES.COMMENT_MENTION,
        title: `${auth.user.name ?? auth.user.email} mentioned you`,
        body: `${existing.entity_type === "task" ? "Task" : "Project"} "${entityTitle ?? existing.entity_id}": ${preview}`,
        link:
          existing.entity_type === ENTITY_TYPES.TASK
            ? `/tasks?id=${existing.entity_id}`
            : `/projects?id=${existing.entity_id}`,
        entity_type: existing.entity_type,
        entity_id: existing.entity_id,
        actor_id: auth.user.id,
      });
    }

    const full = await loadCommentWithMentions(id);
    return Response.json({
      comment: serializeComment(full, auth.user.id, auth.user.role),
      changed: true,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("edit comment error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "Invalid comment id." }, { status: 400 });
  }

  try {
    const [existing] = await sql`SELECT * FROM comments WHERE id = ${id}`;
    if (!existing) {
      return Response.json({ error: "Comment not found." }, { status: 404 });
    }
    if (existing.deleted_at) {
      return Response.json(
        { error: "Comment is already deleted." },
        { status: 409 }
      );
    }
    await sql`
      UPDATE comments
      SET deleted_at = NOW(), deleted_by_id = ${auth.user.id}
      WHERE id = ${id}
    `;
    await logActivity({
      icon: "trash-2",
      tone: "danger",
      message: `${auth.user.name ?? auth.user.email} deleted a comment on ${existing.entity_type} ${existing.entity_id}`,
      actor_id: auth.user.id,
      action: "comment_delete",
      entity_type: existing.entity_type,
      entity_id: existing.entity_id,
    });
    return Response.json({ ok: true, id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("delete comment error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
