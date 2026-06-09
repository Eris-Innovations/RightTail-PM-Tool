"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  Mail,
  Phone,
  Building,
  Calendar,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Briefcase,
  ClipboardList,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import { api } from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/formatters";

function initials(name) {
  return (name ?? "?")
    .split(/\s+/)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const ROLE_PILL = {
  admin: "bg-purple-500/15 text-purple-300",
  manager: "bg-blue-500/15 text-blue-300",
  member: "bg-zinc-500/15 text-zinc-300",
};

function MetaRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2 text-sm py-1.5">
      <Icon
        className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0 mt-0.5"
        strokeWidth={2.2}
      />
      <span className="text-muted-foreground min-w-28">{label}</span>
      <span className="text-foreground min-w-0 flex-1">{children}</span>
    </div>
  );
}

function StatTile({ label, value, icon: Icon }) {
  return (
    <div className="rounded-md border border-border p-3 bg-input/30">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Icon
          className="w-3.5 h-3.5 text-muted-foreground"
          strokeWidth={2.4}
        />
      </div>
      <div className="text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

export default function UserDetailModal({ open, onClose, userId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    api
      .user(userId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const u = data?.user;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={u?.name ?? "User details"}
      subtitle={u ? `${u.id} · joined ${formatDate(u.created_at)}` : ""}
      size="lg"
    >
      {loading && !data && (
        <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading user…
        </div>
      )}

      {error && (
        <div className="p-4 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
          <div className="font-semibold mb-1">Could not load user.</div>
          <div className="text-xs font-mono break-all">{error.message}</div>
        </div>
      )}

      {u && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            {u.avatar_url ? (
              <img
                src={u.avatar_url}
                alt={u.name}
                className="w-16 h-16 rounded-full object-cover border border-border"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground text-lg font-bold">
                {initials(u.name)}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded ${ROLE_PILL[u.role] ?? ROLE_PILL.member}`}
                >
                  {u.role}
                </span>
                {u.status === "Active" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded bg-green-500/15 text-green-300">
                    <CheckCircle2 className="w-3 h-3" strokeWidth={2.6} />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded bg-zinc-500/15 text-zinc-400">
                    <XCircle className="w-3 h-3" strokeWidth={2.6} />
                    Inactive
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Last login:{" "}
                {u.last_login_at ? timeAgo(u.last_login_at) : "Never"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatTile
              label="Projects owned"
              value={u.projects_owned}
              icon={Briefcase}
            />
            <StatTile
              label="Tasks assigned"
              value={u.tasks_assigned}
              icon={ClipboardList}
            />
            <StatTile label="Tasks done" value={u.tasks_done} icon={ShieldCheck} />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2">
              Contact Information
            </h3>
            <div className="rounded-md border border-border px-3 py-1.5 bg-input/20">
              <MetaRow icon={Mail} label="Email">
                <a
                  href={`mailto:${u.email}`}
                  className="text-primary hover:underline"
                >
                  {u.email}
                </a>
              </MetaRow>
              <MetaRow icon={Phone} label="Phone">
                {u.phone || (
                  <span className="text-muted-foreground italic">
                    Not provided
                  </span>
                )}
              </MetaRow>
              <MetaRow icon={Building} label="Department">
                {u.department || (
                  <span className="text-muted-foreground italic">
                    Not provided
                  </span>
                )}
              </MetaRow>
              <MetaRow icon={Calendar} label="Joined">
                {formatDate(u.created_at)} ({timeAgo(u.created_at)})
              </MetaRow>
              {u.updated_at && (
                <MetaRow icon={Calendar} label="Profile updated">
                  {timeAgo(u.updated_at)}
                </MetaRow>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
