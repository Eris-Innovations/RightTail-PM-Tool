"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import TextField from "@/components/ui/TextField";
import { api } from "@/lib/api";

const baseInput =
  "bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary";

const emptyForm = {
  title: "",
  description: "",
  due_date: "",
  status: "Pending",
};

function milestoneToForm(m) {
  if (!m) return { ...emptyForm };
  return {
    title: m.title ?? "",
    description: m.description ?? "",
    due_date: m.due_date ? String(m.due_date).slice(0, 10) : "",
    status: m.status ?? "Pending",
  };
}

export default function MilestoneFormModal({
  open,
  onClose,
  mode = "create",
  milestone = null,
  projectId, // required for create mode
  projectName,
  onSaved,
}) {
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm(milestoneToForm(milestone));
    setError(null);
  }, [open, milestone]);

  function set(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        due_date: form.due_date || null,
        status: form.status,
      };
      const result =
        mode === "edit" && milestone?.id
          ? await api.updateMilestone(milestone.id, payload)
          : await api.createMilestone(projectId, payload);
      onSaved?.(result.milestone);
      onClose?.();
    } catch (err) {
      setError(err.message || "Could not save milestone.");
    } finally {
      setSubmitting(false);
    }
  }

  const isEdit = mode === "edit";

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={isEdit ? "Edit milestone" : "New milestone"}
      subtitle={
        projectName
          ? `${isEdit ? "Update" : "Add"} for ${projectName}`
          : undefined
      }
      size="md"
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
            form="milestone-form"
            disabled={submitting || !form.title.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting
              ? isEdit
                ? "Saving…"
                : "Adding…"
              : isEdit
                ? "Save changes"
                : "Add milestone"}
          </button>
        </>
      }
    >
      <form
        id="milestone-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <TextField
          label="Title"
          id="milestone-title"
          value={form.title}
          onChange={set("title")}
          required
          placeholder="e.g. Beta launch ready"
        />

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="milestone-description"
            className="text-xs font-medium text-foreground"
          >
            Notes
          </label>
          <textarea
            id="milestone-description"
            value={form.description}
            onChange={set("description")}
            rows={3}
            placeholder="Anything the team should remember about this milestone."
            className={`${baseInput} resize-y min-h-[80px]`}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="milestone-due"
              className="text-xs font-medium text-foreground"
            >
              Due date
            </label>
            <input
              id="milestone-due"
              type="date"
              value={form.due_date}
              onChange={set("due_date")}
              className={baseInput}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="milestone-status"
              className="text-xs font-medium text-foreground"
            >
              Status
            </label>
            <select
              id="milestone-status"
              value={form.status}
              onChange={set("status")}
              className={baseInput}
            >
              <option value="Pending">Pending</option>
              <option value="Completed">Completed</option>
            </select>
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
