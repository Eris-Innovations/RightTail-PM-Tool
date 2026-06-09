"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import AuthShell from "@/components/layout/AuthShell";
import TextField from "@/components/ui/TextField";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // Supabase always responds 200 here (intentionally — leaking which
      // emails are registered would be an enumeration vector), so we
      // unconditionally show the "check your inbox" confirmation.
      await forgotPassword({ email });
      setSent(true);
    } catch (err) {
      setError(err.message || "Could not start password reset.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter the email tied to your account. We'll send a reset link."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Back to sign in
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="flex flex-col gap-4">
          <div className="p-3 rounded-md border border-green-500/30 bg-green-500/10 text-sm text-green-300">
            If <span className="font-semibold">{email}</span> is registered, a
            reset link has been sent. Check your inbox.
          </div>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Send another link
          </button>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <TextField
            label="Email"
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@company.com"
          />
          {error && (
            <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-md py-2.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {submitting ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
