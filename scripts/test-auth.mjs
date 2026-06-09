// Authentication module test suite — Supabase Auth edition.
//
// Covers three layers:
//   A. Server contract — public/protected routing, deprecated 410 stubs.
//   B. Supabase JWT round-trip — sign up → JWT → /api/auth/me → enriched
//      profile, auto-provisioning into our users table, role assignment.
//   C. Behaviour — RBAC denies a member from admin actions; deactivated
//      users get 403; pre-existing users with a matching email get LINKED
//      instead of duplicated.
//
// The suite cleans up the rows it creates in our `users` table. It cannot
// delete rows from Supabase `auth.users` without the service_role key —
// each run leaves behind 1–2 auth users tagged `righttail.smoke.*@gmail.com`.
// That's intentional; deleting auth users via REST without the admin API
// isn't possible.
//
// Run with: npm run test:auth

import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { sql } from "../lib/db.js";
import { resolveAppUser } from "../lib/auth/resolveAppUser.js";

const SUPA_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const SUPA_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
// IMPORTANT: 127.0.0.1, not localhost. Node's undici fetch resolves
// `localhost` to IPv6 `::1` first on Windows; if anything along the
// loopback path doesn't speak IPv6 the request just hangs.
const API = process.env.AUTH_TEST_API_BASE ?? "http://127.0.0.1:3000";

if (!SUPA_URL || !SUPA_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  );
  process.exit(1);
}

// Cached credentials file. Supabase rate-limits signups to a handful per
// hour per project — caching means re-running the suite repeatedly (during
// development) doesn't keep burning fresh users.
const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_FILE = `${__dirname}/.auth-test-creds.json`;

