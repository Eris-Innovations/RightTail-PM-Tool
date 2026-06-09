export const USER_ROLES = ["admin", "manager", "member"];
export const USER_STATUSES = ["Active", "Inactive"];
const EMAIL_VALIDATION_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Loosely-permissive phone matcher — international formats vary wildly.
// Accept digits, spaces, dashes, parens, dots, and a leading "+", 6+ chars.
const PHONE_RE = /^[+]?[\d\s().-]{6,32}$/;

// Shared column list — every user list/detail query returns the same
// shape so the UI doesn't have to special-case different endpoints.
export const USER_PUBLIC_COLUMNS = `
  u.id,
  u.name,
  u.email,
  u.role,
  u.status,
  u.department,
  u.phone,
  u.avatar_url,
  u.created_at,
  u.updated_at,
  u.last_login_at,
  (SELECT COUNT(*)::int FROM projects p WHERE p.owner_id = u.id)         AS projects_owned,
  (SELECT COUNT(*)::int FROM tasks t WHERE t.assignee_id = u.id)         AS tasks_assigned,
  (SELECT COUNT(*)::int FROM tasks t WHERE t.assignee_id = u.id
                                      AND t.status = 'Done')             AS tasks_done
`;

export function validateUserPayload(body, { partial = false } = {}) {
  const errors = [];
  const values = {};

  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (name.length < 2) errors.push("Name must be at least 2 characters.");
    else values.name = name;
  }
  if (!partial || body.email !== undefined) {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!EMAIL_VALIDATION_RE.test(email)) errors.push("Enter a valid email address.");
    else values.email = email;
  }
  if (!partial || body.role !== undefined) {
    const role = String(body.role ?? "member");
    if (!USER_ROLES.includes(role)) errors.push(`Role must be one of: ${USER_ROLES.join(", ")}.`);
    else values.role = role;
  }
  if (!partial || body.status !== undefined) {
    const status = String(body.status ?? "Active");
    if (!USER_STATUSES.includes(status)) {
      errors.push(`Status must be one of: ${USER_STATUSES.join(", ")}.`);
    } else {
      values.status = status;
    }
  }
  if (body.department !== undefined) {
    const dept = body.department === null ? null : String(body.department).trim();
    if (dept !== null && dept.length > 100) {
      errors.push("Department must be 100 characters or fewer.");
    } else {
      values.department = dept || null;
    }
  }
  if (body.phone !== undefined) {
    const phone = body.phone === null ? null : String(body.phone).trim();
    if (phone && !PHONE_RE.test(phone)) {
      errors.push("Phone must be a plausible phone number.");
    } else {
      values.phone = phone || null;
    }
  }
  if (body.avatar_url !== undefined) {
    const url = body.avatar_url === null ? null : String(body.avatar_url).trim();
    if (url && url.length > 2000) {
      errors.push("Avatar URL is too long.");
    } else if (url && !/^https?:\/\//i.test(url)) {
      errors.push("Avatar URL must start with http:// or https://");
    } else {
      values.avatar_url = url || null;
    }
  }

  return { errors, values };
}
