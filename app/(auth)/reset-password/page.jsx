"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AuthShell from "@/components/layout/AuthShell";
import TextField from "@/components/ui/TextField";
import { useAuth } from "@/lib/auth/AuthProvider";

/**
 * Password-reset target page.
 *
 * When a user clicks the link in their reset email, Supabase redirects
 * them here with a one-shot session embedded in the URL hash. The
 * supabase-js client picks the hash up automatically (via
 * detectSessionInUrl) and turns it into a real session. We then call
 * updateUser() to change the password.
 */
export default function ResetPasswordPage() {
  const { resetPassword, session } = useAuth();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [linkError, setLinkError] = useState(null);

  // Surface a friendly error if Supabase rejected the reset link before
  // sending us here (e.g. expired). The error lands in the URL hash as
  // `error=...&error_description=...`.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const err = hash.get("error_description") || hash.get("error");
    if (err) setLinkError(decodeURIComponent(err.replace(/\+/g, " ")));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword({ password });
      setDone(true);
      setTimeout(() => router.replace("/login"), 1800);
    } catch (err) {
      setError(err.message || "Could not reset password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle="Choose something strong — at least 8 characters."
      footer={
        <Link href="/login" className="text-primary font-medium hover:underline">
          Back to sign in
        </Link>
      }
    >
      {done ? (
        <div className="p-3 rounded-md border border-green-500/30 bg-green-500/10 text-sm text-green-300">
          Password updated. Redirecting you to sign in…
        </div>
      ) : linkError ? (
        <div className="flex flex-col gap-4">
          <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            {linkError}
          </div>
          <Link
            href="/forgot-password"
            className="text-sm text-primary font-medium hover:underline"
          >
            Request a new reset link
          </Link>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {!session && (
            <div className="p-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 text-xs text-yellow-200">
              Open this page from the link in your password-reset email — the
              session it carries is required to set a new password.
            </div>
          )}
          <TextField
            label="New password"
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
          />
          <TextField
            label="Confirm new password"
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            placeholder="••••••••"
          />
          {error && (
            <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || !session}
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-md py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? "Resetting…" : "Reset password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
