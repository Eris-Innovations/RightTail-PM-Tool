import { sql } from "@/lib/db";

// Light-weight liveness probe. Returns the database's NOW() so we
// know the connection is up too, not just the function.

// Don't let Next prerender this at build time — NOW() must run per
// request, and on Vercel build-time SELECTs would fail without
// DATABASE_URL configured as a Build env var.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await sql`SELECT NOW() as now`;
    return Response.json({ ok: true, now: rows[0].now });
  } catch (err) {
    return Response.json(
      { ok: false, error: err.message },
      { status: 500 }
    );
  }
}
