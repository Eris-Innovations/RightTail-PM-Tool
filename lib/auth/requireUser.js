// Server-side auth helpers used by every protected route handler.
//
//   requireUser()  — verifies the request's Supabase session (cookie OR
//                    Authorization: Bearer JWT), lazily provisions our
//                    `users` row, returns { user, authUser } or a 401/403
//                    Response if anything is off.
//   requireRole()  — wraps requireUser and enforces RBAC by role name.
//
// Cookies are the primary channel for browser sessions (set by
// @supabase/ssr on signIn and sent automatically by the browser).
// Bearer tokens are accepted as a fallback so /scripts/test-auth.mjs
// and other programmatic callers keep working without a cookie jar.
//
// Each helper returns EITHER { user, authUser } on success OR a
// Response on failure. Callers should
//   if (result instanceof Response) return result;
// at the top of their handler so 401/403 short-circuit cleanly.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAppUser } from "@/lib/auth/resolveAppUser";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function extractBearer(request) {
  const auth =
    request.headers.get("authorization") || request.headers.get("Authorization");
  if (!auth) return null;
  const m = /^bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : null;
}

/**
 * Verify the caller's Supabase session and return the enriched app
 * user. Returns a 401/403 Response on failure — handlers should pass
 * it straight back to the client.
 */
export async function requireUser(request) {
  let authUser = null;

  // 1. Prefer cookie session (the @supabase/ssr browser client writes
  //    these on signIn and the browser sends them automatically).
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data?.user) authUser = data.user;

  // 2. Fall back to Bearer token for programmatic callers (scripts,
  //    cross-origin tools). Uses a freshly built client because the SSR
  //    client doesn't have a getUser(token) overload.
  if (!authUser && request) {
    const token = extractBearer(request);
    if (token && SUPABASE_URL && SUPABASE_KEY) {
      const bare = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: bd } = await bare.auth.getUser(token);
      if (bd?.user) authUser = bd.user;
    }
  }

  if (!authUser) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  let appUser;
  try {
    appUser = await resolveAppUser(authUser);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("auth provisioning error:", err);
    return Response.json(
      { error: "Failed to resolve user" },
      { status: 500 }
    );
  }

  if (appUser.status && appUser.status !== "Active") {
    return Response.json(
      { error: "Account is deactivated." },
      { status: 403 }
    );
  }

  return {
    authUser,
    user: {
      id: appUser.id,
      role: appUser.role,
      email: appUser.email,
      name: appUser.name,
    },
  };
}

/**
 * Convenience: like requireUser() but also returns a 403 unless the
 * caller's role is in the `allowedRoles` list.
 *
 *   const auth = await requireRole(request, "admin", "manager");
 *   if (auth instanceof Response) return auth;
 *   const { user } = auth;
 */
export async function requireRole(request, ...allowedRoles) {
  const result = await requireUser(request);
  if (result instanceof Response) return result;
  if (!allowedRoles.includes(result.user.role)) {
    return Response.json(
      {
        error: `Forbidden — requires role: ${allowedRoles.join(" or ")}.`,
      },
      { status: 403 }
    );
  }
  return result;
}
