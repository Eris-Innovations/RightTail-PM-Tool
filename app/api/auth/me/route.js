import { requireUser } from "@/lib/auth/requireUser";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const auth = await requireUser(request);
  if (auth instanceof Response) return auth;
  return Response.json({ user: auth.user });
}
