export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4 relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 30%, rgba(59,130,246,0.15) 0%, rgba(0,0,0,0) 70%)",
        }}
      />
      <div className="relative w-full max-w-md">
        <div className="flex flex-col items-center gap-2 mb-8">
          <img
            src="/brand-icon.png"
            alt=""
            className="w-16 h-16 rounded-xl object-cover select-none"
            draggable="false"
            style={{ filter: "drop-shadow(0 8px 24px rgba(59,130,246,0.25))" }}
          />
          <span className="font-headings font-bold text-xl text-foreground tracking-tight">
            Right Tail
          </span>
        </div>
        <div className="bg-input border border-border rounded-2xl shadow-2xl shadow-black/40 p-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-foreground font-headings">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          {children}
        </div>
        {footer && (
          <div className="text-center text-sm text-muted-foreground mt-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
