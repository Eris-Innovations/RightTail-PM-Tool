"use client";

// Authenticated route-group layout.
//
// Acts as the client-side equivalent of the React-Router-era
// <ProtectedRoute>. We check `useAuth()` and:
//
//   • show the SplashScreen while the initial Supabase session is
//     resolving (loading === true),
//   • redirect to /login if there's no signed-in user once loading
//     has settled,
//   • otherwise render the AppLayout shell (sidebar + page area)
//     around `children`.
//
// We intentionally do this client-side instead of in middleware so
// (a) auth state stays in one source of truth (the AuthProvider), and
// (b) the login redirect doesn't flash through a brief 302 in the
// browser address bar during normal navigation.

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import AppLayout from "@/components/layout/AppLayout";
import SplashScreen from "@/components/layout/SplashScreen";

export default function ProtectedAppLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    if (!loading && !user) {
      // Preserve where the user was heading so we can bounce them back
      // post-login (Login reads ?from=… from the query string).
      const from = encodeURIComponent(pathname);
      router.replace(`/login?from=${from}`);
    }
  }, [loading, user, pathname, router]);

  if (loading || !user) return <SplashScreen />;

  return <AppLayout>{children}</AppLayout>;
}
