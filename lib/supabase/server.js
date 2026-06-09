// Server-side Supabase client.
//
// Used inside Server Components, Route Handlers, and Server Actions to
// resolve the current user's session from the request cookies. The
// @supabase/ssr `createServerClient` factory takes a small adapter so it
// can read (and, on token refresh, write) the same cookies the browser
// client manages.
//
// This client is read-only by default (no service_role privileges) — it
// just verifies the JWT it finds in the cookies against Supabase's JWKS
// and exposes the auth.users row via `supabase.auth.getUser()`.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  // Surface this loudly during build / first request — server-side
  // routes have no graceful fallback the way the browser AuthProvider
  // does.
  // eslint-disable-next-line no-console
  console.error(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
      "are required for the server-side Supabase client."
  );
}

/**
 * Build a Supabase client bound to the current request's cookie jar.
 * Call this inside an async server context (route handler, server
 * component) — `cookies()` is itself async/dynamic and must run inside
 * a request scope.
 *
 * In a Route Handler, mutating cookies via `cookies().set(...)` is
 * allowed. In a Server Component it's a no-op (Next.js will throw if
 * you try) — our adapter swallows the throw so a Server Component can
 * still call `supabase.auth.getUser()` without crashing.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    url ?? "https://example.supabase.co",
    key ?? "placeholder-key",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — cookie mutations are
            // not allowed there. The middleware refreshes the session
            // anyway, so this is safe to ignore.
          }
        },
      },
    }
  );
}
