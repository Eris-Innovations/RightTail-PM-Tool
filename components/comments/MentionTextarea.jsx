"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";

// Lightweight @-mention picker around a controlled textarea. We don't pull in
// a contenteditable rich-text library — we just track the caret, look for an
// `@xxx` token immediately before it, and pop a suggestion list. Selecting a
// suggestion replaces the token with `@<canonical handle>` and the resolver
// on the server takes care of mapping that to a user id.

function buildHandle(user) {
  // Prefer the email local-part (always unique, always alphanumeric).
  const local = (user.email ?? "").split("@")[0];
  if (local) return local;
  return (user.name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export default function MentionTextarea({
  value,
  onChange,
  placeholder,
  disabled,
  rows = 3,
  autoFocus = false,
  onSubmit, // optional: Ctrl/Cmd+Enter shortcut
}) {
  const ref = useRef(null);
  const [users, setUsers] = useState([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  // Caret offsets for the token we're about to replace.
  const [tokenRange, setTokenRange] = useState(null);

  // One-time user fetch. Notification-recipient picking ergonomics aren't
  // worth the latency of a per-keystroke server query.
  useEffect(() => {
    let cancelled = false;
    api
      .users()
      .then((r) => {
        if (!cancelled) setUsers(r.items ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!open) return [];
    const q = query.toLowerCase();
    const all = users.filter((u) => u.status !== "inactive");
    if (!q) return all.slice(0, 6);
    return all
      .filter((u) => {
        const handle = buildHandle(u);
        return (
          handle.includes(q) ||
          (u.name ?? "").toLowerCase().includes(q) ||
          (u.email ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 6);
  }, [users, query, open]);

  useEffect(() => {
    if (!open) setActiveIndex(0);
    else setActiveIndex((i) => Math.min(i, Math.max(0, filtered.length - 1)));
  }, [open, filtered.length]);

  function detectToken(text, caret) {
    // Walk backwards from the caret looking for the most recent `@`. Bail
    // if we hit whitespace, since `@foo bar` shouldn't keep the picker open
    // after the space.
    let i = caret - 1;
    while (i >= 0) {
      const ch = text[i];
      if (ch === "@") {
        // Token starts only if the char before @ is start-of-string or whitespace.
        if (i === 0 || /\s/.test(text[i - 1])) {
          return { start: i, end: caret, handle: text.slice(i + 1, caret) };
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
      i -= 1;
    }
    return null;
  }

  function handleInput(e) {
    const text = e.target.value;
    const caret = e.target.selectionStart;
    onChange(text);
    const token = detectToken(text, caret);
    if (token && /^[A-Za-z0-9._-]{0,64}$/.test(token.handle)) {
      setTokenRange(token);
      setQuery(token.handle);
      setOpen(true);
    } else {
      setOpen(false);
      setTokenRange(null);
    }
  }

  function insertMention(user) {
    if (!tokenRange) return;
    const handle = buildHandle(user);
    const before = value.slice(0, tokenRange.start);
    const after = value.slice(tokenRange.end);
    const insert = `@${handle} `;
    const next = `${before}${insert}${after}`;
    onChange(next);
    setOpen(false);
    setTokenRange(null);
    // Restore caret position right after the inserted handle.
    queueMicrotask(() => {
      if (ref.current) {
        const pos = before.length + insert.length;
        ref.current.focus();
        ref.current.setSelectionRange(pos, pos);
      }
    });
  }

  function handleKeyDown(e) {
    if (open && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(filtered[activeIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
    }
    if (
      (e.metaKey || e.ctrlKey) &&
      e.key === "Enter" &&
      typeof onSubmit === "function"
    ) {
      e.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        autoFocus={autoFocus}
        className="w-full bg-input text-foreground placeholder-muted-foreground text-sm rounded-md border border-border px-3 py-2 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/40 disabled:opacity-50 resize-y"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-30 mt-1 left-0 right-0 sm:right-auto sm:min-w-[260px] bg-background border border-border rounded-md shadow-xl overflow-hidden max-h-60 overflow-y-auto">
          {filtered.map((u, i) => {
            const handle = buildHandle(u);
            return (
              <button
                type="button"
                key={u.id}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertMention(u);
                }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2 ${
                  i === activeIndex ? "bg-input/80" : "bg-transparent"
                }`}
              >
                <span className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground text-[10px] font-bold flex-shrink-0">
                  {(u.name ?? "?").charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-medium text-foreground truncate">
                    {u.name}
                  </span>
                  <span className="block text-[10px] text-muted-foreground truncate">
                    @{handle} · {u.email}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
