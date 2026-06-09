// POST /api/users/:id/reset-password
//
// Admin-triggered password reset. Hands off to Supabase Auth's own
// resetPasswordForEmail flow — Supabase mails the user a one-time link
// that lets them set a new password. We don't issue or store the
// token ourselves anymore (Supabase does, in its `auth.flow_state`
// table).

import { sql } from "@/lib/db";
import { requireRole } from "@/lib/auth/requireUser";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export async function POST(request, { params }) {
  const auth = await requireRole(request, "admin");
  if (auth instanceof Response) return auth;
  const { id: idParam } = await params;
  const id = String(idParam);

  try {
    const [target] = await sql`
      SELECT id, name, email FROM users WHERE id = ${id}
    `;
    if (!target) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return Response.json(
        { error: "Supabase Auth is not configured on this deployment." },
        { status: 503 }
      );
    }

    // Anon-key client is sufficient — resetPasswordForEmail is part of
    // the public auth surface (it can't reveal whether the email is
    // registered).
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.auth.resetPasswordForEmail(target.email);
    if (error) {
      return Response.json({ error: error.message }, { status: 502 });
    }

    await logActivity({
      icon: "key",
      tone: "primary",
      message: `Password reset email sent to ${target.name}`,
      actor_id: auth.user.id,
      action: "admin_password_reset",
      entity_type: ENTITY_TYPES.USER,
      entity_id: id,
    });

    return Response.json({
      ok: true,
      user: { id: target.id, name: target.name, email: target.email },
      message: "Password reset email sent via Supabase Auth.",
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("admin reset password error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
