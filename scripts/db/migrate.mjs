// Idempotent schema migrator.
//
// Each statement is wrapped in `IF NOT EXISTS` so re-runs are safe and
// the runner doubles as the first-time installer. Designed for
// Supabase / Neon / vanilla Postgres alike — the connection details
// live in `lib/db.js`.

import { sql } from "../../lib/db.js";

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
     id             TEXT PRIMARY KEY,
     name           TEXT NOT NULL,
     email          TEXT UNIQUE NOT NULL,
     role           TEXT NOT NULL DEFAULT 'member',
     password_hash  TEXT,
     last_login_at  TIMESTAMPTZ,
     created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`,
  // User Management — profile + contact + lifecycle fields. status
  // defaults to 'Active' so existing rows remain usable without a
  // backfill.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'Active'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS department  TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone       TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url  TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `CREATE INDEX IF NOT EXISTS idx_users_status ON users (status)`,
  `CREATE TABLE IF NOT EXISTS projects (
     id          TEXT PRIMARY KEY,
     name        TEXT NOT NULL,
     description TEXT,
     status      TEXT NOT NULL DEFAULT 'Planning',
     start_date  DATE,
     end_date    DATE,
     owner_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS priority    TEXT NOT NULL DEFAULT 'Medium'`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS category    TEXT`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS tags        TEXT[] NOT NULL DEFAULT '{}'::TEXT[]`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `CREATE TABLE IF NOT EXISTS teams (
     id          TEXT PRIMARY KEY,
     name        TEXT NOT NULL,
     description TEXT,
     leader_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_name ON teams (LOWER(name))`,
  `CREATE INDEX IF NOT EXISTS idx_teams_leader ON teams (leader_id)`,
  `CREATE TABLE IF NOT EXISTS team_members (
     team_id     TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
     user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     added_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
     PRIMARY KEY (team_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members (user_id)`,
  // Optional association: a project may live under exactly one team
  // (or none).
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES teams(id) ON DELETE SET NULL`,
  `CREATE INDEX IF NOT EXISTS idx_projects_team ON projects (team_id)`,
  `CREATE TABLE IF NOT EXISTS tasks (
     id           TEXT PRIMARY KEY,
     project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
     title        TEXT NOT NULL,
     status       TEXT NOT NULL DEFAULT 'To Do',
     priority     TEXT NOT NULL DEFAULT 'Medium',
     due_date     DATE,
     assignee_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
     assigner_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description     TEXT`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(6,2)`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS actual_hours    NUMERIC(6,2)`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS tags            TEXT[] NOT NULL DEFAULT '{}'::TEXT[]`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at    TIMESTAMPTZ`,
  `CREATE TABLE IF NOT EXISTS task_assignments (
     id                BIGSERIAL PRIMARY KEY,
     task_id           TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     assigned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     assigned_by_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
     unassigned_at     TIMESTAMPTZ,
     unassigned_by_id  TEXT REFERENCES users(id) ON DELETE SET NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON task_assignments (task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_task_assignments_user ON task_assignments (user_id)`,
  // Partial unique index — at most one OPEN assignment per (task,user).
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_task_assignments_active
     ON task_assignments (task_id, user_id)
     WHERE unassigned_at IS NULL`,
  // Idempotent back-fill: any task with a current assignee that lacks
  // an open audit row gets one. Safe to re-run because of the
  // WHERE NOT EXISTS.
  `INSERT INTO task_assignments (task_id, user_id, assigned_at, assigned_by_id)
   SELECT t.id, t.assignee_id, t.created_at, t.assigner_id
   FROM tasks t
   WHERE t.assignee_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM task_assignments ta
       WHERE ta.task_id = t.id
         AND ta.user_id = t.assignee_id
         AND ta.unassigned_at IS NULL
     )`,
  `CREATE TABLE IF NOT EXISTS activity (
     id          BIGSERIAL PRIMARY KEY,
     icon        TEXT NOT NULL DEFAULT 'activity',
     tone        TEXT NOT NULL DEFAULT 'primary',
     message     TEXT NOT NULL,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE TABLE IF NOT EXISTS milestones (
     id            TEXT PRIMARY KEY,
     project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     title         TEXT NOT NULL,
     description   TEXT,
     due_date      DATE,
     status        TEXT NOT NULL DEFAULT 'Pending',
     completed_at  TIMESTAMPTZ,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_milestones_project ON milestones (project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_milestones_status  ON milestones (status)`,
  `CREATE INDEX IF NOT EXISTS idx_milestones_due     ON milestones (due_date)`,
  // Legacy password-reset table kept around for older deployments —
  // Supabase Auth now owns the reset flow, but dropping the table
  // would be a destructive migration.
  `CREATE TABLE IF NOT EXISTS password_resets (
     token_hash   TEXT PRIMARY KEY,
     user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at   TIMESTAMPTZ NOT NULL,
     used_at      TIMESTAMPTZ,
     created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets (user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_password_resets_exp  ON password_resets (expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_project   ON tasks (project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_assignee  ON tasks (assignee_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_status    ON tasks (status)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_priority  ON tasks (priority)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_due       ON tasks (due_date)`,
  `CREATE INDEX IF NOT EXISTS idx_projects_status   ON projects (status)`,
  `CREATE INDEX IF NOT EXISTS idx_projects_priority ON projects (priority)`,
  `CREATE INDEX IF NOT EXISTS idx_projects_owner    ON projects (owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_projects_archived ON projects (archived_at)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_time     ON activity (created_at DESC)`,
  // Activity Logs: structured audit fields so the UI can filter and
  // the data can be re-rendered later.
  `ALTER TABLE activity ADD COLUMN IF NOT EXISTS actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL`,
  `ALTER TABLE activity ADD COLUMN IF NOT EXISTS action      TEXT`,
  `ALTER TABLE activity ADD COLUMN IF NOT EXISTS entity_type TEXT`,
  `ALTER TABLE activity ADD COLUMN IF NOT EXISTS entity_id   TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_activity_actor       ON activity (actor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_entity      ON activity (entity_type, entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_activity_entity_type ON activity (entity_type)`,
  // Notifications: one row per (recipient, event). The type drives
  // both the in-app badge category and the email template;
  // `email_status` captures delivery state so a UI can surface failures
  // and a worker can retry.
  `CREATE TABLE IF NOT EXISTS notifications (
     id            BIGSERIAL PRIMARY KEY,
     user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     type          TEXT NOT NULL,
     title         TEXT NOT NULL,
     body          TEXT,
     link          TEXT,
     entity_type   TEXT,
     entity_id     TEXT,
     actor_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
     read_at       TIMESTAMPTZ,
     email_status  TEXT NOT NULL DEFAULT 'pending',
     email_sent_at TIMESTAMPTZ,
     email_error   TEXT,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, read_at)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user_time   ON notifications (user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_entity      ON notifications (entity_type, entity_id)`,
  // Idempotency guard for the daily deadline-reminder runner: at most
  // one deadline reminder per (user, task) per UTC day.
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_deadline_dedupe
     ON notifications (user_id, entity_id, (DATE(created_at AT TIME ZONE 'UTC')))
     WHERE type = 'deadline_reminder'`,
  // Per-user delivery preferences. The in-app stream is always on;
  // only the email channel is opt-out-per-type. A missing row means
  // "use the defaults".
  `CREATE TABLE IF NOT EXISTS notification_preferences (
     user_id                   TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     email_enabled             BOOLEAN NOT NULL DEFAULT TRUE,
     email_task_assigned       BOOLEAN NOT NULL DEFAULT TRUE,
     email_task_updated        BOOLEAN NOT NULL DEFAULT FALSE,
     email_task_completed      BOOLEAN NOT NULL DEFAULT FALSE,
     email_project_updated     BOOLEAN NOT NULL DEFAULT FALSE,
     email_deadline_reminder   BOOLEAN NOT NULL DEFAULT TRUE,
     email_comment_added       BOOLEAN NOT NULL DEFAULT FALSE,
     email_comment_mention     BOOLEAN NOT NULL DEFAULT TRUE,
     updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `ALTER TABLE notification_preferences
     ADD COLUMN IF NOT EXISTS email_comment_added   BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE notification_preferences
     ADD COLUMN IF NOT EXISTS email_comment_mention BOOLEAN NOT NULL DEFAULT TRUE`,
  // Comments. Generic over (entity_type, entity_id) so threads can
  // hang off any future entity without another schema change.
  `CREATE TABLE IF NOT EXISTS comments (
     id            BIGSERIAL PRIMARY KEY,
     entity_type   TEXT NOT NULL,
     entity_id     TEXT NOT NULL,
     author_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
     body          TEXT NOT NULL,
     edited_at     TIMESTAMPTZ,
     deleted_at    TIMESTAMPTZ,
     deleted_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
     created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_comments_entity   ON comments (entity_type, entity_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_author   ON comments (author_id)`,
  // Append-only revision log: every edit snapshots the *previous*
  // body so we can rebuild the history pane without row-level audit.
  `CREATE TABLE IF NOT EXISTS comment_versions (
     id          BIGSERIAL PRIMARY KEY,
     comment_id  BIGINT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
     body        TEXT NOT NULL,
     editor_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_comment_versions_comment ON comment_versions (comment_id, created_at)`,
  // Mentions are first-class so the UI can render highlighted chips
  // and the notification fan-out is a simple JOIN.
  `CREATE TABLE IF NOT EXISTS comment_mentions (
     comment_id BIGINT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
     user_id    TEXT  NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
     created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
     PRIMARY KEY (comment_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_comment_mentions_user ON comment_mentions (user_id)`,
  // Supabase Auth integration. The TEXT id (USR-001, …) stays put so
  // every FK across projects/tasks/teams remains intact. We add a
  // UUID column linking to auth.users(id) — the row Supabase creates
  // on signup. The JOIN happens in requireUser: verified JWT →
  // auth_user_id → our users row.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_user_id
     ON users (auth_user_id) WHERE auth_user_id IS NOT NULL`,
];

async function migrate() {
  console.log("Running migrations...");
  for (const stmt of statements) {
    // `sql.unsafe` is the porsager/postgres escape hatch for raw,
    // pre-built SQL strings — the only way to run statements that
    // don't come from a tagged template.
    await sql.unsafe(stmt);
  }
  console.log("Migrations complete.");
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
