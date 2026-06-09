"use client";

export default function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-center justify-between gap-4 px-8 py-5 border-b border-border">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-foreground font-headings">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-3 flex-shrink-0">{children}</div>
      )}
    </div>
  );
}
