"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import TextField from "@/components/ui/TextField";
import { api } from "@/lib/api";

const STATUSES = ["To Do", "In Progress", "Done"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];

const baseInput =
  "bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary";

const emptyForm = {
  project_id: "",
  title: "",
  description: "",
  status: "To Do",
  priority: "Medium",
  due_date: "",
  assignee_id: "",
  estimated_hours: "",
  actual_hours: "",
  tagsText: "",
};

function taskToForm(task) {
  if (!task) return { ...emptyForm };
  return {
    project_id: task.project_id ?? "",
    title: task.title ?? "",
    description: task.description ?? "",
    status: task.status ?? "To Do",
    priority: task.priority ?? "Medium",
    due_date: task.due_date ? String(task.due_date).slice(0, 10) : "",
    assignee_id: task.assignee_id ?? "",
    estimated_hours:
      task.estimated_hours !== null && task.estimated_hours !== undefined
        ? String(task.estimated_hours)
        : "",
    actual_hours:
      task.actual_hours !== null && task.actual_hours !== undefined
        ? String(task.actual_hours)
        : "",
    tagsText: Array.isArray(task.tags) ? task.tags.join(", ") : "",
  };
}

export default function TaskFormModal({
  open,
  onClose,
  mode = "create",
  task = null,
  defaultProjectId = null,
  onSaved,
  // Restricted edit mode — used when an assignee is editing their own task.
  // We hide the manager-only fields entirely instead of greying them out so
  // the form doesn't look broken.
  restrictedToStatusAndHours = false,
}) {
  const [form, setForm] = useState(emptyForm);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    const seed = taskToForm(task);
    if (mode === "create" && defaultProjectId && !seed.project_id) {
      seed.project_id = defaultProjectId;
    }
    setForm(seed);
    setError(null);
    Promise.all([api.projects({ include_archived: "false" }), api.users()])
      .then(([proj, usr]) => {
        setProjects(proj.items ?? []);
        setUsers(usr.items ?? []);
      })
      .catch(() => {
        setProjects([]);
        setUsers([]);
      });
  }, [open, task, mode, defaultProjectId]);

  function set(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const tags = form.tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = restrictedToStatusAndHours
        ? {
            status: form.status,
            actual_hours:
              form.actual_hours === "" ? null : Number(form.actual_hours),
          }
        : {
            project_id: form.project_id,
            title: form.title.trim(),
            description: form.description.trim(),
            status: form.status,
            priority: form.priority,
            due_date: form.due_date || null,
            assignee_id: form.assignee_id || null,
            estimated_hours:
              form.estimated_hours === ""
                ? null
                : Number(form.estimated_hours),
            actual_hours:
              form.actual_hours === "" ? null : Number(form.actual_hours),
            tags,
          };

      const result =
        mode === "edit" && task?.id
          ? await api.updateTask(task.id, payload)
          : await api.createTask(payload);
      onSaved?.(result.task);
      onClose?.();
    } catch (err) {
      setError(err.message || "Could not save task.");
    } finally {
      setSubmitting(false);
    }
  }

  const isEdit = mode === "edit";

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={isEdit ? "Edit task" : "New task"}
      subtitle={
        isEdit
          ? "Update the details for this task. Changes are logged."
          : "Capture a new task and assign it to a teammate."
      }
      size="lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="task-form"
            disabled={
              submitting ||
              (!restrictedToStatusAndHours && (!form.title.trim() || !form.project_id))
            }
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save changes"
                : "Create task"}
          </button>
        </>
      }
    >
      <form
        id="task-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        {restrictedToStatusAndHours ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/30 border border-secondary text-xs text-secondary-foreground">
            You can update the status and log hours on your own task. Ask an
            admin or manager for any other changes.
          </div>
        ) : (
          <>
            <TextField
              label="Title"
              id="task-title"
              value={form.title}
              onChange={set("title")}
              required
              placeholder="What needs to be done?"
            />

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="task-description"
                className="text-xs font-medium text-foreground"
              >
                Description
              </label>
              <textarea
                id="task-description"
                value={form.description}
                onChange={set("description")}
                rows={3}
                placeholder="Add context, acceptance criteria, or links."
                className={`${baseInput} resize-y min-h-[80px]`}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="task-project"
                className="text-xs font-medium text-foreground"
              >
                Project
              </label>
              <select
                id="task-project"
                value={form.project_id}
                onChange={set("project_id")}
                required
                className={baseInput}
              >
                <option value="" disabled>
                  Select a project…
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="task-assignee"
                  className="text-xs font-medium text-foreground"
                >
                  Assignee
                </label>
                <select
                  id="task-assignee"
                  value={form.assignee_id}
                  onChange={set("assignee_id")}
                  className={baseInput}
                >
                  <option value="">Unassigned</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="task-due"
                  className="text-xs font-medium text-foreground"
                >
                  Due date
                </label>
                <input
                  id="task-due"
                  type="date"
                  value={form.due_date}
                  onChange={set("due_date")}
                  className={baseInput}
                />
              </div>
            </div>
          </>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="task-status"
              className="text-xs font-medium text-foreground"
            >
              Status
            </label>
            <select
              id="task-status"
              value={form.status}
              onChange={set("status")}
              className={baseInput}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          {!restrictedToStatusAndHours && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="task-priority"
                className="text-xs font-medium text-foreground"
              >
                Priority
              </label>
              <select
                id="task-priority"
                value={form.priority}
                onChange={set("priority")}
                className={baseInput}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!restrictedToStatusAndHours && (
            <TextField
              label="Estimated hours"
              id="task-est"
              type="number"
              value={form.estimated_hours}
              onChange={set("estimated_hours")}
              placeholder="0"
              hint="Optional. Decimals allowed (e.g. 1.5)."
            />
          )}
          <TextField
            label="Actual hours"
            id="task-actual"
            type="number"
            value={form.actual_hours}
            onChange={set("actual_hours")}
            placeholder="0"
            hint="Log hours as you work."
          />
        </div>

        {!restrictedToStatusAndHours && (
          <TextField
            label="Tags"
            id="task-tags"
            value={form.tagsText}
            onChange={set("tagsText")}
            placeholder="e.g. bug, frontend, urgent"
            hint="Separate multiple tags with commas."
          />
        )}

        {error && (
          <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
