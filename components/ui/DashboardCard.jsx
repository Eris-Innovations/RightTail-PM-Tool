"use client";

export default function DashboardCard({
  title,
  subtitle,
  action,
  children,
  className = "",
  bodyClassName = "",
}) {
  return (
    <div
      className={`bg-background border border-border rounded-lg p-5 flex flex-col min-h-0 ${className}`}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground font-body truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="flex-shrink-0">{action}</div>}
      </div>
      <div className={`flex-1 ${bodyClassName}`}>{children}</div>
    </div>
  );
}

export function CardLoading({ label = "Loading…" }) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">{label}</div>
  );
}

export function CardError({ error }) {
  return (
    <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-300">
      <div className="font-semibold mb-1">Could not load this widget.</div>
      <div className="font-mono break-all">{error.message}</div>
    </div>
  );
}

export function CardEmpty({ message }) {
  return (
    <div className="py-8 text-center text-xs text-muted-foreground">
      {message}
    </div>
  );
}
