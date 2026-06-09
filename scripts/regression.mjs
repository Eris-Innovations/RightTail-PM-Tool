#!/usr/bin/env node
// Regression test runner. Hits the live API + Vite proxy and asserts behavior.
// Usage: npm run test:regression

const API = process.env.REGRESSION_API ?? "http://127.0.0.1:3000";
const WEB = process.env.REGRESSION_WEB ?? "http://127.0.0.1:3000";

// ----- tiny test harness -----------------------------------------------------

const tests = [];
const groups = new Map();
let currentGroup = "general";

function group(name, fn) {
  currentGroup = name;
  groups.set(name, true);
  fn();
}

function test(name, fn) {
  tests.push({ group: currentGroup, name, fn });
}

function assert(cond, message) {
  if (!cond) throw new Error(`assertion failed: ${message}`);
}

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `${message ?? "assertion failed"} — expected ${JSON.stringify(
        expected
      )}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertStatus(res, expected, ctx = "") {
  if (res.status !== expected) {
    throw new Error(
      `${ctx ? ctx + ": " : ""}expected HTTP ${expected}, got ${res.status} ${res.statusText}`
    );
  }
}

// ----- cookie jar ------------------------------------------------------------

class Jar {
  constructor() {
    this.store = new Map();
  }
  ingest(res) {
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const sc of setCookies) {
      const [pair, ...attrs] = sc.split(";");
      const [name, ...rest] = pair.split("=");
      const value = rest.join("=").trim();
      if (value === "" || /Expires=Thu, 01 Jan 1970/i.test(sc)) {
        this.store.delete(name.trim());
      } else {
        this.store.set(name.trim(), { value, attrs });
      }
    }
  }
  header() {
    return Array.from(this.store.entries())
      .map(([k, { value }]) => `${k}=${value}`)
      .join("; ");
  }
  raw(name) {
    return this.store.get(name);
  }
  clear() {
    this.store.clear();
  }
}

async function call(jar, method, base, path, body) {
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
  let parsed = null;
  const text = await res.text();
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { res, body: parsed };
}

const POST = (jar, path, body) => call(jar, "POST", API, path, body);
const GET = (jar, path) => call(jar, "GET", API, path);
const PROXY_POST = (jar, path, body) => call(jar, "POST", WEB, path, body);
const PROXY_GET = (jar, path) => call(jar, "GET", WEB, path);

const uniqueEmail = (prefix = "reg") =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@hub.test`;

// ----- tests -----------------------------------------------------------------

group("health & schema", () => {
  test("GET /api/health is public and returns ok+now", async () => {
    const { res, body } = await GET(null, "/api/health");
    assertStatus(res, 200);
    assert(body.ok === true, "ok=true");
    assert(typeof body.now === "string" && body.now.length > 0, "now is a non-empty string");
  });
});

group("auth gating", () => {
  const protectedPaths = [
    "/api/auth/me",
    "/api/dashboard/stats",
    "/api/dashboard/activity",
    "/api/projects",
    "/api/tasks",
    "/api/users",
    "/api/assignments",
    "/api/activity",
  ];
  for (const p of protectedPaths) {
    test(`GET ${p} without cookie returns 401`, async () => {
      const { res, body } = await GET(null, p);
      assertStatus(res, 401, p);
      assert(body?.error, `error field present (got ${JSON.stringify(body)})`);
    });
  }
});

group("signup validation", () => {
  test("missing fields → 400", async () => {
    const { res } = await POST(null, "/api/auth/signup", {});
    assertStatus(res, 400);
  });
  test("name too short → 400", async () => {
    const { res, body } = await POST(null, "/api/auth/signup", {
      name: "A",
      email: uniqueEmail(),
      password: "hunter12!",
    });
    assertStatus(res, 400);
    assert(/name/i.test(body.error), "error mentions name");
  });
  test("invalid email → 400", async () => {
    const { res, body } = await POST(null, "/api/auth/signup", {
      name: "Reg Test",
      email: "not-an-email",
      password: "hunter12!",
    });
    assertStatus(res, 400);
    assert(/email/i.test(body.error), "error mentions email");
  });
  test("short password → 400", async () => {
    const { res, body } = await POST(null, "/api/auth/signup", {
      name: "Reg Test",
      email: uniqueEmail(),
      password: "short",
    });
    assertStatus(res, 400);
    assert(/password/i.test(body.error), "error mentions password");
  });
});

