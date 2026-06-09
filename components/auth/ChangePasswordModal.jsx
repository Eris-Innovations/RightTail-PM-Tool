"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import Modal from "@/components/ui/Modal";
import TextField from "@/components/ui/TextField";
import { useAuth } from "@/lib/auth/AuthProvider";

const emptyForm = { newPassword: "", confirm: "" };

/**
 * Set / change password modal.
 *
 * Under Supabase Auth this is just `supabase.auth.updateUser({ password })`
 * — authority comes from the user's active session, not from re-entering
 * their current password. For OAuth-only users (signed in via Google) this
 * flow lets them set their first password, after which they can also sign
 * in with email + password.
 */
export default function ChangePasswordModal({ open, onClose }) {
  const { changePassword } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    setError(null);
    setDone(false);
  }, [open]);

  function set(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (form.newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (form.newPassword !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await changePassword({ password: form.newPassword });
      setDone(true);
      setTimeout(() => onClose?.(), 1400);
    } catch (err) {
      setError(err.message || "Could not change password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title="Change password"
      subtitle="You'll stay signed in on this device."
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
            form="change-password-form"
            disabled={submitting || done || !form.newPassword}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? "Updating…" : done ? "Updated" : "Update password"}
          </button>
        </>
      }
    >
      <form
        id="change-password-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <TextField
          label="New password"
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={set("newPassword")}
          required
          hint="At least 8 characters."
        />
        <TextField
          label="Confirm new password"
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set("confirm")}
          required
        />
        {done && (
          <div className="p-3 rounded-md border border-green-500/30 bg-green-500/10 text-sm text-green-300">
            Password updated.
          </div>
        )}
        {error && !done && (
          <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
