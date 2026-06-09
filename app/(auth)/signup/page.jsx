"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AuthShell from "@/components/layout/AuthShell";
import TextField from "@/components/ui/TextField";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // Email confirmation is disabled at the project level — signup
      // returns a session immediately and we land the user on the
      // dashboard. If you ever re-enable "Confirm email" in Supabase,
      // surface a "check your inbox" screen here for the no-session
      // case.
      await signup({ name, email, password });
      router.replace("/");
    } catch (err) {
      setError(err.message || "Signup failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="The first account becomes the workspace admin."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <TextField
          label="Full name"
          id="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Jane Smith"
        />
        <TextField
          label="Work email"
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@company.com"
        />
        <TextField
          label="Password"
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          hint="At least 8 characters."
          placeholder="••••••••"
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
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
