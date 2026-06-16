"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

// Compact "..." popover used in table rows. Items is an array of:
//   { label, icon: Component, onClick, tone?: "danger"|"warning", disabled?: boolean }
// The dropdown renders through a portal so it's never clipped by a
// parent `overflow:hidden` / `overflow-x:auto` container (which is the
// default on every table wrapper in the app).
export default function RowActionMenu({ items, ariaLabel = "Row actions" }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Position the menu just below the button, right-aligned. Re-measured
  // on every open so resize/scroll between toggles is handled.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const MENU_WIDTH = 192; // matches the w-48 class on the menu
    setCoords({
      top: rect.bottom + 4,
      left: rect.right - MENU_WIDTH,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (
        !buttonRef.current?.contains(e.target) &&
        !menuRef.current?.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleReposition() {
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    // Closing on scroll/resize is cheaper than reflowing the menu — the
    // user can always re-open it.
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open]);

  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
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
      {mounted && open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: coords.top, left: coords.left }}
            className="fixed z-[100] w-48 rounded-md border border-border bg-input shadow-xl shadow-black/60 py-1.5"
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
          </div>,
          document.body
        )}
    </>
  );
}
