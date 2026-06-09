"use client";

import { useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import Modal from "@/components/ui/Modal";

const TONE_BTN = {
  danger:
    "bg-red-500 text-white hover:bg-red-600 focus:ring-2 focus:ring-red-500/40",
  warning:
    "bg-yellow-500 text-yellow-950 hover:bg-yellow-400",
  primary:
    "bg-primary text-primary-foreground hover:opacity-90",
};

const TONE_ICON = {
  danger: "text-red-300 bg-red-500/15",
  warning: "text-yellow-300 bg-yellow-500/15",
  primary: "text-primary bg-secondary",
};

// Lightweight async-confirm wrapper. The caller passes onConfirm — we await
// it and only close when it resolves. Errors are surfaced inline so the user
// gets feedback without the dialog disappearing on them.
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  requireText, // optional: user must type this exact string to enable confirm
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [typed, setTyped] = useState("");

  const requirementMet = !requireText || typed === requireText;

  async function handleConfirm() {
    if (!requirementMet) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm?.();
      setTyped("");
      onClose?.();
    } catch (err) {
      setError(err?.message ?? "Action failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={submitting ? undefined : onClose}
      title={title}
      size="md"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={submitting || !requirementMet}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${TONE_BTN[tone] ?? TONE_BTN.primary}`}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${TONE_ICON[tone] ?? TONE_ICON.primary}`}
        >
          <AlertTriangle className="w-4 h-4" strokeWidth={2.3} />
        </div>
        <div className="text-sm text-foreground flex-1">{message}</div>
      </div>

      {requireText && (
        <div className="mt-4">
          <label className="text-xs text-muted-foreground">
            To confirm, type{" "}
            <span className="font-mono text-foreground">{requireText}</span>{" "}
            below.
          </label>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={submitting}
            autoFocus
            className="mt-1.5 w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground font-mono outline-none focus:border-primary"
          />
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-300">
          {error}
        </div>
      )}
    </Modal>
  );
}