async function loadCache() {
  if (!existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(await readFile(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function saveCache(cache) {
  await mkdir(dirname(CACHE_FILE), { recursive: true });
  await writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}

// ────────────────────────────────────────────────────────────────────────
//  Tiny test harness — no external deps, plays nice with the existing
//  regression/UAT runners that print the same style.
// ────────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function pad(s, n) {
  return (s + " ".repeat(n)).slice(0, n);
}

async function test(name, fn) {
  process.stdout.write(`  ${pad(name, 64)}`);
  try {
    await fn();
    console.log("PASS");
    passed++;
  } catch (err) {
    console.log("FAIL");
    failed++;
    failures.push({ name, err });
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(
      `${msg || "expected equal"} — actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`
    );
  }
}

function group(label) {
  console.log(`\n── ${label} ──`);
}

// ────────────────────────────────────────────────────────────────────────
//  HTTP helpers
// ────────────────────────────────────────────────────────────────────────
async function api(path, { token, method = "GET", body } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not json — keep null */
  }
  return { status: res.status, body: json, raw: text };
}

async function supaSignUp(email, password, meta = {}) {
  const res = await fetch(`${SUPA_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: SUPA_KEY, "content-type": "application/json" },
    body: JSON.stringify({ email, password, data: meta }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      `Supabase signup failed (${res.status}): ${body.msg || body.error_description || JSON.stringify(body)}`
    );
  }
  return body;
}

async function supaSignIn(email, password) {
  const res = await fetch(
    `${SUPA_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: SUPA_KEY, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }
  );
  const body = await res.json();
  if (!res.ok) {
    throw new Error(
      `Supabase sign-in failed (${res.status}): ${body.error_description || body.msg || JSON.stringify(body)}`
    );
  }
  return body;
}

// Trade a signup-or-signin body for an access token, transparently
// handling projects that require email confirmation.
async function tokenFromAuth(authBody, email, password) {
  if (authBody.access_token) return authBody.access_token;
  // No session means "Confirm email" is enabled. Fall back to password
  // sign-in — if the project autoconfirms, this will succeed; otherwise
  // it throws a clear message the developer can act on.
  const signedIn = await supaSignIn(email, password);
  return signedIn.access_token;
}

// ────────────────────────────────────────────────────────────────────────
//  Bookkeeping: track what we create so the suite can clean up.
// ────────────────────────────────────────────────────────────────────────
const provisionedUserIds = new Set(); // our users.id values
const preCreatedUserIds = new Set(); // ids we created directly via SQL
const supabaseAuthUserIds = new Set(); // auth.users uuids (can't delete, but
//                                       useful for the report)

async function cleanup() {
  const ids = [...provisionedUserIds, ...preCreatedUserIds];
  if (ids.length === 0) return;
  try {
    // Best-effort: clear referencing rows so the user DELETE doesn't trip
    // FK violations. We don't care about partial failures — the row
    // delete is the meaningful step.
    await sql`DELETE FROM activity WHERE actor_id = ANY(${ids})`;
    await sql`DELETE FROM users WHERE id = ANY(${ids})`;
  } catch (err) {
    console.warn(`(cleanup: ${err.message})`);
  }
}

/**
 * Resolve an access token for a "primary" test user. Strategy, in order:
 *
 *   1. AUTH_TEST_EMAIL / AUTH_TEST_PASSWORD env vars (suite's "secret
 *      override") — useful when the developer already signed up via the
 *      UI and wants to drive the suite with that account.
 *   2. Cached creds from a prior run (saved to scripts/.auth-test-creds.json).
 *   3. A fresh Supabase signup.
 *
 * The "member" cacheKey honours the env-var override; other keys (like
 * "linked") only consult the cache then fall through to signup.
 */
async function obtainOrCreateUser(cache, cacheKey, userMeta = {}) {
  if (cacheKey === "member") {
    const envEmail = process.env.AUTH_TEST_EMAIL;
    const envPass = process.env.AUTH_TEST_PASSWORD;
    if (envEmail && envPass) {
      const signIn = await supaSignIn(envEmail, envPass);
      return {
        email: envEmail,
        password: envPass,
        token: signIn.access_token,
        authUserId: signIn.user?.id,
        source: "env",
      };
    }
  }

  const cached = cache[cacheKey];
  if (cached) {
    try {
      const signIn = await supaSignIn(cached.email, cached.password);
      return {
        email: cached.email,
        password: cached.password,
        token: signIn.access_token,
        authUserId: signIn.user?.id ?? cached.authUserId,
        source: "cache",
      };
    } catch (err) {
      console.log(`  (cached creds for ${cacheKey} invalid: ${err.message})`);
    }
  }

  const email = `righttail.${cacheKey}.${Date.now()}@gmail.com`;
  const password = `Smoke-${cacheKey}-2026!`;
  const body = await supaSignUp(email, password, userMeta);
  const authUserId = body.user?.id ?? body.id;
  const token = await tokenFromAuth(body, email, password);
  cache[cacheKey] = { email, password, authUserId };
  await saveCache(cache);
  return { email, password, token, authUserId, source: "signup" };
}

// ────────────────────────────────────────────────────────────────────────
//  Suite
// ────────────────────────────────────────────────────────────────────────
console.log(`Auth suite → API=${API}, Supabase=${SUPA_URL}\n`);

try {
  // ════════════════════════════════════════════════════════════════════
  //  A. Server contract — no Supabase calls needed.
  // ════════════════════════════════════════════════════════════════════
  group("A. Server contract");

  await test("GET /api/health is public (200)", async () => {
    const r = await api("/api/health");
    assertEq(r.status, 200);
    assert(r.body?.ok === true, "health.ok should be true");
  });

  await test("GET /api/auth/me without token → 401", async () => {
    const r = await api("/api/auth/me");
    assertEq(r.status, 401);
  });

  await test("GET /api/projects without token → 401", async () => {
    const r = await api("/api/projects");
    assertEq(r.status, 401);
  });

  await test("GET /api/projects with bogus Bearer → 401", async () => {
    const r = await api("/api/projects", { token: "not-a-real-jwt" });
    assertEq(r.status, 401);
  });

  await test("GET /api/projects with malformed-but-shaped JWT → 401", async () => {
    const r = await api("/api/projects", {
      token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.bogussig",
    });
    assertEq(r.status, 401);
  });

  for (const [route, label] of [
    ["/api/auth/signup", "POST /api/auth/signup"],
    ["/api/auth/login", "POST /api/auth/login"],
    ["/api/auth/logout", "POST /api/auth/logout"],
    ["/api/auth/forgot-password", "POST /api/auth/forgot-password"],
    ["/api/auth/reset-password", "POST /api/auth/reset-password"],
  ]) {
    await test(`${label} → 410 Gone`, async () => {
      const r = await api(route, { method: "POST", body: {} });
      assertEq(r.status, 410);
      assert(r.body?.deprecated === true, "should be flagged deprecated");
    });
  }

  await test(
    "POST /api/auth/change-password (no auth) → 401 from auth gate",
    async () => {
      const r = await api("/api/auth/change-password", {
        method: "POST",
        body: {},
      });
      // It's mounted *after* requireAuth, so unauthed callers get 401
      // (not 410); 410 is what an authed caller would see.
      assertEq(r.status, 401);
    }
  );

  // ════════════════════════════════════════════════════════════════════
  //  B. Supabase JWT round-trip — sign up (or reuse) a user, then drive
  //     the enriched-profile path through /api/auth/me.
  // ════════════════════════════════════════════════════════════════════
  group("B. Supabase JWT round-trip");

  const cache = await loadCache();
  let memberCreds = null;
  let memberToken = null;
  let memberEmail = null;
  let memberPassword = null;
  let memberAuthUserId = null;
  let memberAppUserId = null;

  await test("Obtain Supabase access token (env / cached / signup)", async () => {
    memberCreds = await obtainOrCreateUser(cache, "member", {
      full_name: "Smoke Tester",
      name: "Smoke Tester",
    });
    memberToken = memberCreds.token;
    memberEmail = memberCreds.email;
    memberPassword = memberCreds.password;
    memberAuthUserId = memberCreds.authUserId;
    supabaseAuthUserIds.add(memberAuthUserId);
    assert(memberToken && memberToken.length > 50, "expected JWT");
  });

  // If we couldn't get a token (rate limit, email-confirm enforced, …)
  // every downstream test would cascade-fail with confusing errors.
  // Skip them with a single clear explanation instead.
  if (!memberToken) {
    console.log(
      "\n⏸  Skipping remaining Supabase tests — no access token available.\n" +
        "    Likely causes & remedies:\n" +
        "    • Supabase project hit its hourly signup/email rate limit:\n" +
        "        → wait ~1 hour and re-run, OR\n" +
        "        → disable 'Confirm email' in Supabase dashboard\n" +
        "          (Authentication → Sign In / Providers → Email) so the\n" +
        "          signup doesn't trigger an outbound email.\n" +
        "    • Run with known-good creds you already have:\n" +
        "        AUTH_TEST_EMAIL=you@example.com AUTH_TEST_PASSWORD=… npm run test:auth"
    );
  } else {

  await test("GET /api/auth/me with JWT → 200 + enriched user", async () => {
    const r = await api("/api/auth/me", { token: memberToken });
    assertEq(r.status, 200);
    const u = r.body?.user;
    assert(u, "missing user in response");
    assertEq(u.email, memberEmail);
    assert(/^USR-/.test(u.id), `expected USR-* id, got ${u.id}`);
    assertEq(u.role, "member");
    memberAppUserId = u.id;
    provisionedUserIds.add(memberAppUserId);
  });

  await test(
    "Auto-provisioned users row exists with auth_user_id link",
    async () => {
      const [row] = await sql`
        SELECT id, email, role, status, auth_user_id, name
        FROM users WHERE id = ${memberAppUserId}
      `;
      assert(row, "expected provisioned row");
      assertEq(row.email, memberEmail);
      assertEq(row.auth_user_id, memberAuthUserId);
      assertEq(row.status, "Active");
      assert(
        row.name === "Smoke Tester" || row.name === memberEmail.split("@")[0],
        `unexpected name "${row.name}"`
      );
    }
  );

  await test("GET /api/projects with JWT → 200", async () => {
    const r = await api("/api/projects", { token: memberToken });
    assertEq(r.status, 200);
  });

  await test("GET /api/tasks with JWT → 200", async () => {
    const r = await api("/api/tasks", { token: memberToken });
    assertEq(r.status, 200);
  });

  await test("GET /api/users with JWT → 200 (read allowed)", async () => {
    const r = await api("/api/users", { token: memberToken });
    assertEq(r.status, 200);
  });

  await test(
    "Re-signing-in returns a fresh JWT that maps to the SAME app user",
    async () => {
      const signIn = await supaSignIn(memberEmail, memberPassword);
      const t2 = signIn.access_token;
      assert(t2 && t2 !== memberToken, "expected a fresh access token");
      const r = await api("/api/auth/me", { token: t2 });
      assertEq(r.status, 200);
      assertEq(r.body?.user?.id, memberAppUserId);
    }
  );

  // ════════════════════════════════════════════════════════════════════
  //  C. Behaviour: RBAC, deactivation, email linking.
  // ════════════════════════════════════════════════════════════════════
  group("C. Behaviour: RBAC, deactivation, email linking");

  await test(
    "member cannot POST /api/projects (admin/manager-only) → 403",
    async () => {
      const r = await api("/api/projects", {
        token: memberToken,
        method: "POST",
        body: {
          name: "Auth Test Project",
          status: "Active",
          priority: "Medium",
          owner_id: memberAppUserId,
        },
      });
      assertEq(r.status, 403);
    }
  );

  await test(
    "member cannot POST /api/users (admin-only) → 403",
    async () => {
      const r = await api("/api/users", {
        token: memberToken,
        method: "POST",
        body: { name: "x", email: `x.${Date.now()}@example.com`, role: "member" },
      });
      assertEq(r.status, 403);
    }
  );

  await test(
    "Deactivating the member makes their JWT yield 403 (not 401)",
    async () => {
      await sql`UPDATE users SET status = 'Inactive' WHERE id = ${memberAppUserId}`;
      try {
        const r = await api("/api/auth/me", { token: memberToken });
        assertEq(r.status, 403);
        assert(
          /deactivat/i.test(r.body?.error || ""),
          "expected 'deactivated' in error message"
        );
      } finally {
        // Restore so later tests work even if this one is debugged in
        // isolation.
        await sql`UPDATE users SET status = 'Active' WHERE id = ${memberAppUserId}`;
      }
    }
  );

  await test(
    "Pre-existing users row with matching email gets LINKED (not duplicated) on first JWT",
    async () => {
      // Use a cached "linked" Supabase user so re-runs don't burn the
      // signup rate limit. Each run pre-creates a fresh users row with
      // that cached email; the middleware should locate it via the
      // email branch and stamp auth_user_id onto it.
      const linkedCreds = await obtainOrCreateUser(cache, "linked", {
        full_name: "Different Name From Auth",
      });
      supabaseAuthUserIds.add(linkedCreds.authUserId);

      const seededEmail = linkedCreds.email;
      const seededName = "Linked Tester";
      const preId = `USR-LINK-${Date.now().toString(36)}`;

      // If a previous (incomplete) run left a row behind, clear it first
      // so the INSERT below can succeed and the test starts from a known
      // state.
      await sql`DELETE FROM users WHERE email = ${seededEmail}`;
      await sql`
        INSERT INTO users (id, name, email, role, status)
        VALUES (${preId}, ${seededName}, ${seededEmail}, 'manager', 'Active')
      `;
      preCreatedUserIds.add(preId);

      const r = await api("/api/auth/me", { token: linkedCreds.token });
      assertEq(r.status, 200);
      assertEq(r.body?.user?.id, preId);
      assertEq(r.body?.user?.role, "manager");
      assertEq(r.body?.user?.email, seededEmail);

      const [row] = await sql`
        SELECT id, auth_user_id, name
        FROM users WHERE email = ${seededEmail}
      `;
      assert(row, "row should still exist");
      assertEq(row.id, preId);
      assert(row.auth_user_id, "auth_user_id should be set after linking");
      assertEq(row.auth_user_id, linkedCreds.authUserId);
      // Pre-existing name should be preserved, not overwritten with the
      // Supabase metadata name.
      assertEq(row.name, seededName);

      // Make sure nothing duplicate was inserted.
      const [{ count }] = await sql`
        SELECT COUNT(*)::int AS count FROM users WHERE email = ${seededEmail}
      `;
      assertEq(count, 1);
    }
  );

  await test(
    "Password-reset email request succeeds via Supabase",
    async () => {
      const res = await fetch(`${SUPA_URL}/auth/v1/recover`, {
        method: "POST",
        headers: { apikey: SUPA_KEY, "content-type": "application/json" },
        body: JSON.stringify({ email: memberEmail }),
      });
      // Supabase responds 200 unconditionally to prevent email enumeration.
      // 429 is also acceptable here — it proves the endpoint is reachable
      // and our test just happens to be the one that tipped the bucket.
      assert(
        res.status === 200 || res.status === 429,
        `expected 200 or 429, got ${res.status}`
      );
    }
  );

  } // end of `if (memberToken) { ... }`

  // ════════════════════════════════════════════════════════════════════
  //  D. Middleware data layer — call resolveAppUser() directly with fake
  //     Supabase auth users. No HTTP, no Supabase calls. These tests
  //     pin down the auto-provisioning / linking / role-assignment
  //     contract independent of any external service.
  // ════════════════════════════════════════════════════════════════════
  group("D. Middleware data layer (resolveAppUser, no Supabase calls)");

  // Synthetic auth users we create here. We'll clean up the users rows
  // (by id) and the email rows just to be safe.
  const synthAuthIds = [];
  const synthEmails = [];
  async function dCleanup() {
    if (synthAuthIds.length) {
      try {
        await sql`
          DELETE FROM activity
          WHERE entity_type = 'auth'
            AND entity_id IN (
              SELECT id FROM users WHERE auth_user_id = ANY(${synthAuthIds})
            )
        `;
      } catch {
        /* table-column drift — ignore */
      }
      try {
        await sql`DELETE FROM users WHERE auth_user_id = ANY(${synthAuthIds})`;
      } catch {
        /* ignore */
      }
    }
    if (synthEmails.length) {
      try {
        await sql`DELETE FROM users WHERE email = ANY(${synthEmails})`;
      } catch {
        /* ignore */
      }
    }
  }

  function fakeAuthUser({ email, name, avatar } = {}) {
    const id = randomUUID();
    const userEmail = email ?? `righttail.fake.${id.slice(0, 8)}@gmail.com`;
    synthAuthIds.push(id);
    synthEmails.push(userEmail);
    return {
      id,
      email: userEmail,
      user_metadata: { full_name: name, name, avatar_url: avatar },
    };
  }

  try {
    await test(
      "D1. New auth user is auto-provisioned with role=member",
      async () => {
        const authUser = fakeAuthUser({ name: "Auto Provision" });
        const row = await resolveAppUser(authUser);
        assert(row, "expected a row");
        assert(/^USR-/.test(row.id), `expected USR- id, got ${row.id}`);
        assertEq(row.email, authUser.email);
        assertEq(row.role, "member"); // not admin: seed users already exist
        assertEq(row.status, "Active");
        assertEq(row.auth_user_id, authUser.id);
        assertEq(row.name, "Auto Provision");
      }
    );

    await test(
      "D2. Calling resolveAppUser twice for the same auth user is idempotent",
      async () => {
        const authUser = fakeAuthUser({ name: "Idempotent" });
        const a = await resolveAppUser(authUser);
        const b = await resolveAppUser(authUser);
        assertEq(a.id, b.id);
        const [{ count }] = await sql`
          SELECT COUNT(*)::int AS count
          FROM users WHERE auth_user_id = ${authUser.id}
        `;
        assertEq(count, 1);
      }
    );

    await test(
      "D3. Pre-existing users row matched by EMAIL is linked, not duplicated",
      async () => {
        const sharedEmail = `righttail.linkable.${randomUUID().slice(0, 8)}@gmail.com`;
        synthEmails.push(sharedEmail);
        const preId = `USR-PRE-${Date.now().toString(36)}`;
        await sql`
          INSERT INTO users (id, name, email, role, status)
          VALUES (${preId}, 'Pre-existing Manager', ${sharedEmail}, 'manager', 'Active')
        `;

        const authUser = fakeAuthUser({
          email: sharedEmail,
          name: "OAuth Display Name",
        });
        const row = await resolveAppUser(authUser);

        assertEq(row.id, preId, "should return the pre-existing row id");
        assertEq(row.role, "manager", "role should be preserved");
        assertEq(row.auth_user_id, authUser.id, "auth_user_id should be linked");
        // Pre-existing display name should win over OAuth metadata name.
        assertEq(row.name, "Pre-existing Manager");

        const [{ count }] = await sql`
          SELECT COUNT(*)::int AS count
          FROM users WHERE email = ${sharedEmail}
        `;
        assertEq(count, 1, "no duplicate row should have been created");
      }
    );

    await test(
      "D4. Email matching is case-insensitive (Supabase normalises to lowercase)",
      async () => {
        const lower = `righttail.case.${randomUUID().slice(0, 8)}@gmail.com`;
        synthEmails.push(lower);
        const preId = `USR-CASE-${Date.now().toString(36)}`;
        await sql`
          INSERT INTO users (id, name, email, role, status)
          VALUES (${preId}, 'Case Test', ${lower}, 'member', 'Active')
        `;

        // Auth user shows up with an UPPERCASED email — our middleware
        // lowercases before SELECT, so the link must still happen.
        const authUser = fakeAuthUser({
          email: lower.toUpperCase(),
          name: "Case Test",
        });
        const row = await resolveAppUser(authUser);
        assertEq(row.id, preId);
      }
    );

    await test(
      "D5. Provisioning logs a signup entry in the activity table",
      async () => {
        const authUser = fakeAuthUser({ name: "Activity Subject" });
        const row = await resolveAppUser(authUser);
        const [entry] = await sql`
          SELECT message, action, entity_type, actor_id
          FROM activity
          WHERE actor_id = ${row.id} AND action = 'signup'
          ORDER BY created_at DESC LIMIT 1
        `;
        assert(entry, "expected an activity row for the signup");
        assertEq(entry.action, "signup");
        assertEq(entry.entity_type, "auth");
        assert(
          /signed up/i.test(entry.message),
          `unexpected message: ${entry.message}`
        );
      }
    );

    await test(
      "D6. resolveAppUser falls back to email-prefix when no metadata name",
      async () => {
        const authUser = {
          id: randomUUID(),
          email: `righttail.noname.${randomUUID().slice(0, 8)}@gmail.com`,
          user_metadata: {}, // no full_name, no name
        };
        synthAuthIds.push(authUser.id);
        synthEmails.push(authUser.email);
        const row = await resolveAppUser(authUser);
        assertEq(row.name, authUser.email.split("@")[0]);
      }
    );
  } finally {
    await dCleanup();
  }
} catch (err) {
  // Catastrophic failure outside a test() block (most commonly: signup
  // rate-limited or "Confirm email" enforced and no auto-confirm).
  console.error("\nFATAL:", err.message);
  failed++;
  failures.push({ name: "<bootstrap>", err });
} finally {
  await cleanup();
  if (supabaseAuthUserIds.size > 0) {
    console.log(
      `\nNote: ${supabaseAuthUserIds.size} auth.users row(s) cannot be removed without the service_role key:`
    );
    for (const id of supabaseAuthUserIds) console.log(`  - ${id}`);
  }
  console.log(`\nTotal: ${passed} passed, ${failed} failed.`);
  for (const f of failures) {
    console.log(`\n✖ ${f.name}`);
    console.log(`  ${f.err.stack || f.err.message}`);
  }
  process.exit(failed === 0 ? 0 : 1);
}
