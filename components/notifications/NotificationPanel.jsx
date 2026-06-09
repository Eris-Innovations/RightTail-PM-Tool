"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AtSign,
  Bell,
  CheckCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  FolderPen,
  Inbox,
  Loader2,
  Mail,
  MailX,
  MessageSquare,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { timeAgo } from "@/lib/formatters";

const TYPE_META = {
  task_assigned:    { label: "Assigned",   icon: UserPlus,         tone: "text-blue-300 bg-blue-500/10" },
  task_updated:     { label: "Updated",    icon: ClipboardList,    tone: "text-yellow-300 bg-yellow-500/10" },
  task_completed:   { label: "Completed",  icon: CheckCircle2,     tone: "text-green-300 bg-green-500/10" },
  project_updated:  { label: "Project",    icon: FolderPen,        tone: "text-purple-300 bg-purple-500/10" },
  deadline_reminder:{ label: "Due soon",   icon: Clock,            tone: "text-red-300 bg-red-500/10" },
  comment_mention:  { label: "Mentioned",  icon: AtSign,           tone: "text-pink-300 bg-pink-500/10" },
  comment_added:    { label: "Comment",    icon: MessageSquare,    tone: "text-indigo-300 bg-indigo-500/10" },
};

const FILTERS = [
  { value: "all",       label: "All" },
  { value: "unread",    label: "Unread" },
  ...Object.entries(TYPE_META).map(([value, m]) => ({ value, label: m.label })),
];

function NotificationRow({ n, busy, onRead, onDelete }) {
  const meta = TYPE_META[n.type] ?? {
    label: n.type,
    icon: Bell,
    tone: "text-muted-foreground bg-input",
  };
  const Icon = meta.icon;
  const unread = !n.read_at;
  return (
    <div
      className={`group flex items-start gap-3 px-3 py-2.5 border-b border-border last:border-b-0 ${
        unread ? "bg-input/40" : "bg-transparent"
      }`}
    >
      <div
        className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${meta.tone}`}
      >
        <Icon className="w-3.5 h-3.5" strokeWidth={2.4} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <span
            className={`text-sm flex-1 min-w-0 ${
              unread ? "font-semibold text-foreground" : "text-foreground/80"
            }`}
          >
            {n.title}
          </span>
          {unread && (
            <span
              className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0 mt-1.5"
              aria-label="Unread"
            />
          )}
        </div>
        {n.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {n.body}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
          <span>{timeAgo(n.created_at)}</span>
          {n.actor_name && <span>· by {n.actor_name}</span>}
          {n.email_status === "sent" && (
            <span
              className="inline-flex items-center gap-0.5 text-green-400"
              title="Email also sent"
            >
              <Mail className="w-2.5 h-2.5" strokeWidth={2.4} />
              emailed
            </span>
          )}
          {n.email_status === "failed" && (
            <span
              className="inline-flex items-center gap-0.5 text-red-400"
              title="Email delivery failed"
            >
              <MailX className="w-2.5 h-2.5" strokeWidth={2.4} />
              email failed
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        {unread && (
          <button
            type="button"
            onClick={onRead}
            disabled={busy}
            title="Mark as read"
            className="w-6 h-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
          >
            <CheckCheck className="w-3 h-3" strokeWidth={2.4} />
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          title="Dismiss"
          className="w-6 h-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          <Trash2 className="w-3 h-3" strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

export default function NotificationPanel({
  open,
  onClose,
  onUnreadChange,
  onOpenPreferences,
}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [marking, setMarking] = useState(false);

  const params = useMemo(() => {
    if (filter === "all") return null;
    if (filter === "unread") return { unread: "true" };
    return { type: filter };
  }, [filter]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.notifications({ ...(params ?? {}), limit: 50 });
      setItems(res.items ?? []);
      onUnreadChange?.(res.unread_count);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [params, onUnreadChange]);

  useEffect(() => {
    if (!open) return;
    reload();
  }, [open, reload]);

  if (!open) return null;

  async function markOne(id) {
    setBusyId(id);
    try {
      await api.markNotificationRead(id);
      await reload();
    } finally {
      setBusyId(null);
    }
  }
  async function deleteOne(id) {
    setBusyId(id);
    try {
      await api.deleteNotification(id);
      await reload();
    } finally {
      setBusyId(null);
    }
  }
  async function markAll() {
    setMarking(true);
    try {
      await api.markAllNotificationsRead();
      await reload();
    } finally {
      setMarking(false);
    }
  }

  return (
    <>
      {/* Click-outside dismisser. Sits below the panel in stacking order so
          clicks on the panel itself don't bubble up and close it. */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label="Notifications"
        className="fixed top-16 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] max-h-[80vh] bg-background border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-primary" strokeWidth={2.4} />
            <h2 className="text-sm font-semibold text-foreground">
              Notifications
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={markAll}
              disabled={marking}
              className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-input/60 disabled:opacity-50"
            >
              {marking ? "Marking…" : "Mark all read"}
            </button>
            <button
              type="button"
              onClick={onOpenPreferences}
              title="Preferences"
              className="w-7 h-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-input/60"
            >
              <svg
                className="w-3.5 h-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-input/60"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.4} />
            </button>
          </div>
        </div>

        <div className="px-3 py-2 flex items-center gap-1 flex-wrap border-b border-border bg-input/20">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`text-[11px] px-2 py-1 rounded transition-colors ${
                filter === f.value
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-input/60"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && items.length === 0 && (
            <div className="py-10 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading…
            </div>
          )}
          {error && (
            <div className="m-3 p-3 rounded border border-red-500/30 bg-red-500/10 text-xs text-red-300">
              {error.message}
            </div>
          )}
          {!loading && items.length === 0 && !error && (
            <div className="py-10 px-4 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
              <Inbox className="w-6 h-6 text-muted-foreground/60" strokeWidth={1.8} />
              <span>You&apos;re all caught up.</span>
            </div>
          )}
          {items.map((n) => (
            <NotificationRow
              key={n.id}
              n={n}
              busy={busyId === n.id}
              onRead={() => markOne(n.id)}
              onDelete={() => deleteOne(n.id)}
            />
          ))}
        </div>
      </div>
    </>
  );
}
