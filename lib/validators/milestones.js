export function validateMilestoneInput(body, mode) {
  const errors = [];
  const values = {};

  if (mode === "create" || body.title !== undefined) {
    const title = String(body.title ?? "").trim();
    if (title.length < 2) errors.push("Milestone title must be at least 2 characters.");
    else if (title.length > 200) errors.push("Milestone title must be at most 200 characters.");
    else values.title = title;
  }

  if (body.description !== undefined) {
    const desc = String(body.description ?? "").trim();
    values.description = desc || null;
  }

  if (body.due_date !== undefined) {
    values.due_date = body.due_date || null;
  }

  if (body.status !== undefined) {
    const s = String(body.status).trim();
    if (s !== "Pending" && s !== "Completed") {
      errors.push("Status must be Pending or Completed.");
    } else values.status = s;
  }

  return { errors, values };
}
