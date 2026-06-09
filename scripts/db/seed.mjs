// Demo seed — drops in a small but representative dataset (users,
// projects, tasks, activity) so the UI looks alive immediately after
// running `npm run db:seed:demo`.

import { sql } from "../../lib/db.js";

const users = [
  { id: "USR-001", name: "Admin User", email: "admin@hub.com", role: "admin" },
  { id: "USR-002", name: "Jane Smith", email: "jane@hub.com", role: "manager" },
  { id: "USR-003", name: "Mark Lee", email: "mark@hub.com", role: "member" },
  { id: "USR-004", name: "Alex Turner", email: "alex@hub.com", role: "member" },
  { id: "USR-005", name: "Sara Kim", email: "sara@hub.com", role: "member" },
];

const projects = [
  {
    id: "PRJ-001",
    name: "Website Redesign",
    description: "Full redesign of the corporate website",
    status: "In Progress",
    start_date: "2024-01-10",
    end_date: "2024-04-30",
    owner_id: "USR-001",
  },
  {
    id: "PRJ-002",
    name: "Mobile App v2",
    description: "Second version of the customer-facing mobile app",
    status: "Planning",
    start_date: "2024-02-01",
    end_date: "2024-07-15",
    owner_id: "USR-002",
  },
  {
    id: "PRJ-003",
    name: "API Integration",
    description: "Integrate third-party payment and analytics APIs",
    status: "Completed",
    start_date: "2023-11-01",
    end_date: "2024-02-28",
    owner_id: "USR-001",
  },
  {
    id: "PRJ-004",
    name: "CRM Migration",
    description: "Migrate legacy CRM data to the new platform",
    status: "On Hold",
    start_date: "2024-03-01",
    end_date: "2024-06-30",
    owner_id: "USR-003",
  },
  {
    id: "PRJ-005",
    name: "Analytics Dashboard",
    description: "Internal BI dashboard for the ops team",
    status: "In Progress",
    start_date: "2024-01-20",
    end_date: "2024-05-10",
    owner_id: "USR-002",
  },
  {
    id: "PRJ-006",
    name: "Security Audit",
    description: "Annual security review and vulnerability fixes",
    status: "Planning",
    start_date: "2024-03-15",
    end_date: "2024-04-15",
    owner_id: "USR-001",
  },
  {
    id: "PRJ-007",
    name: "Legacy Portal Sunset",
    description: "Decommission and archive old customer portal",
    status: "Completed",
    start_date: "2023-09-01",
    end_date: "2024-01-31",
    owner_id: "USR-003",
  },
];

const tasks = [
  {
    id: "ASN-001",
    project_id: "PRJ-001",
    title: "Design homepage mockup",
    status: "In Progress",
    priority: "High",
    due_date: "2024-05-01",
    assignee_id: "USR-002",
    assigner_id: "USR-001",
  },
  {
    id: "ASN-002",
    project_id: "PRJ-002",
    title: "Write unit tests",
    status: "To Do",
    priority: "Medium",
    due_date: "2024-05-10",
    assignee_id: "USR-004",
    assigner_id: "USR-002",
  },
  {
    id: "ASN-003",
    project_id: "PRJ-003",
    title: "Set up CI/CD pipeline",
    status: "Done",
    priority: "High",
    due_date: "2024-04-15",
    assignee_id: "USR-003",
    assigner_id: "USR-001",
  },
  {
    id: "ASN-004",
    project_id: "PRJ-004",
    title: "Migrate user data",
    status: "To Do",
    priority: "High",
    due_date: "2024-06-01",
    assignee_id: "USR-005",
    assigner_id: "USR-003",
  },
  {
    id: "ASN-005",
    project_id: "PRJ-005",
    title: "Build chart components",
    status: "In Progress",
    priority: "Medium",
    due_date: "2024-05-20",
    assignee_id: "USR-002",
    assigner_id: "USR-001",
  },
  {
    id: "ASN-006",
    project_id: "PRJ-006",
    title: "Run penetration tests",
    status: "To Do",
    priority: "High",
    due_date: "2024-04-20",
    assignee_id: "USR-004",
    assigner_id: "USR-001",
  },
  {
    id: "ASN-007",
    project_id: "PRJ-007",
    title: "Archive legacy data",
    status: "Done",
    priority: "Low",
    due_date: "2024-01-31",
    assignee_id: "USR-003",
    assigner_id: "USR-003",
  },
  {
    id: "ASN-008",
    project_id: "PRJ-003",
    title: "Update API documentation",
    status: "In Progress",
    priority: "Low",
    due_date: "2024-05-05",
    assignee_id: "USR-005",
    assigner_id: "USR-002",
  },
];

const activity = [
  {
    icon: "folder-plus",
    tone: "primary",
    message: 'Project "Website Redesign" was created',
    minutes_ago: 2,
  },
  {
    icon: "check-circle",
    tone: "success",
    message: 'Task "Design homepage mockup" marked as Done',
    minutes_ago: 15,
  },
  {
    icon: "user-plus",
    tone: "primary",
    message: 'User "Jane Smith" was added',
    minutes_ago: 60,
  },
  {
    icon: "pencil",
    tone: "warning",
    message: 'Project "Mobile App" status updated to In Progress',
    minutes_ago: 180,
  },
  {
    icon: "trash-2",
    tone: "muted",
    message: 'Task "Old API integration" was deleted',
    minutes_ago: 300,
  },
  {
    icon: "user-check",
    tone: "primary",
    message: 'Task "Write unit tests" assigned to Alex',
    minutes_ago: 60 * 24,
  },
  {
    icon: "folder-x",
    tone: "muted",
    message: 'Project "Legacy Portal" was deleted',
    minutes_ago: 60 * 30,
  },
];

async function seed() {
  console.log("Clearing existing rows...");
  await sql`TRUNCATE TABLE activity RESTART IDENTITY CASCADE`;
  await sql`TRUNCATE TABLE tasks CASCADE`;
  await sql`TRUNCATE TABLE projects CASCADE`;
  await sql`TRUNCATE TABLE users CASCADE`;

  console.log(`Inserting ${users.length} users...`);
  for (const u of users) {
    await sql`
      INSERT INTO users (id, name, email, role)
      VALUES (${u.id}, ${u.name}, ${u.email}, ${u.role})
    `;
  }

  console.log(`Inserting ${projects.length} projects...`);
  for (const p of projects) {
    await sql`
      INSERT INTO projects (id, name, description, status, start_date, end_date, owner_id)
      VALUES (${p.id}, ${p.name}, ${p.description}, ${p.status},
              ${p.start_date}, ${p.end_date}, ${p.owner_id})
    `;
  }

  console.log(`Inserting ${tasks.length} tasks...`);
  for (const t of tasks) {
    await sql`
      INSERT INTO tasks (id, project_id, title, status, priority, due_date, assignee_id, assigner_id)
      VALUES (${t.id}, ${t.project_id}, ${t.title}, ${t.status},
              ${t.priority}, ${t.due_date}, ${t.assignee_id}, ${t.assigner_id})
    `;
  }

  console.log(`Inserting ${activity.length} activity rows...`);
  for (const a of activity) {
    await sql`
      INSERT INTO activity (icon, tone, message, created_at)
      VALUES (${a.icon}, ${a.tone}, ${a.message},
              NOW() - (${a.minutes_ago} || ' minutes')::interval)
    `;
  }

  console.log("Seed complete.");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
