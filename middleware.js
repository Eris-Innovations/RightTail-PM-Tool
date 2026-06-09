// Next.js Edge middleware — runs on every request that matches the
// `config.matcher` pattern below. Its only job is to call into
// `updateSession()`, which refreshes the Supabase session cookie if
// the access token has expired (Supabase issues short-lived 1h JWTs).
//
// We DO NOT do route protection here — protection lives inside the
// (app) route-group layout where it's easier to render a SplashScreen
// while the session resolves. Doing 302 redirects from middleware
// causes a brief flash of the auth page during navigation in some
// browsers and complicates Server Component fetches.

import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Run on everything except static assets and Next's internals.
    // Skip /_next/static, /_next/image, favicon, png/svg icons, and
    // anything with a file extension that isn't .html/.json (those
    // come from route handlers and DO need a refreshed session).
    "/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|brand-icon\\.png|.*\\.(?:png|jpg|jpeg|svg|webp|ico|gif)$).*)",
  ],
};
