// Browser-side Supabase client.
//
// Built with `createBrowserClient` from @supabase/ssr — the SSR-aware
// drop-in for the vanilla `createClient`. The difference: this client
// reads + writes session cookies (rather than localStorage), which
// keeps the browser and the Next.js server in agreement about who's
// signed in. Server components and route handlers can then read the
// same session via `lib/supabase/server.js` without a round-trip.
//
// The publishable key is intentionally safe to ship to the browser; all
// privileged DB operations stay behind the Next.js route handlers which
// use the connection string.

"use client";

import { createBrowserClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * `true` when both env vars are present and look at least vaguely like a
 * Supabase project URL + key. Used by the AuthProvider to short-circuit
 * auth entirely (so the rest of the app still renders, e.g. the login
 * screen can surface a clear "needs Supabase config" message instead of
 * a splash that hangs forever).
 */
export const supabaseConfigured = Boolean(
  url && key && /^https?:\/\//.test(url)
);

if (typeof window !== "undefined" && !supabaseConfigured) {
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY " +
      "missing or malformed — auth is disabled until those env vars are set."
  );
}

// We always construct a client (with placeholders if needed) so import
// sites can `import { supabase } from "@/lib/supabase/client"` without
// a null check. Calls into it will fail at request time when config is
// missing, which AuthProvider guards against.
export const supabase = createBrowserClient(
  supabaseConfigured ? url : "https://example.supabase.co",
  supabaseConfigured ? key : "placeholder-key"
);
