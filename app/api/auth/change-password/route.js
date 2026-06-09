const NOTICE =
  "Password changes moved to Supabase Auth. Use " +
  "supabase.auth.updateUser({ password }) on the client instead.";

export async function POST() {
  return Response.json({ error: NOTICE, deprecated: true }, { status: 410 });
}
