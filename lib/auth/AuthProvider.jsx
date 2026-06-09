"use client";

// Centralised auth state for the app. Source of truth = Supabase Auth.
//
// Lifecycle:
//   1. On mount, ask Supabase for the current session (handles page
//      refresh).
//   2. Subscribe to onAuthStateChange so login / logout / token
//      refresh events keep state in sync without polling.
//   3. Whenever the session changes, hit /api/auth/me to fetch the
//      enriched user (role, name, department, …) from our own users
//      table. That's the row every UI uses — `user.role` for RBAC
//      chips, etc.
//
// The login/signup/logout/reset helpers exposed here are thin wrappers
// around the Supabase client so screens don't need to import `supabase`
// directly.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase/client";
import { api, ApiError } from "@/lib/api";

const AuthContext = createContext(null);

export default function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Guards against a stale /api/auth/me response overwriting a newer
  // one when sessions change rapidly (e.g. OAuth callback into
  // immediate logout).
  const fetchSeq = useRef(0);

  const fetchProfile = useCallback(async () => {
    const mySeq = ++fetchSeq.current;
    try {
      const data = await api.me();
      if (mySeq === fetchSeq.current) setUser(data.user);
    } catch (err) {
      if (mySeq === fetchSeq.current) {
        if (!(err instanceof ApiError && err.status === 401)) {
          // 401s during the brief window between sign-out and React
          // seeing the new session are expected — only log unexpected
          // failures.
          // eslint-disable-next-line no-console
          console.error("profile refresh failed:", err);
        }
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!supabaseConfigured) {
      // Short-circuit: render the app as logged-out so the user at
      // least sees the login page (which will surface a config-error
      // banner) instead of a splash that hangs forever.
      setLoading(false);
      return undefined;
    }

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(data.session);
        if (data.session) await fetchProfile();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[auth] initial session lookup failed:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess);
      if (sess) {
        fetchProfile();
      } else {
        fetchSeq.current++;
        setUser(null);
      }
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const login = useCallback(async ({ email, password }) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    return data.session;
  }, []);

  const signup = useCallback(async ({ name, email, password }) => {
    await api.signup({ name, email, password });
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error(error.message);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const forgotPassword = useCallback(async ({ email }) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw new Error(error.message);
  }, []);

  const resetPassword = useCallback(async ({ password }) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  }, []);

  const changePassword = useCallback(async ({ password }) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  }, []);

  const value = {
    session,
    user,
    authUser: session?.user ?? null,
    loading,
    login,
    signup,
    logout,
    forgotPassword,
    resetPassword,
    changePassword,
    refresh: fetchProfile,
  };

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside an <AuthProvider>");
  }
  return ctx;
}
