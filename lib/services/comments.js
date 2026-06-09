import { sql } from "@/lib/db";
import { ENTITY_TYPES } from "@/lib/services/activityLog";

export const COMMENT_ENTITY_TYPES = new Set([
  ENTITY_TYPES.TASK,
  ENTITY_TYPES.PROJECT,
]);

export const MAX_COMMENT_LENGTH = 4000;

// Recipient list for a comment_added notification on the given entity:
// project owner + team members + active task assignees, depending on
// entity type. Always excludes the author (notify() does that, but we
// keep the query tight).
export async function commentSubscribers(entity_type, entity_id) {
  if (entity_type === ENTITY_TYPES.TASK) {
    const rows = await sql`
      SELECT DISTINCT user_id FROM (
        SELECT ta.user_id
          FROM task_assignments ta
          WHERE ta.task_id = ${entity_id} AND ta.unassigned_at IS NULL
        UNION
        SELECT p.owner_id AS user_id
          FROM tasks t JOIN projects p ON p.id = t.project_id
          WHERE t.id = ${entity_id}
      ) s WHERE s.user_id IS NOT NULL
    `;
    return rows.map((r) => r.user_id);
  }
  if (entity_type === ENTITY_TYPES.PROJECT) {
    const rows = await sql`
      SELECT DISTINCT user_id FROM (
        SELECT owner_id AS user_id FROM projects WHERE id = ${entity_id}
        UNION
        SELECT tm.user_id
          FROM projects p
          JOIN team_members tm ON tm.team_id = p.team_id
          WHERE p.id = ${entity_id}
        UNION
        SELECT ta.user_id
          FROM task_assignments ta
          JOIN tasks t ON t.id = ta.task_id
          WHERE t.project_id = ${entity_id} AND ta.unassigned_at IS NULL
      ) s WHERE s.user_id IS NOT NULL
    `;
    return rows.map((r) => r.user_id);
  }
  return [];
}

// Hides bodies of soft-deleted rows unless the requester is the author
// or an admin — the row itself stays visible so the history pane can
// show "[deleted by X]".
export function serializeComment(row, requesterId, requesterRole) {
  const canSeeBody =
    !row.deleted_at ||
    row.author_id === requesterId ||
    requesterRole === "admin";
  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    author_id: row.author_id,
    author_name: row.author_name ?? null,
    author_email: row.author_email ?? null,
    body: canSeeBody ? row.body : null,
    is_deleted: !!row.deleted_at,
    deleted_at: row.deleted_at,
    deleted_by_id: row.deleted_by_id,
    edited_at: row.edited_at,
    created_at: row.created_at,
    mentions: row.mentions ?? [],
  };
}

export async function loadCommentWithMentions(id) {
  const [row] = await sql`
    SELECT c.*, u.name AS author_name, u.email AS author_email
    FROM comments c
    LEFT JOIN users u ON u.id = c.author_id
    WHERE c.id = ${id}
  `;
  if (!row) return null;
  const mentions = await sql`
    SELECT cm.user_id, u.name, u.email
    FROM comment_mentions cm
    JOIN users u ON u.id = cm.user_id
    WHERE cm.comment_id = ${id}
  `;
  row.mentions = mentions;
  return row;
}
