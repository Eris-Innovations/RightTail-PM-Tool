"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";

// Compact "..." popover used in table rows. Items is an array of:
//   { label, icon: Component, onClick, tone?: "danger"|"warning", disabled?: boolean }
// The menu renders into a portal so it isn't clipped by ancestor
// `overflow:hidden` containers (tables and modals both have them). On
// open we measure the menu's natural height and:
//   • flip the menu upward when there's not enough room below,
//   • cap its height + enable scroll if neither side has enough room,
//   • clamp it horizontally so it can't render off-screen.

const MENU_WIDTH = 192; // matches w-48
const GAP = 4;          // gap between button and menu
const MARGIN = 8;       // safe area from viewport edges

export default function RowActionMenu({ items, ariaLabel = "Row actions" }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, maxHeight: undefined });
  const [ready, setReady] = useState(false);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset positioning on every open so we always re-measure (the menu's
  // natural height changes with the items prop).
  useLayoutEffect(() => {
    if (!open) {
      setReady(false);
      return;
    }
    if (!buttonRef.current || !menuRef.current) return;

    const btn = buttonRef.current.getBoundingClientRect();
    // scrollHeight gives the content's natural height even if CSS already
    // capped the rendered element via maxHeight.
    const naturalHeight = menuRef.current.scrollHeight;

    const spaceBelow = window.innerHeight - btn.bottom - MARGIN - GAP;
    const spaceAbove = btn.top - MARGIN - GAP;

    const fitsBelow = spaceBelow >= naturalHeight;
    const fitsAbove = spaceAbove >= naturalHeight;
    // Open upward only when below doesn't fit but above does (or above
    // has more breathing room when neither side fits the natural size).
    const flipUp = !fitsBelow && (fitsAbove || spaceAbove > spaceBelow);

    const available = Math.max(0, flipUp ? spaceAbove : spaceBelow);
    const usedHeight = Math.min(naturalHeight, available);
    const maxHeight = usedHeight < naturalHeight ? usedHeight : undefined;

    const top = flipUp ? btn.top - usedHeight - GAP : btn.bottom + GAP;

    let left = btn.right - MENU_WIDTH;
    left = Math.max(
      MARGIN,
      Math.min(left, window.innerWidth - MENU_WIDTH - MARGIN)
    );

    setPos({ top, left, maxHeight });
    setReady(true);
  }, [open, items]);

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
      // Closing on scroll/resize is cheaper than tracking the button.
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
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
      {mounted &&
        open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              top: pos.top,
              left: pos.left,
              maxHeight: pos.maxHeight,
              // First render before measurement: keep it invisible so
              // there's no flash at (0,0) before useLayoutEffect runs.
              visibility: ready ? "visible" : "hidden",
              overflowY: pos.maxHeight ? "auto" : "visible",
            }}
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