group("happy-path auth flow", () => {
  const jar = new Jar();
  const email = uniqueEmail("admin");
  const password = "hunter12!";
  let userId;

  test("first signup creates user with role=admin and sets cookie", async () => {
    const { res, body } = await POST(jar, "/api/auth/signup", {
      name: "First Admin",
      email,
      password,
    });
    assertStatus(res, 201);
    assertEq(body.user.role, "admin", "first user is admin");
    assertEq(body.user.email, email);
    assert(/^USR-/.test(body.user.id), "user id has USR- prefix");
    userId = body.user.id;
    assert(jar.raw("ph_session"), "ph_session cookie was set");
  });

  test("Set-Cookie has HttpOnly, SameSite=Lax, Path=/", async () => {
    const j2 = new Jar();
    const res = await fetch(`${API}/api/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Cookie Check",
        email: uniqueEmail("ck"),
        password: "hunter12!",
      }),
    });
    j2.ingest(res);
    const setCookies = res.headers.getSetCookie?.() ?? [];
    const ph = setCookies.find((s) => s.startsWith("ph_session="));
    assert(ph, "ph_session Set-Cookie header present");
    assert(/HttpOnly/i.test(ph), "HttpOnly attribute set");
    assert(/SameSite=Lax/i.test(ph), "SameSite=Lax attribute set");
    assert(/Path=\//.test(ph), "Path=/ attribute set");
  });

  test("GET /api/auth/me with cookie returns the user", async () => {
    const { res, body } = await GET(jar, "/api/auth/me");
    assertStatus(res, 200);
    assertEq(body.user.id, userId);
    assertEq(body.user.role, "admin");
    assert(body.user.last_login_at, "last_login_at populated");
  });

  test("duplicate signup with same email → 409", async () => {
    const { res, body } = await POST(null, "/api/auth/signup", {
      name: "Dup",
      email,
      password: "another12!",
    });
    assertStatus(res, 409);
    assert(/registered/i.test(body.error), "error mentions registered");
  });

  test("login with wrong password → 401", async () => {
    const { res } = await POST(null, "/api/auth/login", {
      email,
      password: "WRONGwrong1",
    });
    assertStatus(res, 401);
  });

  test("login with correct password sets a fresh cookie", async () => {
    const j = new Jar();
    const { res, body } = await POST(j, "/api/auth/login", {
      email,
      password,
    });
    assertStatus(res, 200);
    assertEq(body.user.email, email);
    assert(j.raw("ph_session"), "new cookie issued");
  });

  test("second signup is role=member (not admin)", async () => {
    const j = new Jar();
    const { res, body } = await POST(j, "/api/auth/signup", {
      name: "Second User",
      email: uniqueEmail("member"),
      password: "hunter12!",
    });
    assertStatus(res, 201);
    assertEq(body.user.role, "member", "second user defaults to member");
  });

  test("logout clears the cookie and revokes access", async () => {
    const { res } = await POST(jar, "/api/auth/logout");
    assertStatus(res, 200);
    assert(!jar.raw("ph_session"), "cookie removed from jar after logout");
    const { res: me } = await GET(jar, "/api/auth/me");
    assertStatus(me, 401, "subsequent /me");
  });

  test("invalid JWT in cookie → 401", async () => {
    const j = new Jar();
    j.store.set("ph_session", { value: "not.a.valid.jwt", attrs: [] });
    const { res } = await GET(j, "/api/dashboard/stats");
    assertStatus(res, 401);
  });
});

group("protected endpoints (with valid session)", () => {
  const jar = new Jar();

  test("setup: signup a fresh admin", async () => {
    const { res } = await POST(jar, "/api/auth/signup", {
      name: "Endpoint Tester",
      email: uniqueEmail("ep"),
      password: "hunter12!",
    });
    assertStatus(res, 201);
  });

  const paths = [
    { path: "/api/dashboard/stats", check: (b) => typeof b.totalUsers === "number" && b.totalUsers >= 1 },
    { path: "/api/dashboard/activity", check: (b) => Array.isArray(b) },
    { path: "/api/projects", check: (b) => Array.isArray(b.items) && Array.isArray(b.summary) },
    { path: "/api/tasks", check: (b) => Array.isArray(b.items) && Array.isArray(b.summary) },
    { path: "/api/users", check: (b) => Array.isArray(b.items) && b.items.length >= 1 },
    { path: "/api/assignments", check: (b) => Array.isArray(b.items) && Array.isArray(b.summary) },
    { path: "/api/activity", check: (b) => Array.isArray(b.items) },
    { path: "/api/activity?limit=5", check: (b) => Array.isArray(b.items) && b.items.length <= 5 },
  ];

  for (const { path, check } of paths) {
    test(`GET ${path} returns expected shape`, async () => {
      const { res, body } = await GET(jar, path);
      assertStatus(res, 200, path);
      assert(check(body), `shape mismatch for ${path}: got ${JSON.stringify(body).slice(0, 200)}`);
    });
  }
});

group("Vite proxy", () => {
  test("WEB /api/health proxies to API", async () => {
    const { res, body } = await PROXY_GET(null, "/api/health");
    assertStatus(res, 200);
    assert(body?.ok === true, "proxied response has ok=true");
  });

  test("signup → me round-trip through proxy preserves cookie", async () => {
    const jar = new Jar();
    const { res: s } = await PROXY_POST(jar, "/api/auth/signup", {
      name: "Proxy User",
      email: uniqueEmail("proxy"),
      password: "hunter12!",
    });
    assertStatus(s, 201);
    assert(jar.raw("ph_session"), "cookie set via proxy");
    const { res, body } = await PROXY_GET(jar, "/api/auth/me");
    assertStatus(res, 200);
    assert(body.user, "me returns user");
  });
});

group("teardown", () => {
  test("cleanup: TRUNCATE all rows in-process", async () => {
    const { sql } = await import("../lib/db.js");
    await sql`TRUNCATE TABLE activity RESTART IDENTITY CASCADE`;
    await sql`TRUNCATE TABLE tasks CASCADE`;
    await sql`TRUNCATE TABLE projects CASCADE`;
    await sql`TRUNCATE TABLE teams CASCADE`;
    await sql`TRUNCATE TABLE users CASCADE`;
    const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM users`;
    assertEq(count, 0, "users table empty after truncate");
  });
});

// ----- runner ----------------------------------------------------------------

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";

async function main() {
  console.log(`${BOLD}Running regression suite${RESET}`);
  console.log(`${DIM}API: ${API}  WEB: ${WEB}${RESET}\n`);

  let pass = 0;
  let fail = 0;
  const failures = [];
  let lastGroup = null;

  const started = Date.now();
  for (const t of tests) {
    if (t.group !== lastGroup) {
      console.log(`\n${BOLD}${t.group}${RESET}`);
      lastGroup = t.group;
    }
    try {
      await t.fn();
      console.log(`  ${GREEN}✓${RESET} ${t.name}`);
      pass++;
    } catch (err) {
      console.log(`  ${RED}✗${RESET} ${t.name}`);
      console.log(`    ${RED}${err.message}${RESET}`);
      failures.push({ group: t.group, name: t.name, err });
      fail++;
    }
  }
  const elapsed = ((Date.now() - started) / 1000).toFixed(2);

  console.log(`\n${BOLD}Result:${RESET} ${GREEN}${pass} passed${RESET}, ${
    fail > 0 ? RED + fail + " failed" + RESET : "0 failed"
  } in ${elapsed}s`);

  if (fail > 0) {
    console.log(`\n${BOLD}${RED}Failures:${RESET}`);
    for (const f of failures) {
      console.log(`  - [${f.group}] ${f.name}: ${f.err.message}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("regression runner crashed:", err);
  process.exit(2);
});
