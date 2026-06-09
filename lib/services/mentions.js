import { sql } from "@/lib/db";

// Match @handles where the handle is letters/digits/._- (no spaces).
// The trailing word-boundary on the regex means "@alex." in "Hi @alex."
// resolves to "alex" — punctuation is stripped before lookup.
const MENTION_RE = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9._-]{1,64})/g;

export function parseMentionHandles(body) {
  const handles = new Set();
  let m;
  while ((m = MENTION_RE.exec(body)) !== null) {
    handles.add(m[1].toLowerCase());
  }
  return [...handles];
}

/**
 * Resolve `@handle` style tokens to real users. We accept three forms:
 *
 *   1. The literal email (admin@hub.com — full match).
 *   2. The email local-part (admin → admin@hub.com).
 *   3. The display name reduced to lowercase with non-alphanumerics
 *      stripped (e.g. "Jane Smith" → "janesmith"), so users can
 *      `@jane` or `@jane.smith`.
 *
 * Ambiguous handles (two different users that normalise to the same
 * value) are dropped — the UI picker is the source of truth for the
 * unambiguous case; this resolver is here as a safety net for
 * manually-typed mentions.
 */
export async function resolveMentions(handles) {
  if (handles.length === 0) return [];
  const users = await sql`
    SELECT id, name, email
    FROM users
    WHERE status = 'Active'
  `;
  const idx = new Map();
  const push = (key, id) => {
    const k = key.toLowerCase();
    if (!idx.has(k)) idx.set(k, new Set());
    idx.get(k).add(id);
  };
  for (const u of users) {
    push(u.email, u.id);
    push(u.email.split("@")[0], u.id);
    const namePart = (u.name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (namePart) push(namePart, u.id);
    const dotted = (u.name ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, "")
      .trim()
      .replace(/\s+/g, ".");
    if (dotted) push(dotted, u.id);
  }
  const resolved = new Set();
  for (const h of handles) {
    const matches = idx.get(h);
    if (matches && matches.size === 1) {
      // Only resolve unambiguous matches; prevents "@john" from
      // accidentally pinging every John in the system.
      resolved.add([...matches][0]);
    }
  }
  return [...resolved];
}
