"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Calendar,
  User as UserIcon,
  Tag,
  Folder,
  Archive,
  Crown,
  CheckCircle2,
  Circle,
  ListChecks,
  Clock,
  AlertTriangle,
  Plus,
  Flag,
  Pencil,
  Trash2,
  RotateCcw,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import PriorityBadge from "@/components/ui/PriorityBadge";
import ActivityItem from "@/components/activity/ActivityItem";
import CommentsSection from "@/components/comments/CommentsSection";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import MilestoneFormModal from "@/components/milestones/MilestoneFormModal";
import { api } from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/formatters";
import { getActivityIcon } from "@/lib/activityIcon";
import { useAuth } from "@/lib/auth/AuthProvider";

function ProgressBar({ pct, tone }) {
  const fill =
    tone ??
    (pct >= 100
      ? "bg-green-500"
      : pct >= 60
        ? "bg-primary"
        : pct > 0
          ? "bg-yellow-500"
          : "bg-zinc-700");
  return (
    <div className="relative h-2 w-full overflow-hidden rounded-full bg-input">
      <div
        className={`h-full rounded-full transition-all duration-500 ${fill}`}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

function StatTile({ icon: Icon, label, value, tone = "muted", hint }) {
  const tones = {
    muted: "text-muted-foreground bg-input/40",
    primary: "text-primary bg-secondary/30",
    success: "text-green-300 bg-green-500/10",
    warning: "text-yellow-300 bg-yellow-500/10",
    danger: "text-red-300 bg-red-500/10",
  };
  return (
    <div className="rounded-lg border border-border p-3 bg-input/30">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className={`w-6 h-6 rounded-md flex items-center justify-center ${tones[tone] ?? tones.muted}`}
        >
          <Icon className="w-3 h-3" strokeWidth={2.4} />
        </span>
      </div>
      <div className="text-xl font-semibold text-foreground">{value}</div>
      {hint && (
        <div className="text-[11px] text-muted-foreground mt-0.5">{hint}</div>
      )}
    </div>
  );
}

function MetaRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" strokeWidth={2.2} />
      <span className="text-muted-foreground min-w-20">{label}</span>
      <span className="text-foreground min-w-0 flex-1">{children}</span>
    </div>
  );
}

const ROLE_PILL = {
  admin: "bg-purple-500/15 text-purple-300",
  manager: "bg-blue-500/15 text-blue-300",
  member: "bg-zinc-500/15 text-zinc-300",
};

