"use client";

import { useEffect, useRef, useState } from "react";
import { MoreVertical } from "lucide-react";

// Compact "..." popover used in table rows. Items is an array of:
//   { label, icon: Component, onClick, tone?: "danger"|"warning", disabled?: boolean }
// Visible icon, accessible button, click-outside + Escape to close.
export default function RowActionMenu({ items, ariaLabel = "Row actions" }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (!containerRef.current?.contains(e.target)) {
        setOpen(false);
      }
    }
    function handleKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;

  return (
    <div ref={containerRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="w-8 h-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreVertical className="w-4 h-4" strokeWidth={2.4} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-30 w-48 rounded-md border border-border bg-input shadow-xl shadow-black/60 py-1.5"
        >
          {visible.map((item, idx) => {
            const Icon = item.icon;
            const toneClass =
              item.tone === "danger"
                ? "text-red-300 hover:bg-red-500/10"
                : item.tone === "warning"
                  ? "text-yellow-300 hover:bg-yellow-500/10"
                  : "text-foreground hover:bg-muted";
            return (
              <button
                key={`${item.label}-${idx}`}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (item.disabled) return;
                  setOpen(false);
                  item.onClick?.();
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${toneClass}`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" strokeWidth={2.4} />}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
