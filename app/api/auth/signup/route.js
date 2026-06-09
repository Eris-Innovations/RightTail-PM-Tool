// POST /api/auth/signup
//
// Authentication is handled by Supabase Auth. Login, password-reset,
// and password-change happen directly between the browser and Supabase
// via @supabase/supabase-js — our server isn't in those flows.
//
// The ONE exception is signup. We deliberately route signup through our
// own endpoint (which uses the Supabase Admin API with the service_role
// key) so we can:
//
//   * Bypass the public /auth/v1/signup rate limit (~4/hr per IP on
//     free tier). The Admin API has no rate limit.
//   * Auto-confirm the email regardless of the project's "Confirm email"
//     setting, so the user can sign in immediately — no inbox round-
//     trip, no misconfigured Site URL pointing at localhost:3000.
//   * Enforce our own per-IP rate limit, so swapping out Supabase's
//     protection doesn't open us up to signup spam.

import { supabaseAdmin, hasSupabaseAdmin } from "@/lib/supabase/admin";

// Per-IP sliding-window rate limit. Each Vercel cold start gets a fresh
// map, so the protection is "per instance, per warm period" rather
// than truly global — enough to stop the simplest scripted abuse
// without pulling in Redis/Vercel KV for what is currently a tiny app.
const SIGNUP_WINDOW_MS = 15 * 60 * 1000;
const SIGNUP_MAX_PER_IP = 10;
const signupBuckets = new Map();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function callerIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function rateLimit(ip) {
  const now = Date.now();
  const cutoff = now - SIGNUP_WINDOW_MS;
  const timestamps = (signupBuckets.get(ip) || []).filter((t) => t > cutoff);
  if (timestamps.length >= SIGNUP_MAX_PER_IP) {
    const oldest = timestamps[0];
    const retryAfterSec = Math.max(
      1,
      Math.ceil((oldest + SIGNUP_WINDOW_MS - now) / 1000)
    );
    return { ok: false, retryAfterSec };
  }
  timestamps.push(now);
  signupBuckets.set(ip, timestamps);
  return { ok: true };
}

export async function POST(request) {
  const ip = callerIp(request);
  const rl = rateLimit(ip);
  if (!rl.ok) {
    return Response.json(
      {
        error: `Too many signup attempts. Try again in ~${Math.ceil(rl.retryAfterSec / 60)} min.`,
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { email, password, name } = body || {};

  // Validate inputs first so typos surface as a clear 400 even when
  // server signup happens to be misconfigured.
  if (!email || typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return Response.json({ error: "Valid email is required." }, { status: 400 });
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    return Response.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }
  if (name !== undefined && typeof name !== "string") {
    return Response.json({ error: "Name must be a string." }, { status: 400 });
  }

  if (!hasSupabaseAdmin) {
    return Response.json(
      {
        error:
          "Server signup is not configured. Add SUPABASE_SERVICE_ROLE_KEY " +
          "to the server environment (Vercel: Project Settings → " +
          "Environment Variables, Production scope) and redeploy.",
      },
      { status: 503 }
    );
  }

  const normalizedEmail = email.trim().toLowerCase();
  const displayName = (name || "").trim() || normalizedEmail.split("@")[0];

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName, name: displayName },
    });

    if (error) {
      const exists =
        /already.*registered/i.test(error.message) ||
        /already.*exists/i.test(error.message) ||
        error.status === 422;
      if (exists) {
        return Response.json(
          { error: "Email already registered." },
          { status: 409 }
        );
      }
      // 401 / "Invalid API key" = the SUPABASE_SERVICE_ROLE_KEY env var
      // is set but wrong. Surface as 503 (server misconfigured).
      if (
        error.status === 401 ||
        /invalid api key/i.test(error.message) ||
        /jwt|jwk/i.test(error.message)
      ) {
        // eslint-disable-next-line no-console
        console.error(
          "[signup] admin.createUser rejected the service-role key:",
          error
        );
        return Response.json(
          {
            error:
              "Server signup is misconfigured: Supabase rejected the " +
              "SUPABASE_SERVICE_ROLE_KEY. Verify the value matches the " +
              "'service_role' key on the Supabase dashboard (Settings → " +
              "API), with no leading/trailing whitespace, then redeploy.",
          },
          { status: 503 }
        );
      }
      // Surface password-policy / weak-password errors verbatim.
      if (
        /password/i.test(error.message) &&
        (error.status === 400 || error.status === 422)
      ) {
        return Response.json({ error: error.message }, { status: 400 });
      }
      // eslint-disable-next-line no-console
      console.error("[signup] admin.createUser failed:", error);
      return Response.json(
        { error: error.message || "Signup failed." },
        { status: 500 }
      );
    }

    return Response.json(
      { ok: true, user: { id: data.user.id, email: data.user.email } },
      { status: 201 }
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[signup] unexpected:", err);
    return Response.json({ error: "Signup failed." }, { status: 500 });
  }
}
