// Server-only Supabase admin client.
//
// Bound to the SUPABASE_SERVICE_ROLE_KEY — bypasses RLS and the public
// auth rate limits. Used by /api/auth/signup (admin createUser) and by
// the admin password-reset route. NEVER import this client into a
// component, page, or anywhere that could end up in the browser bundle.
//
// `null` when SUPABASE_SERVICE_ROLE_KEY isn't set — callers fall back
// gracefully (e.g. /api/auth/signup returns 503 instead of crashing).

import "server-only";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseAdmin =
  url && serviceRoleKey
    ? createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const hasSupabaseAdmin = Boolean(supabaseAdmin);

if (!hasSupabaseAdmin) {
  // Loud-ish warning so this is visible in Vercel function logs /
  // dev console without being fatal. Only surfaces when something
  // actually tries to hit an admin-only route.
  // eslint-disable-next-line no-console
  console.warn(
    "[supabase] SUPABASE_SERVICE_ROLE_KEY not set — admin operations " +
      "(server-side signup, force-confirm, password reset by admin) will " +
      "return 503 until you add the secret."
  );
}
