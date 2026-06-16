// GET  /api/projects   — filterable, summary-bearing list
// POST /api/projects   — create (admin/manager)

import { sql } from "@/lib/db";
import { requireUser } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { generateProjectId } from "@/lib/utils/ids";
import {
  PROJECT_STATUSES,
  PROJECT_PRIORITIES,
  validateProjectInput,
} from "@/lib/validators/projects";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  try {
    const sp = new URL(request.url).searchParams;
    const includeArchived = sp.get("include_archived") === "true";
    const onlyArchived = sp.get("only_archived") === "true";
    const status = sp.get("status")?.trim() || null;
    const priority = sp.get("priority")?.trim() || null;
    const ownerId = sp.get("owner_id")?.trim() || null;
    const teamId = sp.get("team_id")?.trim() || null;
    const startFrom = sp.get("start_from") || null;
    const endTo = sp.get("end_to") || null;
    const q = sp.get("q")?.trim() || null;

    if (status && !PROJECT_STATUSES.includes(status)) {
      return Response.json(
        { error: `Invalid status filter: ${status}.` },
        { status: 400 }
      );
    }
    if (priority && !PROJECT_PRIORITIES.includes(priority)) {
      return Response.json(
        { error: `Invalid priority filter: ${priority}.` },
        { status: 400 }
      );
    }

    const where = ["1=1"];
    const params = [];
    const push = (clause, value) => {
      params.push(value);
      where.push(clause.replace("$?", `$${params.length}`));
    };

    if (onlyArchived) {
      where.push("p.archived_at IS NOT NULL");
    } else if (!includeArchived) {
      where.push("p.archived_at IS NULL");
    }
    if (status) push("p.status = $?", status);
    if (priority) push("p.priority = $?", priority);
    if (ownerId) push("p.owner_id = $?", ownerId);
    if (teamId) push("p.team_id = $?", teamId);
    if (startFrom) push("(p.start_date IS NOT NULL AND p.start_date >= $?)", startFrom);
    if (endTo) push("(p.end_date IS NOT NULL AND p.end_date <= $?)", endTo);
    if (q) {
      const like = `%${q}%`;
      params.push(like, like, like, q, like);
      const i = params.length;
      where.push(
        `(p.name ILIKE $${i - 4}
           OR p.description ILIKE $${i - 3}
           OR p.id ILIKE $${i - 2}
           OR $${i - 1} = ANY(p.tags)
           OR p.category ILIKE $${i})`
      );
    }

    // Cast DATE columns to text so the wire format is a stable
    // YYYY-MM-DD string instead of an ISO timestamp that gets shifted
    // by the host's timezone when JSON.stringify converts the Date.
    const text = `
      SELECT
        p.id, p.name, p.description, p.status, p.priority, p.category, p.tags,
        p.start_date::text  AS start_date,
        p.end_date::text    AS end_date,
        p.owner_id, p.archived_at, p.team_id,
        p.created_at, p.updated_at,
        u.name AS owner_name,
        tm.name AS team_name,
        (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id)                       AS total_tasks,
        (SELECT COUNT(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'Done') AS done_tasks
      FROM projects p
      LEFT JOIN users u  ON u.id = p.owner_id
      LEFT JOIN teams tm ON tm.id = p.team_id
      WHERE ${where.join(" AND ")}
      ORDER BY p.archived_at NULLS FIRST, p.id
    `;
    const rows = await sql.unsafe(text, params);

    // Summaries always reflect the active set so the status chips on
    // the Projects screen don't double-count archived rows.
    const summary = await sql`
      SELECT status, COUNT(*)::int AS count
      FROM projects
      WHERE archived_at IS NULL
      GROUP BY status
    `;
    const prioritySummary = await sql`
      SELECT priority, COUNT(*)::int AS count
      FROM projects
      WHERE archived_at IS NULL
      GROUP BY priority
    `;
    const [{ archived: archivedCount }] = await sql`
      SELECT COUNT(*)::int AS archived FROM projects WHERE archived_at IS NOT NULL
    `;
    return Response.json({
      items: rows,
      summary,
      prioritySummary,
      archivedCount,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("list projects error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await request.json().catch(() => ({}));
    const { errors, values } = validateProjectInput(body ?? {}, "create");
    if (errors.length) {
      return Response.json(
        { error: errors[0], errors },
        { status: 400 }
      );
    }

    const ownerId = (values.owner_id || auth.user.id).trim();
    const [owner] = await sql`SELECT id FROM users WHERE id = ${ownerId}`;
    if (!owner) {
      return Response.json(
        { error: "Selected project owner does not exist." },
        { status: 400 }
      );
    }

    let teamId = values.team_id ?? null;
    if (teamId) {
      const [team] = await sql`SELECT id FROM teams WHERE id = ${teamId}`;
      if (!team) {
        return Response.json(
          { error: "Selected team does not exist." },
          { status: 400 }
        );
      }
    }

    const id = await generateProjectId();
    const tags = values.tags ?? [];

    const [project] = await sql`
      INSERT INTO projects (
        id, name, description, status, priority,
        category, tags, start_date, end_date, owner_id, team_id
      )
      VALUES (
        ${id},
        ${values.name},
        ${values.description ?? null},
        ${values.status},
        ${values.priority},
        ${values.category ?? null},
        ${tags},
        ${values.start_date ?? null},
        ${values.end_date ?? null},
        ${ownerId},
        ${teamId}
      )
      RETURNING id, name, description, status, priority, category, tags,
                start_date::text AS start_date,
                end_date::text   AS end_date,
                owner_id, team_id, created_at, updated_at
    `;

    await logActivity({
      icon: "folder-plus",
      tone: "primary",
      message: `Project "${values.name}" was created`,
      actor_id: auth.user.id,
      action: "create",
      entity_type: ENTITY_TYPES.PROJECT,
      entity_id: project.id,
    });

    return Response.json({ project }, { status: 201 });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("create project error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
