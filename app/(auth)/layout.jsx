"use client";

// Public-only route-group layout.
//
// If the visitor is already signed in, kick them to the dashboard
// instead of letting them see the login/signup screens. While auth is
// still resolving we render the SplashScreen so there's no flash of
// the wrong page.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import SplashScreen from "@/components/layout/SplashScreen";

export default function PublicOnlyLayout({ children }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  if (loading || user) return <SplashScreen />;
  return children;
}
