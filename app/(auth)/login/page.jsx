"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import AuthShell from "@/components/layout/AuthShell";
import TextField from "@/components/ui/TextField";
import { useAuth } from "@/lib/auth/AuthProvider";
import { supabaseConfigured } from "@/lib/supabase/client";

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login({ email, password });
      router.replace(from);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your Right Tail workspace."
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-primary font-medium hover:underline">
            Create one
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!supabaseConfigured && (
          <div className="flex gap-3 p-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 text-xs text-yellow-200">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold mb-1">Auth disabled</div>
              This build was made without Supabase env vars. Set{" "}
              <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
              <code className="font-mono">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>{" "}
              in your hosting provider, then redeploy.
            </div>
          </div>
        )}

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
          <TextField
            label="Password"
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
          />

          <div className="flex justify-end text-sm">
            <Link
              href="/forgot-password"
              className="text-primary font-medium hover:underline"
            >
              Forgot password?
            </Link>
          </div>

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
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  // useSearchParams must be inside a Suspense boundary in App Router so
  // the page can be pre-rendered. The wrapper is cheap and only renders
  // a flash if search params are still resolving.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
