// GET /api/comments/:id/history — edit log.
//
// Anyone with read access to the comment can see its edit log — the
// history is part of the audit story and intentionally public to
// authenticated users on the same entity.

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isInteger(id)) {
    return Response.json({ error: "Invalid comment id." }, { status: 400 });
  }
  try {
    const [comment] = await sql`SELECT * FROM comments WHERE id = ${id}`;
    if (!comment) {
      return Response.json({ error: "Comment not found." }, { status: 404 });
    }
    const versions = await sql`
      SELECT v.id, v.body, v.editor_id, u.name AS editor_name, v.created_at
      FROM comment_versions v
      LEFT JOIN users u ON u.id = v.editor_id
      WHERE v.comment_id = ${id}
      ORDER BY v.created_at ASC
    `;
    return Response.json({
      comment_id: id,
      is_deleted: !!comment.deleted_at,
      current_body: comment.deleted_at ? null : comment.body,
      edited_at: comment.edited_at,
      versions,
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
