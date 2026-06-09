#!/usr/bin/env node
// User Acceptance Testing — walks real-user scenarios end-to-end.
// Each story is framed as Persona / Goal / Given-When-Then, mirroring how a
// product manager or stakeholder reviews acceptance.
//
// Usage: npm run test:uat

import bcrypt from "bcryptjs";

const API = process.env.UAT_API ?? "http://127.0.0.1:3000";
const WEB = process.env.UAT_WEB ?? "http://127.0.0.1:3000";
const UAT_ADMIN_PASSWORD = "Uat-Admin-2026!";

// ----- cookie jar + HTTP helpers --------------------------------------------

class Jar {
  constructor() {
    this.store = new Map();
  }
  ingest(res) {
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const [pair] = sc.split(";");
      const [name, ...rest] = pair.split("=");
      const value = rest.join("=").trim();
      if (value === "" || /Expires=Thu, 01 Jan 1970/i.test(sc)) {
        this.store.delete(name.trim());
      } else {
        this.store.set(name.trim(), value);
      }
    }
  }
  header() {
    return Array.from(this.store.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
  has(name) {
    return this.store.has(name);
  }
  clear() {
    this.store.clear();
  }
}

async function http(jar, method, base, path, body) {
  const headers = { "content-type": "application/json" };
  if (jar) {
    const cookie = jar.header();
    if (cookie) headers.cookie = cookie;
  }
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (jar) jar.ingest(res);
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { res, body: parsed };
}

const GET = (jar, path, base = API) => http(jar, "GET", base, path);
const POST = (jar, path, body, base = API) =>
  http(jar, "POST", base, path, body);

// ----- assertion + reporting -------------------------------------------------

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const YELLOW = "\x1b[33m";

// Register-then-execute model: defining a story records its steps into a
// plain data structure. The runner walks the structure and awaits each step
// sequentially. This keeps all I/O ordered and prevents the cookie jars /
// shared state from being touched by parallel work.

const personas = [];
let currentPersona = null;
let currentStory = null;

function persona(name, optionsOrDefine, maybeDefine) {
  const define = maybeDefine ?? optionsOrDefine;
  const options = maybeDefine ? optionsOrDefine : {};
  currentPersona = { name, stories: [], setup: options.setup ?? null };
  personas.push(currentPersona);
  define();
}

function story(title, defineSteps) {
  currentStory = {
    title,
    steps: [],
    passed: true,
    skipRemaining: false,
  };
  currentPersona.stories.push(currentStory);
  defineSteps();
}

function step(prefix, description, fn) {
  currentStory.steps.push({
    prefix,
    description,
    fn,
    status: null,
    error: null,
  });
}

const given = (desc, fn) => step("Given", desc, fn);
const when = (desc, fn) => step("When", desc, fn);
const then = (desc, fn) => step("Then", desc, fn);
const and_ = (desc, fn) => step("And", desc, fn);

function expect(value) {
  return {
    toBe(expected, msg) {
      if (value !== expected) {
        throw new Error(
          msg ?? `expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`
        );
      }
    },
    toBeGreaterThan(n, msg) {
      if (!(value > n)) {
        throw new Error(msg ?? `expected > ${n}, got ${value}`);
      }
    },
    toBeGreaterThanOrEqual(n, msg) {
      if (!(value >= n)) {
        throw new Error(msg ?? `expected >= ${n}, got ${value}`);
      }
    },
    toContain(needle, msg) {
      const ok = Array.isArray(value)
        ? value.includes(needle)
        : typeof value === "string" && value.includes(needle);
      if (!ok) {
        throw new Error(msg ?? `expected to contain ${JSON.stringify(needle)}`);
      }
    },
    toMatch(re, msg) {
      if (!re.test(String(value))) {
        throw new Error(msg ?? `expected to match ${re}`);
      }
    },
    toBeTruthy(msg) {
      if (!value) {
        throw new Error(msg ?? `expected truthy value, got ${JSON.stringify(value)}`);
      }
    },
    toEqual(expected, msg) {
      const a = JSON.stringify(value);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(msg ?? `expected ${b}, got ${a}`);
      }
    },
  };
}

// ----- shared state across stories ------------------------------------------

const state = {
  adminJar: new Jar(),
  memberJar: new Jar(),
  unauthedJar: new Jar(),
  adminEmail: "admin@hub.com",
  newMemberEmail: `member-${Date.now()}@uat.test`,
};

// ----- pre-flight: clear DB, seed demo data, attach a real password --------

const seedUsers = [
  { id: "USR-001", name: "Admin User",  email: "admin@hub.com", role: "admin",   department: "Operations",  phone: "+1 555 000 0001" },
  { id: "USR-002", name: "Jane Smith",  email: "jane@hub.com",  role: "manager", department: "Engineering", phone: "+1 555 000 0002" },
  { id: "USR-003", name: "Mark Lee",    email: "mark@hub.com",  role: "member",  department: "Engineering", phone: "+1 555 000 0003" },
  { id: "USR-004", name: "Alex Turner", email: "alex@hub.com",  role: "member",  department: "Design",      phone: "+1 555 000 0004" },
  { id: "USR-005", name: "Sara Kim",    email: "sara@hub.com",  role: "member",  department: "Design",      phone: "+1 555 000 0005" },
];

const seedProjects = [
  { id: "PRJ-001", name: "Website Redesign", description: "Full redesign of the corporate website", status: "In Progress", priority: "High",     category: "Design",     tags: ["q3", "frontend"],           start_date: "2024-01-10", end_date: "2024-04-30", owner_id: "USR-001" },
  { id: "PRJ-002", name: "Mobile App v2", description: "Second version of the customer-facing mobile app", status: "Planning",    priority: "Medium",   category: "Engineering", tags: ["mobile", "ios"],            start_date: "2024-02-01", end_date: "2024-07-15", owner_id: "USR-002" },
  { id: "PRJ-003", name: "API Integration", description: "Integrate third-party payment and analytics APIs", status: "Completed",  priority: "Critical", category: "Engineering", tags: ["billing", "analytics"],     start_date: "2023-11-01", end_date: "2024-02-28", owner_id: "USR-001" },
  { id: "PRJ-004", name: "CRM Migration", description: "Migrate legacy CRM data to the new platform",      status: "On Hold",     priority: "Medium",   category: "Operations",  tags: ["crm", "migration"],         start_date: "2024-03-01", end_date: "2024-06-30", owner_id: "USR-003" },
  { id: "PRJ-005", name: "Analytics Dashboard", description: "Internal BI dashboard for the ops team",     status: "In Progress", priority: "Low",      category: "Engineering", tags: ["bi", "internal"],           start_date: "2024-01-20", end_date: "2024-05-10", owner_id: "USR-002" },
  { id: "PRJ-006", name: "Security Audit", description: "Annual security review and vulnerability fixes", status: "Planning",    priority: "Critical", category: "Security",    tags: ["security", "compliance"],   start_date: "2024-03-15", end_date: "2024-04-15", owner_id: "USR-001" },
  { id: "PRJ-007", name: "Legacy Portal Sunset", description: "Decommission and archive old customer portal", status: "Completed",  priority: "Low",      category: "Operations",  tags: ["legacy", "sunset"],         start_date: "2023-09-01", end_date: "2024-01-31", owner_id: "USR-003" },
];

const seedTasks = [
  { id: "ASN-001", project_id: "PRJ-001", title: "Design homepage mockup", status: "In Progress", priority: "High", due_date: "2024-05-01", assignee_id: "USR-002", assigner_id: "USR-001" },
  { id: "ASN-002", project_id: "PRJ-002", title: "Write unit tests", status: "To Do", priority: "Medium", due_date: "2024-05-10", assignee_id: "USR-004", assigner_id: "USR-002" },
  { id: "ASN-003", project_id: "PRJ-003", title: "Set up CI/CD pipeline", status: "Done", priority: "High", due_date: "2024-04-15", assignee_id: "USR-003", assigner_id: "USR-001" },
  { id: "ASN-004", project_id: "PRJ-004", title: "Migrate user data", status: "To Do", priority: "High", due_date: "2024-06-01", assignee_id: "USR-005", assigner_id: "USR-003" },
  { id: "ASN-005", project_id: "PRJ-005", title: "Build chart components", status: "In Progress", priority: "Medium", due_date: "2024-05-20", assignee_id: "USR-002", assigner_id: "USR-001" },
  { id: "ASN-006", project_id: "PRJ-006", title: "Run penetration tests", status: "To Do", priority: "High", due_date: "2024-04-20", assignee_id: "USR-004", assigner_id: "USR-001" },
  { id: "ASN-007", project_id: "PRJ-007", title: "Archive legacy data", status: "Done", priority: "Low", due_date: "2024-01-31", assignee_id: "USR-003", assigner_id: "USR-003" },
  { id: "ASN-008", project_id: "PRJ-003", title: "Update API documentation", status: "In Progress", priority: "Low", due_date: "2024-05-05", assignee_id: "USR-005", assigner_id: "USR-002" },
];

// Each seed entry now carries the structured audit fields (actor_id,
// entity_type, entity_id, action) the Activity Log filters expect. Message
// text is unchanged so existing personas that grep on it still pass.
const seedActivity = [
  { icon: "folder-plus", tone: "primary", message: 'Project "Website Redesign" was created', minutes_ago: 2,         actor_id: "USR-001", action: "create", entity_type: "project", entity_id: "PRJ-001" },
  { icon: "check-circle", tone: "success", message: 'Task "Design homepage mockup" marked as Done', minutes_ago: 15,  actor_id: "USR-002", action: "complete", entity_type: "task", entity_id: "ASN-001" },
  { icon: "user-plus",   tone: "primary", message: 'User "Jane Smith" was added', minutes_ago: 60,                    actor_id: "USR-001", action: "create", entity_type: "user", entity_id: "USR-002" },
  { icon: "pencil",      tone: "warning", message: 'Project "Mobile App" status updated to In Progress', minutes_ago: 180, actor_id: "USR-001", action: "update", entity_type: "project", entity_id: "PRJ-002" },
  { icon: "trash-2",     tone: "muted",   message: 'Task "Old API integration" was deleted', minutes_ago: 300,        actor_id: "USR-001", action: "delete", entity_type: "task", entity_id: "ASN-999" },
  { icon: "user-check",  tone: "primary", message: 'Task "Write unit tests" assigned to Alex', minutes_ago: 60 * 24,  actor_id: "USR-002", action: "assign", entity_type: "task", entity_id: "ASN-003" },
  { icon: "folder-x",    tone: "muted",   message: 'Project "Legacy Portal" was deleted', minutes_ago: 60 * 30,       actor_id: "USR-001", action: "delete", entity_type: "project", entity_id: "PRJ-998" },
];

async function preflight() {
  console.log(`${BOLD}Pre-flight: setting up the workspace${RESET}`);
  const { sql } = await import("../lib/db.js");

  console.log(`  ${DIM}→ clearing database${RESET}`);
  await sql`TRUNCATE TABLE activity RESTART IDENTITY CASCADE`;
  await sql`TRUNCATE TABLE tasks CASCADE`;
  await sql`TRUNCATE TABLE projects CASCADE`;
  await sql`TRUNCATE TABLE teams CASCADE`;
  await sql`TRUNCATE TABLE users CASCADE`;

  console.log(`  ${DIM}→ hashing UAT admin password${RESET}`);
  const adminHash = await bcrypt.hash(UAT_ADMIN_PASSWORD, 12);

  console.log(`  ${DIM}→ seeding ${seedUsers.length} users${RESET}`);
  for (const u of seedUsers) {
    const hash = u.id === "USR-001" ? adminHash : null;
    await sql`
      INSERT INTO users (
        id, name, email, role, password_hash, status, department, phone
      ) VALUES (
        ${u.id}, ${u.name}, ${u.email}, ${u.role}, ${hash},
        'Active', ${u.department ?? null}, ${u.phone ?? null}
      )
    `;
  }

  console.log(`  ${DIM}→ seeding ${seedProjects.length} projects${RESET}`);
  for (const p of seedProjects) {
    await sql`
      INSERT INTO projects (id, name, description, status, priority, category, tags, start_date, end_date, owner_id)
      VALUES (${p.id}, ${p.name}, ${p.description}, ${p.status}, ${p.priority}, ${p.category}, ${p.tags}, ${p.start_date}, ${p.end_date}, ${p.owner_id})
    `;
  }

  console.log(`  ${DIM}→ seeding ${seedTasks.length} tasks${RESET}`);
  for (const t of seedTasks) {
    await sql`
      INSERT INTO tasks (id, project_id, title, status, priority, due_date, assignee_id, assigner_id)
      VALUES (${t.id}, ${t.project_id}, ${t.title}, ${t.status}, ${t.priority}, ${t.due_date}, ${t.assignee_id}, ${t.assigner_id})
    `;
  }

  // Mirror seeded lead-assignees into the audit table so assignment history
  // starts from creation rather than from the first reassignment.
  await sql`
    INSERT INTO task_assignments (task_id, user_id, assigned_at, assigned_by_id)
    SELECT id, assignee_id, created_at, assigner_id
    FROM tasks
    WHERE assignee_id IS NOT NULL
  `;

  console.log(`  ${DIM}→ seeding ${seedActivity.length} activity entries${RESET}`);
  for (const a of seedActivity) {
    await sql`
      INSERT INTO activity (
        icon, tone, message, actor_id, action, entity_type, entity_id, created_at
      ) VALUES (
        ${a.icon}, ${a.tone}, ${a.message},
        ${a.actor_id ?? null}, ${a.action ?? null},
        ${a.entity_type ?? null}, ${a.entity_id ?? null},
        NOW() - (${a.minutes_ago} || ' minutes')::interval
      )
    `;
  }

  const [{ count: u }] = await sql`SELECT COUNT(*)::int AS count FROM users`;
  const [{ count: p }] = await sql`SELECT COUNT(*)::int AS count FROM projects`;
  const [{ count: t }] = await sql`SELECT COUNT(*)::int AS count FROM tasks`;
  const [{ count: a }] = await sql`SELECT COUNT(*)::int AS count FROM activity`;
  console.log(
    `  ${DIM}→ ready: ${u} users · ${p} projects · ${t} tasks · ${a} activity rows${RESET}\n`
  );
}

// ----- STORIES ---------------------------------------------------------------

// Empty-workspace persona is registered first so its setup wipes the DB and
// runs the brand-new-install journey. The next persona's setup re-seeds before
// the populated-workspace stories run.

const firstAdminState = { jar: new Jar(), email: `founder-${Date.now()}@uat.test` };

persona(
  "First-Time Admin (fresh install, Day 0)",
  {
    setup: async () => {
      const { sql } = await import("../lib/db.js");
      await sql`TRUNCATE TABLE activity RESTART IDENTITY CASCADE`;
      await sql`TRUNCATE TABLE tasks CASCADE`;
      await sql`TRUNCATE TABLE projects CASCADE`;
      await sql`TRUNCATE TABLE teams CASCADE`;
      await sql`TRUNCATE TABLE users CASCADE`;
    },
  },
  () => {
    story("I sign up before anyone else and become the workspace admin", () => {
      let signupBody;
      when("I submit the signup form on a brand-new install", async () => {
        const { res, body } = await POST(
          firstAdminState.jar,
          "/api/auth/signup",
          {
            name: "Founder Admin",
            email: firstAdminState.email,
            password: "Founder-2026!",
          }
        );
        expect(res.status).toBe(201);
        signupBody = body;
      });
      then("the very first user is auto-promoted to admin", () => {
        expect(signupBody.user.role).toBe(
          "admin",
          "the founder must become admin on a fresh install"
        );
      });
      and_("I am already signed in (no second login step)", () => {
        expect(firstAdminState.jar.has("ph_session")).toBeTruthy();
      });
    });

    story("Every screen shows a friendly empty state on Day 0", () => {
      then("the dashboard reports zeroes, not nulls or errors", async () => {
        const { res, body } = await GET(firstAdminState.jar, "/api/dashboard/stats");
        expect(res.status).toBe(200);
        expect(body.totalUsers).toBe(1, "only the founder exists");
        expect(body.totalProjects).toBe(0);
        expect(body.totalTasks).toBe(0);
      });
      and_(
        "the activity feed contains only the founder's auth events",
        async () => {
          // Section 9 of the proposal makes login + signup track-able, so a
          // brand-new workspace already shows two rows (signup + implicit
          // login). Anything more would mean stray data was carried over.
          const { body } = await GET(
            firstAdminState.jar,
            "/api/dashboard/activity"
          );
          expect(Array.isArray(body)).toBeTruthy();
          expect(body.length).toBe(2, "only signup + login should be logged");
          const actions = body.map((e) => e.action);
          expect(actions.includes("signup")).toBeTruthy();
          expect(actions.includes("login")).toBeTruthy();
        }
      );
      and_("Projects returns an empty list with an empty summary", async () => {
        const { body } = await GET(firstAdminState.jar, "/api/projects");
        expect(body.items.length).toBe(0);
        expect(body.summary.length).toBe(0);
      });
      and_(
        "Tasks and Assignments return empty payloads",
        async () => {
          for (const path of ["/api/tasks", "/api/assignments"]) {
            const { body } = await GET(firstAdminState.jar, path);
            expect(Array.isArray(body.items)).toBeTruthy(
              `${path}.items should be an array`
            );
            expect(body.items.length).toBe(0, `${path}.items should be empty`);
          }
        }
      );
      and_("the Users screen shows only me", async () => {
        const { body } = await GET(firstAdminState.jar, "/api/users");
        expect(body.items.length).toBe(1);
        expect(body.items[0].role).toBe("admin");
        expect(body.items[0].email).toBe(firstAdminState.email);
      });
    });
  }
);

persona(
  "Workspace Admin (returning user, populated workspace)",
  {
    setup: preflight, // re-seed the demo data so populated-workspace stories work
  },
  () => {
  story("Log in to the workspace I already own", () => {
    when("I submit my credentials at /api/auth/login", async () => {
      const { res, body } = await POST(state.adminJar, "/api/auth/login", {
        email: state.adminEmail,
        password: UAT_ADMIN_PASSWORD,
      });
      expect(res.status).toBe(200, "login should succeed");
      expect(body.user.email).toBe(state.adminEmail);
      expect(body.user.role).toBe("admin");
    });
    then("an httpOnly session cookie is issued", () => {
      expect(state.adminJar.has("ph_session")).toBeTruthy(
        "cookie missing from jar"
      );
    });
    and_("my /api/auth/me reflects the admin profile", async () => {
      const { res, body } = await GET(state.adminJar, "/api/auth/me");
      expect(res.status).toBe(200);
      expect(body.user.role).toBe("admin");
      expect(body.user.name).toBeTruthy();
    });
  });

  story("See my team's KPIs on the dashboard", () => {
    let stats;
    when("I open the dashboard data feed", async () => {
      const { res, body } = await GET(state.adminJar, "/api/dashboard/stats");
      expect(res.status).toBe(200);
      stats = body;
    });
    then("I see the seeded headline numbers", () => {
      expect(stats.totalUsers).toBeGreaterThanOrEqual(5);
      expect(stats.totalProjects).toBeGreaterThanOrEqual(7);
      expect(stats.totalTasks).toBeGreaterThanOrEqual(8);
    });
    and_(
      "the new Overdue + Active Users metrics are surfaced",
      () => {
        expect(typeof stats.overdueTasks).toBe("number");
        expect(typeof stats.activeUsers).toBe("number");
        expect(typeof stats.activeUserWindowDays).toBe("number");
        // The 6 non-Done seed tasks all have 2024 due dates → overdue today.
        expect(stats.overdueTasks).toBe(
          6,
          `expected 6 overdue tasks in seeded workspace, got ${stats.overdueTasks}`
        );
        // Only the admin has logged in so far via this persona's stories.
        expect(stats.activeUsers).toBeGreaterThanOrEqual(1);
      }
    );
    and_("the recent-activity feed has entries", async () => {
      const { body: activity } = await GET(
        state.adminJar,
        "/api/dashboard/activity"
      );
      expect(Array.isArray(activity)).toBeTruthy();
      expect(activity.length).toBeGreaterThan(0);
    });
  });

  story("Browse every project and see the status breakdown", () => {
    let payload;
    when("I open the Projects screen", async () => {
      const { res, body } = await GET(state.adminJar, "/api/projects");
      expect(res.status).toBe(200);
      payload = body;
    });
    then("I see all 7 seeded projects", () => {
      expect(payload.items.length).toBe(7);
    });
    and_("the status summary matches reality", () => {
      const counts = Object.fromEntries(
        payload.summary.map((s) => [s.status, s.count])
      );
      expect(counts["In Progress"]).toBe(2);
      expect(counts["Planning"]).toBe(2);
      expect(counts["Completed"]).toBe(2);
      expect(counts["On Hold"]).toBe(1);
    });
    and_("each project carries the owner's display name", () => {
      const websiteRedesign = payload.items.find(
        (p) => p.id === "PRJ-001"
      );
      expect(websiteRedesign).toBeTruthy();
      expect(websiteRedesign.name).toBe("Website Redesign");
      expect(websiteRedesign.owner_name).toBeTruthy();
    });
  });

  story('Filter projects to only "In Progress"', () => {
    let inProgress;
    when("I apply the status filter client-side", async () => {
      const { body } = await GET(state.adminJar, "/api/projects");
      inProgress = body.items.filter((p) => p.status === "In Progress");
    });
    then("the filtered set matches the summary chip", () => {
      expect(inProgress.length).toBe(2);
    });
    and_("both Website Redesign and Analytics Dashboard appear", () => {
      const names = inProgress.map((p) => p.name).sort();
      expect(names).toEqual(["Analytics Dashboard", "Website Redesign"]);
    });
  });

  story('Search for "redesign" in the project list', () => {
    let hits;
    when("I run the case-insensitive substring search", async () => {
      const { body } = await GET(state.adminJar, "/api/projects");
      hits = body.items.filter((p) =>
        `${p.name} ${p.description ?? ""}`
          .toLowerCase()
          .includes("redesign")
      );
    });
    then("Website Redesign is the single match", () => {
      expect(hits.length).toBe(1);
      expect(hits[0].id).toBe("PRJ-001");
    });
  });

  story("Review the full task backlog with priority + status", () => {
    let payload;
    when("I open the Tasks screen", async () => {
      const { res, body } = await GET(state.adminJar, "/api/tasks");
      expect(res.status).toBe(200);
      payload = body;
    });
    then("I see all 8 seeded tasks", () => {
      expect(payload.items.length).toBe(8);
    });
    and_("each task has a priority and a status", () => {
      for (const t of payload.items) {
        expect(t.priority).toMatch(/^(High|Medium|Low)$/);
        expect(t.status).toMatch(/^(To Do|In Progress|Done)$/);
      }
    });
    and_("the summary chips reconcile with the row data", () => {
      const inProgress = payload.items.filter(
        (t) => t.status === "In Progress"
      ).length;
      const summary = Object.fromEntries(
        payload.summary.map((s) => [s.status, s.count])
      );
      expect(summary["In Progress"]).toBe(inProgress);
    });
  });

  story("See who is assigned to what", () => {
    let payload;
    when("I open the Task Assignments screen", async () => {
      const { res, body } = await GET(state.adminJar, "/api/assignments");
      expect(res.status).toBe(200);
      payload = body;
    });
    then("every assignment row has a real assignee + assigner", () => {
      expect(payload.items.length).toBeGreaterThanOrEqual(8);
      for (const a of payload.items) {
        expect(a.assignee_name).toBeTruthy(
          `assignment ${a.id} missing assignee_name`
        );
        expect(a.assigner_name).toBeTruthy(
          `assignment ${a.id} missing assigner_name`
        );
      }
    });
  });

  story("Audit the team roster", () => {
    let payload;
    when("I open the Users screen", async () => {
      const { res, body } = await GET(state.adminJar, "/api/users");
      expect(res.status).toBe(200);
      payload = body;
    });
    then("I see all 5 seeded users", () => {
      expect(payload.items.length).toBe(5);
    });
    and_(
      "the role breakdown is 1 admin · 1 manager · 3 members",
      () => {
        const byRole = payload.items.reduce((acc, u) => {
          acc[u.role] = (acc[u.role] ?? 0) + 1;
          return acc;
        }, {});
        expect(byRole.admin).toBe(1);
        expect(byRole.manager).toBe(1);
        expect(byRole.member).toBe(3);
      }
    );
    and_(
      "each user row is decorated with projects_owned / tasks_assigned / tasks_done",
      () => {
        const admin = payload.items.find((u) => u.id === "USR-001");
        expect(admin).toBeTruthy("USR-001 should be present");
        expect(typeof admin.projects_owned).toBe(
          "number",
          "projects_owned column missing from /api/users"
        );
        expect(typeof admin.tasks_assigned).toBe(
          "number",
          "tasks_assigned column missing from /api/users"
        );
        expect(typeof admin.tasks_done).toBe(
          "number",
          "tasks_done column missing from /api/users"
        );
        // USR-001 owns PRJ-001, PRJ-003, PRJ-006 in the seed → 3 projects
        expect(admin.projects_owned).toBe(
          3,
          `admin should own 3 projects, got ${admin.projects_owned}`
        );
      }
    );
  });

  story("Create a brand-new project and watch it show up everywhere", () => {
    let createdId;
    when("I submit the New Project form with valid details", async () => {
      const { res, body } = await POST(state.adminJar, "/api/projects", {
        name: "UAT Smoke Project",
        description: "Created from the UAT suite to verify the write path.",
        status: "In Progress",
        start_date: "2026-06-01",
        end_date: "2026-08-01",
      });
      expect(res.status).toBe(201, "create endpoint should return 201");
      expect(body.project).toBeTruthy();
      expect(body.project.name).toBe("UAT Smoke Project");
      expect(body.project.id).toMatch(/^PRJ-\d{3}$/);
      createdId = body.project.id;
    });
    and_("the id is sequential after the seed (PRJ-008+)", () => {
      const n = Number(createdId.slice(4));
      expect(n).toBeGreaterThanOrEqual(8);
    });
    then("the new project appears in the projects list", async () => {
      const { body } = await GET(state.adminJar, "/api/projects");
      const found = body.items.find((p) => p.id === createdId);
      expect(found).toBeTruthy("created project should be in the list");
      expect(found.name).toBe("UAT Smoke Project");
      expect(found.status).toBe("In Progress");
      expect(found.owner_name).toBeTruthy(
        "owner_name should be joined from users"
      );
    });
    and_("the status summary count for In Progress went up by one", async () => {
      const { body } = await GET(state.adminJar, "/api/projects");
      const inProgress = body.summary.find(
        (s) => s.status === "In Progress"
      );
      // seed had 2 In Progress, we added 1 → 3
      expect(inProgress.count).toBe(3);
    });
    and_("the dashboard total_projects went up by one", async () => {
      const { body } = await GET(state.adminJar, "/api/dashboard/stats");
      expect(body.totalProjects).toBe(8);
    });
    and_(
      "an activity entry was logged for the creation",
      async () => {
        const { body } = await GET(state.adminJar, "/api/activity?limit=5");
        const matched = body.items.find((a) =>
          a.message?.includes("UAT Smoke Project")
        );
        expect(matched).toBeTruthy(
          "activity should mention the new project name"
        );
        expect(matched.icon).toBe("folder-plus");
      }
    );
  });

  story("Validation blocks bad project input", () => {
    when("I submit with no name", async () => {
      const { res, body } = await POST(state.adminJar, "/api/projects", {
        name: "",
        status: "Planning",
      });
      expect(res.status).toBe(400);
      expect(body.error.toLowerCase()).toContain("name");
    });
    and_("when I submit an invalid status", async () => {
      const { res, body } = await POST(state.adminJar, "/api/projects", {
        name: "Bad Status Project",
        status: "Backlog",
      });
      expect(res.status).toBe(400);
      expect(body.error.toLowerCase()).toContain("status");
    });
    and_("when the end date is before the start date", async () => {
      const { res, body } = await POST(state.adminJar, "/api/projects", {
        name: "Time-Travel Project",
        status: "Planning",
        start_date: "2026-09-01",
        end_date: "2026-06-01",
      });
      expect(res.status).toBe(400);
      expect(body.error.toLowerCase()).toContain("end date");
    });
    and_("when the owner_id does not exist", async () => {
      const { res, body } = await POST(state.adminJar, "/api/projects", {
        name: "Ghost-Owner Project",
        status: "Planning",
        owner_id: "USR-DOES-NOT-EXIST",
      });
      expect(res.status).toBe(400);
      expect(body.error.toLowerCase()).toContain("owner");
    });
  });

  story("Create a project without an explicit owner — I become owner", () => {
    let createdId;
    when("I omit owner_id from the payload", async () => {
      const { res, body } = await POST(state.adminJar, "/api/projects", {
        name: "Owner-Defaults Project",
        status: "Planning",
      });
      expect(res.status).toBe(201);
      createdId = body.project.id;
      // owner defaults to the authenticated user
      expect(body.project.owner_id).toBe("USR-001");
    });
    then("the projects list shows me as the owner", async () => {
      const { body } = await GET(state.adminJar, "/api/projects");
      const created = body.items.find((p) => p.id === createdId);
      expect(created.owner_name).toBe("Admin User");
    });
  });

  story("Cannot create a project without being logged in", () => {
    when("I POST /api/projects with no session cookie", async () => {
      const { res } = await POST(null, "/api/projects", {
        name: "Anon Project",
        status: "Planning",
      });
      expect(res.status).toBe(401);
    });
  });

  story("Open the activity log in reverse-chronological order", () => {
    let payload;
    when("I request the most-recent 50 entries", async () => {
      const { res, body } = await GET(
        state.adminJar,
        "/api/activity?limit=50"
      );
      expect(res.status).toBe(200);
      payload = body;
    });
    then(
      "I see at least the seeded 7 entries plus any auto-logged from creates",
      () => {
        expect(payload.items.length).toBeGreaterThanOrEqual(7);
      }
    );
    and_(
      "the projects I just created are reflected in the activity log",
      () => {
        const createdMessages = payload.items
          .map((a) => a.message)
          .filter((m) => /UAT Smoke Project|Owner-Defaults Project/.test(m));
        expect(createdMessages.length).toBeGreaterThanOrEqual(2);
      }
    );
    and_("the entries are sorted newest-first", () => {
      const times = payload.items.map((a) => new Date(a.created_at).getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i - 1] >= times[i]).toBeTruthy(
          `entries out of order at index ${i}: ${times[i - 1]} < ${times[i]}`
        );
      }
    });
  });
});

