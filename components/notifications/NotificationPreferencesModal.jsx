"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, Save } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { api } from "@/lib/api";

const TYPE_ROWS = [
  {
    key: "email_task_assigned",
    label: "Task assigned to me",
    hint: "A teammate or admin assigns a task to you.",
  },
  {
    key: "email_task_updated",
    label: "Task updated",
    hint: "Status change, edit, or field change on a task you're on.",
  },
  {
    key: "email_task_completed",
    label: "Task completed",
    hint: "A task you own or are assigned to is marked complete.",
  },
  {
    key: "email_project_updated",
    label: "Project updated",
    hint: "Owner, status, dates, or other fields on a project you're on.",
  },
  {
    key: "email_deadline_reminder",
    label: "Deadline reminder",
    hint: "Daily summary when a task you're assigned to is due soon.",
  },
  {
    key: "email_comment_mention",
    label: "Comment mentions",
    hint: "Someone @mentions you in a comment on a task or project.",
  },
  {
    key: "email_comment_added",
    label: "New comments on followed items",
    hint: "Any new comment on tasks or projects you're a part of.",
  },
];

function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ${
        checked ? "bg-primary" : "bg-input border border-border"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

export default function NotificationPreferencesModal({ open, onClose }) {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    setSavedAt(null);
    api
      .notificationPreferences()
      .then((r) => setPrefs(r.preferences))
      .catch(setError)
      .finally(() => setLoading(false));
  }, [open]);

  async function handleSave() {
    if (!prefs) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateNotificationPreferences(prefs);
      setPrefs(res.preferences);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  function update(key, value) {
    setPrefs((p) => ({ ...p, [key]: value }));
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title="Notification preferences"
      subtitle="Choose which events also send you an email. In-app notifications always arrive in the bell."
      size="md"
    >
      {loading && !prefs && (
        <div className="py-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading preferences…
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-300">
          {error.message}
        </div>
      )}

      {prefs && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-md border border-border bg-input/30">
            <div className="flex items-center gap-2">
              <Mail
                className="w-3.5 h-3.5 text-muted-foreground"
                strokeWidth={2.4}
              />
              <div>
                <div className="text-sm font-medium text-foreground">
                  Email delivery
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Master switch. When off, no email is sent regardless of the
                  per-type settings below.
                </div>
              </div>
            </div>
            <Toggle
              checked={prefs.email_enabled}
              onChange={(v) => update("email_enabled", v)}
              disabled={saving}
              label="Email delivery"
            />
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-1 mb-1">
              Per-type email
            </div>
            {TYPE_ROWS.map((row) => (
              <div
                key={row.key}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-input/40"
              >
                <div className="min-w-0">
                  <div className="text-sm text-foreground">{row.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {row.hint}
                  </div>
                </div>
                <Toggle
                  checked={!!prefs[row.key] && prefs.email_enabled}
                  onChange={(v) => update(row.key, v)}
                  disabled={saving || !prefs.email_enabled}
                  label={row.label}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
            {savedAt && (
              <span className="text-[11px] text-green-300 mr-auto">
                Saved.
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:bg-input transition-colors disabled:opacity-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" strokeWidth={2.6} />
              )}
              Save changes
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
