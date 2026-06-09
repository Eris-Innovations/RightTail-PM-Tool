"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import TextField from "@/components/ui/TextField";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth/AuthProvider";

const STATUSES = ["Planning", "In Progress", "Completed", "On Hold"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];

const baseInput =
  "bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary";

const emptyForm = {
  name: "",
  description: "",
  status: "Planning",
  priority: "Medium",
  category: "",
  tagsText: "",
  start_date: "",
  end_date: "",
  owner_id: "",
  team_id: "",
};

function projectToForm(project, fallbackOwnerId) {
  if (!project) return { ...emptyForm, owner_id: fallbackOwnerId ?? "" };
  return {
    name: project.name ?? "",
    description: project.description ?? "",
    status: project.status ?? "Planning",
    priority: project.priority ?? "Medium",
    category: project.category ?? "",
    tagsText: Array.isArray(project.tags) ? project.tags.join(", ") : "",
    start_date: project.start_date ? String(project.start_date).slice(0, 10) : "",
    end_date: project.end_date ? String(project.end_date).slice(0, 10) : "",
    owner_id: project.owner_id ?? fallbackOwnerId ?? "",
    team_id: project.team_id ?? "",
  };
}

export default function ProjectFormModal({
  open,
  onClose,
  mode = "create",
  project = null,
  onSaved,
}) {
  const { user } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm(projectToForm(project, user?.id));
    setError(null);
    api
      .users()
      .then((res) => setUsers(res.items ?? []))
      .catch(() => setUsers([]));
    api
      .teams()
      .then((res) => setTeams(res.items ?? []))
      .catch(() => setTeams([]));
  }, [open, user?.id, project]);

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
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        status: form.status,
        priority: form.priority,
        category: form.category.trim(),
        tags,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        owner_id: form.owner_id || user?.id,
        team_id: form.team_id || null,
      };
      const result =
        mode === "edit" && project?.id
          ? await api.updateProject(project.id, payload)
          : await api.createProject(payload);
      onSaved?.(result.project);
      onClose?.();
    } catch (err) {
      setError(err.message || "Could not save project.");
    } finally {
      setSubmitting(false);
    }
  }

  const isEdit = mode === "edit";

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={isEdit ? "Edit project" : "New project"}
      subtitle={
        isEdit
          ? "Update the details for this project. Changes are logged."
          : "Set up a new project workspace for your team."
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
            form="project-form"
            disabled={submitting || !form.name.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting
              ? isEdit
                ? "Saving…"
                : "Creating…"
              : isEdit
                ? "Save changes"
                : "Create project"}
          </button>
        </>
      }
    >
      <form
        id="project-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <TextField
          label="Project name"
          id="project-name"
          value={form.name}
          onChange={set("name")}
          required
          placeholder="e.g. Mobile App v3"
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="project-description"
            className="text-xs font-medium text-foreground"
          >
            Description
          </label>
          <textarea
            id="project-description"
            value={form.description}
            onChange={set("description")}
            rows={3}
            placeholder="What is this project about?"
            className={`${baseInput} resize-y min-h-[80px]`}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="project-status"
              className="text-xs font-medium text-foreground"
            >
              Status
            </label>
            <select
              id="project-status"
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
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="project-priority"
              className="text-xs font-medium text-foreground"
            >
              Priority
            </label>
            <select
              id="project-priority"
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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField
            label="Category"
            id="project-category"
            value={form.category}
            onChange={set("category")}
            placeholder="e.g. Engineering, Marketing"
            hint="Free-form. Useful for filtering."
          />
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="project-owner"
              className="text-xs font-medium text-foreground"
            >
              Owner
            </label>
            <select
              id="project-owner"
              value={form.owner_id}
              onChange={set("owner_id")}
              className={baseInput}
            >
              {users.length === 0 && (
                <option value={user?.id ?? ""}>
                  {user?.name ?? "Me"} (you)
                </option>
              )}
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.id === user?.id ? " (you)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="project-team"
            className="text-xs font-medium text-foreground"
          >
            Team
          </label>
          <select
            id="project-team"
            value={form.team_id}
            onChange={set("team_id")}
            className={baseInput}
          >
            <option value="">Unassigned (no team)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.leader_name ? ` · led by ${t.leader_name}` : ""}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Optional — projects can belong to a team for shared workload tracking.
          </p>
        </div>

        <TextField
          label="Tags"
          id="project-tags"
          value={form.tagsText}
          onChange={set("tagsText")}
          placeholder="e.g. q3, frontend, billing"
          hint="Separate multiple tags with commas."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="project-start"
              className="text-xs font-medium text-foreground"
            >
              Start date
            </label>
            <input
              id="project-start"
              type="date"
              value={form.start_date}
              onChange={set("start_date")}
              className={baseInput}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="project-end"
              className="text-xs font-medium text-foreground"
            >
              End date
            </label>
            <input
              id="project-end"
              type="date"
              value={form.end_date}
              onChange={set("end_date")}
              min={form.start_date || undefined}
              className={baseInput}
            />
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
