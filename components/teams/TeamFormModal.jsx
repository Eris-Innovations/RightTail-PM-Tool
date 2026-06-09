"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, UsersRound } from "lucide-react";
import Modal from "@/components/ui/Modal";
import TextField from "@/components/ui/TextField";
import { api } from "@/lib/api";

function emptyForm() {
  return { name: "", description: "", leader_id: "" };
}

export default function TeamFormModal({
  open,
  onClose,
  mode = "create",
  team = null,
  onSaved,
}) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState(emptyForm);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (isEdit && team) {
      setForm({
        name: team.name ?? "",
        description: team.description ?? "",
        leader_id: team.leader_id ?? "",
      });
    } else {
      setForm(emptyForm());
    }
    api.users().then((r) => setUsers(r.items ?? [])).catch(() => {});
  }, [open, isEdit, team]);

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        leader_id: form.leader_id || null,
      };
      if (isEdit) {
        await api.updateTeam(team.id, payload);
      } else {
        await api.createTeam(payload);
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || "Could not save team.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={isEdit ? "Edit team" : "Create team"}
      subtitle={
        isEdit
          ? `Update details for ${team?.name ?? "this team"}.`
          : "Group people into a team. You can add or change members afterwards."
      }
      size="md"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <TextField
          label="Team name"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
          required
          disabled={busy}
        />
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Description
          </label>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="What does this team focus on?"
            rows={3}
            disabled={busy}
            className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary resize-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Team leader
          </label>
          <select
            value={form.leader_id}
            onChange={(e) => update("leader_id", e.target.value)}
            disabled={busy}
            className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="">No leader (assign one later)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {u.role}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            The leader is automatically added to the team roster.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-input transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isEdit ? (
              <Save className="w-3.5 h-3.5" strokeWidth={2.6} />
            ) : (
              <UsersRound className="w-3.5 h-3.5" strokeWidth={2.6} />
            )}
            {isEdit ? "Save changes" : "Create team"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