persona("New Team Member (joining today)", () => {
  story("Sign up for an account on an existing workspace", () => {
    let signupBody;
    when("I submit the signup form with valid details", async () => {
      const { res, body } = await POST(state.memberJar, "/api/auth/signup", {
        name: "New Member",
        email: state.newMemberEmail,
        password: "MemberPass-2026!",
      });
      expect(res.status).toBe(201);
      signupBody = body;
    });
    then("my account is created as a member, not an admin", () => {
      expect(signupBody.user.role).toBe(
        "member",
        "admin already exists, so new signups must default to member"
      );
    });
    and_("I am immediately signed in", () => {
      expect(state.memberJar.has("ph_session")).toBeTruthy();
    });
    and_("I can read every shared workspace screen", async () => {
      for (const path of [
        "/api/dashboard/stats",
        "/api/projects",
        "/api/tasks",
        "/api/users",
        "/api/assignments",
        "/api/activity",
      ]) {
        const { res } = await GET(state.memberJar, path);
        expect(res.status).toBe(200, `${path} should be readable`);
      }
    });
  });

  story("Form validation guides me when I make mistakes", () => {
    when("I submit a too-short password", async () => {
      const { res, body } = await POST(null, "/api/auth/signup", {
        name: "Bad Password",
        email: `bad-${Date.now()}@uat.test`,
        password: "short",
      });
      expect(res.status).toBe(400);
      expect(body.error.toLowerCase()).toContain("password");
    });
    and_("when I submit an invalid email format", async () => {
      const { res, body } = await POST(null, "/api/auth/signup", {
        name: "Bad Email",
        email: "not-an-email",
        password: "ValidPass-2026!",
      });
      expect(res.status).toBe(400);
      expect(body.error.toLowerCase()).toContain("email");
    });
    and_("when I try to reuse the admin's email", async () => {
      const { res, body } = await POST(null, "/api/auth/signup", {
        name: "Dup",
        email: state.adminEmail,
        password: "ValidPass-2026!",
      });
      expect(res.status).toBe(409);
      expect(body.error.toLowerCase()).toMatch(/already|registered/);
    });
  });

  story("Log out at end-of-day, log back in tomorrow", () => {
    when("I log out", async () => {
      const { res } = await POST(state.memberJar, "/api/auth/logout");
      expect(res.status).toBe(200);
    });
    then("my session cookie is cleared", () => {
      expect(state.memberJar.has("ph_session")).toBe(
        false,
        "session cookie should be cleared"
      );
    });
    and_("I lose access to protected screens", async () => {
      const { res } = await GET(state.memberJar, "/api/dashboard/stats");
      expect(res.status).toBe(401);
    });
    and_("I can sign back in tomorrow with the same password", async () => {
      const { res, body } = await POST(state.memberJar, "/api/auth/login", {
        email: state.newMemberEmail,
        password: "MemberPass-2026!",
      });
      expect(res.status).toBe(200);
      expect(body.user.email).toBe(state.newMemberEmail);
      expect(state.memberJar.has("ph_session")).toBeTruthy();
    });
    and_("the wrong password is rejected", async () => {
      const { res } = await POST(null, "/api/auth/login", {
        email: state.newMemberEmail,
        password: "completely-wrong-password",
      });
      expect(res.status).toBe(401);
    });
  });
});

persona("RBAC enforcement — what each role can/can't do", () => {
  story("Member is blocked from creating projects (server enforces RBAC)", () => {
    when("a member POSTs /api/projects", async () => {
      const { res, body } = await POST(state.memberJar, "/api/projects", {
        name: "Member-Authored Project",
        status: "Planning",
      });
      expect(res.status).toBe(
        403,
        "members must not be able to create projects"
      );
      expect(body.error.toLowerCase()).toContain("forbidden");
    });
    and_("admin can still create projects", async () => {
      const { res } = await POST(state.adminJar, "/api/projects", {
        name: "RBAC Verification Project",
        status: "Planning",
      });
      expect(res.status).toBe(201);
    });
  });

  story("Member cannot change another user's role", () => {
    when("a member PATCHes /api/users/USR-003/role", async () => {
      const { res } = await http(
        state.memberJar,
        "PATCH",
        API,
        "/api/users/USR-003/role",
        { role: "manager" }
      );
      expect(res.status).toBe(403);
    });
  });

  story("Admin can promote and demote users (and the audit is logged)", () => {
    when("admin promotes Mark Lee from member → manager", async () => {
      const { res, body } = await http(
        state.adminJar,
        "PATCH",
        API,
        "/api/users/USR-003/role",
        { role: "manager" }
      );
      expect(res.status).toBe(200);
      expect(body.user.role).toBe("manager");
    });
    and_("admin demotes Jane Smith from manager → member", async () => {
      const { res, body } = await http(
        state.adminJar,
        "PATCH",
        API,
        "/api/users/USR-002/role",
        { role: "member" }
      );
      expect(res.status).toBe(200);
      expect(body.user.role).toBe("member");
    });
    and_("the role-change events appear in the activity feed", async () => {
      const { body } = await GET(state.adminJar, "/api/activity?limit=20");
      const roleEvents = body.items.filter((a) =>
        /Role for .* changed to/.test(a.message ?? "")
      );
      expect(roleEvents.length).toBeGreaterThanOrEqual(2);
    });
    and_("invalid role values are rejected", async () => {
      const { res } = await http(
        state.adminJar,
        "PATCH",
        API,
        "/api/users/USR-003/role",
        { role: "owner" } // not a real role
      );
      expect(res.status).toBe(400);
    });
    and_("a missing user returns 404", async () => {
      const { res } = await http(
        state.adminJar,
        "PATCH",
        API,
        "/api/users/USR-NOPE/role",
        { role: "member" }
      );
      expect(res.status).toBe(404);
    });
  });

  story("Admin cannot demote the very last admin (workspace would lock up)", () => {
    when("admin tries to demote themselves while sole admin", async () => {
      const { res, body } = await http(
        state.adminJar,
        "PATCH",
        API,
        "/api/users/USR-001/role",
        { role: "member" }
      );
      expect(res.status).toBe(409, "should refuse with 409 Conflict");
      expect(body.error.toLowerCase()).toContain("last admin");
    });
    and_("admin is still admin afterwards", async () => {
      const { body } = await GET(state.adminJar, "/api/auth/me");
      expect(body.user.role).toBe("admin");
    });
    and_("admin restores the team roles for the rest of the suite", async () => {
      // Put roles back to seeded defaults so later stories see expected data.
      await http(state.adminJar, "PATCH", API, "/api/users/USR-002/role", {
        role: "manager",
      });
      await http(state.adminJar, "PATCH", API, "/api/users/USR-003/role", {
        role: "member",
      });
    });
  });
});

persona("Forgot Password / Reset Password journey", () => {
  story("Email enumeration is intentionally impossible", () => {
    when("I request a reset for an email that does not exist", async () => {
      const { res, body } = await POST(null, "/api/auth/forgot-password", {
        email: `ghost-${Date.now()}@uat.test`,
      });
      expect(res.status).toBe(
        200,
        "must return 200 even for unknown emails to avoid leak"
      );
      expect(body.devResetUrl).toBe(
        undefined,
        "no reset url should be emitted for unknown emails"
      );
      expect(body.message.toLowerCase()).toContain("reset link");
    });
  });

  story("I forgot my password, get a link, and reset it", () => {
    let token;
    let newPassword = "Recovered-2026!";
    when("admin@hub.com requests a password reset", async () => {
      const { res, body } = await POST(null, "/api/auth/forgot-password", {
        email: "admin@hub.com",
      });
      expect(res.status).toBe(200);
      expect(body.devResetToken).toBeTruthy(
        "dev mode should expose the reset token"
      );
      token = body.devResetToken;
    });
    and_("I follow the link and submit a strong new password", async () => {
      const { res, body } = await POST(null, "/api/auth/reset-password", {
        token,
        password: newPassword,
      });
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });
    then("I can sign in with the new password", async () => {
      const jar = new Jar();
      const { res, body } = await POST(jar, "/api/auth/login", {
        email: "admin@hub.com",
        password: newPassword,
      });
      expect(res.status).toBe(200);
      expect(body.user.email).toBe("admin@hub.com");
    });
    and_("the old password no longer works", async () => {
      const { res } = await POST(null, "/api/auth/login", {
        email: "admin@hub.com",
        password: UAT_ADMIN_PASSWORD,
      });
      expect(res.status).toBe(401);
    });
    and_("the same reset token cannot be used twice", async () => {
      const { res, body } = await POST(null, "/api/auth/reset-password", {
        token,
        password: "Another-Try-2026!",
      });
      expect(res.status).toBe(400);
      expect(body.error.toLowerCase()).toMatch(/used|invalid/);
    });
    and_("a fabricated token is rejected", async () => {
      const { res } = await POST(null, "/api/auth/reset-password", {
        token: "obviously-not-a-real-token",
        password: "Another-Try-2026!",
      });
      expect(res.status).toBe(400);
    });
    and_("a weak password is rejected even with a valid token", async () => {
      // request a fresh token
      const { body: fresh } = await POST(null, "/api/auth/forgot-password", {
        email: "admin@hub.com",
      });
      const { res, body } = await POST(null, "/api/auth/reset-password", {
        token: fresh.devResetToken,
        password: "short",
      });
      expect(res.status).toBe(400);
      expect(body.error.toLowerCase()).toContain("8 characters");
    });
  });
});

persona("Change Password from inside the app", () => {
  const cpState = {
    jar: new Jar(),
    email: `cp-${Date.now()}@uat.test`,
    initial: "Initial-2026!",
    updated: "Updated-2026!",
  };

  story("Sign up a fresh user so we have a known password to change", () => {
    when("they submit the signup form", async () => {
      const { res } = await POST(cpState.jar, "/api/auth/signup", {
        name: "Change-Password Tester",
        email: cpState.email,
        password: cpState.initial,
      });
      expect(res.status).toBe(201);
    });
  });

  story("Wrong current password is rejected", () => {
    when("they submit a wrong current password", async () => {
      const { res, body } = await POST(cpState.jar, "/api/auth/change-password", {
        currentPassword: "this-is-not-it",
        newPassword: cpState.updated,
      });
      expect(res.status).toBe(401);
      expect(body.error.toLowerCase()).toContain("current password");
    });
  });

  story("New password must differ from current and meet the length rule", () => {
    and_("re-using the same password is rejected", async () => {
      const { res, body } = await POST(cpState.jar, "/api/auth/change-password", {
        currentPassword: cpState.initial,
        newPassword: cpState.initial,
      });
      expect(res.status).toBe(400);
      expect(body.error.toLowerCase()).toContain("different");
    });
    and_("a too-short new password is rejected", async () => {
      const { res, body } = await POST(cpState.jar, "/api/auth/change-password", {
        currentPassword: cpState.initial,
        newPassword: "short",
      });
      expect(res.status).toBe(400);
      expect(body.error.toLowerCase()).toContain("8 characters");
    });
  });

  story("Happy path: change password while signed in", () => {
    when("they submit the correct current + a valid new password", async () => {
      const { res, body } = await POST(cpState.jar, "/api/auth/change-password", {
        currentPassword: cpState.initial,
        newPassword: cpState.updated,
      });
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });
    and_("the original password no longer works", async () => {
      const { res } = await POST(null, "/api/auth/login", {
        email: cpState.email,
        password: cpState.initial,
      });
      expect(res.status).toBe(401);
    });
    and_("the new password lets them sign in", async () => {
      const { res } = await POST(new Jar(), "/api/auth/login", {
        email: cpState.email,
        password: cpState.updated,
      });
      expect(res.status).toBe(200);
    });
  });

  story("Change-password is gated by authentication", () => {
    when("an unauthenticated client tries to change a password", async () => {
      const { res } = await POST(null, "/api/auth/change-password", {
        currentPassword: cpState.updated,
        newPassword: "Another-2026!",
      });
      expect(res.status).toBe(401);
    });
  });
});

persona("Remember Me session length", () => {
  const rmState = {
    email: `remember-${Date.now()}@uat.test`,
    password: "Remember-2026!",
  };

  story("Sign up a fresh user just for the cookie-lifetime checks", () => {
    when("they submit the signup form", async () => {
      const { res } = await POST(new Jar(), "/api/auth/signup", {
        name: "Remember Me Tester",
        email: rmState.email,
        password: rmState.password,
      });
      expect(res.status).toBe(201);
    });
  });

  story("Login without 'Remember Me' issues a ~7-day cookie", () => {
    let maxAge;
    when("they sign in with remember=false", async () => {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: rmState.email,
          password: rmState.password,
          remember: false,
        }),
      });
      expect(res.status).toBe(200);
      const setCookies = res.headers.getSetCookie?.() ?? [];
      const sessionCookie = setCookies.find((c) => c.startsWith("ph_session="));
      expect(sessionCookie).toBeTruthy();
      const match = sessionCookie.match(/Max-Age=(\d+)/i);
      expect(match).toBeTruthy("Max-Age missing from cookie");
      maxAge = Number(match[1]);
    });
    then("the cookie max-age is roughly 7 days", () => {
      const SEVEN_DAYS = 7 * 24 * 60 * 60;
      // allow a 5-min skew for round-trip
      expect(maxAge).toBeGreaterThanOrEqual(SEVEN_DAYS - 300);
      expect(maxAge <= SEVEN_DAYS + 300).toBeTruthy(
        `expected ~${SEVEN_DAYS}s, got ${maxAge}s`
      );
    });
  });

  story("Login WITH 'Remember Me' issues a ~30-day cookie", () => {
    let maxAge;
    when("they sign in with remember=true", async () => {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: rmState.email,
          password: rmState.password,
          remember: true,
        }),
      });
      expect(res.status).toBe(200);
      const setCookies = res.headers.getSetCookie?.() ?? [];
      const sessionCookie = setCookies.find((c) => c.startsWith("ph_session="));
      const match = sessionCookie.match(/Max-Age=(\d+)/i);
      maxAge = Number(match[1]);
    });
    then("the cookie max-age is roughly 30 days", () => {
      const THIRTY_DAYS = 30 * 24 * 60 * 60;
      expect(maxAge).toBeGreaterThanOrEqual(THIRTY_DAYS - 300);
      expect(maxAge <= THIRTY_DAYS + 300).toBeTruthy(
        `expected ~${THIRTY_DAYS}s, got ${maxAge}s`
      );
    });
    and_("the server reports the chosen session length", async () => {
      const res = await fetch(`${API}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: rmState.email,
          password: rmState.password,
          remember: true,
        }),
      });
      const body = await res.json();
      expect(typeof body.sessionMaxAgeMs).toBe("number");
      expect(body.sessionMaxAgeMs).toBeGreaterThan(7 * 24 * 60 * 60 * 1000);
    });
  });
});

persona("Anonymous Visitor / Security Boundary", () => {
  story("Cannot reach the workspace without authenticating", () => {
    given("I have no session cookie", () => {
      expect(state.unauthedJar.has("ph_session")).toBe(false);
    });
    when("I request each protected resource", async () => {
      const paths = [
        "/api/auth/me",
        "/api/dashboard/stats",
        "/api/dashboard/activity",
        "/api/projects",
        "/api/tasks",
        "/api/users",
        "/api/assignments",
        "/api/activity",
      ];
      for (const p of paths) {
        const { res, body } = await GET(state.unauthedJar, p);
        expect(res.status).toBe(401, `${p} should be 401`);
        expect(body.error).toBeTruthy();
      }
    });
    then("the public /api/health endpoint is reachable", async () => {
      const { res, body } = await GET(null, "/api/health");
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
    });
  });

  story("A tampered session cookie is rejected", () => {
    when("I forge a fake JWT in the session cookie", async () => {
      const j = new Jar();
      j.store.set("ph_session", "tampered.jwt.value");
      const { res } = await GET(j, "/api/dashboard/stats");
      expect(res.status).toBe(401);
    });
  });
});

persona("Brand & Asset Delivery", () => {
  story("The Right Tail brand assets are served to the browser", () => {
    when("I fetch the brand icon over the Vite dev server", async () => {
      const res = await fetch(`${WEB}/brand-icon.png`);
      expect(res.status).toBe(200);
      const ct = res.headers.get("content-type") ?? "";
      expect(ct.includes("image")).toBeTruthy(
        `content-type was '${ct}'`
      );
    });
    and_("the index.html sets the Right Tail page title", async () => {
      const res = await fetch(`${WEB}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Right Tail");
      expect(html).toContain("brand-icon.png");
    });
    and_("the inline boot splash is present on first paint", async () => {
      const res = await fetch(`${WEB}/`);
      const html = await res.text();
      expect(html).toContain('id="boot-splash"');
      expect(html).toContain('class="boot-name"');
    });
  });

  story("The Vite proxy carries my session to the API", () => {
    const proxyJar = new Jar();
    when("I sign up through the Vite proxy", async () => {
      const email = `proxy-${Date.now()}@uat.test`;
      const { res } = await POST(
        proxyJar,
        "/api/auth/signup",
        {
          name: "Proxy User",
          email,
          password: "ProxyPass-2026!",
        },
        WEB
      );
      expect(res.status).toBe(201);
      expect(proxyJar.has("ph_session")).toBeTruthy();
    });
    then("my session round-trips through the proxy", async () => {
      const { res, body } = await GET(proxyJar, "/api/auth/me", WEB);
      expect(res.status).toBe(200);
      expect(body.user).toBeTruthy();
    });
  });
});

// ===== PROJECT MANAGEMENT MODULE ============================================
// Each persona below re-runs preflight in its setup so the project tables are
// in a known state. The CRUD persona mutates rows; the filters persona is
// read-only; the RBAC persona drives the same actions from three roles.

