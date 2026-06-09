// Edge middleware helper for keeping the Supabase session fresh.
//
// Called from /middleware.js on every request. The canonical
// @supabase/ssr pattern: re-create the client, call getUser(), and let
// the cookie adapter write the refreshed access/refresh tokens back to
// the response. Without this, server components would read stale
// cookies whenever the access token expires (every hour).
//
// The function returns the NextResponse it constructed so the caller
// can pass it through unchanged (it already carries the refreshed
// cookies).

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export async function updateSession(request) {
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // If env is missing we can't refresh anything — just pass through.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Mirror cookies onto BOTH the incoming request (so any
        // downstream code that re-reads sees the fresh values) and the
        // outgoing response (so the browser stores them).
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Important: getUser() (not getSession()) — getUser() actually
  // verifies the token with Supabase's JWKS endpoint, while getSession
  // just decodes it locally. We want the verified branch in middleware
  // so a forged/expired cookie doesn't survive the round-trip.
  try {
    await supabase.auth.getUser();
  } catch {
    // Network blip or invalid cookie — swallow; the next request retries.
  }

  return response;
}
