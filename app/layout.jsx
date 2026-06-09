// Root layout. Runs once around every page in the app — both the
// authenticated (`(app)`) and the public-only (`(auth)`) route groups
// inherit this shell.
//
// Responsibilities:
//   1. <html>/<body> boilerplate + global font loading.
//   2. Mount the global stylesheet (Tailwind + theme tokens).
//   3. Wrap the tree in <AuthProvider> so any client component can call
//      useAuth() without each route having to remember to opt in.
//
// We skip the Vite-era "boot splash" because Next.js server-renders the
// real page chrome on first request — the user never sees a blank dark
// screen waiting for the JS bundle. Auth-resolution splash lives inside
// the (app) layout so it only blocks the protected area.

import { Inter } from "next/font/google";
import AuthProvider from "@/lib/auth/AuthProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Right Tail — Project Management Tool",
  description: "A React + Supabase project management tool.",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/brand-icon.png", type: "image/png" },
    ],
    apple: "/brand-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
