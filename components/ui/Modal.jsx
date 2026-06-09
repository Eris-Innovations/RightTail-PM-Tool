"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export default function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-3xl",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm cursor-default"
      />
      <div
        className={`relative w-full ${widths[size]} max-h-[90vh] bg-input border border-border rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground font-headings">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={2.4} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-border bg-background/40 flex items-center justify-end gap-2 flex-shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
