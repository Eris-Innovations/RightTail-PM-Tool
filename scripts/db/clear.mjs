// Truncate every domain table without dropping the schema. Intended
// for resetting a dev / staging database back to "empty but valid".

import { sql } from "../../lib/db.js";

async function clear() {
  console.log(
    "Clearing all rows from notifications, comments, activity, tasks, projects, teams, users..."
  );
  // CASCADE handles dependent rows (task_assignments, team_members,
  // comment_versions/mentions, notification_preferences, ...).
  await sql`TRUNCATE TABLE notifications RESTART IDENTITY CASCADE`;
  await sql`TRUNCATE TABLE comments RESTART IDENTITY CASCADE`;
  await sql`TRUNCATE TABLE activity RESTART IDENTITY CASCADE`;
  await sql`TRUNCATE TABLE tasks CASCADE`;
  await sql`TRUNCATE TABLE milestones CASCADE`;
  await sql`TRUNCATE TABLE projects CASCADE`;
  await sql`TRUNCATE TABLE teams CASCADE`;
  await sql`TRUNCATE TABLE users CASCADE`;
  console.log("Database cleared. Schema preserved.");
}

clear()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Clear failed:", err);
    process.exit(1);
  });
