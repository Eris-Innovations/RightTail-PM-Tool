"use client";

import { useEffect, useState } from "react";
import { Loader2, UserPlus, Save } from "lucide-react";
import Modal from "@/components/ui/Modal";
import TextField from "@/components/ui/TextField";
import { api } from "@/lib/api";

const ROLES = ["admin", "manager", "member"];
const STATUSES = ["Active", "Inactive"];

function emptyForm() {
  return {
    name: "",
    email: "",
    role: "member",
    status: "Active",
    department: "",
    phone: "",
    avatar_url: "",
    password: "",
  };
}

export default function UserFormModal({
  open,
  onClose,
  mode = "create",
  user = null,
  onSaved,
}) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (isEdit && user) {
      setForm({
        name: user.name ?? "",
        email: user.email ?? "",
        role: user.role ?? "member",
        status: user.status ?? "Active",
        department: user.department ?? "",
        phone: user.phone ?? "",
        avatar_url: user.avatar_url ?? "",
        password: "",
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, isEdit, user]);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        role: form.role,
        status: form.status,
        department: form.department.trim() || null,
        phone: form.phone.trim() || null,
        avatar_url: form.avatar_url.trim() || null,
      };
      if (!isEdit && form.password) {
        payload.password = form.password;
      }
      if (isEdit) {
        await api.updateUser(user.id, payload);
      } else {
        await api.createUser(payload);
      }
      onSaved?.();
      onClose?.();
    } catch (err) {
      setError(err.message || "Could not save user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      title={isEdit ? "Edit user" : "Add user"}
      subtitle={
        isEdit
          ? `Update profile for ${user?.name ?? "this user"}.`
          : "Create a new workspace member. Leave password blank to send a reset link later."
      }
      size="lg"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="Full name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            required
            disabled={busy}
          />
          <TextField
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            required
            disabled={busy}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Role
            </label>
            <select
              value={form.role}
              onChange={(e) => update("role", e.target.value)}
              disabled={busy}
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r[0].toUpperCase() + r.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Account status
            </label>
            <select
              value={form.status}
              onChange={(e) => update("status", e.target.value)}
              disabled={busy}
              className="w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="Department"
            value={form.department}
            onChange={(e) => update("department", e.target.value)}
            placeholder="e.g. Engineering"
            disabled={busy}
          />
          <TextField
            label="Phone"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="e.g. +1 555 123 4567"
            disabled={busy}
          />
        </div>

        <TextField
          label="Profile picture URL"
          value={form.avatar_url}
          onChange={(e) => update("avatar_url", e.target.value)}
          placeholder="https://…"
          hint="Optional. Leave blank to use initials."
          disabled={busy}
        />

        {!isEdit && (
          <TextField
            label="Initial password"
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            placeholder="Leave blank to send a reset link instead"
            hint="Minimum 8 characters when set."
            disabled={busy}
          />
        )}

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
              <UserPlus className="w-3.5 h-3.5" strokeWidth={2.6} />
            )}
            {isEdit ? "Save changes" : "Create user"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
