import { sql } from "@/lib/db";
import { generateUserId } from "@/lib/utils/ids";
import { logActivity, ENTITY_TYPES } from "@/lib/services/activityLog";

/**
 * Resolve (or lazily provision) the application's `users` row for a
 * verified Supabase auth user. The provisioning step is what lets
 * brand-new OAuth sign-ups land directly in the dashboard without an
 * explicit "create user" call — the first time we see a JWT we mint a
 * USR-NNN row tied to it.
 *
 * Role assignment mirrors the old custom-auth behaviour: the very first
 * user in the system becomes `admin`; subsequent signups are `member`.
 */
export async function resolveAppUser(authUser) {
  // 1. Look up by the link column first — fastest path for returning users.
  let [user] = await sql`
    SELECT id, name, email, role, status, department, phone, avatar_url,
           auth_user_id
    FROM users WHERE auth_user_id = ${authUser.id}
  `;
  if (user) return user;

  // 2. Maybe we have a pre-existing user with the same email (e.g. a
  //    seeded demo account). Link the existing row instead of creating
  //    a duplicate.
  if (authUser.email) {
    const [byEmail] = await sql`
      SELECT id, name, email, role, status, department, phone, avatar_url,
             auth_user_id
      FROM users WHERE email = ${authUser.email.toLowerCase()}
    `;
    if (byEmail) {
      await sql`
        UPDATE users SET auth_user_id = ${authUser.id}, updated_at = NOW()
        WHERE id = ${byEmail.id}
      `;
      return { ...byEmail, auth_user_id: authUser.id };
    }
  }

  // 3. First time we've ever seen this Supabase user — provision a row.
  //    First overall user becomes admin; everyone after that is a member.
  const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM users`;
  const role = count === 0 ? "admin" : "member";
  const id = generateUserId();
  const email = (authUser.email ?? "").toLowerCase();
  const name =
    authUser.user_metadata?.full_name ||
    authUser.user_metadata?.name ||
    email.split("@")[0] ||
    "New User";
  const avatar = authUser.user_metadata?.avatar_url ?? null;

  const [created] = await sql`
    INSERT INTO users
      (id, name, email, role, status, avatar_url, auth_user_id, last_login_at)
    VALUES
      (${id}, ${name}, ${email}, ${role}, 'Active', ${avatar},
       ${authUser.id}, NOW())
    RETURNING id, name, email, role, status, department, phone, avatar_url,
              auth_user_id
  `;

  await logActivity({
    icon: "user-plus",
    tone: "success",
    message: `${name} signed up (${role})`,
    actor_id: id,
    action: "signup",
    entity_type: ENTITY_TYPES.AUTH,
    entity_id: id,
  });

  return created;
}
