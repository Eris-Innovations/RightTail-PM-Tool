/* eslint-disable no-console */
// One-shot user seeder.
//
// Two modes, picked automatically based on what is in .env:
//
//   1. Admin mode (preferred) - if SUPABASE_SERVICE_ROLE_KEY is set, use
//      supabase.auth.admin.createUser(). This:
//        * has NO rate limit
//        * always auto-confirms email (no Confirm Email click-through)
//        * works whether or not "Confirm email" is enabled in the dashboard
//      The service_role key is server/secret-only - get it from the
//      Supabase dashboard at:
//        Settings -> API -> "service_role" secret (NOT publishable).
//      Then add to .env:
//        SUPABASE_SERVICE_ROLE_KEY=eyJ...
//
//   2. Public mode (fallback) - if only the publishable key is available,
//      call supabase.auth.signUp() the same way the browser would. This
//      shares the public signup rate limit (~4/hr per IP) and respects
//      the project Confirm Email setting.
//
// Usage:
//   node scripts/seed-user.mjs <email> <password> [displayName]

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_URL =
  process.env.APP_URL ||
  "https://project-management-tool-omega-dusky.vercel.app";

if (!SUPABASE_URL || !PUBLISHABLE_KEY) {
  console.error(
    "[seed-user] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env"
  );
  process.exit(1);
}

const [, , email, password, ...nameParts] = process.argv;
if (!email || !password) {
  console.error("Usage: node scripts/seed-user.mjs <email> <password> [name]");
  process.exit(1);
}
const displayName = nameParts.join(" ") || email.split("@")[0];

async function ensureViaAdmin() {
  console.log("[seed-user] Mode: admin (service_role) - no rate limit, auto-confirmed.");
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // createUser returns { user, ... } on success. If the email exists it
  // returns a 422 error; in that case we update via admin.updateUserById.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: displayName, name: displayName },
  });

  if (!error) {
    console.log(`[seed-user] OK - created id=${data.user.id}, email_confirmed.`);
    return { id: data.user.id, created: true };
  }

  // Existing user - look it up and reset password / confirm email.
  const exists =
    /already.*registered/i.test(error.message) ||
    /already.*exists/i.test(error.message) ||
    error.status === 422;
  if (!exists) {
    console.error(`[seed-user] admin.createUser failed: ${error.message}`);
    process.exit(1);
  }

  console.log("[seed-user] User already exists - updating via admin.updateUserById ...");

  // listUsers paginates; we just need to find by email. The Admin API
  // supports a filter via the GoTrue HTTP endpoint, but the JS SDK only
  // exposes pagination - fine since we typically have few users.
  let foundId = null;
  let page = 1;
  while (!foundId) {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (listErr) {
      console.error(`[seed-user] admin.listUsers failed: ${listErr.message}`);
      process.exit(1);
    }
    foundId = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    if (!foundId && list.users.length < 200) break;
    page += 1;
  }
  if (!foundId) {
    console.error("[seed-user] Could not find existing user in admin.listUsers output.");
    process.exit(1);
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(foundId, {
    password,
    email_confirm: true,
    user_metadata: { full_name: displayName, name: displayName },
  });
  if (updateErr) {
    console.error(`[seed-user] admin.updateUserById failed: ${updateErr.message}`);
    process.exit(1);
  }
  console.log(`[seed-user] OK - updated id=${foundId}, password reset, email_confirmed.`);
  return { id: foundId, created: false };
}

async function ensureViaPublic() {
  console.log("[seed-user] Mode: public (publishable key) - subject to signup rate limit.");
  console.log("[seed-user] Tip: add SUPABASE_SERVICE_ROLE_KEY to .env to bypass the rate limit.");
  const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: displayName, name: displayName } },
  });

  if (!error) {
    if (data.session) {
      console.log("[seed-user] OK - user created and signed in immediately.");
      return data.session;
    }
    console.log(
      "[seed-user] User created, but no session returned. Likely either " +
        "(a) 'Confirm email' is still enabled in the Supabase dashboard, " +
        "or (b) the email already existed (signUp does not leak that)."
    );
    return null;
  }

  if (error.status === 429) {
    console.error("[seed-user] 429 Too Many Requests - public signup rate limit.");
    console.error("[seed-user] Add SUPABASE_SERVICE_ROLE_KEY to .env to use admin mode.");
    process.exit(1);
  }

  const alreadyExists =
    /already.*registered/i.test(error.message) ||
    /user.*already/i.test(error.message) ||
    error.status === 422;
  if (!alreadyExists) {
    console.error(`[seed-user] signUp failed: ${error.message}`);
    process.exit(1);
  }

  console.log("[seed-user] User exists - verifying password via signInWithPassword ...");
  const { data: signInData, error: signInErr } =
    await supabase.auth.signInWithPassword({ email, password });
  if (signInErr) {
    console.error(`[seed-user] Sign-in failed: ${signInErr.message}`);
    process.exit(1);
  }
  console.log("[seed-user] OK - existing account, password verified.");
  return signInData.session;
}

async function provisionAppRow(session) {
  if (!session?.access_token) return;
  const url = `${APP_URL.replace(/\/$/, "")}/api/auth/me`;
  console.log(`[seed-user] Provisioning app users row via ${url} ...`);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.status === 200) {
      const body = await res.json();
      console.log(
        `[seed-user] OK - app profile: id=${body.user?.id} name="${body.user?.name}" role=${body.user?.role}`
      );
    } else {
      const txt = await res.text();
      console.warn(`[seed-user] /api/auth/me returned ${res.status}: ${txt.slice(0, 200)}`);
      console.warn("[seed-user] The Supabase auth user is fine; app row will be auto-provisioned on first real login.");
    }
  } catch (err) {
    console.warn(`[seed-user] /api/auth/me unreachable: ${err.message}`);
  }
}

async function adminFollowupSignIn() {
  // After admin.createUser we do not get back a session, so sign in once
  // with the publishable key to grab a token for /api/auth/me.
  const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    console.warn(`[seed-user] Follow-up sign-in failed: ${error.message}`);
    return null;
  }
  return data.session;
}

(async () => {
  let session;
  if (SERVICE_ROLE_KEY) {
    await ensureViaAdmin();
    session = await adminFollowupSignIn();
  } else {
    session = await ensureViaPublic();
  }
  await provisionAppRow(session);
  console.log("");
  console.log("Done. You can now log in with:");
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}`);
  console.log(`  url:      ${APP_URL}/login`);
})().catch((err) => {
  console.error("[seed-user] Unexpected failure:", err);
  process.exit(1);
});