function TeamMemberCard({ member }) {
  const completion =
    member.assigned_tasks > 0
      ? Math.round((member.done_tasks / member.assigned_tasks) * 100)
      : null;
  return (
    <div className="rounded-md border border-border bg-input/30 p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-secondary-foreground flex-shrink-0">
        {member.name?.[0] ?? "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-foreground truncate">
            {member.name}
          </span>
          {member.is_owner && (
            <span title="Project owner">
              <Crown
                className="w-3 h-3 text-yellow-400 flex-shrink-0"
                strokeWidth={2.4}
              />
            </span>
          )}
          <span
            className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${ROLE_PILL[member.role] ?? ROLE_PILL.member}`}
          >
            {member.role}
          </span>
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {member.assigned_tasks > 0 ? (
            <>
              {member.done_tasks}/{member.assigned_tasks} tasks done
              {completion !== null && (
                <span className="ml-1">· {completion}%</span>
              )}
              {member.overdue_tasks > 0 && (
                <span className="text-red-300 ml-1">
                  · {member.overdue_tasks} overdue
                </span>
              )}
            </>
          ) : (
            "Owner (no assigned tasks)"
          )}
        </div>
      </div>
    </div>
  );
}

function MilestoneRow({
  milestone,
  canEdit,
  onToggle,
  onEdit,
  onDelete,
  busy,
}) {
  const done = milestone.status === "Completed";
  const overdue =
    !done &&
    milestone.due_date &&
    new Date(milestone.due_date) < new Date(new Date().toDateString());

  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 ${
        done ? "opacity-70" : ""
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={!canEdit || busy}
        title={done ? "Mark as pending" : "Mark complete"}
        className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded-full flex items-center justify-center transition-colors ${
          done
            ? "text-green-300 hover:text-green-200"
            : "text-muted-foreground hover:text-foreground"
        } ${!canEdit ? "cursor-default" : "cursor-pointer"}`}
      >
        {done ? (
          <CheckCircle2 className="w-4 h-4" strokeWidth={2.2} />
        ) : (
          <Circle className="w-4 h-4" strokeWidth={2.2} />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div
          className={`text-sm font-medium ${
            done ? "line-through text-muted-foreground" : "text-foreground"
          }`}
        >
          {milestone.title}
        </div>
        {milestone.description && (
          <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
            {milestone.description}
          </div>
        )}
        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
          <span className="font-mono">{milestone.id}</span>
          {milestone.due_date ? (
            <span
              className={`inline-flex items-center gap-1 ${
                overdue ? "text-red-300 font-medium" : ""
              }`}
            >
              <Calendar className="w-3 h-3" strokeWidth={2.4} />
              {formatDate(milestone.due_date)}
              {overdue && <span> · overdue</span>}
            </span>
          ) : (
            <span className="text-muted-foreground/60">No due date</span>
          )}
          {done && milestone.completed_at && (
            <span className="text-green-300">
              · completed {timeAgo(milestone.completed_at)}
            </span>
          )}
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onEdit}
            disabled={busy}
            title="Edit milestone"
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Pencil className="w-3 h-3" strokeWidth={2.4} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            title="Delete milestone"
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3 h-3" strokeWidth={2.4} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailModal({ open, onClose, projectId }) {
  const { user } = useAuth();
  const canEdit = !!user;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  // Milestone action state
  const [createMsOpen, setCreateMsOpen] = useState(false);
  const [editMs, setEditMs] = useState(null);
  const [deleteMs, setDeleteMs] = useState(null);
  const [busyMsId, setBusyMsId] = useState(null);
  const [msError, setMsError] = useState(null);

  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .project(projectId)
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
  }, [open, projectId, reloadTick]);

  // Reset transient action state whenever the modal closes so the next open
  // is a clean slate.
  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      setCreateMsOpen(false);
      setEditMs(null);
      setDeleteMs(null);
      setMsError(null);
    }
  }, [open]);

  async function handleToggleMilestone(m) {
    if (!canEdit) return;
    setMsError(null);
    setBusyMsId(m.id);
    try {
      if (m.status === "Completed") {
        await api.reopenMilestone(m.id);
      } else {
        await api.completeMilestone(m.id);
      }
      reload();
    } catch (err) {
      setMsError(err.message || "Could not update milestone.");
    } finally {
      setBusyMsId(null);
    }
  }

  const p = data?.project;
  const stats = data?.stats;
  const tasks = data?.tasks ?? [];
  const team = data?.teamMembers ?? [];
  const milestones = data?.milestones ?? [];
  const msStats = data?.milestoneStats;
  const activity = data?.activity ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={p?.name ?? "Project details"}
      subtitle={p ? `${p.id} · created ${formatDate(p.created_at)}` : ""}
      size="xl"
    >
      {loading && !data && (
        <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading project…
        </div>
      )}

      {error && (
        <div className="p-4 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
          <div className="font-semibold mb-1">Could not load project.</div>
          <div className="text-xs font-mono break-all">{error.message}</div>
        </div>
      )}

      {p && (
        <div className="flex flex-col gap-6">
          {p.archived_at && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-zinc-600 bg-zinc-500/10 text-xs text-zinc-300">
              <Archive className="w-3.5 h-3.5" strokeWidth={2.2} />
              Archived on {formatDate(p.archived_at)}. Restore the project to
              edit it.
            </div>
          )}

          {/* --- Project Overview header --- */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={p.status} />
            <PriorityBadge priority={p.priority} />
            {p.category && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-input border border-border text-foreground">
                <Folder className="w-3 h-3" strokeWidth={2.4} />
                {p.category}
              </span>
            )}
            {Array.isArray(p.tags) &&
              p.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-secondary/40 text-secondary-foreground"
                >
                  <Tag className="w-3 h-3" strokeWidth={2.4} />
                  {t}
                </span>
              ))}
          </div>

          {/* --- Project Statistics: Completion / Open / Closed / Delayed --- */}
          <div>
            <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Tracking
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile
                icon={ListChecks}
                label="Completion"
                value={`${stats?.completionPct ?? 0}%`}
                tone={
                  stats?.completionPct >= 100
                    ? "success"
                    : stats?.completionPct > 0
                      ? "primary"
                      : "muted"
                }
                hint={`${stats?.done ?? 0}/${stats?.total ?? 0} tasks`}
              />
              <StatTile
                icon={Clock}
                label="Open tasks"
                value={stats?.open ?? 0}
                tone={stats?.open > 0 ? "warning" : "muted"}
                hint={stats?.open > 0 ? "Still in flight" : "Nothing pending"}
              />
              <StatTile
                icon={CheckCircle2}
                label="Closed tasks"
                value={stats?.done ?? 0}
                tone={stats?.done > 0 ? "success" : "muted"}
                hint={stats?.done > 0 ? "Done & dusted" : "—"}
              />
              <StatTile
                icon={AlertTriangle}
                label="Delayed tasks"
                value={stats?.overdue ?? 0}
                tone={stats?.overdue > 0 ? "danger" : "muted"}
                hint={
                  stats?.overdue > 0 ? "Past due date" : "All on schedule"
                }
              />
            </div>
            <div className="mt-3">
              <ProgressBar pct={stats?.completionPct ?? 0} />
            </div>
          </div>

          {/* --- Description --- */}
          {p.description && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                Project Overview
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {p.description}
              </p>
            </div>
          )}

          {/* --- Metadata --- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <MetaRow icon={UserIcon} label="Owner">
              {p.owner_name ?? "—"}
              {p.owner_email && (
                <span className="text-muted-foreground ml-1.5">
                  · {p.owner_email}
                </span>
              )}
            </MetaRow>
            <MetaRow icon={Calendar} label="Start">
              {p.start_date ? formatDate(p.start_date) : "Not set"}
            </MetaRow>
            <MetaRow icon={Calendar} label="End">
              {p.end_date ? formatDate(p.end_date) : "Not set"}
            </MetaRow>
            <MetaRow icon={Calendar} label="Updated">
              {timeAgo(p.updated_at)}
            </MetaRow>
          </div>

          {/* --- Team Members --- */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground">
                Team Members ({team.length})
              </h3>
            </div>
            {team.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No team members yet — assign tasks to bring people in.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {team.map((m) => (
                  <TeamMemberCard key={m.id} member={m} />
                ))}
              </div>
            )}
          </div>

          {/* --- Milestones Progress --- */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  Milestones Progress
                </h3>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {msStats?.total > 0 ? (
                    <>
                      {msStats.completed} of {msStats.total} complete ·{" "}
                      {msStats.completionPct}%
                      {msStats.overdue > 0 && (
                        <span className="text-red-300 ml-1.5">
                          · {msStats.overdue} overdue
                        </span>
                      )}
                    </>
                  ) : (
                    "No milestones yet."
                  )}
                </div>
              </div>
              {canEdit && !p.archived_at && (
                <button
                  type="button"
                  onClick={() => setCreateMsOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-medium bg-secondary/40 text-secondary-foreground px-2.5 py-1.5 rounded-md hover:bg-secondary/60 transition-colors"
                >
                  <Plus className="w-3 h-3" strokeWidth={3} />
                  Add milestone
                </button>
              )}
            </div>

            {msStats?.total > 0 && (
              <div className="mb-3">
                <ProgressBar
                  pct={msStats.completionPct}
                  tone={
                    msStats.completionPct >= 100
                      ? "bg-green-500"
                      : msStats.overdue > 0
                        ? "bg-yellow-500"
                        : "bg-primary"
                  }
                />
              </div>
            )}

            {msError && (
              <div className="mb-2 p-2 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-300">
                {msError}
              </div>
            )}

            {milestones.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                <Flag
                  className="w-4 h-4 mx-auto mb-1 text-muted-foreground/50"
                  strokeWidth={2.2}
                />
                {canEdit && !p.archived_at
                  ? "Add a milestone to track major checkpoints."
                  : "No milestones have been defined for this project."}
              </div>
            ) : (
              <div className="rounded-md border border-border divide-y divide-border max-h-72 overflow-y-auto">
                {milestones.map((m) => (
                  <MilestoneRow
                    key={m.id}
                    milestone={m}
                    canEdit={canEdit && !p.archived_at}
                    busy={busyMsId === m.id}
                    onToggle={() => handleToggleMilestone(m)}
                    onEdit={() => setEditMs(m)}
                    onDelete={() =>
                      setDeleteMs({ id: m.id, title: m.title })
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* --- Task List --- */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground">
                Task List ({tasks.length})
              </h3>
            </div>
            {tasks.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                No tasks linked to this project yet.
              </div>
            ) : (
              <ul className="border border-border rounded-md divide-y divide-border max-h-56 overflow-y-auto">
                {tasks.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground truncate">
                        {t.title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {t.assignee_name ?? "Unassigned"}
                        {t.due_date && <> · due {formatDate(t.due_date)}</>}
                      </div>
                    </div>
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* --- Comments & Collaboration (Section 11) --- */}
          <CommentsSection entityType="project" entityId={projectId} />

          {/* --- Activity Timeline --- */}
          {activity.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Activity Timeline
              </h3>
              <div className="rounded-md border border-border px-3 py-2 max-h-56 overflow-y-auto">
                {activity.map((a) => (
                  <ActivityItem
                    key={a.id}
                    icon={getActivityIcon(a.icon)}
                    tone={a.tone}
                    message={a.message}
                    time={timeAgo(a.created_at)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- Modals stacked on top of this one --- */}
      <MilestoneFormModal
        open={createMsOpen}
        mode="create"
        projectId={projectId}
        projectName={p?.name}
        onClose={() => setCreateMsOpen(false)}
        onSaved={reload}
      />
      <MilestoneFormModal
        open={!!editMs}
        mode="edit"
        milestone={editMs}
        projectName={p?.name}
        onClose={() => setEditMs(null)}
        onSaved={reload}
      />
      <ConfirmDialog
        open={!!deleteMs}
        onClose={() => setDeleteMs(null)}
        onConfirm={async () => {
          await api.deleteMilestone(deleteMs.id);
          reload();
        }}
        tone="danger"
        title="Delete milestone?"
        confirmLabel="Delete"
        message={
          <>
            Remove <span className="font-semibold">{deleteMs?.title}</span> from
            this project? This cannot be undone.
          </>
        }
      />
    </Modal>
  );
}
