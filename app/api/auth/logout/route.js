const NOTICE =
  "Authentication moved to Supabase Auth. The frontend uses " +
  "@supabase/supabase-js to handle this directly with the Supabase " +
  "project; no server endpoint exists for it anymore.";

export async function POST() {
  return Response.json({ error: NOTICE, deprecated: true }, { status: 410 });
}