persona(
  "Project CRUD lifecycle",
  {
    setup: async () => {
      await preflight();
    },
  },
  () => {
    const crud = { adminJar: new Jar(), createdId: null };

    story("Admin signs in to drive the lifecycle stories", () => {
      when("admin logs in", async () => {
        const { res } = await POST(crud.adminJar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
    });

    story("View Project — GET /api/projects/:id returns full detail bundle", () => {
      let payload;
      when("admin opens PRJ-001's detail", async () => {
        const { res, body } = await GET(crud.adminJar, "/api/projects/PRJ-001");
        expect(res.status).toBe(200);
        payload = body;
      });
      then("the project header carries every field", () => {
        const p = payload.project;
        expect(p.id).toBe("PRJ-001");
        expect(p.name).toBe("Website Redesign");
        expect(p.status).toBe("In Progress");
        expect(p.priority).toBe("High");
        expect(p.category).toBe("Design");
        expect(p.tags).toEqual(["q3", "frontend"]);
        expect(p.owner_name).toBe("Admin User");
        expect(p.owner_email).toBe("admin@hub.com");
      });
      and_("the task list and stats are bundled in the response", () => {
        expect(Array.isArray(payload.tasks)).toBeTruthy();
        expect(payload.tasks.length).toBe(
          1,
          "PRJ-001 has 1 seeded task (ASN-001)"
        );
        expect(payload.stats.total).toBe(1);
        expect(payload.stats.done).toBe(0);
        expect(payload.stats.completionPct).toBe(0);
        expect(payload.stats.overdue).toBe(1);
      });
      and_("activity entries for this project are included", () => {
        expect(Array.isArray(payload.activity)).toBeTruthy();
        const found = payload.activity.find((a) =>
          a.message.includes("Website Redesign")
        );
        expect(found).toBeTruthy(
          "the seeded 'Website Redesign was created' activity should surface"
        );
      });
      and_("a missing project returns 404", async () => {
        const { res } = await GET(crud.adminJar, "/api/projects/PRJ-DOES-NOT-EXIST");
        expect(res.status).toBe(404);
      });
    });

    story("Update Project — PATCH writes only the fields supplied", () => {
      when("admin PATCHes PRJ-001 with new name + priority + tags", async () => {
        const { res, body } = await http(
          crud.adminJar,
          "PATCH",
          API,
          "/api/projects/PRJ-001",
          {
            name: "Website Redesign 2026",
            priority: "Critical",
            tags: ["q3", "frontend", "redesign"],
          }
        );
        expect(res.status).toBe(200);
        expect(body.project.name).toBe("Website Redesign 2026");
        expect(body.project.priority).toBe("Critical");
        expect(body.project.tags).toEqual(["q3", "frontend", "redesign"]);
        expect(body.changed.sort()).toEqual(["name", "priority", "tags"]);
      });
      and_("other fields (status, owner, dates) are untouched", async () => {
        const { body } = await GET(crud.adminJar, "/api/projects/PRJ-001");
        expect(body.project.status).toBe("In Progress");
        expect(body.project.owner_id).toBe("USR-001");
        expect(String(body.project.start_date).slice(0, 10)).toBe("2024-01-10");
      });
      and_("an activity entry describes what changed", async () => {
        const { body } = await GET(crud.adminJar, "/api/activity?limit=10");
        const evt = body.items.find((a) =>
          a.message.includes("Website Redesign 2026")
        );
        expect(evt).toBeTruthy();
        expect(evt.message.toLowerCase()).toContain("name");
        expect(evt.message.toLowerCase()).toContain("priority");
        expect(evt.message.toLowerCase()).toContain("tags");
      });
      and_("a no-op PATCH returns the same row with empty 'changed'", async () => {
        const { res, body } = await http(
          crud.adminJar,
          "PATCH",
          API,
          "/api/projects/PRJ-001",
          { name: "Website Redesign 2026" } // already matches
        );
        expect(res.status).toBe(200);
        expect(body.changed.length).toBe(0);
      });
    });

    story("Update validation blocks bad input", () => {
      when("PATCH supplies an invalid status", async () => {
        const { res, body } = await http(
          crud.adminJar,
          "PATCH",
          API,
          "/api/projects/PRJ-002",
          { status: "Backlog" }
        );
        expect(res.status).toBe(400);
        expect(body.error.toLowerCase()).toContain("status");
      });
      and_("PATCH supplies an invalid priority", async () => {
        const { res, body } = await http(
          crud.adminJar,
          "PATCH",
          API,
          "/api/projects/PRJ-002",
          { priority: "Urgent" }
        );
        expect(res.status).toBe(400);
        expect(body.error.toLowerCase()).toContain("priority");
      });
      and_("PATCH supplies an end_date earlier than start_date", async () => {
        // PRJ-002 starts 2024-02-01 in the seed.
        const { res, body } = await http(
          crud.adminJar,
          "PATCH",
          API,
          "/api/projects/PRJ-002",
          { end_date: "2023-12-01" }
        );
        expect(res.status).toBe(400);
        expect(body.error.toLowerCase()).toContain("end date");
      });
      and_("PATCH supplies a non-existent owner_id", async () => {
        const { res, body } = await http(
          crud.adminJar,
          "PATCH",
          API,
          "/api/projects/PRJ-002",
          { owner_id: "USR-DOES-NOT-EXIST" }
        );
        expect(res.status).toBe(400);
        expect(body.error.toLowerCase()).toContain("owner");
      });
      and_("PATCH on a missing project returns 404", async () => {
        const { res } = await http(
          crud.adminJar,
          "PATCH",
          API,
          "/api/projects/PRJ-DOES-NOT-EXIST",
          { name: "Anything" }
        );
        expect(res.status).toBe(404);
      });
    });

    story("Archive Project — soft delete hides from active list", () => {
      when("admin archives PRJ-005", async () => {
        const { res, body } = await POST(
          crud.adminJar,
          "/api/projects/PRJ-005/archive"
        );
        expect(res.status).toBe(200);
        expect(body.project.archived_at).toBeTruthy();
      });
      then("default listing no longer includes PRJ-005", async () => {
        const { body } = await GET(crud.adminJar, "/api/projects");
        expect(body.items.find((p) => p.id === "PRJ-005")).toBe(
          undefined,
          "archived project must be hidden by default"
        );
        expect(body.items.length).toBe(6);
        expect(body.archivedCount).toBe(1);
      });
      and_("?only_archived=true surfaces just the archived rows", async () => {
        const { body } = await GET(
          crud.adminJar,
          "/api/projects?only_archived=true"
        );
        expect(body.items.length).toBe(1);
        expect(body.items[0].id).toBe("PRJ-005");
      });
      and_("?include_archived=true returns everything", async () => {
        const { body } = await GET(
          crud.adminJar,
          "/api/projects?include_archived=true"
        );
        expect(body.items.length).toBe(7);
      });
      and_("editing an archived project is blocked with 409", async () => {
        const { res, body } = await http(
          crud.adminJar,
          "PATCH",
          API,
          "/api/projects/PRJ-005",
          { name: "Cannot Touch This" }
        );
        expect(res.status).toBe(409);
        expect(body.error.toLowerCase()).toContain("archived");
      });
      and_("archiving an already-archived project returns 409", async () => {
        const { res } = await POST(
          crud.adminJar,
          "/api/projects/PRJ-005/archive"
        );
        expect(res.status).toBe(409);
      });
    });

    story("Restore Project — returns it to the active list", () => {
      when("admin restores PRJ-005", async () => {
        const { res, body } = await POST(
          crud.adminJar,
          "/api/projects/PRJ-005/restore"
        );
        expect(res.status).toBe(200);
        expect(body.project.archived_at).toBe(null);
      });
      then("PRJ-005 is back in the default listing", async () => {
        const { body } = await GET(crud.adminJar, "/api/projects");
        expect(body.items.find((p) => p.id === "PRJ-005")).toBeTruthy();
        expect(body.archivedCount).toBe(0);
      });
      and_("restoring an active project returns 409", async () => {
        const { res } = await POST(
          crud.adminJar,
          "/api/projects/PRJ-005/restore"
        );
        expect(res.status).toBe(409);
      });
    });

    story("Delete Project — hard delete with cascade", () => {
      when("admin creates a throwaway project just for the delete test", async () => {
        const { res, body } = await POST(crud.adminJar, "/api/projects", {
          name: "Throwaway",
          status: "Planning",
          priority: "Low",
        });
        expect(res.status).toBe(201);
        crud.createdId = body.project.id;
      });
      and_("admin DELETEs it", async () => {
        const { res, body } = await http(
          crud.adminJar,
          "DELETE",
          API,
          `/api/projects/${crud.createdId}`
        );
        expect(res.status).toBe(200);
        expect(body.ok).toBe(true);
      });
      then("subsequent GET returns 404", async () => {
        const { res } = await GET(
          crud.adminJar,
          `/api/projects/${crud.createdId}`
        );
        expect(res.status).toBe(404);
      });
      and_("an activity entry was recorded", async () => {
        const { body } = await GET(crud.adminJar, "/api/activity?limit=10");
        const evt = body.items.find((a) => a.message.includes("Throwaway"));
        expect(evt).toBeTruthy();
        expect(evt.message.toLowerCase()).toContain("deleted");
      });
      and_("DELETE on a non-existent id returns 404", async () => {
        const { res } = await http(
          crud.adminJar,
          "DELETE",
          API,
          "/api/projects/PRJ-NOPE"
        );
        expect(res.status).toBe(404);
      });
    });
  }
);

persona(
  "Project filters & search (every query parameter exercised)",
  {
    setup: async () => {
      await preflight();
    },
  },
  () => {
    const adminJar = new Jar();

    story("Admin signs in for the filter stories", () => {
      when("admin logs in", async () => {
        const { res } = await POST(adminJar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
    });

    story("Filter by Status — ?status=In Progress", () => {
      when("admin filters by status", async () => {
        const { res, body } = await GET(
          adminJar,
          "/api/projects?status=In%20Progress"
        );
        expect(res.status).toBe(200);
        const names = body.items.map((p) => p.name).sort();
        expect(names).toEqual(["Analytics Dashboard", "Website Redesign"]);
      });
      and_("an invalid status filter returns 400", async () => {
        const { res } = await GET(adminJar, "/api/projects?status=Backlog");
        expect(res.status).toBe(400);
      });
    });

    story("Filter by Priority — ?priority=Critical", () => {
      when("admin filters by priority=Critical", async () => {
        const { body } = await GET(adminJar, "/api/projects?priority=Critical");
        const ids = body.items.map((p) => p.id).sort();
        expect(ids).toEqual(["PRJ-003", "PRJ-006"]);
      });
      and_("priority summary reports the full priority histogram", async () => {
        const { body } = await GET(adminJar, "/api/projects");
        const byPriority = Object.fromEntries(
          body.prioritySummary.map((s) => [s.priority, s.count])
        );
        expect(byPriority.Critical).toBe(2);
        expect(byPriority.High).toBe(1);
        expect(byPriority.Medium).toBe(2);
        expect(byPriority.Low).toBe(2);
      });
      and_("invalid priority returns 400", async () => {
        const { res } = await GET(adminJar, "/api/projects?priority=Urgent");
        expect(res.status).toBe(400);
      });
    });

    story("Filter by Owner — ?owner_id=USR-002", () => {
      when("admin filters by owner_id", async () => {
        const { body } = await GET(adminJar, "/api/projects?owner_id=USR-002");
        const ids = body.items.map((p) => p.id).sort();
        expect(ids).toEqual(["PRJ-002", "PRJ-005"]);
      });
      and_("unknown owner_id gives an empty list (not an error)", async () => {
        const { res, body } = await GET(
          adminJar,
          "/api/projects?owner_id=USR-NOBODY"
        );
        expect(res.status).toBe(200);
        expect(body.items.length).toBe(0);
      });
    });

    story("Filter by Date Range — ?start_from + ?end_to", () => {
      when("admin filters start_from=2024-02-01", async () => {
        const { body } = await GET(
          adminJar,
          "/api/projects?start_from=2024-02-01"
        );
        const ids = body.items.map((p) => p.id).sort();
        expect(ids).toEqual(["PRJ-002", "PRJ-004", "PRJ-006"]);
      });
      and_("admin filters end_by=2024-02-28", async () => {
        const { body } = await GET(
          adminJar,
          "/api/projects?end_to=2024-02-28"
        );
        const ids = body.items.map((p) => p.id).sort();
        // PRJ-003 ends 2024-02-28; PRJ-007 ends 2024-01-31
        expect(ids).toEqual(["PRJ-003", "PRJ-007"]);
      });
      and_("the range can be composed with status", async () => {
        const { body } = await GET(
          adminJar,
          "/api/projects?status=Planning&start_from=2024-03-01"
        );
        const ids = body.items.map((p) => p.id).sort();
        // Planning projects starting on/after 2024-03-01: PRJ-006 only.
        expect(ids).toEqual(["PRJ-006"]);
      });
    });

    story("Search — ?q hits name, description, id, tag, and category", () => {
      and_('q="Mobile" finds the project by name', async () => {
        const { body } = await GET(adminJar, "/api/projects?q=Mobile");
        const ids = body.items.map((p) => p.id);
        expect(ids).toContain("PRJ-002");
      });
      and_('q="billing" finds the project by tag', async () => {
        const { body } = await GET(adminJar, "/api/projects?q=billing");
        const ids = body.items.map((p) => p.id);
        expect(ids).toContain("PRJ-003");
      });
      and_('q="Security" finds the project by category', async () => {
        const { body } = await GET(adminJar, "/api/projects?q=Security");
        const ids = body.items.map((p) => p.id);
        expect(ids).toContain("PRJ-006");
      });
      and_('q="PRJ-001" finds by id (case-insensitive)', async () => {
        const { body } = await GET(adminJar, "/api/projects?q=prj-001");
        expect(body.items.length).toBe(1);
        expect(body.items[0].id).toBe("PRJ-001");
      });
      and_('q="vulnerability" hits the description', async () => {
        const { body } = await GET(adminJar, "/api/projects?q=vulnerability");
        expect(body.items.map((p) => p.id)).toContain("PRJ-006");
      });
    });

    story("Combined filters narrow the result set", () => {
      when("admin combines priority + owner", async () => {
        const { body } = await GET(
          adminJar,
          "/api/projects?priority=Critical&owner_id=USR-001"
        );
        const ids = body.items.map((p) => p.id).sort();
        // USR-001 owns Critical projects PRJ-003 + PRJ-006
        expect(ids).toEqual(["PRJ-003", "PRJ-006"]);
      });
    });
  }
);

persona(
  "Project RBAC — admin can do everything, manager can edit, member cannot",
  {
    setup: async () => {
      await preflight();
      const { sql } = await import("../lib/db.js");
      const managerHash = await bcrypt.hash("Manager-2026!", 12);
      const memberHash = await bcrypt.hash("Member-2026!", 12);
      await sql`UPDATE users SET password_hash = ${managerHash} WHERE id = 'USR-002'`;
      await sql`UPDATE users SET password_hash = ${memberHash} WHERE id = 'USR-003'`;
    },
  },
  () => {
    const jars = {
      admin: new Jar(),
      manager: new Jar(),
      member: new Jar(),
    };

    story("All three roles sign in", () => {
      when("admin logs in", async () => {
        const { res } = await POST(jars.admin, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
      and_("manager (Jane) logs in", async () => {
        const { res } = await POST(jars.manager, "/api/auth/login", {
          email: "jane@hub.com",
          password: "Manager-2026!",
        });
        expect(res.status).toBe(200);
      });
      and_("member (Mark) logs in", async () => {
        const { res } = await POST(jars.member, "/api/auth/login", {
          email: "mark@hub.com",
          password: "Member-2026!",
        });
        expect(res.status).toBe(200);
      });
    });

    story("Every role can READ projects (view list + detail)", () => {
      for (const [name, jar] of Object.entries(jars)) {
        and_(`${name} can list projects`, async () => {
          const { res } = await GET(jar, "/api/projects");
          expect(res.status).toBe(200);
        });
        and_(`${name} can read a project detail`, async () => {
          const { res } = await GET(jar, "/api/projects/PRJ-001");
          expect(res.status).toBe(200);
        });
      }
    });

    story("Member cannot UPDATE / ARCHIVE / RESTORE / DELETE", () => {
      when("member tries to PATCH a project", async () => {
        const { res } = await http(
          jars.member,
          "PATCH",
          API,
          "/api/projects/PRJ-001",
          { name: "Member rename" }
        );
        expect(res.status).toBe(403);
      });
      and_("member tries to archive a project", async () => {
        const { res } = await POST(jars.member, "/api/projects/PRJ-001/archive");
        expect(res.status).toBe(403);
      });
      and_("member tries to restore a project", async () => {
        const { res } = await POST(jars.member, "/api/projects/PRJ-001/restore");
        expect(res.status).toBe(403);
      });
      and_("member tries to DELETE a project", async () => {
        const { res } = await http(
          jars.member,
          "DELETE",
          API,
          "/api/projects/PRJ-001"
        );
        expect(res.status).toBe(403);
      });
    });

    story("Manager can UPDATE + ARCHIVE + RESTORE but NOT DELETE", () => {
      when("manager updates a project's priority", async () => {
        const { res, body } = await http(
          jars.manager,
          "PATCH",
          API,
          "/api/projects/PRJ-002",
          { priority: "High" }
        );
        expect(res.status).toBe(200);
        expect(body.project.priority).toBe("High");
      });
      and_("manager archives PRJ-004", async () => {
        const { res } = await POST(jars.manager, "/api/projects/PRJ-004/archive");
        expect(res.status).toBe(200);
      });
      and_("manager restores PRJ-004", async () => {
        const { res } = await POST(jars.manager, "/api/projects/PRJ-004/restore");
        expect(res.status).toBe(200);
      });
      and_("manager attempts DELETE and is rejected with 403", async () => {
        const { res } = await http(
          jars.manager,
          "DELETE",
          API,
          "/api/projects/PRJ-007"
        );
        expect(res.status).toBe(403);
      });
    });

    story("Admin can DELETE (the destructive privilege is admin-only)", () => {
      when("admin deletes PRJ-007 (was manager-rejected above)", async () => {
        const { res, body } = await http(
          jars.admin,
          "DELETE",
          API,
          "/api/projects/PRJ-007"
        );
        expect(res.status).toBe(200);
        expect(body.ok).toBe(true);
      });
      then("PRJ-007 no longer exists", async () => {
        const { res } = await GET(jars.admin, "/api/projects/PRJ-007");
        expect(res.status).toBe(404);
      });
    });

    story("Anonymous callers are 401 for every write endpoint", () => {
      when("each project write endpoint is hit without auth", async () => {
        const { res: r1 } = await POST(null, "/api/projects", { name: "x" });
        const { res: r2 } = await http(
          null,
          "PATCH",
          API,
          "/api/projects/PRJ-001",
          { name: "x" }
        );
        const { res: r3 } = await POST(null, "/api/projects/PRJ-001/archive");
        const { res: r4 } = await POST(null, "/api/projects/PRJ-001/restore");
        const { res: r5 } = await http(null, "DELETE", API, "/api/projects/PRJ-001");
        expect(r1.status).toBe(401);
        expect(r2.status).toBe(401);
        expect(r3.status).toBe(401);
        expect(r4.status).toBe(401);
        expect(r5.status).toBe(401);
      });
    });
  }
);

// ===== PROJECT DETAILS MODULE ===============================================
// These personas exercise the expanded /api/projects/:id bundle (team members
// + milestone stats + tracking stats) and the full milestone CRUD lifecycle.

persona(
  "Project Details bundle (overview / team / tasks / activity / tracking)",
  {
    setup: async () => {
      await preflight();
    },
  },
  () => {
    const adminJar = new Jar();

    story("Admin signs in to inspect the detail endpoint", () => {
      when("admin logs in", async () => {
        const { res } = await POST(adminJar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
    });

    story("PRJ-001 detail bundle returns every Section 4 element", () => {
      let body;
      when("admin GETs /api/projects/PRJ-001", async () => {
        const res = await GET(adminJar, "/api/projects/PRJ-001");
        expect(res.res.status).toBe(200);
        body = res.body;
      });
      then("'Project Overview' fields are populated", () => {
        expect(body.project.id).toBe("PRJ-001");
        expect(body.project.description).toContain("redesign");
        expect(body.project.owner_name).toBe("Admin User");
      });
      and_("'Task List' is bundled", () => {
        expect(Array.isArray(body.tasks)).toBeTruthy();
        expect(body.tasks.length).toBe(1, "PRJ-001 has 1 seeded task (ASN-001)");
        expect(body.tasks[0].id).toBe("ASN-001");
      });
      and_("'Activity Timeline' is bundled", () => {
        expect(Array.isArray(body.activity)).toBeTruthy();
        const creation = body.activity.find((a) =>
          a.message.includes("Website Redesign")
        );
        expect(creation).toBeTruthy();
      });
      and_("'Project Statistics → Tracking' includes completion + open + closed + delayed", () => {
        expect(body.stats.total).toBe(1);
        expect(body.stats.done).toBe(0);
        expect(body.stats.open).toBe(1);
        expect(body.stats.overdue).toBe(1, "due_date 2024-05-01 is in the past");
        expect(body.stats.completionPct).toBe(0);
      });
      and_("'Team Members' includes the owner + each assignee", () => {
        expect(Array.isArray(body.teamMembers)).toBeTruthy();
        expect(body.teamMembers.length).toBe(
          2,
          "PRJ-001 team = owner USR-001 + assignee USR-002"
        );
        const owner = body.teamMembers.find((m) => m.is_owner);
        expect(owner.id).toBe("USR-001");
        expect(owner.assigned_tasks).toBe(0, "admin owns the project but is not assigned any tasks");
        const jane = body.teamMembers.find((m) => m.id === "USR-002");
        expect(jane.assigned_tasks).toBe(1);
        expect(jane.done_tasks).toBe(0);
        expect(jane.overdue_tasks).toBe(1);
      });
      and_("'Milestones Progress' bundle is present and empty by default", () => {
        expect(Array.isArray(body.milestones)).toBeTruthy();
        expect(body.milestones.length).toBe(0);
        expect(body.milestoneStats.total).toBe(0);
        expect(body.milestoneStats.completed).toBe(0);
        expect(body.milestoneStats.pending).toBe(0);
        expect(body.milestoneStats.overdue).toBe(0);
        expect(body.milestoneStats.completionPct).toBe(0);
      });
    });

    story("Team Members are deduplicated when the owner is also an assignee", () => {
      let body;
      when("admin GETs /api/projects/PRJ-003", async () => {
        const res = await GET(adminJar, "/api/projects/PRJ-003");
        body = res.body;
      });
      then("the team has 3 unique members (owner + 2 distinct assignees)", () => {
        // PRJ-003 owner = USR-001; assignees = USR-003, USR-005 → 3 unique.
        expect(body.teamMembers.length).toBe(3);
        const ids = body.teamMembers.map((m) => m.id).sort();
        expect(ids).toEqual(["USR-001", "USR-003", "USR-005"]);
      });
      and_("only one member is flagged as is_owner", () => {
        const owners = body.teamMembers.filter((m) => m.is_owner);
        expect(owners.length).toBe(1);
        expect(owners[0].id).toBe("USR-001");
      });
    });

    story("Delayed-task counter reconciles with reality", () => {
      let body;
      when("admin GETs /api/projects/PRJ-002 (1 task, due 2024-05-10, not Done)", async () => {
        const res = await GET(adminJar, "/api/projects/PRJ-002");
        body = res.body;
      });
      then("stats.overdue = 1 because the due_date is in the past", () => {
        expect(body.stats.overdue).toBe(1);
        expect(body.stats.open).toBe(1);
        expect(body.stats.done).toBe(0);
      });
    });
  }
);

persona(
  "Milestones — CRUD + complete/reopen + roll-up into Milestones Progress",
  {
    setup: async () => {
      await preflight();
    },
  },
  () => {
    const adminJar = new Jar();
    const state = { msId: null };

    story("Admin signs in for milestone management", () => {
      when("admin logs in", async () => {
        const { res } = await POST(adminJar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
    });

    story("Create a milestone — appears in detail bundle + stats roll up", () => {
      when("admin POSTs a milestone on PRJ-001", async () => {
        const { res, body } = await POST(
          adminJar,
          "/api/projects/PRJ-001/milestones",
          {
            title: "Beta launch",
            description: "External beta open to design partners",
            due_date: "2026-09-30",
          }
        );
        expect(res.status).toBe(201);
        expect(body.milestone.id).toMatch(/^MIL-\d{3}$/);
        expect(body.milestone.title).toBe("Beta launch");
        expect(body.milestone.status).toBe("Pending");
        expect(body.milestone.due_date).toBe(
          "2026-09-30",
          "wire format must be a stable YYYY-MM-DD string"
        );
        state.msId = body.milestone.id;
      });
      then("the detail bundle now lists 1 pending milestone, 0% complete", async () => {
        const { body } = await GET(adminJar, "/api/projects/PRJ-001");
        expect(body.milestones.length).toBe(1);
        expect(body.milestoneStats.total).toBe(1);
        expect(body.milestoneStats.pending).toBe(1);
        expect(body.milestoneStats.completed).toBe(0);
        expect(body.milestoneStats.completionPct).toBe(0);
      });
      and_("the activity feed records the addition", async () => {
        const { body } = await GET(adminJar, "/api/activity?limit=10");
        const evt = body.items.find((a) =>
          a.message.includes("Beta launch")
        );
        expect(evt).toBeTruthy();
        expect(evt.message.toLowerCase()).toContain("added");
      });
    });

    story("Validation blocks bad milestone input", () => {
      when("admin POSTs an empty title", async () => {
        const { res, body } = await POST(
          adminJar,
          "/api/projects/PRJ-001/milestones",
          { title: "" }
        );
        expect(res.status).toBe(400);
        expect(body.error.toLowerCase()).toContain("title");
      });
      and_("admin POSTs an invalid status", async () => {
        const { res, body } = await POST(
          adminJar,
          "/api/projects/PRJ-001/milestones",
          { title: "Bad status", status: "Cancelled" }
        );
        expect(res.status).toBe(400);
        expect(body.error.toLowerCase()).toContain("status");
      });
      and_("POSTing under a missing project returns 404", async () => {
        const { res } = await POST(
          adminJar,
          "/api/projects/PRJ-NOPE/milestones",
          { title: "Anything" }
        );
        expect(res.status).toBe(404);
      });
    });

    story("Edit a milestone — title, due date, and notes can be changed", () => {
      when("admin PATCHes the milestone", async () => {
        const { res, body } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/milestones/${state.msId}`,
          { title: "Beta launch (revised)", due_date: "2026-10-15" }
        );
        expect(res.status).toBe(200);
        expect(body.milestone.title).toBe("Beta launch (revised)");
        expect(body.milestone.due_date).toBe("2026-10-15");
      });
      and_("the change is reflected in the project detail bundle", async () => {
        const { body } = await GET(adminJar, "/api/projects/PRJ-001");
        const ms = body.milestones.find((m) => m.id === state.msId);
        expect(ms.title).toBe("Beta launch (revised)");
        expect(ms.due_date).toBe("2026-10-15");
      });
    });

    story("Complete a milestone — Milestones Progress climbs to 100%", () => {
      when("admin POSTs /complete", async () => {
        const { res, body } = await POST(
          adminJar,
          `/api/milestones/${state.msId}/complete`
        );
        expect(res.status).toBe(200);
        expect(body.milestone.status).toBe("Completed");
        expect(body.milestone.completed_at).toBeTruthy();
      });
      and_("Milestones Progress for the project is now 100%", async () => {
        const { body } = await GET(adminJar, "/api/projects/PRJ-001");
        expect(body.milestoneStats.completed).toBe(1);
        expect(body.milestoneStats.completionPct).toBe(100);
      });
      and_("completing it again returns 409", async () => {
        const { res } = await POST(
          adminJar,
          `/api/milestones/${state.msId}/complete`
        );
        expect(res.status).toBe(409);
      });
    });

    story("Reopen a milestone — completion drops back down", () => {
      when("admin POSTs /reopen", async () => {
        const { res, body } = await POST(
          adminJar,
          `/api/milestones/${state.msId}/reopen`
        );
        expect(res.status).toBe(200);
        expect(body.milestone.status).toBe("Pending");
        expect(body.milestone.completed_at).toBe(null);
      });
      and_("Milestones Progress for the project is back to 0%", async () => {
        const { body } = await GET(adminJar, "/api/projects/PRJ-001");
        expect(body.milestoneStats.completed).toBe(0);
        expect(body.milestoneStats.completionPct).toBe(0);
      });
      and_("reopening it again returns 409", async () => {
        const { res } = await POST(
          adminJar,
          `/api/milestones/${state.msId}/reopen`
        );
        expect(res.status).toBe(409);
      });
    });

    story("Overdue rollup — a pending milestone with a past due_date counts as overdue", () => {
      let overdueId;
      when("admin adds a milestone due in 1990", async () => {
        const { res, body } = await POST(
          adminJar,
          "/api/projects/PRJ-001/milestones",
          { title: "Way overdue", due_date: "1990-01-01" }
        );
        expect(res.status).toBe(201);
        overdueId = body.milestone.id;
      });
      then("the project bundle reports overdue = 1", async () => {
        const { body } = await GET(adminJar, "/api/projects/PRJ-001");
        expect(body.milestoneStats.overdue).toBe(1);
        expect(body.milestoneStats.total).toBe(2);
      });
      and_("completing the overdue milestone removes it from the overdue count", async () => {
        await POST(adminJar, `/api/milestones/${overdueId}/complete`);
        const { body } = await GET(adminJar, "/api/projects/PRJ-001");
        expect(body.milestoneStats.overdue).toBe(0);
        expect(body.milestoneStats.completed).toBe(1);
      });
    });

    story("Archived projects refuse milestone changes", () => {
      when("admin archives PRJ-001", async () => {
        const { res } = await POST(adminJar, "/api/projects/PRJ-001/archive");
        expect(res.status).toBe(200);
      });
      and_("adding a milestone to the archived project returns 409", async () => {
        const { res, body } = await POST(
          adminJar,
          "/api/projects/PRJ-001/milestones",
          { title: "Should fail" }
        );
        expect(res.status).toBe(409);
        expect(body.error.toLowerCase()).toContain("archived");
      });
      and_("editing an existing milestone on the archived project returns 409", async () => {
        const { res } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/milestones/${state.msId}`,
          { title: "Cannot edit" }
        );
        expect(res.status).toBe(409);
      });
      and_("restoring the project lets edits proceed again", async () => {
        await POST(adminJar, "/api/projects/PRJ-001/restore");
        const { res } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/milestones/${state.msId}`,
          { title: "Beta launch (post-restore)" }
        );
        expect(res.status).toBe(200);
      });
    });

    story("Delete a milestone — gone from detail bundle, cascade clean", () => {
      when("admin DELETEs the milestone", async () => {
        const { res, body } = await http(
          adminJar,
          "DELETE",
          API,
          `/api/milestones/${state.msId}`
        );
        expect(res.status).toBe(200);
        expect(body.ok).toBe(true);
      });
      then("the milestone no longer appears in the project bundle", async () => {
        const { body } = await GET(adminJar, "/api/projects/PRJ-001");
        const found = body.milestones.find((m) => m.id === state.msId);
        expect(found).toBe(undefined);
      });
      and_("deleting again returns 404", async () => {
        const { res } = await http(
          adminJar,
          "DELETE",
          API,
          `/api/milestones/${state.msId}`
        );
        expect(res.status).toBe(404);
      });
    });

    story("Deleting a project cascades and removes its milestones", () => {
      let msId;
      when("admin adds a milestone to PRJ-005", async () => {
        const { res, body } = await POST(
          adminJar,
          "/api/projects/PRJ-005/milestones",
          { title: "Will be cascade-deleted" }
        );
        expect(res.status).toBe(201);
        msId = body.milestone.id;
      });
      and_("admin DELETEs PRJ-005", async () => {
        const { res } = await http(
          adminJar,
          "DELETE",
          API,
          "/api/projects/PRJ-005"
        );
        expect(res.status).toBe(200);
      });
      then("the milestone is gone too (FK ON DELETE CASCADE)", async () => {
        const { res } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/milestones/${msId}`,
          { title: "Anything" }
        );
        expect(res.status).toBe(404);
      });
    });
  }
);

persona(
  "Milestones RBAC — admin/manager can write, member cannot",
  {
    setup: async () => {
      await preflight();
      const { sql } = await import("../lib/db.js");
      const managerHash = await bcrypt.hash("Manager-2026!", 12);
      const memberHash = await bcrypt.hash("Member-2026!", 12);
      await sql`UPDATE users SET password_hash = ${managerHash} WHERE id = 'USR-002'`;
      await sql`UPDATE users SET password_hash = ${memberHash} WHERE id = 'USR-003'`;
    },
  },
  () => {
    const jars = { admin: new Jar(), manager: new Jar(), member: new Jar() };
    const state = { sharedMsId: null };

    story("All three roles sign in", () => {
      when("admin logs in", async () => {
        const { res } = await POST(jars.admin, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
      and_("manager logs in", async () => {
        const { res } = await POST(jars.manager, "/api/auth/login", {
          email: "jane@hub.com",
          password: "Manager-2026!",
        });
        expect(res.status).toBe(200);
      });
      and_("member logs in", async () => {
        const { res } = await POST(jars.member, "/api/auth/login", {
          email: "mark@hub.com",
          password: "Member-2026!",
        });
        expect(res.status).toBe(200);
      });
    });

    story("Every role can READ milestones via the project detail bundle", () => {
      when("admin creates one milestone so the read tests have a subject", async () => {
        const { res, body } = await POST(
          jars.admin,
          "/api/projects/PRJ-001/milestones",
          { title: "Shared milestone for RBAC reads" }
        );
        expect(res.status).toBe(201);
        state.sharedMsId = body.milestone.id;
      });
      for (const [name, jarKey] of [
        ["admin", "admin"],
        ["manager", "manager"],
        ["member", "member"],
      ]) {
        and_(`${name} can see the milestone in the detail bundle`, async () => {
          const { body } = await GET(jars[jarKey], "/api/projects/PRJ-001");
          expect(body.milestones.find((m) => m.id === state.sharedMsId)).toBeTruthy();
        });
      }
    });

    story("Member is 403 on every milestone write", () => {
      and_("member cannot POST a milestone", async () => {
        const { res } = await POST(
          jars.member,
          "/api/projects/PRJ-001/milestones",
          { title: "Forbidden" }
        );
        expect(res.status).toBe(403);
      });
      and_("member cannot PATCH a milestone", async () => {
        const { res } = await http(
          jars.member,
          "PATCH",
          API,
          `/api/milestones/${state.sharedMsId}`,
          { title: "Forbidden" }
        );
        expect(res.status).toBe(403);
      });
      and_("member cannot complete a milestone", async () => {
        const { res } = await POST(
          jars.member,
          `/api/milestones/${state.sharedMsId}/complete`
        );
        expect(res.status).toBe(403);
      });
      and_("member cannot reopen a milestone", async () => {
        const { res } = await POST(
          jars.member,
          `/api/milestones/${state.sharedMsId}/reopen`
        );
        expect(res.status).toBe(403);
      });
      and_("member cannot DELETE a milestone", async () => {
        const { res } = await http(
          jars.member,
          "DELETE",
          API,
          `/api/milestones/${state.sharedMsId}`
        );
        expect(res.status).toBe(403);
      });
    });

    story("Manager can drive the full milestone lifecycle", () => {
      let mgrMsId;
      when("manager adds a milestone", async () => {
        const { res, body } = await POST(
          jars.manager,
          "/api/projects/PRJ-002/milestones",
          { title: "Manager-driven milestone", due_date: "2026-11-01" }
        );
        expect(res.status).toBe(201);
        mgrMsId = body.milestone.id;
      });
      and_("manager edits it", async () => {
        const { res } = await http(
          jars.manager,
          "PATCH",
          API,
          `/api/milestones/${mgrMsId}`,
          { title: "Manager-driven (revised)" }
        );
        expect(res.status).toBe(200);
      });
      and_("manager completes it", async () => {
        const { res } = await POST(
          jars.manager,
          `/api/milestones/${mgrMsId}/complete`
        );
        expect(res.status).toBe(200);
      });
      and_("manager reopens it", async () => {
        const { res } = await POST(
          jars.manager,
          `/api/milestones/${mgrMsId}/reopen`
        );
        expect(res.status).toBe(200);
      });
      and_("manager DELETEs it", async () => {
        const { res } = await http(
          jars.manager,
          "DELETE",
          API,
          `/api/milestones/${mgrMsId}`
        );
        expect(res.status).toBe(200);
      });
    });

    story("Anonymous callers are 401 for every milestone write endpoint", () => {
      when("each write endpoint is hit without auth", async () => {
        const { res: r1 } = await POST(null, "/api/projects/PRJ-001/milestones", {
          title: "x",
        });
        const { res: r2 } = await http(
          null,
          "PATCH",
          API,
          `/api/milestones/${state.sharedMsId}`,
          { title: "x" }
        );
        const { res: r3 } = await POST(
          null,
          `/api/milestones/${state.sharedMsId}/complete`
        );
        const { res: r4 } = await POST(
          null,
          `/api/milestones/${state.sharedMsId}/reopen`
        );
        const { res: r5 } = await http(
          null,
          "DELETE",
          API,
          `/api/milestones/${state.sharedMsId}`
        );
        expect(r1.status).toBe(401);
        expect(r2.status).toBe(401);
        expect(r3.status).toBe(401);
        expect(r4.status).toBe(401);
        expect(r5.status).toBe(401);
      });
    });
  }
);

// ===== TASK MANAGEMENT MODULE ===============================================
// Section 5 of the proposal. Three personas cover (1) the full CRUD lifecycle
// and quick-action endpoints, (2) every filter on GET /api/tasks, and (3) the
// three-role permission matrix including the assignee-can-update-own-task
// carve-out.

persona(
  "Task CRUD lifecycle + quick actions",
  {
    setup: async () => {
      await preflight();
    },
  },
  () => {
    const adminJar = new Jar();
    const state = { createdId: null };

    story("Admin signs in", () => {
      when("admin logs in", async () => {
        const { res } = await POST(adminJar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
    });

    story("Create Task — POST writes every Section 5 feature", () => {
      when("admin POSTs a fully-populated task", async () => {
        const { res, body } = await POST(adminJar, "/api/tasks", {
          project_id: "PRJ-001",
          title: "Design system audit",
          description: "Tighten spacing tokens + colour ramps before beta.",
          status: "To Do",
          priority: "High",
          due_date: "2026-09-15",
          assignee_id: "USR-002",
          estimated_hours: 8,
          actual_hours: 0,
          tags: ["design", "audit", "q3"],
        });
        expect(res.status).toBe(201);
        const t = body.task;
        expect(t.id).toMatch(/^ASN-\d{3}$/);
        expect(t.title).toBe("Design system audit");
        expect(t.description).toBe(
          "Tighten spacing tokens + colour ramps before beta."
        );
        expect(t.status).toBe("To Do");
        expect(t.priority).toBe("High");
        expect(t.due_date).toBe("2026-09-15");
        expect(t.assignee_id).toBe("USR-002");
        expect(t.assignee_name).toBe("Jane Smith");
        expect(t.assigner_id).toBe(
          "USR-001",
          "the creator is recorded as the assigner"
        );
        expect(Number(t.estimated_hours)).toBe(8);
        expect(Number(t.actual_hours)).toBe(0);
        expect(t.tags).toEqual(["design", "audit", "q3"]);
        expect(t.project_id).toBe("PRJ-001");
        expect(t.project_name).toBe("Website Redesign");
        state.createdId = t.id;
      });
      and_("two activity entries fire — the creation + the assignment", async () => {
        const { body } = await GET(adminJar, "/api/activity?limit=10");
        const creation = body.items.find((a) =>
          a.message.includes("Design system audit") &&
          a.message.toLowerCase().includes("added")
        );
        const assigned = body.items.find(
          (a) =>
            a.message.includes("Design system audit") &&
            a.message.toLowerCase().includes("assigned to jane")
        );
        expect(creation).toBeTruthy();
        expect(assigned).toBeTruthy();
      });
    });

    story("View Task — GET /api/tasks/:id returns full bundle", () => {
      let body;
      when("admin opens the task detail", async () => {
        const res = await GET(adminJar, `/api/tasks/${state.createdId}`);
        expect(res.res.status).toBe(200);
        body = res.body;
      });
      then("the task envelope is populated", () => {
        expect(body.task.id).toBe(state.createdId);
        expect(body.task.assigner_name).toBe("Admin User");
      });
      and_("the activity tail is included", () => {
        expect(Array.isArray(body.activity)).toBeTruthy();
        expect(body.activity.length > 0).toBeTruthy();
      });
      and_("missing task returns 404", async () => {
        const { res } = await GET(adminJar, "/api/tasks/ASN-NEVER");
        expect(res.status).toBe(404);
      });
    });

    story("Update Task — PATCH writes the diff + logs human-readable events", () => {
      when("admin PATCHes title + tags + actual_hours", async () => {
        const { res, body } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/tasks/${state.createdId}`,
          {
            title: "Design system audit (sprint 2)",
            tags: ["design", "audit", "q3", "sprint-2"],
            actual_hours: 3.5,
          }
        );
        expect(res.status).toBe(200);
        expect(body.task.title).toBe("Design system audit (sprint 2)");
        expect(Number(body.task.actual_hours)).toBe(3.5);
        expect(body.changed.sort()).toEqual(["actual_hours", "tags", "title"]);
      });
      and_("a no-op PATCH returns empty changed", async () => {
        const { res, body } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/tasks/${state.createdId}`,
          { title: "Design system audit (sprint 2)" }
        );
        expect(res.status).toBe(200);
        expect(body.changed.length).toBe(0);
      });
      and_("a generic 'updated' activity is recorded", async () => {
        const { body } = await GET(adminJar, "/api/activity?limit=10");
        const updated = body.items.find(
          (a) =>
            a.message.includes("Design system audit (sprint 2)") &&
            a.message.toLowerCase().includes("updated")
        );
        expect(updated).toBeTruthy();
        expect(updated.message).toContain("title");
        expect(updated.message).toContain("tags");
        expect(updated.message).toContain("actual_hours");
      });
    });

    story("Change Status — moving to Done writes the bespoke 'marked complete' message", () => {
      when("admin PATCHes status to Done", async () => {
        const { res, body } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/tasks/${state.createdId}`,
          { status: "Done" }
        );
        expect(res.status).toBe(200);
        expect(body.task.status).toBe("Done");
        expect(body.task.completed_at).toBeTruthy();
      });
      then("the activity feed shows the 'marked complete' event", async () => {
        const { body } = await GET(adminJar, "/api/activity?limit=10");
        const evt = body.items.find((a) =>
          a.message.includes("marked complete")
        );
        expect(evt).toBeTruthy();
        expect(evt.tone).toBe("success");
      });
      and_("reopening clears completed_at and writes the reopen event", async () => {
        const { res, body } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/tasks/${state.createdId}`,
          { status: "In Progress" }
        );
        expect(res.status).toBe(200);
        expect(body.task.status).toBe("In Progress");
        expect(body.task.completed_at).toBe(null);
        const a = await GET(adminJar, "/api/activity?limit=10");
        expect(
          a.body.items.find((x) => x.message.toLowerCase().includes("reopened"))
        ).toBeTruthy();
      });
    });

    story("Set Priority via PATCH writes a generic update event", () => {
      when("admin bumps priority Low → Critical", async () => {
        const { res, body } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/tasks/${state.createdId}`,
          { priority: "Critical" }
        );
        expect(res.status).toBe(200);
        expect(body.task.priority).toBe("Critical");
        expect(body.changed).toEqual(["priority"]);
      });
    });

    story("Reassign Task — assignee_id change writes the rename-aware event", () => {
      when("admin PATCHes assignee_id from Jane → Mark", async () => {
        const { res, body } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/tasks/${state.createdId}`,
          { assignee_id: "USR-003" }
        );
        expect(res.status).toBe(200);
        expect(body.task.assignee_id).toBe("USR-003");
        expect(body.task.assignee_name).toBe("Mark Lee");
      });
      and_("the activity log names both sides of the swap", async () => {
        const { body } = await GET(adminJar, "/api/activity?limit=10");
        const evt = body.items.find(
          (a) =>
            a.message.includes("reassigned") &&
            a.message.includes("Jane Smith") &&
            a.message.includes("Mark Lee")
        );
        expect(evt).toBeTruthy();
      });
      and_("reassigning to an unknown user returns 400", async () => {
        const { res, body } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/tasks/${state.createdId}`,
          { assignee_id: "USR-NONE" }
        );
        expect(res.status).toBe(400);
        expect(body.error.toLowerCase()).toContain("assignee");
      });
    });

    story("Validation blocks bad input on create + update", () => {
      and_("missing title is rejected", async () => {
        const { res, body } = await POST(adminJar, "/api/tasks", {
          project_id: "PRJ-001",
          title: " ",
        });
        expect(res.status).toBe(400);
        expect(body.error.toLowerCase()).toContain("title");
      });
      and_("missing project_id is rejected", async () => {
        const { res, body } = await POST(adminJar, "/api/tasks", {
          title: "Floating task",
        });
        expect(res.status).toBe(400);
        expect(body.error.toLowerCase()).toContain("project_id");
      });
      and_("non-existent project_id is rejected", async () => {
        const { res, body } = await POST(adminJar, "/api/tasks", {
          project_id: "PRJ-NOPE",
          title: "Doomed",
        });
        expect(res.status).toBe(400);
        expect(body.error.toLowerCase()).toContain("project");
      });
      and_("bad priority is rejected", async () => {
        const { res, body } = await POST(adminJar, "/api/tasks", {
          project_id: "PRJ-001",
          title: "Bad priority",
          priority: "Urgent",
        });
        expect(res.status).toBe(400);
        expect(body.error.toLowerCase()).toContain("priority");
      });
      and_("bad status is rejected", async () => {
        const { res, body } = await POST(adminJar, "/api/tasks", {
          project_id: "PRJ-001",
          title: "Bad status",
          status: "Cancelled",
        });
        expect(res.status).toBe(400);
        expect(body.error.toLowerCase()).toContain("status");
      });
      and_("negative actual_hours is rejected", async () => {
        const { res, body } = await POST(adminJar, "/api/tasks", {
          project_id: "PRJ-001",
          title: "Negative hours",
          actual_hours: -1,
        });
        expect(res.status).toBe(400);
        expect(body.error.toLowerCase()).toContain("hours");
      });
      and_("non-numeric hours is rejected", async () => {
        const { res, body } = await POST(adminJar, "/api/tasks", {
          project_id: "PRJ-001",
          title: "NaN hours",
          estimated_hours: "soon",
        });
        expect(res.status).toBe(400);
        expect(body.error.toLowerCase()).toContain("hours");
      });
    });

    story("Archived-project guard — cannot create or edit tasks on archived projects", () => {
      when("admin archives PRJ-005", async () => {
        const { res } = await POST(adminJar, "/api/projects/PRJ-005/archive");
        expect(res.status).toBe(200);
      });
      and_("creating a task in the archived project returns 409", async () => {
        const { res, body } = await POST(adminJar, "/api/tasks", {
          project_id: "PRJ-005",
          title: "Should fail",
        });
        expect(res.status).toBe(409);
        expect(body.error.toLowerCase()).toContain("archived");
      });
      and_("editing ASN-005 (under PRJ-005) returns 409", async () => {
        const { res } = await http(
          adminJar,
          "PATCH",
          API,
          "/api/tasks/ASN-005",
          { status: "Done" }
        );
        expect(res.status).toBe(409);
      });
      and_("restoring PRJ-005 lets edits proceed", async () => {
        await POST(adminJar, "/api/projects/PRJ-005/restore");
        const { res } = await http(
          adminJar,
          "PATCH",
          API,
          "/api/tasks/ASN-005",
          { status: "Done" }
        );
        expect(res.status).toBe(200);
      });
    });

    story("Delete Task — hard delete + activity entry + 404 on re-delete", () => {
      when("admin DELETEs the task we created", async () => {
        const { res, body } = await http(
          adminJar,
          "DELETE",
          API,
          `/api/tasks/${state.createdId}`
        );
        expect(res.status).toBe(200);
        expect(body.ok).toBe(true);
      });
      then("a subsequent GET returns 404", async () => {
        const { res } = await GET(adminJar, `/api/tasks/${state.createdId}`);
        expect(res.status).toBe(404);
      });
      and_("an activity entry was recorded", async () => {
        const { body } = await GET(adminJar, "/api/activity?limit=10");
        const evt = body.items.find(
          (a) =>
            a.message.includes("Design system audit") &&
            a.message.toLowerCase().includes("deleted")
        );
        expect(evt).toBeTruthy();
      });
    });
  }
);

persona(
  "Task filters & search (every query parameter exercised)",
  {
    setup: async () => {
      await preflight();
    },
  },
  () => {
    const adminJar = new Jar();

    story("Admin signs in for the filter stories", () => {
      when("admin logs in", async () => {
        const { res } = await POST(adminJar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
    });

    story("?project_id scopes the list to a single project", () => {
      when("admin filters tasks to PRJ-003", async () => {
        const { body } = await GET(
          adminJar,
          "/api/tasks?project_id=PRJ-003"
        );
        const ids = body.items.map((t) => t.id).sort();
        expect(ids).toEqual(["ASN-003", "ASN-008"]);
      });
    });

    story("?status filters by status; invalid values 400", () => {
      and_("status=To Do returns exactly the seeded 'To Do' tasks", async () => {
        const { body } = await GET(
          adminJar,
          "/api/tasks?status=To%20Do"
        );
        const ids = body.items.map((t) => t.id).sort();
        // Seed To Do tasks: ASN-002, ASN-004, ASN-006
        expect(ids).toEqual(["ASN-002", "ASN-004", "ASN-006"]);
      });
      and_("an invalid status returns 400", async () => {
        const { res } = await GET(adminJar, "/api/tasks?status=Backlog");
        expect(res.status).toBe(400);
      });
    });

    story("?priority filters by priority; invalid values 400", () => {
      and_("priority=Low returns exactly the Low-priority seed", async () => {
        const { body } = await GET(adminJar, "/api/tasks?priority=Low");
        const ids = body.items.map((t) => t.id).sort();
        expect(ids).toEqual(["ASN-007", "ASN-008"]);
      });
      and_("an invalid priority returns 400", async () => {
        const { res } = await GET(adminJar, "/api/tasks?priority=Urgent");
        expect(res.status).toBe(400);
      });
    });

    story("?assignee_id and ?unassigned scope by assignee", () => {
      and_("assignee_id=USR-002 returns Jane's tasks", async () => {
        const { body } = await GET(
          adminJar,
          "/api/tasks?assignee_id=USR-002"
        );
        const ids = body.items.map((t) => t.id).sort();
        expect(ids).toEqual(["ASN-001", "ASN-005"]);
      });
      and_("creating an unassigned task makes ?unassigned=true work", async () => {
        await POST(adminJar, "/api/tasks", {
          project_id: "PRJ-001",
          title: "Orphan task",
        });
        const { body } = await GET(adminJar, "/api/tasks?unassigned=true");
        const titles = body.items.map((t) => t.title);
        expect(titles).toContain("Orphan task");
        for (const t of body.items) {
          expect(t.assignee_id).toBe(null);
        }
      });
    });

    story("?due_from + ?due_to filter by due date range", () => {
      and_("due_from=2024-05-01 returns the seeded set with that floor", async () => {
        const { body } = await GET(
          adminJar,
          "/api/tasks?due_from=2024-05-01"
        );
        const ids = body.items.map((t) => t.id).sort();
        // Seed due dates >= 2024-05-01:
        // ASN-001 2024-05-01, ASN-002 2024-05-10, ASN-004 2024-06-01,
        // ASN-005 2024-05-20, ASN-008 2024-05-05
        expect(ids).toEqual([
          "ASN-001", "ASN-002", "ASN-004", "ASN-005", "ASN-008",
        ]);
      });
      and_("due_to=2024-04-30 returns tasks due before May", async () => {
        const { body } = await GET(
          adminJar,
          "/api/tasks?due_to=2024-04-30"
        );
        const ids = body.items.map((t) => t.id).sort();
        // ASN-003 2024-04-15, ASN-006 2024-04-20, ASN-007 2024-01-31
        expect(ids).toEqual(["ASN-003", "ASN-006", "ASN-007"]);
      });
    });

    story("?q searches title, description, id, and tags", () => {
      and_('q="penetration" hits the title', async () => {
        const { body } = await GET(adminJar, "/api/tasks?q=penetration");
        expect(body.items.map((t) => t.id)).toContain("ASN-006");
      });
      and_('q matches the id (case-insensitive)', async () => {
        const { body } = await GET(adminJar, "/api/tasks?q=asn-003");
        expect(body.items.length).toBe(1);
        expect(body.items[0].id).toBe("ASN-003");
      });
      and_('q matches a tag we add at runtime', async () => {
        // Add a tag to one task so the search has something to hit.
        await http(adminJar, "PATCH", API, "/api/tasks/ASN-001", {
          tags: ["needs-review"],
        });
        const { body } = await GET(adminJar, "/api/tasks?q=needs-review");
        expect(body.items.map((t) => t.id)).toContain("ASN-001");
      });
    });

    story("Summary + overdue + priority histogram come back with every list call", () => {
      let body;
      when("admin lists tasks with no filters", async () => {
        const res = await GET(adminJar, "/api/tasks");
        body = res.body;
      });
      then("status summary is broken out", () => {
        const counts = Object.fromEntries(
          body.summary.map((s) => [s.status, s.count])
        );
        // From the seed: 3 To Do, 3 In Progress, 2 Done (+ any added above).
        // We just assert the keys are present + numbers are non-negative.
        expect(typeof counts["To Do"]).toBe("number");
        expect(typeof counts["In Progress"]).toBe("number");
        expect(typeof counts["Done"]).toBe("number");
      });
      and_("priority summary is broken out", () => {
        expect(Array.isArray(body.prioritySummary)).toBeTruthy();
        expect(body.prioritySummary.length > 0).toBeTruthy();
      });
      and_("overdueCount is a number", () => {
        expect(typeof body.overdueCount).toBe("number");
      });
    });

    story("Archived projects' tasks are hidden by default and revealed by ?include_archived", () => {
      when("admin archives PRJ-007 (which has ASN-007)", async () => {
        const { res } = await POST(adminJar, "/api/projects/PRJ-007/archive");
        expect(res.status).toBe(200);
      });
      and_("ASN-007 is not in the default list", async () => {
        const { body } = await GET(adminJar, "/api/tasks");
        expect(body.items.find((t) => t.id === "ASN-007")).toBe(undefined);
      });
      and_("?include_archived=true brings it back", async () => {
        const { body } = await GET(
          adminJar,
          "/api/tasks?include_archived=true"
        );
        expect(body.items.find((t) => t.id === "ASN-007")).toBeTruthy();
      });
    });
  }
);

persona(
  "Task RBAC — admin/manager full edit; assignee restricted edit; member otherwise read-only",
  {
    setup: async () => {
      await preflight();
      const { sql } = await import("../lib/db.js");
      const managerHash = await bcrypt.hash("Manager-2026!", 12);
      const memberHash = await bcrypt.hash("Member-2026!", 12);
      const otherHash = await bcrypt.hash("Other-2026!", 12);
      await sql`UPDATE users SET password_hash = ${managerHash} WHERE id = 'USR-002'`;
      await sql`UPDATE users SET password_hash = ${memberHash} WHERE id = 'USR-003'`;
      // USR-004 (Alex, member) is the assignee of ASN-002, so we hash their pw
      // too in order to drive the "assignee can update own task" coverage.
      await sql`UPDATE users SET password_hash = ${otherHash} WHERE id = 'USR-004'`;
    },
  },
  () => {
    const jars = {
      admin: new Jar(),
      manager: new Jar(),
      // 'member' is USR-003 (Mark), NOT the assignee of any task initially.
      member: new Jar(),
      // 'assignee' is USR-004 (Alex), seeded as the assignee of ASN-002.
      assignee: new Jar(),
    };

    story("All four jars sign in", () => {
      when("admin signs in", async () => {
        const { res } = await POST(jars.admin, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
      and_("manager (Jane) signs in", async () => {
        const { res } = await POST(jars.manager, "/api/auth/login", {
          email: "jane@hub.com",
          password: "Manager-2026!",
        });
        expect(res.status).toBe(200);
      });
      and_("non-assignee member (Mark) signs in", async () => {
        const { res } = await POST(jars.member, "/api/auth/login", {
          email: "mark@hub.com",
          password: "Member-2026!",
        });
        expect(res.status).toBe(200);
      });
      and_("assignee member (Alex, owns ASN-002) signs in", async () => {
        const { res } = await POST(jars.assignee, "/api/auth/login", {
          email: "alex@hub.com",
          password: "Other-2026!",
        });
        expect(res.status).toBe(200);
      });
    });

    story("Every role can READ tasks (list + detail)", () => {
      for (const [name, jar] of Object.entries(jars)) {
        and_(`${name} can list tasks`, async () => {
          const { res } = await GET(jar, "/api/tasks");
          expect(res.status).toBe(200);
        });
        and_(`${name} can read a task detail`, async () => {
          const { res } = await GET(jar, "/api/tasks/ASN-001");
          expect(res.status).toBe(200);
        });
      }
    });

    story("Non-assignee member is 403 on every write", () => {
      and_("member cannot POST a task", async () => {
        const { res } = await POST(jars.member, "/api/tasks", {
          project_id: "PRJ-001",
          title: "Forbidden",
        });
        expect(res.status).toBe(403);
      });
      and_("member cannot PATCH a task they don't own", async () => {
        const { res } = await http(
          jars.member,
          "PATCH",
          API,
          "/api/tasks/ASN-002",
          { status: "Done" }
        );
        expect(res.status).toBe(403);
      });
      and_("member cannot DELETE a task", async () => {
        const { res } = await http(
          jars.member,
          "DELETE",
          API,
          "/api/tasks/ASN-002"
        );
        expect(res.status).toBe(403);
      });
    });

    story("Assignee can update their OWN task — but only status and actual_hours", () => {
      and_("Alex can flip status on ASN-002 (their own task)", async () => {
        const { res, body } = await http(
          jars.assignee,
          "PATCH",
          API,
          "/api/tasks/ASN-002",
          { status: "In Progress" }
        );
        expect(res.status).toBe(200);
        expect(body.task.status).toBe("In Progress");
      });
      and_("Alex can log actual_hours on ASN-002", async () => {
        const { res, body } = await http(
          jars.assignee,
          "PATCH",
          API,
          "/api/tasks/ASN-002",
          { actual_hours: 2.5 }
        );
        expect(res.status).toBe(200);
        expect(Number(body.task.actual_hours)).toBe(2.5);
      });
      and_("Alex CANNOT change priority on their own task", async () => {
        const { res, body } = await http(
          jars.assignee,
          "PATCH",
          API,
          "/api/tasks/ASN-002",
          { priority: "Critical" }
        );
        expect(res.status).toBe(403);
        expect(body.error.toLowerCase()).toContain("priority");
      });
      and_("Alex CANNOT change due_date on their own task", async () => {
        const { res, body } = await http(
          jars.assignee,
          "PATCH",
          API,
          "/api/tasks/ASN-002",
          { due_date: "2030-01-01" }
        );
        expect(res.status).toBe(403);
        expect(body.error.toLowerCase()).toContain("due_date");
      });
      and_("Alex CANNOT reassign their own task to someone else", async () => {
        const { res, body } = await http(
          jars.assignee,
          "PATCH",
          API,
          "/api/tasks/ASN-002",
          { assignee_id: "USR-003" }
        );
        expect(res.status).toBe(403);
        expect(body.error.toLowerCase()).toContain("assignee_id");
      });
      and_("Alex CANNOT touch a task they're NOT assigned to", async () => {
        const { res } = await http(
          jars.assignee,
          "PATCH",
          API,
          "/api/tasks/ASN-001",
          { status: "Done" }
        );
        expect(res.status).toBe(403);
      });
      and_("Alex CANNOT delete their own task", async () => {
        const { res } = await http(
          jars.assignee,
          "DELETE",
          API,
          "/api/tasks/ASN-002"
        );
        expect(res.status).toBe(403);
      });
    });

    story("Manager can drive the full lifecycle (create / edit / reassign / delete)", () => {
      let mgrTaskId;
      when("manager creates a task", async () => {
        const { res, body } = await POST(jars.manager, "/api/tasks", {
          project_id: "PRJ-002",
          title: "Manager-created task",
          priority: "Medium",
        });
        expect(res.status).toBe(201);
        mgrTaskId = body.task.id;
      });
      and_("manager edits everything", async () => {
        const { res } = await http(
          jars.manager,
          "PATCH",
          API,
          `/api/tasks/${mgrTaskId}`,
          {
            title: "Manager-created (renamed)",
            priority: "High",
            due_date: "2026-12-31",
            assignee_id: "USR-004",
            estimated_hours: 4,
          }
        );
        expect(res.status).toBe(200);
      });
      and_("manager marks complete", async () => {
        const { res } = await http(
          jars.manager,
          "PATCH",
          API,
          `/api/tasks/${mgrTaskId}`,
          { status: "Done" }
        );
        expect(res.status).toBe(200);
      });
      and_("manager DELETEs", async () => {
        const { res } = await http(
          jars.manager,
          "DELETE",
          API,
          `/api/tasks/${mgrTaskId}`
        );
        expect(res.status).toBe(200);
      });
    });

    story("Anonymous callers are 401 on every task write endpoint", () => {
      when("each task write endpoint is hit without auth", async () => {
        const { res: r1 } = await POST(null, "/api/tasks", {
          project_id: "PRJ-001",
          title: "x",
        });
        const { res: r2 } = await http(null, "PATCH", API, "/api/tasks/ASN-001", {
          status: "Done",
        });
        const { res: r3 } = await http(null, "DELETE", API, "/api/tasks/ASN-001");
        expect(r1.status).toBe(401);
        expect(r2.status).toBe(401);
        expect(r3.status).toBe(401);
      });
    });
  }
);

// ============================================================================
// SECTION 6: Task Assignment
//
//   Verifies the lifecycle of every assignment-related capability spelled out
//   in the proposal:
//     • Assign Task to User
//     • Multiple Assignees (Optional)
//     • Reassign Tasks
//     • Unassign Tasks
//     • Assignment History
//
//   The audit table is the single source of truth for "who is/was on this
//   task". `tasks.assignee_id` is the lead-pointer and the invariant is that
//   "lead set ⇒ open audit row exists". These stories exercise every edge of
//   that invariant from both the lead-management endpoint (PATCH /api/tasks)
//   and the dedicated co-assignee endpoints.
// ============================================================================

persona(
  "Task Assignment — lifecycle, multi-assignees, reassign, unassign, history",
  {
    setup: async () => {
      await preflight();
    },
  },
  () => {
    const jar = new Jar();
    let createdTaskId;

    story("Admin signs in", () => {
      when("admin signs in", async () => {
        const { res } = await POST(jar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
    });

    story("Seeded tasks already have an open assignment audit row", () => {
      then(
        "GET /api/tasks/ASN-001 returns 1 active assignee with is_lead=true and history of 1",
        async () => {
          const { res, body } = await GET(jar, "/api/tasks/ASN-001");
          expect(res.status).toBe(200);
          expect(Array.isArray(body.assignees)).toBeTruthy("assignees missing");
          expect(body.assignees.length).toBe(1);
          expect(body.assignees[0].user_id).toBe("USR-002");
          expect(body.assignees[0].is_lead).toBeTruthy("seeded lead should be flagged");
          expect(body.assignmentHistory.length).toBe(1);
          expect(body.assignmentHistory[0].unassigned_at).toBe(null);
        }
      );
      and_(
        "list rows expose active_assignees so the UI can render a +N badge",
        async () => {
          const { res, body } = await GET(jar, "/api/tasks?project=PRJ-001");
          expect(res.status).toBe(200);
          const t = body.items.find((x) => x.id === "ASN-001");
          expect(t).toBeTruthy("ASN-001 should be in the list");
          expect(t.active_assignees).toBe(1);
        }
      );
    });

    story("Creating a NEW task seeds the audit row immediately", () => {
      when("admin creates a fresh task assigned to Jane (USR-002)", async () => {
        const { res, body } = await POST(jar, "/api/tasks", {
          project_id: "PRJ-001",
          title: "Assignment fixture task",
          priority: "Medium",
          assignee_id: "USR-002",
        });
        expect(res.status).toBe(201);
        createdTaskId = body.task.id;
      });
      then("the detail bundle shows Jane as the lead AND in the history", async () => {
        const { res, body } = await GET(jar, `/api/tasks/${createdTaskId}`);
        expect(res.status).toBe(200);
        expect(body.assignees.length).toBe(1);
        expect(body.assignees[0].user_id).toBe("USR-002");
        expect(body.assignees[0].is_lead).toBeTruthy();
        expect(body.assignmentHistory.length).toBe(1);
      });
    });

    story("Adding a co-assignee (multiple assignees)", () => {
      and_("admin adds Mark (USR-003) as a co-assignee", async () => {
        const { res, body } = await POST(
          jar,
          `/api/tasks/${createdTaskId}/assignees`,
          { user_id: "USR-003" }
        );
        expect(res.status).toBe(201);
        expect(body.assignees.length).toBe(2);
        const lead = body.assignees.find((a) => a.is_lead);
        const co = body.assignees.find((a) => !a.is_lead);
        expect(lead.user_id).toBe("USR-002");
        expect(co.user_id).toBe("USR-003");
      });
      and_("the list-row count bumps to 2", async () => {
        const { res, body } = await GET(jar, `/api/tasks/${createdTaskId}`);
        expect(res.status).toBe(200);
        expect(body.task.active_assignees).toBe(2);
      });
      and_("history now has 2 rows, both currently open", async () => {
        const { res, body } = await GET(jar, `/api/tasks/${createdTaskId}`);
        expect(res.status).toBe(200);
        const open = body.assignmentHistory.filter((h) => h.unassigned_at === null);
        expect(open.length).toBe(2);
      });
    });

    story("Adding a duplicate assignee is rejected with 409", () => {
      then("adding Mark a second time → 409", async () => {
        const { res, body } = await POST(
          jar,
          `/api/tasks/${createdTaskId}/assignees`,
          { user_id: "USR-003" }
        );
        expect(res.status).toBe(409);
        expect(body.error.toLowerCase()).toContain("already assigned");
      });
      and_("adding a non-existent user is rejected with 400", async () => {
        const { res } = await POST(
          jar,
          `/api/tasks/${createdTaskId}/assignees`,
          { user_id: "USR-DOES-NOT-EXIST" }
        );
        expect(res.status).toBe(400);
      });
      and_("posting against a non-existent task is 404", async () => {
        const { res } = await POST(
          jar,
          `/api/tasks/ASN-DOES-NOT-EXIST/assignees`,
          { user_id: "USR-003" }
        );
        expect(res.status).toBe(404);
      });
    });

    story("Reassigning the lead closes the OLD audit row and opens the NEW", () => {
      when("admin reassigns lead from Jane (USR-002) to Sara (USR-005)", async () => {
        const { res } = await http(
          jar,
          "PATCH",
          API,
          `/api/tasks/${createdTaskId}`,
          { assignee_id: "USR-005" }
        );
        expect(res.status).toBe(200);
      });
      then(
        "Jane's audit row is now CLOSED and Sara's is OPEN with is_lead",
        async () => {
          const { res, body } = await GET(jar, `/api/tasks/${createdTaskId}`);
          expect(res.status).toBe(200);
          // Active assignees = Mark (co) + Sara (new lead). Jane is gone.
          const ids = body.assignees.map((a) => a.user_id).sort();
          expect(ids).toEqual(["USR-003", "USR-005"]);
          const lead = body.assignees.find((a) => a.is_lead);
          expect(lead.user_id).toBe("USR-005");

          // History now has 3 rows; Jane's must be closed, Mark + Sara open.
          const janeRow = body.assignmentHistory.find(
            (h) => h.user_id === "USR-002"
          );
          expect(janeRow).toBeTruthy("Jane should still appear in history");
          expect(janeRow.unassigned_at).toBeTruthy(
            "Jane's row should be closed after reassignment"
          );
          expect(janeRow.unassigned_by_name).toBe("Admin User");
        }
      );
    });

    story("Promoting an existing co-assignee to lead does NOT duplicate audit row", () => {
      when("admin promotes Mark (currently a co) to lead", async () => {
        const { res } = await http(
          jar,
          "PATCH",
          API,
          `/api/tasks/${createdTaskId}`,
          { assignee_id: "USR-003" }
        );
        expect(res.status).toBe(200);
      });
      then(
        "Mark has exactly ONE open audit row (no duplicate) and is the lead",
        async () => {
          const { res, body } = await GET(jar, `/api/tasks/${createdTaskId}`);
          expect(res.status).toBe(200);
          const lead = body.assignees.find((a) => a.is_lead);
          expect(lead.user_id).toBe("USR-003");
          const markOpenRows = body.assignmentHistory.filter(
            (h) => h.user_id === "USR-003" && h.unassigned_at === null
          );
          expect(markOpenRows.length).toBe(1);
        }
      );
      and_("Sara (the previous lead) is now a co-assignee, NOT removed", async () => {
        const { res, body } = await GET(jar, `/api/tasks/${createdTaskId}`);
        expect(res.status).toBe(200);
        const sara = body.assignees.find((a) => a.user_id === "USR-005");
        expect(sara).toBeTruthy("Sara should still be assigned");
        expect(sara.is_lead).toBe(false);
      });
    });

    story("Removing a co-assignee closes their row but doesn't touch the lead", () => {
      when("admin removes Sara from the task", async () => {
        const { res, body } = await http(
          jar,
          "DELETE",
          API,
          `/api/tasks/${createdTaskId}/assignees/USR-005`
        );
        expect(res.status).toBe(200);
        expect(body.assignees.length).toBe(1);
        expect(body.assignees[0].user_id).toBe("USR-003");
      });
      then("Sara's audit row is closed; Mark remains lead", async () => {
        const { res, body } = await GET(jar, `/api/tasks/${createdTaskId}`);
        expect(res.status).toBe(200);
        expect(body.task.assignee_id).toBe("USR-003");
        const saraRow = body.assignmentHistory.find(
          (h) => h.user_id === "USR-005"
        );
        expect(saraRow.unassigned_at).toBeTruthy();
      });
    });

    story("Removing the LEAD assignee also clears tasks.assignee_id", () => {
      when("admin removes Mark (currently lead) via DELETE /assignees", async () => {
        const { res, body } = await http(
          jar,
          "DELETE",
          API,
          `/api/tasks/${createdTaskId}/assignees/USR-003`
        );
        expect(res.status).toBe(200);
        expect(body.assignees.length).toBe(0);
      });
      then(
        "tasks.assignee_id is now NULL and there are zero open audit rows",
        async () => {
          const { res, body } = await GET(jar, `/api/tasks/${createdTaskId}`);
          expect(res.status).toBe(200);
          expect(body.task.assignee_id).toBe(null);
          expect(body.task.active_assignees).toBe(0);
          const openCount = body.assignmentHistory.filter(
            (h) => h.unassigned_at === null
          ).length;
          expect(openCount).toBe(0);
        }
      );
    });

    story("Unassigning via PATCH assignee_id=null closes the open row", () => {
      let scratchTaskId;
      when("admin creates a fresh task assigned to Alex (USR-004)", async () => {
        const { res, body } = await POST(jar, "/api/tasks", {
          project_id: "PRJ-002",
          title: "Unassign-via-patch fixture",
          assignee_id: "USR-004",
        });
        expect(res.status).toBe(201);
        scratchTaskId = body.task.id;
      });
      and_("admin PATCHes assignee_id to null (unassign)", async () => {
        const { res } = await http(
          jar,
          "PATCH",
          API,
          `/api/tasks/${scratchTaskId}`,
          { assignee_id: null }
        );
        expect(res.status).toBe(200);
      });
      then("Alex's audit row is closed and lead pointer is null", async () => {
        const { res, body } = await GET(jar, `/api/tasks/${scratchTaskId}`);
        expect(res.status).toBe(200);
        expect(body.task.assignee_id).toBe(null);
        expect(body.assignees.length).toBe(0);
        const alex = body.assignmentHistory.find(
          (h) => h.user_id === "USR-004"
        );
        expect(alex.unassigned_at).toBeTruthy();
      });
      and_("the unassignment is logged in the activity feed", async () => {
        const { res, body } = await GET(jar, "/api/activity?limit=20");
        expect(res.status).toBe(200);
        const msg = body.items.find(
          (a) =>
            a.message.includes("unassigned from Alex Turner") &&
            a.message.includes("Unassign-via-patch fixture")
        );
        expect(msg).toBeTruthy(
          "Expected an 'unassigned from Alex Turner' activity log"
        );
      });
    });

    story("Dedicated GET /api/tasks/:id/assignments returns full history", () => {
      then("the assignments endpoint returns the same shape as the bundle", async () => {
        const { res, body } = await GET(
          jar,
          `/api/tasks/${createdTaskId}/assignments`
        );
        expect(res.status).toBe(200);
        expect(Array.isArray(body.items)).toBeTruthy();
        expect(body.items.length).toBeGreaterThan(2);
        for (const item of body.items) {
          expect(typeof item.user_name).toBe("string");
          expect(typeof item.assigned_at).toBe("string");
        }
      });
    });
  }
);

persona(
  "Task Assignment RBAC — admin/manager manage assignees; member can only self-remove",
  {
    setup: async () => {
      await preflight();
      const { sql } = await import("../lib/db.js");
      const managerHash = await bcrypt.hash("Manager-2026!", 12);
      const memberHash = await bcrypt.hash("Member-2026!", 12);
      const alexHash = await bcrypt.hash("Alex-2026!", 12);
      await sql`UPDATE users SET password_hash = ${managerHash} WHERE id = 'USR-002'`;
      await sql`UPDATE users SET password_hash = ${memberHash} WHERE id = 'USR-003'`;
      await sql`UPDATE users SET password_hash = ${alexHash} WHERE id = 'USR-004'`;
    },
  },
  () => {
    const jars = {
      admin: new Jar(),
      manager: new Jar(),
      member: new Jar(), // Mark, USR-003 — NOT seeded on any task
      assignee: new Jar(), // Alex, USR-004 — seeded as lead on ASN-002
    };
    let fixtureTaskId;

    story("All four jars sign in", () => {
      when("admin signs in", async () => {
        const { res } = await POST(jars.admin, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
      and_("manager (Jane) signs in", async () => {
        const { res } = await POST(jars.manager, "/api/auth/login", {
          email: "jane@hub.com",
          password: "Manager-2026!",
        });
        expect(res.status).toBe(200);
      });
      and_("non-assignee member (Mark) signs in", async () => {
        const { res } = await POST(jars.member, "/api/auth/login", {
          email: "mark@hub.com",
          password: "Member-2026!",
        });
        expect(res.status).toBe(200);
      });
      and_("assignee (Alex) signs in", async () => {
        const { res } = await POST(jars.assignee, "/api/auth/login", {
          email: "alex@hub.com",
          password: "Alex-2026!",
        });
        expect(res.status).toBe(200);
      });
    });

    story("Admin builds a fixture task with multiple assignees", () => {
      when("admin creates task assigned to Alex", async () => {
        const { res, body } = await POST(jars.admin, "/api/tasks", {
          project_id: "PRJ-001",
          title: "RBAC assignment fixture",
          assignee_id: "USR-004",
        });
        expect(res.status).toBe(201);
        fixtureTaskId = body.task.id;
      });
      and_("admin adds Mark and Sara as co-assignees", async () => {
        const r1 = await POST(
          jars.admin,
          `/api/tasks/${fixtureTaskId}/assignees`,
          { user_id: "USR-003" }
        );
        const r2 = await POST(
          jars.admin,
          `/api/tasks/${fixtureTaskId}/assignees`,
          { user_id: "USR-005" }
        );
        expect(r1.res.status).toBe(201);
        expect(r2.res.status).toBe(201);
      });
    });

    story("Manager can manage assignees the same as admin", () => {
      and_("manager can ADD a co-assignee", async () => {
        // First remove a slot so we have room to re-add.
        const { res: rRm } = await http(
          jars.manager,
          "DELETE",
          API,
          `/api/tasks/${fixtureTaskId}/assignees/USR-005`
        );
        expect(rRm.status).toBe(200);
        const { res } = await POST(
          jars.manager,
          `/api/tasks/${fixtureTaskId}/assignees`,
          { user_id: "USR-005" }
        );
        expect(res.status).toBe(201);
      });
      and_("manager can REMOVE a co-assignee they didn't add", async () => {
        const { res } = await http(
          jars.manager,
          "DELETE",
          API,
          `/api/tasks/${fixtureTaskId}/assignees/USR-003`
        );
        expect(res.status).toBe(200);
      });
    });

    story("Non-assignee members are 403 on add and on removing others", () => {
      and_("member cannot POST an assignee", async () => {
        const { res } = await POST(
          jars.member,
          `/api/tasks/${fixtureTaskId}/assignees`,
          { user_id: "USR-003" }
        );
        expect(res.status).toBe(403);
      });
      and_(
        "member cannot DELETE someone ELSE'S assignment (tried to kick Alex)",
        async () => {
          const { res } = await http(
            jars.member,
            "DELETE",
            API,
            `/api/tasks/${fixtureTaskId}/assignees/USR-004`
          );
          expect(res.status).toBe(403);
        }
      );
    });

    story("Assignee can SELF-REMOVE from a task (and only themselves)", () => {
      // Re-add Alex as a normal assignee on the seeded ASN-001 so we have a
      // distinct fixture that doesn't risk leaving the bigger one orphaned.
      let scratch;
      when("admin creates scratch task assigned to Alex", async () => {
        const { res, body } = await POST(jars.admin, "/api/tasks", {
          project_id: "PRJ-002",
          title: "Self-remove fixture",
          assignee_id: "USR-004",
        });
        expect(res.status).toBe(201);
        scratch = body.task.id;
      });
      and_("Alex DELETEs their own assignment → 200", async () => {
        const { res } = await http(
          jars.assignee,
          "DELETE",
          API,
          `/api/tasks/${scratch}/assignees/USR-004`
        );
        expect(res.status).toBe(200);
      });
      then(
        "self-removal of LEAD also clears tasks.assignee_id (same invariant)",
        async () => {
          const { res, body } = await GET(jars.admin, `/api/tasks/${scratch}`);
          expect(res.status).toBe(200);
          expect(body.task.assignee_id).toBe(null);
        }
      );
      and_(
        "Alex CANNOT DELETE somebody else's assignment (tried to kick Mark on the big fixture)",
        async () => {
          // Make sure Mark is currently assigned to the big fixture so the
          // attempt is a meaningful RBAC denial rather than a 404.
          await POST(jars.admin, `/api/tasks/${fixtureTaskId}/assignees`, {
            user_id: "USR-003",
          });
          const { res } = await http(
            jars.assignee,
            "DELETE",
            API,
            `/api/tasks/${fixtureTaskId}/assignees/USR-003`
          );
          expect(res.status).toBe(403);
        }
      );
    });

    story("Anonymous callers are 401 on every assignment write endpoint", () => {
      when("each write endpoint is hit without auth", async () => {
        const r1 = await POST(null, `/api/tasks/${fixtureTaskId}/assignees`, {
          user_id: "USR-003",
        });
        const r2 = await http(
          null,
          "DELETE",
          API,
          `/api/tasks/${fixtureTaskId}/assignees/USR-004`
        );
        expect(r1.res.status).toBe(401);
        expect(r2.res.status).toBe(401);
      });
    });
  }
);

// ============================================================================
// SECTION 7: User Management
//
//   Verifies the lifecycle of every user-administration capability from the
//   proposal:
//     • User CRUD: Add, View, Update, Delete
//     • Profile fields: Name, Email, Role, Department, Profile Picture,
//                       Contact Information, Account Status
//     • Lifecycle: Activate / Deactivate / Reset Password
//
//   The setup re-seeds so each persona starts from a known workspace and
//   every guard (last-admin protection, self-protection, deactivated-login
//   block) is exercised at least once.
// ============================================================================

persona(
  "User Management — admin CRUD, full profile fields, listing filters",
  {
    setup: async () => {
      await preflight();
    },
  },
  () => {
    const jar = new Jar();
    let newUserId;

    story("Admin signs in", () => {
      when("admin signs in", async () => {
        const { res } = await POST(jar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
    });

    story("Listing exposes every profile field for every user", () => {
      then("GET /api/users returns the full enriched shape", async () => {
        const { res, body } = await GET(jar, "/api/users");
        expect(res.status).toBe(200);
        const admin = body.items.find((u) => u.id === "USR-001");
        expect(admin).toBeTruthy("USR-001 should be present");
        for (const key of [
          "id",
          "name",
          "email",
          "role",
          "status",
          "department",
          "phone",
          "avatar_url",
          "created_at",
          "updated_at",
          "projects_owned",
          "tasks_assigned",
          "tasks_done",
        ]) {
          expect(key in admin).toBeTruthy(
            `User row should include "${key}" — got ${JSON.stringify(Object.keys(admin))}`
          );
        }
        expect(admin.status).toBe("Active");
        expect(admin.department).toBe("Operations");
      });
      and_("the response includes statusSummary and departments", async () => {
        const { res, body } = await GET(jar, "/api/users");
        expect(res.status).toBe(200);
        expect(Array.isArray(body.statusSummary)).toBeTruthy();
        const active = body.statusSummary.find((s) => s.status === "Active");
        expect(active.count).toBe(5);
        expect(body.departments.sort()).toEqual([
          "Design",
          "Engineering",
          "Operations",
        ]);
      });
    });

    story("Listing filters work for role, status, department, q", () => {
      and_("?role=manager returns exactly the manager", async () => {
        const { res, body } = await GET(jar, "/api/users?role=manager");
        expect(res.status).toBe(200);
        expect(body.items.length).toBe(1);
        expect(body.items[0].id).toBe("USR-002");
      });
      and_("?department=Engineering returns Jane + Mark", async () => {
        const { res, body } = await GET(
          jar,
          "/api/users?department=Engineering"
        );
        expect(res.status).toBe(200);
        const ids = body.items.map((u) => u.id).sort();
        expect(ids).toEqual(["USR-002", "USR-003"]);
      });
      and_("?q=alex finds Alex by name", async () => {
        const { res, body } = await GET(jar, "/api/users?q=alex");
        expect(res.status).toBe(200);
        const ids = body.items.map((u) => u.id);
        expect(ids.includes("USR-004")).toBeTruthy(
          "Search 'alex' should match Alex Turner"
        );
      });
      and_("?status=Active returns all 5 seeded users", async () => {
        const { res, body } = await GET(jar, "/api/users?status=Active");
        expect(res.status).toBe(200);
        expect(body.items.length).toBe(5);
      });
    });

    story("Admin can create a user with full profile fields", () => {
      when("admin POSTs /api/users with the full payload", async () => {
        const { res, body } = await POST(jar, "/api/users", {
          name: "Pat Rivera",
          email: "pat@uat.test",
          role: "member",
          department: "Marketing",
          phone: "+1 555 999 1234",
          avatar_url: "https://example.com/avatar.png",
        });
        expect(res.status).toBe(201);
        expect(body.user.name).toBe("Pat Rivera");
        expect(body.user.email).toBe("pat@uat.test");
        expect(body.user.role).toBe("member");
        expect(body.user.department).toBe("Marketing");
        expect(body.user.phone).toBe("+1 555 999 1234");
        expect(body.user.avatar_url).toBe("https://example.com/avatar.png");
        expect(body.user.status).toBe("Active");
        newUserId = body.user.id;
      });
      then("the new user is in the listing immediately", async () => {
        const { res, body } = await GET(jar, "/api/users?q=Pat");
        expect(res.status).toBe(200);
        const pat = body.items.find((u) => u.id === newUserId);
        expect(pat).toBeTruthy();
      });
      and_("GET /api/users/:id returns the same record", async () => {
        const { res, body } = await GET(jar, `/api/users/${newUserId}`);
        expect(res.status).toBe(200);
        expect(body.user.id).toBe(newUserId);
        expect(body.user.department).toBe("Marketing");
      });
    });

    story("Creating a user with a duplicate email returns 409", () => {
      then("POST /api/users with admin's email → 409", async () => {
        const { res, body } = await POST(jar, "/api/users", {
          name: "Dup Email",
          email: "admin@hub.com",
        });
        expect(res.status).toBe(409);
        expect(body.error.toLowerCase()).toContain("already registered");
      });
    });

    story("Creation validation: bad email, short password, bad URL", () => {
      and_("missing email → 400", async () => {
        const { res } = await POST(jar, "/api/users", {
          name: "Bad",
          email: "",
        });
        expect(res.status).toBe(400);
      });
      and_("short name → 400", async () => {
        const { res } = await POST(jar, "/api/users", {
          name: "A",
          email: "a@uat.test",
        });
        expect(res.status).toBe(400);
      });
      and_("password < 8 chars → 400", async () => {
        const { res } = await POST(jar, "/api/users", {
          name: "Bob",
          email: "bob@uat.test",
          password: "short",
        });
        expect(res.status).toBe(400);
      });
      and_("avatar_url with no scheme → 400", async () => {
        const { res } = await POST(jar, "/api/users", {
          name: "Cara",
          email: "cara@uat.test",
          avatar_url: "not-a-url",
        });
        expect(res.status).toBe(400);
      });
      and_("phone with garbage → 400", async () => {
        const { res } = await POST(jar, "/api/users", {
          name: "Dee",
          email: "dee@uat.test",
          phone: "abc!",
        });
        expect(res.status).toBe(400);
      });
    });

    story("Admin can PATCH every profile field — partial update only touches what's sent", () => {
      and_("PATCH name + department leaves email unchanged", async () => {
        const { res, body } = await http(
          jar,
          "PATCH",
          API,
          `/api/users/${newUserId}`,
          { name: "Patricia Rivera", department: "Sales" }
        );
        expect(res.status).toBe(200);
        expect(body.user.name).toBe("Patricia Rivera");
        expect(body.user.department).toBe("Sales");
        expect(body.user.email).toBe("pat@uat.test");
        expect(body.user.phone).toBe("+1 555 999 1234");
      });
      and_("PATCH phone to null clears it", async () => {
        const { res, body } = await http(
          jar,
          "PATCH",
          API,
          `/api/users/${newUserId}`,
          { phone: null }
        );
        expect(res.status).toBe(200);
        expect(body.user.phone).toBe(null);
      });
      and_("PATCH avatar_url to null clears it", async () => {
        const { res, body } = await http(
          jar,
          "PATCH",
          API,
          `/api/users/${newUserId}`,
          { avatar_url: null }
        );
        expect(res.status).toBe(200);
        expect(body.user.avatar_url).toBe(null);
      });
      and_("PATCH email to one in use by another user → 409", async () => {
        const { res } = await http(
          jar,
          "PATCH",
          API,
          `/api/users/${newUserId}`,
          { email: "admin@hub.com" }
        );
        expect(res.status).toBe(409);
      });
    });

    story("Admin can DELETE a user (and the deletion is logged)", () => {
      when("admin DELETEs the freshly-created user", async () => {
        const { res } = await http(
          jar,
          "DELETE",
          API,
          `/api/users/${newUserId}`
        );
        expect(res.status).toBe(200);
      });
      then("GET /api/users/:id now returns 404", async () => {
        const { res } = await GET(jar, `/api/users/${newUserId}`);
        expect(res.status).toBe(404);
      });
      and_("an audit entry was written to /api/activity", async () => {
        const { res, body } = await GET(jar, "/api/activity?limit=10");
        expect(res.status).toBe(200);
        const log = body.items.find(
          (a) =>
            a.message.includes("Patricia Rivera") &&
            a.message.includes("removed")
        );
        expect(log).toBeTruthy(
          "Expected a 'removed from the workspace' activity log"
        );
      });
    });
  }
);

persona(
  "User Management — activate / deactivate / reset-password lifecycle",
  {
    setup: async () => {
      await preflight();
      const { sql } = await import("../lib/db.js");
      const memberHash = await bcrypt.hash("Member-2026!", 12);
      await sql`UPDATE users SET password_hash = ${memberHash} WHERE id = 'USR-003'`;
    },
  },
  () => {
    const adminJar = new Jar();
    const memberJar = new Jar();

    story("Admin and member sign in", () => {
      when("admin signs in", async () => {
        const { res } = await POST(adminJar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
      and_("member (Mark) signs in to confirm initial access works", async () => {
        const { res } = await POST(memberJar, "/api/auth/login", {
          email: "mark@hub.com",
          password: "Member-2026!",
        });
        expect(res.status).toBe(200);
      });
    });

    story("Deactivating a user blocks future logins with a helpful message", () => {
      when("admin POSTs /api/users/USR-003/deactivate", async () => {
        const { res, body } = await POST(
          adminJar,
          "/api/users/USR-003/deactivate"
        );
        expect(res.status).toBe(200);
        expect(body.user.status).toBe("Inactive");
      });
      then("Mark can no longer sign in (403, not 401)", async () => {
        const { res, body } = await POST(new Jar(), "/api/auth/login", {
          email: "mark@hub.com",
          password: "Member-2026!",
        });
        expect(res.status).toBe(403);
        expect(body.error.toLowerCase()).toContain("deactivated");
      });
      and_("statusSummary now shows 4 active + 1 inactive", async () => {
        const { res, body } = await GET(adminJar, "/api/users");
        expect(res.status).toBe(200);
        const summary = Object.fromEntries(
          body.statusSummary.map((s) => [s.status, s.count])
        );
        expect(summary.Active).toBe(4);
        expect(summary.Inactive).toBe(1);
      });
    });

    story("Reactivating restores access immediately", () => {
      when("admin POSTs /api/users/USR-003/activate", async () => {
        const { res, body } = await POST(
          adminJar,
          "/api/users/USR-003/activate"
        );
        expect(res.status).toBe(200);
        expect(body.user.status).toBe("Active");
      });
      then("Mark can sign in again", async () => {
        const { res } = await POST(new Jar(), "/api/auth/login", {
          email: "mark@hub.com",
          password: "Member-2026!",
        });
        expect(res.status).toBe(200);
      });
    });

    story("Admin reset-password mints a single-use token", () => {
      let token;
      when("admin POSTs /api/users/USR-003/reset-password", async () => {
        const { res, body } = await POST(
          adminJar,
          "/api/users/USR-003/reset-password"
        );
        expect(res.status).toBe(200);
        expect(typeof body.reset_token).toBe("string");
        expect(body.reset_token.length).toBeGreaterThan(40);
        expect(body.user.id).toBe("USR-003");
        token = body.reset_token;
      });
      and_("the token works against /api/auth/reset-password", async () => {
        const { res } = await POST(new Jar(), "/api/auth/reset-password", {
          token,
          password: "BrandNew-2026!",
        });
        expect(res.status).toBe(200);
      });
      and_("Mark can sign in with the new password", async () => {
        const { res } = await POST(new Jar(), "/api/auth/login", {
          email: "mark@hub.com",
          password: "BrandNew-2026!",
        });
        expect(res.status).toBe(200);
      });
      and_("re-using the token immediately is rejected", async () => {
        const { res } = await POST(new Jar(), "/api/auth/reset-password", {
          token,
          password: "Yet-Another-2026!",
        });
        expect([400, 401, 409, 410]).toContain(
          res.status,
          "Single-use token should be rejected on second use"
        );
      });
    });
  }
);

persona(
  "User Management RBAC — admin-only writes; self-protection guards; last-admin safety",
  {
    setup: async () => {
      await preflight();
      const { sql } = await import("../lib/db.js");
      const memberHash = await bcrypt.hash("Member-2026!", 12);
      const managerHash = await bcrypt.hash("Manager-2026!", 12);
      await sql`UPDATE users SET password_hash = ${memberHash} WHERE id = 'USR-003'`;
      await sql`UPDATE users SET password_hash = ${managerHash} WHERE id = 'USR-002'`;
    },
  },
  () => {
    const adminJar = new Jar();
    const memberJar = new Jar();
    const managerJar = new Jar();

    story("Sign every jar in", () => {
      when("admin signs in", async () => {
        const { res } = await POST(adminJar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
      and_("manager signs in", async () => {
        const { res } = await POST(managerJar, "/api/auth/login", {
          email: "jane@hub.com",
          password: "Manager-2026!",
        });
        expect(res.status).toBe(200);
      });
      and_("member signs in", async () => {
        const { res } = await POST(memberJar, "/api/auth/login", {
          email: "mark@hub.com",
          password: "Member-2026!",
        });
        expect(res.status).toBe(200);
      });
    });

    story("Members can READ — list, their own detail, but NOT others' detail", () => {
      and_("member can list users", async () => {
        const { res } = await GET(memberJar, "/api/users");
        expect(res.status).toBe(200);
      });
      and_("member can read their OWN user detail", async () => {
        const { res, body } = await GET(memberJar, "/api/users/USR-003");
        expect(res.status).toBe(200);
        expect(body.user.id).toBe("USR-003");
      });
      and_("member CANNOT read another user's detail → 403", async () => {
        const { res } = await GET(memberJar, "/api/users/USR-002");
        expect(res.status).toBe(403);
      });
    });

    story("Managers cannot POST/PATCH/DELETE/activate/deactivate/reset users", () => {
      and_("manager cannot POST a user → 403", async () => {
        const { res } = await POST(managerJar, "/api/users", {
          name: "Forbidden",
          email: "forbidden@uat.test",
        });
        expect(res.status).toBe(403);
      });
      and_("manager cannot PATCH a user → 403", async () => {
        const { res } = await http(
          managerJar,
          "PATCH",
          API,
          "/api/users/USR-003",
          { name: "Renamed" }
        );
        expect(res.status).toBe(403);
      });
      and_("manager cannot DELETE a user → 403", async () => {
        const { res } = await http(
          managerJar,
          "DELETE",
          API,
          "/api/users/USR-003"
        );
        expect(res.status).toBe(403);
      });
      and_("manager cannot deactivate a user → 403", async () => {
        const { res } = await POST(
          managerJar,
          "/api/users/USR-003/deactivate"
        );
        expect(res.status).toBe(403);
      });
      and_("manager cannot reset another user's password → 403", async () => {
        const { res } = await POST(
          managerJar,
          "/api/users/USR-003/reset-password"
        );
        expect(res.status).toBe(403);
      });
    });

    story("Self-protection: admin cannot delete or deactivate themselves", () => {
      and_("admin DELETE /api/users/<self> → 409", async () => {
        const { res, body } = await http(
          adminJar,
          "DELETE",
          API,
          "/api/users/USR-001"
        );
        expect(res.status).toBe(409);
        expect(body.error.toLowerCase()).toContain("yourself");
      });
      and_("admin POST /api/users/<self>/deactivate → 409", async () => {
        const { res, body } = await POST(
          adminJar,
          "/api/users/USR-001/deactivate"
        );
        expect(res.status).toBe(409);
        expect(body.error.toLowerCase()).toContain("yourself");
      });
    });

    story("Last-admin guard: cannot demote/delete/deactivate the only admin", () => {
      // Admin is the ONLY admin in the seed (everyone else is manager/member).
      and_("PATCH role=member on the sole admin → 409", async () => {
        const { res, body } = await http(
          adminJar,
          "PATCH",
          API,
          "/api/users/USR-001",
          { role: "member" }
        );
        expect(res.status).toBe(409);
        expect(body.error.toLowerCase()).toContain("last");
      });
      and_("PATCH /api/users/:id/role demoting last admin → 409", async () => {
        const { res } = await http(
          adminJar,
          "PATCH",
          API,
          "/api/users/USR-001/role",
          { role: "manager" }
        );
        expect(res.status).toBe(409);
      });
      // Now promote Jane (USR-002) to admin so we have two admins, then try
      // to deactivate the original admin — that path is gated by the SELF
      // check first, so we go the other way and confirm deactivating Jane
      // works while she's not the only active admin.
      and_("promote Jane to admin (we now have two admins)", async () => {
        const { res } = await http(
          adminJar,
          "PATCH",
          API,
          "/api/users/USR-002/role",
          { role: "admin" }
        );
        expect(res.status).toBe(200);
      });
      and_("now PATCH Jane status=Inactive → 200 (Active admins still ≥1)", async () => {
        const { res, body } = await http(
          adminJar,
          "PATCH",
          API,
          "/api/users/USR-002",
          { status: "Inactive" }
        );
        expect(res.status).toBe(200);
        expect(body.user.status).toBe("Inactive");
      });
      and_(
        "with Jane inactive, demoting USR-001 is back to a last-admin 409",
        async () => {
          const { res } = await http(
            adminJar,
            "PATCH",
            API,
            "/api/users/USR-001",
            { role: "member" }
          );
          expect(res.status).toBe(409);
        }
      );
    });

    story("Anonymous callers are 401 on every user-management write endpoint", () => {
      when("each write endpoint is hit without auth", async () => {
        const r1 = await POST(null, "/api/users", { name: "x", email: "y@z" });
        const r2 = await http(null, "PATCH", API, "/api/users/USR-003", {});
        const r3 = await http(null, "DELETE", API, "/api/users/USR-003");
        const r4 = await POST(null, "/api/users/USR-003/activate");
        const r5 = await POST(null, "/api/users/USR-003/deactivate");
        const r6 = await POST(null, "/api/users/USR-003/reset-password");
        expect(r1.res.status).toBe(401);
        expect(r2.res.status).toBe(401);
        expect(r3.res.status).toBe(401);
        expect(r4.res.status).toBe(401);
        expect(r5.res.status).toBe(401);
        expect(r6.res.status).toBe(401);
      });
    });
  }
);

// ============================================================================
// SECTION 8: Team Management
//
//   Verifies every feature called out in the proposal:
//     • Create / Edit / Delete Teams
//     • Add / Remove Members
//     • Team Leader Assignment
//     • Team Overview / Team Workload / Team Performance / Team Projects
//
//   Detail bundle is the single source of truth for the team page, so we
//   exercise its full shape and reconcile each field against the seeded
//   data; lifecycle tests then mutate that data and re-verify.
// ============================================================================

persona(
  "Team Management — Create/Edit/Delete + leader + members + detail bundle",
  {
    setup: async () => {
      await preflight();
    },
  },
  () => {
    const jar = new Jar();
    let teamId;
    let teamWithProjectsId;

    story("Admin signs in", () => {
      when("admin signs in", async () => {
        const { res } = await POST(jar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
    });

    story("Listing returns an empty array when no teams exist yet", () => {
      then("GET /api/teams returns items: []", async () => {
        const { res, body } = await GET(jar, "/api/teams");
        expect(res.status).toBe(200);
        expect(Array.isArray(body.items)).toBeTruthy();
        expect(body.items.length).toBe(0);
      });
    });

    story("Admin creates a team with a leader at creation time", () => {
      when("admin POSTs /api/teams with leader_id=USR-002", async () => {
        const { res, body } = await POST(jar, "/api/teams", {
          name: "Platform Engineering",
          description: "Owns the core platform services.",
          leader_id: "USR-002",
        });
        expect(res.status).toBe(201);
        expect(body.team.name).toBe("Platform Engineering");
        expect(body.team.leader_id).toBe("USR-002");
        expect(body.team.leader_name).toBe("Jane Smith");
        teamWithProjectsId = body.team.id;
      });
      then("the leader is automatically added to the roster", async () => {
        const { res, body } = await GET(jar, `/api/teams/${teamWithProjectsId}`);
        expect(res.status).toBe(200);
        expect(body.members.length).toBe(1);
        expect(body.members[0].user_id).toBe("USR-002");
        expect(body.members[0].is_leader).toBeTruthy();
      });
    });

    story("Admin creates a second leaderless team", () => {
      when("admin POSTs /api/teams without leader_id", async () => {
        const { res, body } = await POST(jar, "/api/teams", {
          name: "Design Crew",
          description: "Brand and product design.",
        });
        expect(res.status).toBe(201);
        expect(body.team.leader_id).toBe(null);
        expect(body.team.member_count).toBe(0);
        teamId = body.team.id;
      });
    });

    story("Duplicate team name (case-insensitive) is rejected with 409", () => {
      then("POST /api/teams with same name → 409", async () => {
        const { res, body } = await POST(jar, "/api/teams", {
          name: "DESIGN crew",
        });
        expect(res.status).toBe(409);
        expect(body.error.toLowerCase()).toContain("already exists");
      });
      and_("name validation: too short → 400", async () => {
        const { res } = await POST(jar, "/api/teams", { name: "A" });
        expect(res.status).toBe(400);
      });
      and_("leader_id that doesn't exist → 400", async () => {
        const { res } = await POST(jar, "/api/teams", {
          name: "Bad Leader Team",
          leader_id: "USR-DOES-NOT-EXIST",
        });
        expect(res.status).toBe(400);
      });
    });

    story("Admin edits the team name + description (partial update)", () => {
      when("admin PATCHes only name + description", async () => {
        const { res, body } = await http(
          jar,
          "PATCH",
          API,
          `/api/teams/${teamId}`,
          {
            name: "Design Studio",
            description: "Renamed: focuses on UX research too.",
          }
        );
        expect(res.status).toBe(200);
        expect(body.team.name).toBe("Design Studio");
      });
      and_("leader is still null (the PATCH didn't touch leader_id)", async () => {
        const { res, body } = await GET(jar, `/api/teams/${teamId}`);
        expect(res.status).toBe(200);
        expect(body.team.leader_id).toBe(null);
      });
    });

    story("Add members via POST /api/teams/:id/members", () => {
      and_("admin adds Mark (USR-003)", async () => {
        const { res } = await POST(jar, `/api/teams/${teamId}/members`, {
          user_id: "USR-003",
        });
        expect(res.status).toBe(201);
      });
      and_("admin adds Alex (USR-004)", async () => {
        const { res } = await POST(jar, `/api/teams/${teamId}/members`, {
          user_id: "USR-004",
        });
        expect(res.status).toBe(201);
      });
      and_("admin adds Sara (USR-005)", async () => {
        const { res } = await POST(jar, `/api/teams/${teamId}/members`, {
          user_id: "USR-005",
        });
        expect(res.status).toBe(201);
      });
      then("the roster now has 3 members, none flagged as leader", async () => {
        const { res, body } = await GET(jar, `/api/teams/${teamId}`);
        expect(res.status).toBe(200);
        expect(body.members.length).toBe(3);
        const leaders = body.members.filter((m) => m.is_leader);
        expect(leaders.length).toBe(0);
      });
    });

    story("Adding the same user twice returns 409", () => {
      then("re-adding Mark → 409", async () => {
        const { res, body } = await POST(jar, `/api/teams/${teamId}/members`, {
          user_id: "USR-003",
        });
        expect(res.status).toBe(409);
        expect(body.error.toLowerCase()).toContain("already on this team");
      });
      and_("adding to a non-existent team → 404", async () => {
        const { res } = await POST(jar, `/api/teams/TEAM-NONE/members`, {
          user_id: "USR-003",
        });
        expect(res.status).toBe(404);
      });
      and_("adding a non-existent user → 400", async () => {
        const { res } = await POST(jar, `/api/teams/${teamId}/members`, {
          user_id: "USR-DOES-NOT-EXIST",
        });
        expect(res.status).toBe(400);
      });
    });

    story("Team Leader Assignment via PATCH /api/teams/:id/leader", () => {
      and_("promote Mark (a current member) to leader", async () => {
        const { res, body } = await http(
          jar,
          "PATCH",
          API,
          `/api/teams/${teamId}/leader`,
          { user_id: "USR-003" }
        );
        expect(res.status).toBe(200);
        expect(body.team.leader_id).toBe("USR-003");
        expect(body.team.leader_name).toBe("Mark Lee");
      });
      and_("promoting a NON-member to leader returns 409", async () => {
        // USR-001 (admin) isn't on this team yet.
        const { res, body } = await http(
          jar,
          "PATCH",
          API,
          `/api/teams/${teamId}/leader`,
          { user_id: "USR-001" }
        );
        expect(res.status).toBe(409);
        expect(body.error.toLowerCase()).toContain("must be a team member");
      });
      and_("vacating the leader slot (user_id=null) works", async () => {
        const { res, body } = await http(
          jar,
          "PATCH",
          API,
          `/api/teams/${teamId}/leader`,
          { user_id: null }
        );
        expect(res.status).toBe(200);
        expect(body.team.leader_id).toBe(null);
      });
      and_("set Mark back as leader (for downstream stories)", async () => {
        const { res } = await http(
          jar,
          "PATCH",
          API,
          `/api/teams/${teamId}/leader`,
          { user_id: "USR-003" }
        );
        expect(res.status).toBe(200);
      });
    });

    story("Removing the leader clears the leader slot (invariant guard)", () => {
      when("admin removes Mark from the team", async () => {
        const { res } = await http(
          jar,
          "DELETE",
          API,
          `/api/teams/${teamId}/members/USR-003`
        );
        expect(res.status).toBe(200);
      });
      then("team.leader_id is now NULL", async () => {
        const { res, body } = await GET(jar, `/api/teams/${teamId}`);
        expect(res.status).toBe(200);
        expect(body.team.leader_id).toBe(null);
        const ids = body.members.map((m) => m.user_id).sort();
        expect(ids).toEqual(["USR-004", "USR-005"]);
      });
    });

    story("Removing a user not on the team → 404", () => {
      then("DELETE /api/teams/:id/members/<not-a-member> → 404", async () => {
        const { res } = await http(
          jar,
          "DELETE",
          API,
          `/api/teams/${teamId}/members/USR-001`
        );
        expect(res.status).toBe(404);
      });
    });

    story("Team Projects: associating a project with a team", () => {
      and_("admin creates a project assigned to the platform team", async () => {
        const { res, body } = await POST(jar, "/api/projects", {
          name: "Platform Migration",
          status: "In Progress",
          priority: "High",
          team_id: teamWithProjectsId,
        });
        expect(res.status).toBe(201);
        expect(body.project.team_id).toBe(teamWithProjectsId);
      });
      and_("admin re-parents an existing project (PRJ-001) into the team", async () => {
        const { res, body } = await http(
          jar,
          "PATCH",
          API,
          "/api/projects/PRJ-001",
          { team_id: teamWithProjectsId }
        );
        expect(res.status).toBe(200);
        expect(body.project.team_id).toBe(teamWithProjectsId);
      });
      then("team detail bundle shows both projects", async () => {
        const { res, body } = await GET(jar, `/api/teams/${teamWithProjectsId}`);
        expect(res.status).toBe(200);
        expect(body.projects.length).toBe(2);
        const ids = body.projects.map((p) => p.id).sort();
        expect(ids.includes("PRJ-001")).toBeTruthy();
      });
      and_("?team_id filter on /api/projects returns those projects too", async () => {
        const { res, body } = await GET(
          jar,
          `/api/projects?team_id=${teamWithProjectsId}`
        );
        expect(res.status).toBe(200);
        expect(body.items.length).toBe(2);
      });
      and_("setting team_id to null releases the project from the team", async () => {
        const { res, body } = await http(
          jar,
          "PATCH",
          API,
          "/api/projects/PRJ-001",
          { team_id: null }
        );
        expect(res.status).toBe(200);
        expect(body.project.team_id).toBe(null);
      });
    });

    story("Detail bundle: Team Overview / Workload / Performance shape", () => {
      then(
        "every documented section is present with the right shape",
        async () => {
          const { res, body } = await GET(
            jar,
            `/api/teams/${teamWithProjectsId}`
          );
          expect(res.status).toBe(200);
          // Overview
          expect(typeof body.team.name).toBe("string");
          expect(body.team.leader_name).toBe("Jane Smith");
          // Members
          expect(Array.isArray(body.members)).toBeTruthy();
          for (const m of body.members) {
            for (const k of [
              "user_id",
              "name",
              "is_leader",
              "active_tasks",
              "completed_tasks",
              "overdue_tasks",
              "added_at",
            ]) {
              expect(k in m).toBeTruthy(
                `Member row should expose "${k}" — got ${JSON.stringify(Object.keys(m))}`
              );
            }
          }
          // Workload
          expect(body.workload).toBeTruthy();
          expect(typeof body.workload.peak_active_tasks).toBe("number");
          expect(Array.isArray(body.workload.members)).toBeTruthy();
          // Performance
          expect(body.performance).toBeTruthy();
          for (const k of [
            "total_tasks",
            "completed_tasks",
            "overdue_tasks",
            "on_time_completions",
            "completion_rate",
            "on_time_rate",
          ]) {
            expect(k in body.performance).toBeTruthy(
              `Performance should expose "${k}"`
            );
          }
        }
      );
      and_(
        "performance reconciles against the seed (Jane is on this team)",
        async () => {
          // Jane Smith (USR-002) is the only member and is the assignee of
          // ASN-001 (In Progress, due 2024-05-01 → overdue today) and
          // ASN-005 (In Progress) — both still active, zero completed.
          const { res, body } = await GET(
            jar,
            `/api/teams/${teamWithProjectsId}`
          );
          expect(res.status).toBe(200);
          expect(body.performance.total_tasks).toBe(2);
          expect(body.performance.completed_tasks).toBe(0);
          expect(body.performance.completion_rate).toBe(0);
          expect(body.performance.overdue_tasks).toBeGreaterThanOrEqual(1);
        }
      );
    });

    story("Delete team releases projects (does NOT delete them)", () => {
      when("admin deletes the Platform team", async () => {
        const { res } = await http(
          jar,
          "DELETE",
          API,
          `/api/teams/${teamWithProjectsId}`
        );
        expect(res.status).toBe(200);
      });
      then("the team is gone (GET → 404)", async () => {
        const { res } = await GET(jar, `/api/teams/${teamWithProjectsId}`);
        expect(res.status).toBe(404);
      });
      and_(
        "the project we created earlier still exists (team_id cleared by ON DELETE SET NULL)",
        async () => {
          const { res, body } = await GET(jar, "/api/projects?q=Platform Migration");
          expect(res.status).toBe(200);
          const p = body.items.find((x) => x.name === "Platform Migration");
          expect(p).toBeTruthy(
            "Platform Migration project should outlive its team"
          );
          expect(p.team_id).toBe(null);
        }
      );
      and_("an audit entry mentions the deletion", async () => {
        const { res, body } = await GET(jar, "/api/activity?limit=20");
        expect(res.status).toBe(200);
        const log = body.items.find(
          (a) =>
            a.message.includes("Platform Engineering") &&
            a.message.includes("deleted")
        );
        expect(log).toBeTruthy();
      });
    });
  }
);

persona(
  "Team Management RBAC — admin/manager edit; admin-only delete; members read-only",
  {
    setup: async () => {
      await preflight();
      const { sql } = await import("../lib/db.js");
      const managerHash = await bcrypt.hash("Manager-2026!", 12);
      const memberHash = await bcrypt.hash("Member-2026!", 12);
      await sql`UPDATE users SET password_hash = ${managerHash} WHERE id = 'USR-002'`;
      await sql`UPDATE users SET password_hash = ${memberHash} WHERE id = 'USR-003'`;
    },
  },
  () => {
    const jars = {
      admin: new Jar(),
      manager: new Jar(),
      member: new Jar(),
    };
    let teamId;

    story("All three jars sign in", () => {
      when("admin signs in", async () => {
        const { res } = await POST(jars.admin, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
      and_("manager signs in", async () => {
        const { res } = await POST(jars.manager, "/api/auth/login", {
          email: "jane@hub.com",
          password: "Manager-2026!",
        });
        expect(res.status).toBe(200);
      });
      and_("member signs in", async () => {
        const { res } = await POST(jars.member, "/api/auth/login", {
          email: "mark@hub.com",
          password: "Member-2026!",
        });
        expect(res.status).toBe(200);
      });
    });

    story("Manager can create + edit a team and add/remove members", () => {
      when("manager creates a team", async () => {
        const { res, body } = await POST(jars.manager, "/api/teams", {
          name: "Manager-Owned Team",
          leader_id: "USR-002",
        });
        expect(res.status).toBe(201);
        teamId = body.team.id;
      });
      and_("manager edits the team description", async () => {
        const { res } = await http(
          jars.manager,
          "PATCH",
          API,
          `/api/teams/${teamId}`,
          { description: "Edited by manager." }
        );
        expect(res.status).toBe(200);
      });
      and_("manager adds a member", async () => {
        const { res } = await POST(
          jars.manager,
          `/api/teams/${teamId}/members`,
          { user_id: "USR-004" }
        );
        expect(res.status).toBe(201);
      });
      and_("manager re-assigns the leader", async () => {
        const { res } = await http(
          jars.manager,
          "PATCH",
          API,
          `/api/teams/${teamId}/leader`,
          { user_id: "USR-004" }
        );
        expect(res.status).toBe(200);
      });
    });

    story("Manager CANNOT delete a team (delete is admin-only)", () => {
      then("manager DELETE → 403", async () => {
        const { res } = await http(
          jars.manager,
          "DELETE",
          API,
          `/api/teams/${teamId}`
        );
        expect(res.status).toBe(403);
      });
    });

    story("Members can READ teams (list + detail) but cannot write", () => {
      and_("member can list teams", async () => {
        const { res } = await GET(jars.member, "/api/teams");
        expect(res.status).toBe(200);
      });
      and_("member can read team detail", async () => {
        const { res } = await GET(jars.member, `/api/teams/${teamId}`);
        expect(res.status).toBe(200);
      });
      and_("member cannot POST a team → 403", async () => {
        const { res } = await POST(jars.member, "/api/teams", {
          name: "Member Forbidden",
        });
        expect(res.status).toBe(403);
      });
      and_("member cannot PATCH a team → 403", async () => {
        const { res } = await http(
          jars.member,
          "PATCH",
          API,
          `/api/teams/${teamId}`,
          { description: "no" }
        );
        expect(res.status).toBe(403);
      });
      and_("member cannot add a team member → 403", async () => {
        const { res } = await POST(
          jars.member,
          `/api/teams/${teamId}/members`,
          { user_id: "USR-005" }
        );
        expect(res.status).toBe(403);
      });
      and_("member cannot set the leader → 403", async () => {
        const { res } = await http(
          jars.member,
          "PATCH",
          API,
          `/api/teams/${teamId}/leader`,
          { user_id: "USR-004" }
        );
        expect(res.status).toBe(403);
      });
      and_("member cannot delete a team → 403", async () => {
        const { res } = await http(
          jars.member,
          "DELETE",
          API,
          `/api/teams/${teamId}`
        );
        expect(res.status).toBe(403);
      });
    });

    story("Admin can delete the team (delete is admin-only)", () => {
      when("admin DELETEs the team", async () => {
        const { res } = await http(
          jars.admin,
          "DELETE",
          API,
          `/api/teams/${teamId}`
        );
        expect(res.status).toBe(200);
      });
    });

    story("Anonymous callers are 401 on every team write endpoint", () => {
      when("each team write endpoint is hit without auth", async () => {
        const r1 = await POST(null, "/api/teams", { name: "x" });
        const r2 = await http(null, "PATCH", API, "/api/teams/TEAM-001", {});
        const r3 = await http(null, "DELETE", API, "/api/teams/TEAM-001");
        const r4 = await POST(null, "/api/teams/TEAM-001/members", {
          user_id: "USR-003",
        });
        const r5 = await http(
          null,
          "DELETE",
          API,
          "/api/teams/TEAM-001/members/USR-003"
        );
        const r6 = await http(null, "PATCH", API, "/api/teams/TEAM-001/leader", {
          user_id: "USR-003",
        });
        expect(r1.res.status).toBe(401);
        expect(r2.res.status).toBe(401);
        expect(r3.res.status).toBe(401);
        expect(r4.res.status).toBe(401);
        expect(r5.res.status).toBe(401);
        expect(r6.res.status).toBe(401);
      });
    });
  }
);

// ============================================================================
// SECTION 9: Activity Logs
//
//   Verifies the proposal's full "Track Activities" + "Activity Timeline /
//   Filtering / Search" checklist end-to-end. Each persona reseeds the
//   workspace via preflight so the assertions can pin to specific counts
//   coming out of the seedActivity table.
// ============================================================================

persona(
  "Activity Logs — Track every kind of event (login, logout, signup, CRUD, user actions)",
  {
    setup: async () => {
      await preflight();
    },
  },
  () => {
    const adminJar = new Jar();
    let signupUserId;
    let createdProjectId;
    let createdTaskId;
    let createdUserId;
    let createdTeamId;

    // Each story creates an event, then asserts the log captured it with the
    // correct (actor, action, entity_type, entity_id). Helper centralises the
    // most-recent-match-by-entity lookup.
    async function latestForEntity(jar, entity_type, entity_id) {
      const { res, body } = await GET(
        jar,
        `/api/activity?entity_type=${entity_type}&entity_id=${encodeURIComponent(entity_id)}&limit=20`
      );
      expect(res.status).toBe(200);
      return body.items[0]; // ORDER BY created_at DESC
    }

    story("Login is tracked", () => {
      when("admin signs in", async () => {
        const { res } = await POST(adminJar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
      then("an activity row exists with action=login + entity_type=auth", async () => {
        const evt = await latestForEntity(adminJar, "auth", "USR-001");
        expect(evt).toBeTruthy("expected a login activity row for USR-001");
        expect(evt.action).toBe("login");
        expect(evt.entity_type).toBe("auth");
        expect(evt.actor_id).toBe("USR-001");
        expect(evt.actor_name).toBe("Admin User");
        expect(evt.icon).toBe("log-in");
      });
    });

    story("Project Created is tracked with full structured payload", () => {
      when("admin creates a project", async () => {
        const { res, body } = await POST(adminJar, "/api/projects", {
          name: "Activity-Audit Project",
          status: "Planning",
          priority: "Medium",
        });
        expect(res.status).toBe(201);
        createdProjectId = body.project.id;
      });
      then("the log records action=create / entity_type=project", async () => {
        const evt = await latestForEntity(adminJar, "project", createdProjectId);
        expect(evt).toBeTruthy();
        expect(evt.action).toBe("create");
        expect(evt.actor_id).toBe("USR-001");
        expect(evt.message).toContain("Activity-Audit Project");
      });
    });

    story("Project Updated is tracked with action=update", () => {
      when("admin patches the project's status", async () => {
        const { res } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/projects/${createdProjectId}`,
          { status: "In Progress" }
        );
        expect(res.status).toBe(200);
      });
      then("an update event is logged for the project", async () => {
        const { res, body } = await GET(
          adminJar,
          `/api/activity?entity_id=${createdProjectId}&action=update&limit=5`
        );
        expect(res.status).toBe(200);
        expect(body.items.length).toBeGreaterThanOrEqual(1);
        expect(body.items[0].entity_type).toBe("project");
      });
    });

    story("Task Created + Task Updated + Task Deleted are all tracked", () => {
      when("admin creates a task on the new project", async () => {
        const { res, body } = await POST(adminJar, "/api/tasks", {
          project_id: createdProjectId,
          title: "Audit Trail Task",
          status: "To Do",
          assignee_id: "USR-002",
        });
        expect(res.status).toBe(201);
        createdTaskId = body.task.id;
      });
      and_("the create event has action=create + entity_type=task", async () => {
        const { res, body } = await GET(
          adminJar,
          `/api/activity?entity_id=${createdTaskId}&action=create&limit=5`
        );
        expect(res.status).toBe(200);
        expect(body.items[0].entity_type).toBe("task");
        expect(body.items[0].actor_id).toBe("USR-001");
      });
      and_("the auto-assignment event has action=assign", async () => {
        const { res, body } = await GET(
          adminJar,
          `/api/activity?entity_id=${createdTaskId}&action=assign&limit=5`
        );
        expect(res.status).toBe(200);
        expect(body.items.length).toBeGreaterThanOrEqual(1);
      });
      and_("flipping status to Done emits action=complete", async () => {
        const { res } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/tasks/${createdTaskId}`,
          { status: "Done" }
        );
        expect(res.status).toBe(200);
        const { res: r2, body } = await GET(
          adminJar,
          `/api/activity?entity_id=${createdTaskId}&action=complete&limit=5`
        );
        expect(r2.status).toBe(200);
        expect(body.items[0].icon).toBe("check-circle");
      });
      and_("deleting the task emits action=delete + tone=muted", async () => {
        const { res } = await http(
          adminJar,
          "DELETE",
          API,
          `/api/tasks/${createdTaskId}`
        );
        expect(res.status).toBe(200);
        const evt = await latestForEntity(adminJar, "task", createdTaskId);
        expect(evt.action).toBe("delete");
        expect(evt.tone).toBe("muted");
      });
    });

    story("User Actions: create / role-change / activate / deactivate are tracked", () => {
      when("admin creates a new user", async () => {
        const { res, body } = await POST(adminJar, "/api/users", {
          name: "Audit Subject",
          email: "audit@hub.com",
          role: "member",
        });
        expect(res.status).toBe(201);
        createdUserId = body.user.id;
      });
      and_("the create event has action=create + entity_type=user", async () => {
        const evt = await latestForEntity(adminJar, "user", createdUserId);
        expect(evt.action).toBe("create");
        expect(evt.actor_id).toBe("USR-001");
      });
      and_("role change records action=role_change", async () => {
        const { res } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/users/${createdUserId}/role`,
          { role: "manager" }
        );
        expect(res.status).toBe(200);
        const { res: r2, body } = await GET(
          adminJar,
          `/api/activity?entity_id=${createdUserId}&action=role_change&limit=5`
        );
        expect(r2.status).toBe(200);
        expect(body.items[0].entity_type).toBe("user");
      });
      and_("deactivate / activate cycle each emit their own action", async () => {
        await POST(adminJar, `/api/users/${createdUserId}/deactivate`, {});
        await POST(adminJar, `/api/users/${createdUserId}/activate`, {});
        const { res, body } = await GET(
          adminJar,
          `/api/activity?entity_id=${createdUserId}&limit=20`
        );
        expect(res.status).toBe(200);
        const actions = body.items.map((i) => i.action);
        expect(actions.includes("activate")).toBeTruthy();
        expect(actions.includes("deactivate")).toBeTruthy();
      });
    });

    story("Team events flow into the activity log as entity_type=team", () => {
      when("admin creates a team", async () => {
        const { res, body } = await POST(adminJar, "/api/teams", {
          name: "Activity-Audit Team",
          leader_id: "USR-002",
        });
        expect(res.status).toBe(201);
        createdTeamId = body.team.id;
      });
      then("the create event is logged correctly", async () => {
        const evt = await latestForEntity(adminJar, "team", createdTeamId);
        expect(evt.action).toBe("create");
        expect(evt.entity_type).toBe("team");
      });
      and_("adding a member emits action=add_member", async () => {
        const { res } = await POST(
          adminJar,
          `/api/teams/${createdTeamId}/members`,
          { user_id: "USR-003" }
        );
        expect(res.status).toBe(201);
        const { res: r2, body } = await GET(
          adminJar,
          `/api/activity?entity_id=${createdTeamId}&action=add_member&limit=5`
        );
        expect(r2.status).toBe(200);
        expect(body.items.length).toBeGreaterThanOrEqual(1);
      });
    });

    story("Logout is tracked when called with a valid session", () => {
      when("admin logs out", async () => {
        const { res } = await POST(adminJar, "/api/auth/logout", {});
        expect(res.status).toBe(200);
      });
      then("a logout event is on the timeline (action=logout)", async () => {
        // Sign back in so we have a session to query the log with.
        const fresh = new Jar();
        await POST(fresh, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        const { res, body } = await GET(
          fresh,
          `/api/activity?actor_id=USR-001&action=logout&limit=5`
        );
        expect(res.status).toBe(200);
        expect(body.items.length).toBeGreaterThanOrEqual(1);
        expect(body.items[0].entity_type).toBe("auth");
        expect(body.items[0].icon).toBe("log-out");
      });
    });

    story("Signup is tracked (signup + implicit login events)", () => {
      when("a brand-new user signs up", async () => {
        const fresh = new Jar();
        const { res, body } = await POST(fresh, "/api/auth/signup", {
          name: "Audit Newcomer",
          email: "newcomer@hub.com",
          password: "Newcomer-2026!",
        });
        expect(res.status).toBe(201);
        signupUserId = body.user.id;
      });
      then(
        "the timeline shows both a signup row and an implicit login row",
        async () => {
          const refresh = new Jar();
          await POST(refresh, "/api/auth/login", {
            email: "admin@hub.com",
            password: UAT_ADMIN_PASSWORD,
          });
          const { res, body } = await GET(
            refresh,
            `/api/activity?actor_id=${signupUserId}&limit=10`
          );
          expect(res.status).toBe(200);
          const actions = body.items.map((i) => i.action);
          expect(actions.includes("signup")).toBeTruthy();
          expect(actions.includes("login")).toBeTruthy();
        }
      );
    });
  }
);

persona(
  "Activity Logs — Timeline + Filtering + Search",
  {
    setup: async () => {
      await preflight();
    },
  },
  () => {
    const jar = new Jar();

    story("Admin signs in", () => {
      when("admin signs in", async () => {
        const { res } = await POST(jar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
    });

    story("Listing returns structured fields for every row", () => {
      then(
        "every item exposes actor + action + entity_type + entity_id",
        async () => {
          const { res, body } = await GET(jar, "/api/activity?limit=200");
          expect(res.status).toBe(200);
          expect(body.items.length).toBeGreaterThan(0);
          for (const row of body.items) {
            for (const k of [
              "actor_id",
              "actor_name",
              "action",
              "entity_type",
              "entity_id",
            ]) {
              expect(k in row).toBeTruthy(
                `row ${row.id} must expose "${k}" — got ${JSON.stringify(Object.keys(row))}`
              );
            }
          }
        }
      );
    });

    story("Filter by entity_type narrows the timeline", () => {
      then("?entity_type=project returns only project rows", async () => {
        const { res, body } = await GET(
          jar,
          "/api/activity?entity_type=project&limit=200"
        );
        expect(res.status).toBe(200);
        expect(body.items.length).toBeGreaterThan(0);
        for (const row of body.items) {
          expect(row.entity_type).toBe("project");
        }
      });
      and_("?entity_type=task returns only task rows", async () => {
        const { res, body } = await GET(
          jar,
          "/api/activity?entity_type=task&limit=200"
        );
        expect(res.status).toBe(200);
        for (const row of body.items) {
          expect(row.entity_type).toBe("task");
        }
      });
    });

    story("Filter by actor scopes the feed to one user's actions", () => {
      then("?actor_id=USR-001 returns only USR-001's events", async () => {
        const { res, body } = await GET(
          jar,
          "/api/activity?actor_id=USR-001&limit=200"
        );
        expect(res.status).toBe(200);
        expect(body.items.length).toBeGreaterThan(0);
        for (const row of body.items) {
          expect(row.actor_id).toBe("USR-001");
        }
      });
    });

    story("Filter by action verb works", () => {
      then("?action=create returns only create events", async () => {
        const { res, body } = await GET(
          jar,
          "/api/activity?action=create&limit=200"
        );
        expect(res.status).toBe(200);
        expect(body.items.length).toBeGreaterThan(0);
        for (const row of body.items) {
          expect(row.action).toBe("create");
        }
      });
    });

    story("Search hits message + actor name + entity_id", () => {
      and_('?q=Website matches the project message', async () => {
        const { res, body } = await GET(
          jar,
          `/api/activity?q=${encodeURIComponent("Website")}&limit=200`
        );
        expect(res.status).toBe(200);
        expect(body.items.length).toBeGreaterThan(0);
        for (const row of body.items) {
          const match =
            row.message.includes("Website") ||
            (row.actor_name ?? "").includes("Website") ||
            (row.entity_id ?? "").includes("Website");
          expect(match).toBeTruthy(
            `row "${row.message}" should mention Website somewhere`
          );
        }
      });
      and_("?q=Admin User finds events with that actor name", async () => {
        // Trigger a fresh project create so we know there's at least one row
        // owned by "Admin User".
        await POST(jar, "/api/projects", {
          name: "Searchable By Actor",
          status: "Planning",
        });
        const { res, body } = await GET(
          jar,
          `/api/activity?q=${encodeURIComponent("Admin User")}&limit=200`
        );
        expect(res.status).toBe(200);
        const matchedByActor = body.items.filter(
          (i) => i.actor_name === "Admin User"
        );
        expect(matchedByActor.length).toBeGreaterThan(0);
      });
      and_(
        "?q=PRJ-001 finds events by entity_id (structured search)",
        async () => {
          const { res, body } = await GET(
            jar,
            `/api/activity?q=${encodeURIComponent("PRJ-001")}&limit=200`
          );
          expect(res.status).toBe(200);
          expect(body.items.length).toBeGreaterThan(0);
        }
      );
    });

    story("Date range filter (since / until) is inclusive and zero-pads", () => {
      and_("?since=tomorrow returns an empty feed", async () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const stamp = tomorrow.toISOString().slice(0, 10);
        const { res, body } = await GET(
          jar,
          `/api/activity?since=${stamp}&limit=200`
        );
        expect(res.status).toBe(200);
        expect(body.items.length).toBe(0);
      });
      and_("?since=yesterday returns at least today's events", async () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const stamp = yesterday.toISOString().slice(0, 10);
        const { res, body } = await GET(
          jar,
          `/api/activity?since=${stamp}&limit=200`
        );
        expect(res.status).toBe(200);
        expect(body.items.length).toBeGreaterThan(0);
      });
    });

    story("Filters compose with AND", () => {
      and_(
        "entity_type=project + action=create returns only project-creates",
        async () => {
          const { res, body } = await GET(
            jar,
            "/api/activity?entity_type=project&action=create&limit=200"
          );
          expect(res.status).toBe(200);
          expect(body.items.length).toBeGreaterThan(0);
          for (const row of body.items) {
            expect(row.entity_type).toBe("project");
            expect(row.action).toBe("create");
          }
        }
      );
    });

    story("Filter discovery endpoint reflects current data", () => {
      then("/api/activity/filters returns entity_types + actors + actions", async () => {
        const { res, body } = await GET(jar, "/api/activity/filters");
        expect(res.status).toBe(200);
        expect(Array.isArray(body.entity_types)).toBeTruthy();
        expect(Array.isArray(body.actors)).toBeTruthy();
        expect(Array.isArray(body.actions)).toBeTruthy();
        const types = body.entity_types.map((t) => t.entity_type);
        expect(types.includes("project")).toBeTruthy();
        const actorIds = body.actors.map((a) => a.id);
        expect(actorIds.includes("USR-001")).toBeTruthy();
      });
    });

    story("Anonymous access to the activity API is denied (RBAC)", () => {
      then("GET /api/activity without auth → 401", async () => {
        const { res } = await GET(null, "/api/activity?limit=5");
        expect(res.status).toBe(401);
      });
      and_("GET /api/activity/filters without auth → 401", async () => {
        const { res } = await GET(null, "/api/activity/filters");
        expect(res.status).toBe(401);
      });
    });
  }
);

// ============================================================================
// SECTION 10: Notifications
//
//   Covers every notification type the proposal calls out (task_assigned,
//   task_updated, task_completed, project_updated, deadline_reminder) on
//   both delivery channels (in-app + email). Email is exercised via the
//   `console` mailer driver — it sets email_status='sent' without an SMTP
//   server, which is enough to prove the row's status transitions correctly.
// ============================================================================

persona(
  "Notifications — every type fans out in-app + email (Section 10)",
  {
    setup: async () => {
      await preflight();
      // Three seeded users get real passwords so each can sign in as their
      // own jar and observe their personal notification stream.
      const { sql } = await import("../lib/db.js");
      const janeHash = await bcrypt.hash("Jane-2026!", 12);
      const markHash = await bcrypt.hash("Mark-2026!", 12);
      const alexHash = await bcrypt.hash("Alex-2026!", 12);
      await sql`UPDATE users SET password_hash = ${janeHash} WHERE id = 'USR-002'`;
      await sql`UPDATE users SET password_hash = ${markHash} WHERE id = 'USR-003'`;
      await sql`UPDATE users SET password_hash = ${alexHash} WHERE id = 'USR-004'`;
    },
  },
  () => {
    const adminJar = new Jar();
    const janeJar = new Jar();
    const markJar = new Jar();
    const alexJar = new Jar();
    let taskId;

    story("All four jars sign in", () => {
      when("admin signs in", async () => {
        const { res } = await POST(adminJar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
      and_("jane / mark / alex sign in", async () => {
        const r1 = await POST(janeJar, "/api/auth/login", {
          email: "jane@hub.com",
          password: "Jane-2026!",
        });
        const r2 = await POST(markJar, "/api/auth/login", {
          email: "mark@hub.com",
          password: "Mark-2026!",
        });
        const r3 = await POST(alexJar, "/api/auth/login", {
          email: "alex@hub.com",
          password: "Alex-2026!",
        });
        expect(r1.res.status).toBe(200);
        expect(r2.res.status).toBe(200);
        expect(r3.res.status).toBe(200);
      });
    });

    story("Default preferences: task_assigned + deadline_reminder ON, others OFF", () => {
      then("GET /api/notifications/preferences returns the documented defaults", async () => {
        const { res, body } = await GET(janeJar, "/api/notifications/preferences");
        expect(res.status).toBe(200);
        expect(body.preferences.email_enabled).toBe(true);
        expect(body.preferences.email_task_assigned).toBe(true);
        expect(body.preferences.email_task_updated).toBe(false);
        expect(body.preferences.email_task_completed).toBe(false);
        expect(body.preferences.email_project_updated).toBe(false);
        expect(body.preferences.email_deadline_reminder).toBe(true);
      });
    });

    // ---------- TASK ASSIGNED -------------------------------------------------

    story("TASK ASSIGNED: creating a task with assignee=mark notifies Mark in-app + email", () => {
      when("admin creates a task assigned to Mark", async () => {
        const { res, body } = await POST(adminJar, "/api/tasks", {
          project_id: "PRJ-001",
          title: "Notify-When-Assigned",
          status: "To Do",
          priority: "High",
          due_date: "2099-12-31",
          assignee_id: "USR-003",
        });
        expect(res.status).toBe(201);
        taskId = body.task.id;
      });
      then("Mark sees the task_assigned notification", async () => {
        const { res, body } = await GET(
          markJar,
          "/api/notifications?type=task_assigned&limit=20"
        );
        expect(res.status).toBe(200);
        const n = body.items.find((x) => x.entity_id === taskId);
        expect(n).toBeTruthy("Mark should have a task_assigned notification");
        expect(n.read_at).toBe(null);
        expect(n.title).toContain("Notify-When-Assigned");
        expect(n.email_status).toBe("sent"); // default mailer = console = sent
        expect(n.actor_id).toBe("USR-001");
        expect(n.actor_name).toBe("Admin User");
      });
      and_("the unread badge reflects the new row", async () => {
        const { res, body } = await GET(
          markJar,
          "/api/notifications/unread-count"
        );
        expect(res.status).toBe(200);
        expect(body.unread_count).toBeGreaterThanOrEqual(1);
      });
      and_("the actor (admin) is NOT notified about their own action", async () => {
        const { body } = await GET(
          adminJar,
          `/api/notifications?type=task_assigned&limit=50`
        );
        const selfNoise = body.items.find((x) => x.entity_id === taskId);
        expect(selfNoise).toBe(undefined);
      });
    });

    story("TASK ASSIGNED: reassigning to Alex notifies Alex (and not Mark)", () => {
      when("admin reassigns the task to Alex", async () => {
        const { res } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/tasks/${taskId}`,
          { assignee_id: "USR-004" }
        );
        expect(res.status).toBe(200);
      });
      then("Alex now has a task_assigned for the task", async () => {
        const { body } = await GET(
          alexJar,
          `/api/notifications?type=task_assigned&limit=20`
        );
        const n = body.items.find((x) => x.entity_id === taskId);
        expect(n).toBeTruthy();
      });
    });

    // ---------- TASK UPDATED --------------------------------------------------

    story("TASK UPDATED: status change notifies every active assignee + owner (minus actor)", () => {
      when("admin flips the task to In Progress", async () => {
        const { res } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/tasks/${taskId}`,
          { status: "In Progress" }
        );
        expect(res.status).toBe(200);
      });
      then("Alex (current lead) sees the task_updated event", async () => {
        const { body } = await GET(
          alexJar,
          `/api/notifications?type=task_updated&limit=20`
        );
        const n = body.items.find((x) => x.entity_id === taskId);
        expect(n).toBeTruthy("active lead should be notified");
        expect(n.title.toLowerCase()).toContain("in progress");
      });
      and_(
        "email_status is 'disabled' for task_updated by default (opt-in)",
        async () => {
          const { body } = await GET(
            alexJar,
            `/api/notifications?type=task_updated&limit=20`
          );
          const n = body.items.find((x) => x.entity_id === taskId);
          expect(n.email_status).toBe("disabled");
        }
      );
    });

    story(
      "PREFERENCES: Alex opts into task_updated emails; next update emails them",
      () => {
        when("Alex updates preferences to enable task_updated emails", async () => {
          const { res, body } = await http(
            alexJar,
            "PATCH",
            API,
            "/api/notifications/preferences",
            { email_task_updated: true }
          );
          expect(res.status).toBe(200);
          expect(body.preferences.email_task_updated).toBe(true);
        });
        and_(
          "admin updates the task description (a non-status edit)",
          async () => {
            const { res } = await http(
              adminJar,
              "PATCH",
              API,
              `/api/tasks/${taskId}`,
              { description: "Updated body for preferences UAT" }
            );
            expect(res.status).toBe(200);
          }
        );
        then(
          "Alex's newest task_updated notification has email_status='sent'",
          async () => {
            const { body } = await GET(
              alexJar,
              `/api/notifications?type=task_updated&limit=20`
            );
            const matches = body.items.filter((x) => x.entity_id === taskId);
            // Newest first — the description-change row should be at the top.
            expect(matches[0].email_status).toBe("sent");
          }
        );
      }
    );

    story("PREFERENCES: turning the master email switch OFF silences emails", () => {
      when("Mark disables email_enabled", async () => {
        const { res } = await http(
          markJar,
          "PATCH",
          API,
          "/api/notifications/preferences",
          { email_enabled: false }
        );
        expect(res.status).toBe(200);
      });
      and_("admin reassigns the task to Mark", async () => {
        const { res } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/tasks/${taskId}`,
          { assignee_id: "USR-003" }
        );
        expect(res.status).toBe(200);
      });
      then(
        "Mark gets the in-app notification but email_status='disabled'",
        async () => {
          const { body } = await GET(
            markJar,
            `/api/notifications?type=task_assigned&limit=20`
          );
          const matches = body.items
            .filter((x) => x.entity_id === taskId)
            .sort((a, b) => b.id - a.id);
          // Most-recent row (the just-issued reassignment) is the one to
          // check; older ones from earlier stories may still be 'sent'.
          expect(matches[0].email_status).toBe("disabled");
        }
      );
    });

    // ---------- TASK COMPLETED ------------------------------------------------

    story("TASK COMPLETED: marking Done notifies the assignee + project owner", () => {
      when("admin marks the task Done", async () => {
        const { res } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/tasks/${taskId}`,
          { status: "Done" }
        );
        expect(res.status).toBe(200);
      });
      then("Mark (current lead) sees a task_completed notification", async () => {
        const { body } = await GET(
          markJar,
          `/api/notifications?type=task_completed&limit=20`
        );
        const n = body.items.find((x) => x.entity_id === taskId);
        expect(n).toBeTruthy();
        expect(n.title).toContain("completed");
      });
    });

    // ---------- PROJECT UPDATED -----------------------------------------------

    story("PROJECT UPDATED: editing a project notifies owner + assignees", () => {
      when("admin patches a non-trivial field on PRJ-001", async () => {
        const { res } = await http(
          adminJar,
          "PATCH",
          API,
          "/api/projects/PRJ-001",
          { priority: "Critical" }
        );
        expect(res.status).toBe(200);
      });
      then(
        "the project owner (admin -> seed has Jane) is notified",
        async () => {
          // Seed: PRJ-001 owner_id is USR-001 (admin). Admin is the actor so
          // they're excluded — assert that *active assignees* on the project
          // were notified instead.
          const { body } = await GET(
            janeJar,
            `/api/notifications?type=project_updated&limit=20`
          );
          const n = body.items.find((x) => x.entity_id === "PRJ-001");
          expect(n).toBeTruthy("Jane should be notified (she has a task on PRJ-001)");
        }
      );
    });

    // ---------- READ / MARK ALL / DELETE --------------------------------------

    story("Mark notification as read drops the unread count by 1", () => {
      let beforeCount;
      let firstUnreadId;
      when("Mark grabs his current unread count + a target id", async () => {
        const a = await GET(markJar, "/api/notifications/unread-count");
        beforeCount = a.body.unread_count;
        const b = await GET(markJar, "/api/notifications?unread=true&limit=5");
        firstUnreadId = b.body.items[0]?.id;
        expect(firstUnreadId).toBeTruthy("Mark should have at least one unread row");
      });
      and_("Mark marks it read", async () => {
        const { res } = await POST(
          markJar,
          `/api/notifications/${firstUnreadId}/read`,
          {}
        );
        expect(res.status).toBe(200);
      });
      then("the unread count is exactly one lower", async () => {
        const { body } = await GET(markJar, "/api/notifications/unread-count");
        expect(body.unread_count).toBe(beforeCount - 1);
      });
      and_("marking the same row again returns 404 (already read)", async () => {
        const { res } = await POST(
          markJar,
          `/api/notifications/${firstUnreadId}/read`,
          {}
        );
        expect(res.status).toBe(404);
      });
    });

    story("Mark-all-read clears the badge", () => {
      when("Mark POSTs /api/notifications/read-all", async () => {
        const { res } = await POST(markJar, "/api/notifications/read-all", {});
        expect(res.status).toBe(200);
      });
      then("his unread_count is now 0", async () => {
        const { body } = await GET(markJar, "/api/notifications/unread-count");
        expect(body.unread_count).toBe(0);
      });
    });

    story("Delete removes a notification permanently", () => {
      let targetId;
      when("Mark picks a notification", async () => {
        const { body } = await GET(markJar, "/api/notifications?limit=1");
        targetId = body.items[0]?.id;
        expect(targetId).toBeTruthy();
      });
      and_("Mark DELETEs it", async () => {
        const { res } = await http(
          markJar,
          "DELETE",
          API,
          `/api/notifications/${targetId}`
        );
        expect(res.status).toBe(200);
      });
      then("DELETEing again returns 404", async () => {
        const { res } = await http(
          markJar,
          "DELETE",
          API,
          `/api/notifications/${targetId}`
        );
        expect(res.status).toBe(404);
      });
    });

    // ---------- PRIVACY -------------------------------------------------------

    story("Notifications are scoped to the current user (privacy)", () => {
      then(
        "Mark cannot mark or delete Jane's notifications (404 — not found)",
        async () => {
          const { body } = await GET(janeJar, "/api/notifications?limit=1");
          const janeId = body.items[0]?.id;
          expect(janeId).toBeTruthy();
          const r1 = await POST(markJar, `/api/notifications/${janeId}/read`, {});
          const r2 = await http(
            markJar,
            "DELETE",
            API,
            `/api/notifications/${janeId}`
          );
          expect(r1.res.status).toBe(404);
          expect(r2.res.status).toBe(404);
        }
      );
    });

    // ---------- RBAC ---------------------------------------------------------

    story("Anonymous calls are 401 across the notifications API", () => {
      then("every endpoint returns 401 without a session", async () => {
        const r1 = await GET(null, "/api/notifications");
        const r2 = await GET(null, "/api/notifications/unread-count");
        const r3 = await POST(null, "/api/notifications/1/read", {});
        const r4 = await POST(null, "/api/notifications/read-all", {});
        const r5 = await http(null, "DELETE", API, "/api/notifications/1");
        const r6 = await GET(null, "/api/notifications/preferences");
        const r7 = await http(null, "PATCH", API, "/api/notifications/preferences", {});
        for (const r of [r1, r2, r3, r4, r5, r6, r7]) {
          expect(r.res.status).toBe(401);
        }
      });
    });
  }
);

persona(
  "Notifications — Deadline Reminder runner is idempotent + RBAC-gated",
  {
    setup: async () => {
      await preflight();
      const { sql } = await import("../lib/db.js");
      // Move one seeded task's due date into the next 24h so the runner
      // catches it, and give the seeded assignees real passwords.
      await sql`UPDATE tasks SET due_date = CURRENT_DATE + 1 WHERE id = 'ASN-001'`;
      const managerHash = await bcrypt.hash("Manager-2026!", 12);
      const memberHash = await bcrypt.hash("Member-2026!", 12);
      await sql`UPDATE users SET password_hash = ${managerHash} WHERE id = 'USR-002'`;
      await sql`UPDATE users SET password_hash = ${memberHash} WHERE id = 'USR-003'`;
    },
  },
  () => {
    const adminJar = new Jar();
    const managerJar = new Jar();
    const memberJar = new Jar();

    story("Jars sign in", () => {
      when("admin signs in", async () => {
        const { res } = await POST(adminJar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
      and_("manager + member sign in", async () => {
        const r1 = await POST(managerJar, "/api/auth/login", {
          email: "jane@hub.com",
          password: "Manager-2026!",
        });
        const r2 = await POST(memberJar, "/api/auth/login", {
          email: "mark@hub.com",
          password: "Member-2026!",
        });
        expect(r1.res.status).toBe(200);
        expect(r2.res.status).toBe(200);
      });
    });

    story("Members cannot run the deadline runner (admin/manager only)", () => {
      then("member POST → 403", async () => {
        const { res } = await POST(
          memberJar,
          "/api/notifications/run-deadline-reminders",
          {}
        );
        expect(res.status).toBe(403);
      });
      and_("manager POST → 200", async () => {
        const { res } = await POST(
          managerJar,
          "/api/notifications/run-deadline-reminders",
          {}
        );
        expect(res.status).toBe(200);
      });
    });

    story("First admin run creates deadline_reminder rows for upcoming tasks", () => {
      let firstResult;
      when("admin POSTs the runner with a 3-day horizon", async () => {
        const { res, body } = await POST(
          adminJar,
          "/api/notifications/run-deadline-reminders?days=3",
          {}
        );
        expect(res.status).toBe(200);
        expect(body.ok).toBe(true);
        expect(body.horizon_days).toBe(3);
        // Note: the manager run above already created rows; counts here are
        // cumulative against what's already in the dedupe index.
        firstResult = body;
      });
      then(
        "Jane (assignee of ASN-001) sees a deadline_reminder row",
        async () => {
          const { body } = await GET(
            managerJar,
            "/api/notifications?type=deadline_reminder&limit=20"
          );
          const n = body.items.find((x) => x.entity_id === "ASN-001");
          expect(n).toBeTruthy(
            "deadline reminder for ASN-001 should land in Jane's inbox"
          );
          expect(n.title).toContain("ASN-001"); // entity id appears in link, not title
          // Actually title format is `"<task title>" is due on <date>`
          expect(n.title.toLowerCase()).toContain("due");
        }
      );
      and_("the runner reports a non-negative scanned count", async () => {
        expect(firstResult.scanned).toBeGreaterThanOrEqual(1);
      });
    });

    story("Second run on the same day skips (dedupe index per UTC day)", () => {
      let secondResult;
      when("admin re-runs the runner", async () => {
        const { res, body } = await POST(
          adminJar,
          "/api/notifications/run-deadline-reminders?days=3",
          {}
        );
        expect(res.status).toBe(200);
        secondResult = body;
      });
      then("created=0 (every row collides with the dedupe index)", async () => {
        expect(secondResult.created).toBe(0);
        expect(secondResult.skipped).toBeGreaterThanOrEqual(1);
      });
      and_(
        "the user's notification count for this task hasn't grown",
        async () => {
          const { body } = await GET(
            managerJar,
            "/api/notifications?type=deadline_reminder&limit=50"
          );
          const matches = body.items.filter((x) => x.entity_id === "ASN-001");
          expect(matches.length).toBe(1);
        }
      );
    });
  }
);

// ============================================================================
// SECTION 11: Comments & Collaboration
//
//   Verifies the CRUD lifecycle on a task and a project, edit history,
//   @mention parsing + resolution + notification fan-out, soft-delete
//   visibility, and the RBAC matrix (author / manager / admin / outsider).
// ============================================================================

persona(
  "Comments & Collaboration — CRUD + Mentions + History (Section 11)",
  {
    setup: async () => {
      await preflight();
      const { sql } = await import("../lib/db.js");
      const janeHash = await bcrypt.hash("Jane-2026!", 12);
      const markHash = await bcrypt.hash("Mark-2026!", 12);
      const alexHash = await bcrypt.hash("Alex-2026!", 12);
      const saraHash = await bcrypt.hash("Sara-2026!", 12);
      await sql`UPDATE users SET password_hash = ${janeHash} WHERE id = 'USR-002'`;
      await sql`UPDATE users SET password_hash = ${markHash} WHERE id = 'USR-003'`;
      await sql`UPDATE users SET password_hash = ${alexHash} WHERE id = 'USR-004'`;
      await sql`UPDATE users SET password_hash = ${saraHash} WHERE id = 'USR-005'`;
    },
  },
  () => {
    const adminJar = new Jar();   // USR-001
    const janeJar = new Jar();    // USR-002 (manager — seed)
    const markJar = new Jar();    // USR-003 (member — seed)
    const alexJar = new Jar();    // USR-004 (member — seed)
    const samJar = new Jar();     // USR-005 (Sara — member — seed)
    let commentId;
    let editedCommentId;

    story("All five jars sign in", () => {
      when("admin signs in", async () => {
        const { res } = await POST(adminJar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
      and_("manager + members sign in", async () => {
        const a = await POST(janeJar, "/api/auth/login", {
          email: "jane@hub.com",
          password: "Jane-2026!",
        });
        const b = await POST(markJar, "/api/auth/login", {
          email: "mark@hub.com",
          password: "Mark-2026!",
        });
        const c = await POST(alexJar, "/api/auth/login", {
          email: "alex@hub.com",
          password: "Alex-2026!",
        });
        const d = await POST(samJar, "/api/auth/login", {
          email: "sara@hub.com",
          password: "Sara-2026!",
        });
        expect(a.res.status).toBe(200);
        expect(b.res.status).toBe(200);
        expect(c.res.status).toBe(200);
        expect(d.res.status).toBe(200);
      });
    });

    // ---------- ADD COMMENT --------------------------------------------------

    story("Add Comment: Jane posts on ASN-001 with an @mark mention", () => {
      when("jane POSTs a comment with an @mark mention", async () => {
        const { res, body } = await POST(janeJar, "/api/comments", {
          entity_type: "task",
          entity_id: "ASN-001",
          body: "Picking this up now — heads-up @mark, you'll review later.",
        });
        expect(res.status).toBe(201);
        commentId = body.comment.id;
        expect(body.comment.author_name).toBe("Jane Smith");
        expect(body.comment.mentions.length).toBe(1);
        expect(body.comment.mentions[0].user_id).toBe("USR-003");
        expect(body.comment.is_deleted).toBe(false);
        expect(body.comment.edited_at).toBe(null);
      });
      and_("the comment shows up in the entity's comment list", async () => {
        const { res, body } = await GET(
          markJar,
          "/api/comments?entity_type=task&entity_id=ASN-001"
        );
        expect(res.status).toBe(200);
        expect(body.items.length).toBeGreaterThanOrEqual(1);
        expect(body.items.find((c) => c.id === commentId)).toBeTruthy();
      });
      and_("Mark gets a comment_mention notification (email sent by default)", async () => {
        const { body } = await GET(
          markJar,
          "/api/notifications?type=comment_mention&limit=10"
        );
        const n = body.items.find((x) => x.entity_id === "ASN-001");
        expect(n).toBeTruthy("mark should be mentioned");
        expect(n.email_status).toBe("sent"); // default mailer = console
        expect(n.title).toContain("Jane Smith");
      });
      and_(
        "other subscribers (e.g. project owner) get comment_added but not the mention",
        async () => {
          const { body } = await GET(
            adminJar,
            "/api/notifications?type=comment_added&limit=20"
          );
          const n = body.items.find((x) => x.entity_id === "ASN-001");
          expect(n).toBeTruthy("project owner / subscribers should be pinged");
          expect(n.email_status).toBe("disabled"); // off by default
          // Author (jane) must not be notified.
          const { body: janeBody } = await GET(
            janeJar,
            "/api/notifications?limit=50"
          );
          const janeSelfNoise = janeBody.items.find(
            (x) => x.entity_id === "ASN-001" && x.actor_id === "USR-002"
          );
          expect(janeSelfNoise).toBe(undefined);
        }
      );
    });

    story("Validation: empty body, bad entity_type, too long all rejected", () => {
      then("empty body → 400", async () => {
        const { res } = await POST(janeJar, "/api/comments", {
          entity_type: "task",
          entity_id: "ASN-001",
          body: "   ",
        });
        expect(res.status).toBe(400);
      });
      and_("bad entity_type → 400", async () => {
        const { res } = await POST(janeJar, "/api/comments", {
          entity_type: "user",
          entity_id: "USR-001",
          body: "hi",
        });
        expect(res.status).toBe(400);
      });
      and_("non-existent entity → 404", async () => {
        const { res } = await POST(janeJar, "/api/comments", {
          entity_type: "task",
          entity_id: "ASN-9999",
          body: "ghost",
        });
        expect(res.status).toBe(404);
      });
      and_("over-long body → 400", async () => {
        const { res } = await POST(janeJar, "/api/comments", {
          entity_type: "task",
          entity_id: "ASN-001",
          body: "a".repeat(4001),
        });
        expect(res.status).toBe(400);
      });
    });

    // ---------- EDIT COMMENT -------------------------------------------------

    story("Edit Comment: Jane edits her own; admin can also edit; member cannot", () => {
      when("jane edits her comment", async () => {
        const { res, body } = await http(
          janeJar,
          "PATCH",
          API,
          `/api/comments/${commentId}`,
          { body: "Picking this up now — handing review to @alex." }
        );
        expect(res.status).toBe(200);
        expect(body.changed).toBe(true);
        expect(body.comment.edited_at).toBeTruthy();
        expect(body.comment.mentions.length).toBe(1);
        expect(body.comment.mentions[0].user_id).toBe("USR-004");
      });
      and_(
        "Alex (newly-mentioned) gets a fresh comment_mention notification",
        async () => {
          const { body } = await GET(
            alexJar,
            "/api/notifications?type=comment_mention&limit=10"
          );
          const n = body.items.find((x) => x.entity_id === "ASN-001");
          expect(n).toBeTruthy();
        }
      );
      and_(
        "Mark does NOT receive a new mention notification (he was removed)",
        async () => {
          const { body } = await GET(
            markJar,
            "/api/notifications?type=comment_mention&limit=20"
          );
          const matches = body.items.filter(
            (x) => x.entity_id === "ASN-001"
          );
          // Mark only has the *original* mention (from the create story).
          expect(matches.length).toBe(1);
        }
      );
      then(
        "another member (Sam) cannot edit Jane's comment (403)",
        async () => {
          const { res } = await http(
            samJar,
            "PATCH",
            API,
            `/api/comments/${commentId}`,
            { body: "Tampered." }
          );
          expect(res.status).toBe(403);
        }
      );
      and_("admin CAN edit Jane's comment (moderation override)", async () => {
        const { res, body } = await http(
          adminJar,
          "PATCH",
          API,
          `/api/comments/${commentId}`,
          { body: "[edited by admin] Picking this up now — handing review to @alex." }
        );
        expect(res.status).toBe(200);
        expect(body.changed).toBe(true);
        editedCommentId = body.comment.id;
      });
    });

    // ---------- COMMENT HISTORY ----------------------------------------------

    story("Comment History: prior versions are surfaced in /history", () => {
      then("GET /api/comments/:id/history returns 2 versions (jane + admin edits)", async () => {
        const { res, body } = await GET(
          janeJar,
          `/api/comments/${editedCommentId ?? commentId}/history`
        );
        expect(res.status).toBe(200);
        expect(body.versions.length).toBe(2);
        // Versions are stored in *editor order* (oldest first). The first
        // snapshot is jane's original; the second is jane's edit.
        expect(body.versions[0].body).toContain("@mark");
        expect(body.versions[1].body).toContain("@alex");
        expect(body.current_body).toContain("[edited by admin]");
        expect(body.edited_at).toBeTruthy();
      });
    });

    // ---------- MENTION ROBUSTNESS -------------------------------------------

    story("Mentions: unknown handles + ambiguity are silently ignored, not errors", () => {
      when("jane posts a comment with @nobody and bare @ tokens", async () => {
        const { res, body } = await POST(janeJar, "/api/comments", {
          entity_type: "task",
          entity_id: "ASN-001",
          body: "FYI @nobody, also @ should not match.",
        });
        expect(res.status).toBe(201);
        expect(body.comment.mentions.length).toBe(0);
      });
    });

    // ---------- LIST: SOFT-DELETE BEHAVIOUR ----------------------------------

    story("Delete: author can soft-delete; row stays hidden by default, visible with include_deleted=true", () => {
      let toDelete;
      when("jane creates a comment for the explicit purpose of deleting", async () => {
        const { res, body } = await POST(janeJar, "/api/comments", {
          entity_type: "task",
          entity_id: "ASN-001",
          body: "This will be deleted shortly.",
        });
        expect(res.status).toBe(201);
        toDelete = body.comment.id;
      });
      and_("jane deletes it", async () => {
        const { res } = await http(
          janeJar,
          "DELETE",
          API,
          `/api/comments/${toDelete}`
        );
        expect(res.status).toBe(200);
      });
      then("default list does NOT include the deleted row", async () => {
        const { body } = await GET(
          markJar,
          "/api/comments?entity_type=task&entity_id=ASN-001"
        );
        expect(body.items.find((c) => c.id === toDelete)).toBe(undefined);
      });
      and_("include_deleted=true returns the row with body=null for non-authors", async () => {
        const { body } = await GET(
          markJar,
          "/api/comments?entity_type=task&entity_id=ASN-001&include_deleted=true"
        );
        const ghost = body.items.find((c) => c.id === toDelete);
        expect(ghost).toBeTruthy();
        expect(ghost.is_deleted).toBe(true);
        expect(ghost.body).toBe(null);
      });
      and_("the author CAN still see the body when include_deleted=true", async () => {
        const { body } = await GET(
          janeJar,
          "/api/comments?entity_type=task&entity_id=ASN-001&include_deleted=true"
        );
        const ghost = body.items.find((c) => c.id === toDelete);
        expect(ghost.body).toBe("This will be deleted shortly.");
      });
      and_("admins also see the body when include_deleted=true", async () => {
        const { body } = await GET(
          adminJar,
          "/api/comments?entity_type=task&entity_id=ASN-001&include_deleted=true"
        );
        const ghost = body.items.find((c) => c.id === toDelete);
        expect(ghost.body).toBe("This will be deleted shortly.");
      });
      then("editing a soft-deleted comment → 409", async () => {
        const { res } = await http(
          janeJar,
          "PATCH",
          API,
          `/api/comments/${toDelete}`,
          { body: "Resurrect?" }
        );
        expect(res.status).toBe(409);
      });
      and_("deleting it twice → 409", async () => {
        const { res } = await http(
          janeJar,
          "DELETE",
          API,
          `/api/comments/${toDelete}`
        );
        expect(res.status).toBe(409);
      });
    });

    story("Delete RBAC: a member who is not the author cannot delete (403); manager and admin can", () => {
      let alexComment;
      let janeComment;
      let samComment;
      when("alex posts a comment", async () => {
        const { res, body } = await POST(alexJar, "/api/comments", {
          entity_type: "task",
          entity_id: "ASN-001",
          body: "Posted by alex.",
        });
        expect(res.status).toBe(201);
        alexComment = body.comment.id;
      });
      and_("jane (manager) posts a comment", async () => {
        const { res, body } = await POST(janeJar, "/api/comments", {
          entity_type: "task",
          entity_id: "ASN-001",
          body: "Posted by jane the manager.",
        });
        expect(res.status).toBe(201);
        janeComment = body.comment.id;
      });
      and_("sam (member) posts a comment", async () => {
        const { res, body } = await POST(samJar, "/api/comments", {
          entity_type: "task",
          entity_id: "ASN-001",
          body: "Posted by sam.",
        });
        expect(res.status).toBe(201);
        samComment = body.comment.id;
      });
      then("sam cannot delete alex's comment (403)", async () => {
        const { res } = await http(
          samJar,
          "DELETE",
          API,
          `/api/comments/${alexComment}`
        );
        expect(res.status).toBe(403);
      });
      and_("manager (jane) CAN delete sam's comment (moderation)", async () => {
        const { res } = await http(
          janeJar,
          "DELETE",
          API,
          `/api/comments/${samComment}`
        );
        expect(res.status).toBe(200);
      });
      and_("admin CAN delete jane's comment (moderation)", async () => {
        const { res } = await http(
          adminJar,
          "DELETE",
          API,
          `/api/comments/${janeComment}`
        );
        expect(res.status).toBe(200);
      });
      and_("members can still delete their own comments", async () => {
        const { res } = await http(
          alexJar,
          "DELETE",
          API,
          `/api/comments/${alexComment}`
        );
        expect(res.status).toBe(200);
      });
    });

    // ---------- PROJECT COMMENTS --------------------------------------------

    story("Comments also work on projects (generic entity_type)", () => {
      let projectComment;
      when("admin posts on PRJ-001", async () => {
        const { res, body } = await POST(adminJar, "/api/comments", {
          entity_type: "project",
          entity_id: "PRJ-001",
          body: "Kicking off PRJ-001 — @jane please drive scoping.",
        });
        expect(res.status).toBe(201);
        projectComment = body.comment;
      });
      then("the project's comment list reflects the new row", async () => {
        const { body } = await GET(
          janeJar,
          "/api/comments?entity_type=project&entity_id=PRJ-001"
        );
        const c = body.items.find((x) => x.id === projectComment.id);
        expect(c).toBeTruthy();
        expect(c.mentions[0].user_id).toBe("USR-002");
      });
      and_("Jane receives the comment_mention notification", async () => {
        const { body } = await GET(
          janeJar,
          "/api/notifications?type=comment_mention&limit=20"
        );
        const n = body.items.find(
          (x) => x.entity_type === "project" && x.entity_id === "PRJ-001"
        );
        expect(n).toBeTruthy();
      });
    });

    // ---------- ACTIVITY LOG INTEGRATION ------------------------------------

    story("Each comment lifecycle event appears in the activity log (Section 9 hook)", () => {
      then("the activity feed contains comment / comment_edit / comment_delete entries", async () => {
        const { body } = await GET(
          adminJar,
          "/api/activity?entity_type=task&entity_id=ASN-001&limit=200"
        );
        const actions = new Set(body.items.map((a) => a.action));
        expect(actions.has("comment")).toBe(true);
        expect(actions.has("comment_edit")).toBe(true);
        expect(actions.has("comment_delete")).toBe(true);
      });
    });

    // ---------- RBAC: ANONYMOUS ---------------------------------------------

    story("Anonymous requests are rejected with 401 across the comment API", () => {
      then("every endpoint requires a session", async () => {
        const r1 = await GET(null, "/api/comments?entity_type=task&entity_id=ASN-001");
        const r2 = await POST(null, "/api/comments", { entity_type: "task", entity_id: "ASN-001", body: "x" });
        const r3 = await http(null, "PATCH", API, "/api/comments/1", { body: "x" });
        const r4 = await http(null, "DELETE", API, "/api/comments/1");
        const r5 = await GET(null, "/api/comments/1/history");
        for (const r of [r1, r2, r3, r4, r5]) {
          expect(r.res.status).toBe(401);
        }
      });
    });
  }
);

// Dedicated persona for the new Dashboard widget endpoints. It re-runs the
// preflight seed for fully deterministic numbers, then hashes a password for
// Jane Smith (USR-002) so we can sign in as her and exercise the "my tasks"
// personal view against a user who actually owns tasks. Admin's view, by
// contrast, must show the empty-state because USR-001 has no assigned tasks
// in the seed.

const widgetsState = {
  adminJar: new Jar(),
  janeJar: new Jar(),
  janePassword: "Jane-Manager-2026!",
};

persona(
  "Dashboard widget contracts (deep coverage)",
  {
    setup: async () => {
      await preflight();
      const { sql } = await import("../lib/db.js");
      const janeHash = await bcrypt.hash(widgetsState.janePassword, 12);
      await sql`UPDATE users SET password_hash = ${janeHash} WHERE id = 'USR-002'`;
    },
  },
  () => {
    story("Admin signs in so /api/dashboard/stats reflects active-user activity", () => {
      when("admin logs in", async () => {
        const { res } = await POST(widgetsState.adminJar, "/api/auth/login", {
          email: "admin@hub.com",
          password: UAT_ADMIN_PASSWORD,
        });
        expect(res.status).toBe(200);
      });
    });

    story("Overview: every new headline metric is present and correct", () => {
      let stats;
      when("admin fetches /api/dashboard/stats", async () => {
        const { res, body } = await GET(
          widgetsState.adminJar,
          "/api/dashboard/stats"
        );
        expect(res.status).toBe(200);
        stats = body;
      });
      then("the proposal's six headline metrics are all reported", () => {
        for (const key of [
          "totalProjects",
          "totalTasks",
          "completedTasks",
          "pendingTasks",
          "overdueTasks",
          "activeUsers",
        ]) {
          expect(typeof stats[key]).toBe(
            "number",
            `${key} should be a number in /api/dashboard/stats`
          );
        }
      });
      and_("the values reconcile with the seed", () => {
        expect(stats.totalProjects).toBe(7);
        expect(stats.totalTasks).toBe(8);
        expect(stats.completedTasks).toBe(2);
        expect(stats.pendingTasks).toBe(6);
        expect(stats.overdueTasks).toBe(6);
        expect(stats.activeUsers).toBe(
          1,
          "only the admin has logged in in this persona"
        );
      });
    });

    story("Project Progress Overview widget", () => {
      let payload;
      when("admin fetches /api/dashboard/project-progress", async () => {
        const { res, body } = await GET(
          widgetsState.adminJar,
          "/api/dashboard/project-progress"
        );
        expect(res.status).toBe(200);
        payload = body;
      });
      then("every seeded project gets a row, sorted by % completion DESC", () => {
        expect(payload.items.length).toBe(7);
        const pcts = payload.items.map((p) => p.completion_pct);
        for (let i = 1; i < pcts.length; i++) {
          expect(pcts[i - 1] >= pcts[i]).toBeTruthy(
            `not sorted DESC at index ${i}: ${pcts[i - 1]} < ${pcts[i]}`
          );
        }
      });
      and_("the 100% / 50% / 0% bucket shapes match the seed", () => {
        const byId = Object.fromEntries(payload.items.map((p) => [p.id, p]));
        // PRJ-007: 1 task (Done) → 100%
        expect(byId["PRJ-007"].completion_pct).toBe(100);
        expect(byId["PRJ-007"].total_tasks).toBe(1);
        expect(byId["PRJ-007"].done_tasks).toBe(1);
        // PRJ-003: 2 tasks (1 Done, 1 In Progress) → 50%
        expect(byId["PRJ-003"].completion_pct).toBe(50);
        expect(byId["PRJ-003"].total_tasks).toBe(2);
        expect(byId["PRJ-003"].done_tasks).toBe(1);
        // PRJ-001..PRJ-006 (except PRJ-003): 0%, 1 open task each, 1 overdue
        for (const id of ["PRJ-001", "PRJ-002", "PRJ-004", "PRJ-005", "PRJ-006"]) {
          expect(byId[id].completion_pct).toBe(0);
          expect(byId[id].overdue_tasks).toBe(
            1,
            `${id} should have 1 overdue task`
          );
        }
      });
      and_("each row carries the owner_name (joined from users)", () => {
        for (const p of payload.items) {
          expect(p.owner_name).toBeTruthy(
            `${p.id} should have owner_name joined`
          );
        }
      });
    });

    story("Task Status Overview widget", () => {
      let payload;
      when("admin fetches /api/dashboard/task-status", async () => {
        const { res, body } = await GET(
          widgetsState.adminJar,
          "/api/dashboard/task-status"
        );
        expect(res.status).toBe(200);
        payload = body;
      });
      then("the three canonical statuses are reported", () => {
        const statuses = payload.items.map((i) => i.status);
        expect(statuses).toEqual(["To Do", "In Progress", "Done"]);
      });
      and_("counts and percents add up against the seed", () => {
        const byStatus = Object.fromEntries(
          payload.items.map((i) => [i.status, i])
        );
        expect(byStatus["To Do"].count).toBe(3);
        expect(byStatus["In Progress"].count).toBe(3);
        expect(byStatus["Done"].count).toBe(2);
        expect(payload.total).toBe(8);
        const sumPercents = payload.items.reduce((s, i) => s + i.percent, 0);
        // Rounding can yield 99-101 in aggregate — that's expected.
        expect(sumPercents >= 99 && sumPercents <= 101).toBeTruthy(
          `percents should sum to ~100, got ${sumPercents}`
        );
      });
    });

    story("Team Workload Overview widget", () => {
      let payload;
      when("admin fetches /api/dashboard/team-workload", async () => {
        const { res, body } = await GET(
          widgetsState.adminJar,
          "/api/dashboard/team-workload"
        );
        expect(res.status).toBe(200);
        payload = body;
      });
      then("only people with assignments appear (admin omitted)", () => {
        const ids = payload.items.map((u) => u.id).sort();
        // USR-002..USR-005 each have 2 tasks. USR-001 admin has none.
        expect(ids).toEqual(["USR-002", "USR-003", "USR-004", "USR-005"]);
        for (const u of payload.items) {
          expect(u.total).toBe(2, `${u.id} should have 2 assigned tasks`);
        }
      });
      and_("the peak is reported for chart scaling", () => {
        expect(payload.peak).toBe(2);
      });
      and_("the per-status breakdown reconciles per assignee", () => {
        const byId = Object.fromEntries(payload.items.map((u) => [u.id, u]));
        // USR-002 Jane: ASN-001 In Progress + ASN-005 In Progress
        expect(byId["USR-002"].in_progress).toBe(2);
        expect(byId["USR-002"].done).toBe(0);
        // USR-003 Mark: ASN-003 Done + ASN-007 Done
        expect(byId["USR-003"].done).toBe(2);
        // USR-004 Alex: ASN-002 To Do + ASN-006 To Do
        expect(byId["USR-004"].todo).toBe(2);
      });
    });

    story("Upcoming Deadlines widget", () => {
      let payload;
      when("admin fetches /api/dashboard/upcoming-deadlines", async () => {
        const { res, body } = await GET(
          widgetsState.adminJar,
          "/api/dashboard/upcoming-deadlines"
        );
        expect(res.status).toBe(200);
        payload = body;
      });
      then("the response is well-formed even when no tasks are due soon", () => {
        // All seed tasks are due in 2024 → none qualify on a 2026 dev clock.
        expect(Array.isArray(payload.items)).toBeTruthy();
        expect(payload.items.length).toBe(0);
        expect(payload.horizonDays).toBe(14);
      });
      and_("the horizon is configurable via ?days=", async () => {
        // 60-day cap from the server; passing 30 still returns 0 for seed data.
        const { res, body } = await GET(
          widgetsState.adminJar,
          "/api/dashboard/upcoming-deadlines?days=30"
        );
        expect(res.status).toBe(200);
        expect(body.horizonDays).toBe(30);
      });
    });

    story("My Tasks (Assigned Tasks Summary) — admin has nothing assigned", () => {
      when("admin fetches /api/dashboard/my-tasks", async () => {
        const { res, body } = await GET(
          widgetsState.adminJar,
          "/api/dashboard/my-tasks"
        );
        expect(res.status).toBe(200);
        for (const key of ["todo", "in_progress", "done", "overdue", "total"]) {
          expect(body.summary[key]).toBe(
            0,
            `admin's ${key} should be 0 (no tasks assigned in seed)`
          );
        }
        expect(body.upNext.length).toBe(0);
      });
    });

    story("My Tasks shows real workload for Jane (a seeded assignee)", () => {
      when("Jane signs in", async () => {
        const { res } = await POST(widgetsState.janeJar, "/api/auth/login", {
          email: "jane@hub.com",
          password: widgetsState.janePassword,
        });
        expect(res.status).toBe(200);
      });
      then("Jane sees her two In Progress tasks", async () => {
        const { res, body } = await GET(
          widgetsState.janeJar,
          "/api/dashboard/my-tasks"
        );
        expect(res.status).toBe(200);
        expect(body.summary.total).toBe(2);
        expect(body.summary.in_progress).toBe(2);
        expect(body.summary.done).toBe(0);
        // both her tasks have 2024 due dates → both overdue
        expect(body.summary.overdue).toBe(2);
      });
      and_("upNext is ordered by due_date ASC and capped at 5", async () => {
        const { body } = await GET(
          widgetsState.janeJar,
          "/api/dashboard/my-tasks"
        );
        expect(body.upNext.length).toBe(2);
        const dates = body.upNext.map((t) => t.due_date);
        for (let i = 1; i < dates.length; i++) {
          expect(dates[i - 1] <= dates[i]).toBeTruthy(
            "upNext should be sorted by due_date ASC"
          );
        }
        for (const t of body.upNext) {
          expect(t.project_name).toBeTruthy(
            "upNext rows should include project_name"
          );
        }
      });
    });

    story("All dashboard widgets are gated behind authentication", () => {
      when("an anonymous client requests each widget endpoint", async () => {
        const paths = [
          "/api/dashboard/stats",
          "/api/dashboard/activity",
          "/api/dashboard/project-progress",
          "/api/dashboard/task-status",
          "/api/dashboard/team-workload",
          "/api/dashboard/upcoming-deadlines",
          "/api/dashboard/my-tasks",
        ];
        for (const p of paths) {
          const { res } = await GET(null, p);
          expect(res.status).toBe(401, `${p} should require auth`);
        }
      });
    });
  }
);

// ----- runner + report -------------------------------------------------------

async function executeAllStories() {
  for (const p of personas) {
    console.log(`\n${BOLD}${CYAN}Persona: ${p.name}${RESET}`);
    console.log(`${CYAN}${"─".repeat(64)}${RESET}`);
    if (p.setup) {
      try {
        await p.setup();
      } catch (err) {
        console.log(
          `  ${RED}✗ persona setup failed: ${err.message}${RESET}`
        );
        for (const s of p.stories) {
          s.passed = false;
          s.skipRemaining = true;
        }
        continue;
      }
    }
    for (const s of p.stories) {
      console.log(`\n  ${BOLD}Story:${RESET} ${s.title}`);
      for (const st of s.steps) {
        if (s.skipRemaining) {
          st.status = "skip";
          continue;
        }
        try {
          await st.fn();
          st.status = "pass";
        } catch (err) {
          st.status = "fail";
          st.error = err.message ?? String(err);
          s.passed = false;
          s.skipRemaining = true; // once a step fails, skip the rest of the story
        }
        const glyph =
          st.status === "pass"
            ? `${GREEN}✓${RESET}`
            : st.status === "fail"
              ? `${RED}✗${RESET}`
              : `${DIM}-${RESET}`;
        console.log(
          `    ${glyph} ${DIM}${st.prefix.padEnd(5)}${RESET} ${st.description}`
        );
        if (st.status === "fail") {
          console.log(`        ${RED}↳ ${st.error}${RESET}`);
        }
      }
      for (const st of s.steps) {
        if (st.status === "skip") {
          console.log(
            `    ${DIM}- ${st.prefix.padEnd(5)} ${st.description} ${DIM}(skipped — earlier step failed)${RESET}`
          );
        }
      }
      const verdict = s.passed
        ? `${GREEN}✓ ACCEPTED${RESET}`
        : `${RED}✗ REJECTED${RESET}`;
      console.log(`    ${verdict}`);
    }
  }
}

async function main() {
  console.log(
    `${BOLD}USER ACCEPTANCE TESTING — Right Tail Project Management Tool${RESET}`
  );
  console.log(`${DIM}API: ${API}  WEB: ${WEB}${RESET}\n`);
  console.log(
    `${DIM}Each persona has its own setup — the empty-workspace persona runs first on a cleared DB, then the populated-workspace personas run after demo seeding.${RESET}`
  );

  await executeAllStories();

  let totalSteps = 0;
  let totalPassed = 0;
  let totalStories = 0;
  let passedStories = 0;
  for (const p of personas) {
    for (const s of p.stories) {
      totalStories++;
      if (s.passed) passedStories++;
      for (const st of s.steps) {
        if (st.status === "skip") continue;
        totalSteps++;
        if (st.status === "pass") totalPassed++;
      }
    }
  }

  console.log(`\n${BOLD}${"═".repeat(64)}${RESET}`);
  console.log(`${BOLD}UAT Summary${RESET}`);
  const storyColor = passedStories === totalStories ? GREEN : YELLOW;
  console.log(
    `  Stories  : ${storyColor}${passedStories} / ${totalStories} passed${RESET}`
  );
  const stepColor = totalPassed === totalSteps ? GREEN : YELLOW;
  console.log(
    `  Steps    : ${stepColor}${totalPassed} / ${totalSteps} passed${RESET}`
  );
  const overall =
    passedStories === totalStories ? "ACCEPTED" : "NOT ACCEPTED";
  const overallColor = passedStories === totalStories ? GREEN : RED;
  console.log(
    `  Verdict  : ${BOLD}${overallColor}${overall}${RESET}\n`
  );

  // Always clean up: leave the database empty so a manual run from the UI works.
  const { sql } = await import("../lib/db.js");
  await sql`TRUNCATE TABLE activity RESTART IDENTITY CASCADE`;
  await sql`TRUNCATE TABLE tasks CASCADE`;
  await sql`TRUNCATE TABLE projects CASCADE`;
  await sql`TRUNCATE TABLE teams CASCADE`;
  await sql`TRUNCATE TABLE users CASCADE`;
  console.log(`${DIM}(workspace cleaned up — DB is empty)${RESET}`);

  process.exit(passedStories === totalStories ? 0 : 1);
}

main().catch((err) => {
  console.error("UAT runner crashed:", err);
  process.exit(2);
});
