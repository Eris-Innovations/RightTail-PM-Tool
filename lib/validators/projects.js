export const PROJECT_STATUSES = [
  "Planning",
  "In Progress",
  "Completed",
  "On Hold",
];
export const PROJECT_PRIORITIES = ["Low", "Medium", "High", "Critical"];

// Normalises a list-or-string tags input into a clean string[].
// - strings get split on commas
// - whitespace trimmed
// - empties dropped
// - duplicates removed (case-sensitive — tags are user-facing)
// - max 20 tags, max 32 chars each
export function normaliseTags(input) {
  if (input == null) return [];
  const raw = Array.isArray(input) ? input : String(input).split(",");
  const cleaned = [];
  const seen = new Set();
  for (const item of raw) {
    const t = String(item).trim();
    if (!t) continue;
    if (t.length > 32) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    cleaned.push(t);
    if (cleaned.length >= 20) break;
  }
  return cleaned;
}

// Validates the writable fields of a project. Returns { errors, values }.
// `mode` is "create" (all required) or "update" (partial allowed).
export function validateProjectInput(body, mode) {
  const errors = [];
  const values = {};

  if (mode === "create" || body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (name.length < 2) errors.push("Project name must be at least 2 characters.");
    else if (name.length > 200) errors.push("Project name must be at most 200 characters.");
    else values.name = name;
  }

  if (body.description !== undefined) {
    const desc = String(body.description ?? "").trim();
    values.description = desc || null;
  }

  if (mode === "create" || body.status !== undefined) {
    const status = String(body.status ?? "Planning").trim();
    if (!PROJECT_STATUSES.includes(status)) {
      errors.push(`Status must be one of: ${PROJECT_STATUSES.join(", ")}.`);
    } else values.status = status;
  }

  if (mode === "create" || body.priority !== undefined) {
    const priority = String(body.priority ?? "Medium").trim();
    if (!PROJECT_PRIORITIES.includes(priority)) {
      errors.push(`Priority must be one of: ${PROJECT_PRIORITIES.join(", ")}.`);
    } else values.priority = priority;
  }

  if (body.start_date !== undefined) {
    values.start_date = body.start_date || null;
  }
  if (body.end_date !== undefined) {
    values.end_date = body.end_date || null;
  }
  if (
    values.start_date &&
    values.end_date &&
    new Date(values.start_date) > new Date(values.end_date)
  ) {
    errors.push("End date cannot be before start date.");
  }

  if (body.category !== undefined) {
    const cat = String(body.category ?? "").trim();
    if (cat.length > 80) errors.push("Category must be at most 80 characters.");
    else values.category = cat || null;
  }

  if (body.tags !== undefined) {
    values.tags = normaliseTags(body.tags);
  }

  if (body.owner_id !== undefined) {
    values.owner_id = String(body.owner_id ?? "").trim();
  }
  if (body.team_id !== undefined) {
    // Explicit null clears the team; empty string treated the same so
    // a form that nulls a select doesn't surprise the caller.
    const raw = body.team_id;
    values.team_id = raw === null || raw === "" ? null : String(raw).trim();
  }

  return { errors, values };
}
