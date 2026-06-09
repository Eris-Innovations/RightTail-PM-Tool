import Link from "next/link";

export const metadata = {
  title: "Page not found — Right Tail",
};

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="text-5xl font-extrabold tracking-tight">404</div>
      <h1 className="text-xl font-bold text-foreground">Page not found</h1>
      <p className="text-sm text-muted-foreground max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or you don&apos;t
        have access to it.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition"
      >
        Go to dashboard
      </Link>
    </div>
  );
}
