"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Calendar,
  User as UserIcon,
  Folder,
  Tag,
  Clock,
  Hourglass,
  CheckCircle2,
  UserPlus,
  UserMinus,
  X,
  Crown,
  History,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import PriorityBadge from "@/components/ui/PriorityBadge";
import ActivityItem from "@/components/activity/ActivityItem";
import CommentsSection from "@/components/comments/CommentsSection";
import { api } from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/formatters";
import { getActivityIcon } from "@/lib/activityIcon";
import { useAuth } from "@/lib/auth/AuthProvider";

function MetaRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon
        className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
        strokeWidth={2.2}
      />
      <span className="text-muted-foreground min-w-20">{label}</span>
      <span className="text-foreground min-w-0 flex-1">{children}</span>
    </div>
  );
}

function HoursStat({ label, value, icon: Icon, tone = "muted" }) {
  const tones = {
    muted: "text-muted-foreground bg-input/40",
    primary: "text-primary bg-secondary/30",
    success: "text-green-300 bg-green-500/10",
    warning: "text-yellow-300 bg-yellow-500/10",
  };
  return (
    <div className="rounded-md border border-border p-3 bg-input/30">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span
          className={`w-6 h-6 rounded-md flex items-center justify-center ${tones[tone]}`}
        >
          <Icon className="w-3 h-3" strokeWidth={2.4} />
        </span>
      </div>
      <div className="text-lg font-semibold text-foreground">
        {value ?? "—"}
      </div>
    </div>
  );
}

const ROLE_PILL = {
  admin: "bg-purple-500/15 text-purple-300",
  manager: "bg-blue-500/15 text-blue-300",
  member: "bg-zinc-500/15 text-zinc-300",
};

function AssigneeChip({ assignee, canRemove, onRemove, busy }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-border bg-input/40 px-2 py-1.5 ${
        assignee.is_lead ? "ring-1 ring-primary/30" : ""
      }`}
    >
      <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-[11px] font-bold text-secondary-foreground flex-shrink-0">
        {assignee.user_name?.[0] ?? "?"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium text-foreground truncate">
            {assignee.user_name}
          </span>
          {assignee.is_lead && (
            <span title="Lead assignee">
              <Crown
                className="w-3 h-3 text-yellow-400 flex-shrink-0"
                strokeWidth={2.4}
              />
            </span>
          )}
          <span
            className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${ROLE_PILL[assignee.user_role] ?? ROLE_PILL.member}`}
          >
            {assignee.user_role}
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {assignee.is_lead ? "Lead" : "Co-assignee"} · since{" "}
          {timeAgo(assignee.assigned_at)}
          {assignee.assigned_by_name && ` · by ${assignee.assigned_by_name}`}
        </div>
      </div>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          title={
            assignee.is_lead
              ? "Removing the lead unassigns the task"
              : "Remove from this task"
          }
          className="flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <X className="w-3 h-3" strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
}

function HistoryRow({ entry }) {
  const isOpen = !entry.unassigned_at;
  return (
    <div className="flex items-start gap-2 py-2 border-b border-border last:border-b-0">
      <div
        className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
          isOpen ? "bg-green-400" : "bg-muted-foreground/40"
        }`}
      />
      <div className="flex-1 min-w-0 text-xs">
        <div className="text-foreground">
          <span className="font-medium">{entry.user_name}</span>
          {isOpen ? (
            <span className="text-green-300 ml-1.5">active</span>
          ) : (
            <span className="text-muted-foreground ml-1.5">removed</span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          Assigned {timeAgo(entry.assigned_at)}
          {entry.assigned_by_name && ` by ${entry.assigned_by_name}`}
          {entry.unassigned_at && (
            <>
              {" · "}
              Removed {timeAgo(entry.unassigned_at)}
              {entry.unassigned_by_name && ` by ${entry.unassigned_by_name}`}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TaskDetailModal({ open, onClose, taskId }) {
  const { user } = useAuth();
  const isManager = user?.role === "admin" || user?.role === "manager";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  // Add-assignee picker
  const [pickingUserId, setPickingUserId] = useState("");
  const [busyAssigneeId, setBusyAssigneeId] = useState(null);
  const [assigneeError, setAssigneeError] = useState(null);

  // List of all users (for the picker)
  const [allUsers, setAllUsers] = useState([]);
  useEffect(() => {
    if (!open) return;
    api.users().then((r) => setAllUsers(r.items ?? [])).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || !taskId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .task(taskId)
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
  }, [open, taskId, reloadTick]);

  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      setPickingUserId("");
      setAssigneeError(null);
      setBusyAssigneeId(null);
    }
  }, [open]);

  const t = data?.task;
  const assignees = data?.assignees ?? [];
  const history = data?.assignmentHistory ?? [];
  const activity = data?.activity ?? [];

  const activeAssigneeIds = new Set(assignees.map((a) => a.user_id));
  const pickerUsers = allUsers.filter((u) => !activeAssigneeIds.has(u.id));

  async function handleAdd() {
    if (!pickingUserId) return;
    setAssigneeError(null);
    setBusyAssigneeId("__adding__");
    try {
      await api.addTaskAssignee(t.id, pickingUserId);
      setPickingUserId("");
      reload();
    } catch (err) {
      setAssigneeError(err.message || "Could not add assignee.");
    } finally {
      setBusyAssigneeId(null);
    }
  }

  async function handleRemove(userId) {
    setAssigneeError(null);
    setBusyAssigneeId(userId);
    try {
      await api.removeTaskAssignee(t.id, userId);
      reload();
    } catch (err) {
      setAssigneeError(err.message || "Could not remove assignee.");
    } finally {
      setBusyAssigneeId(null);
    }
  }

  const variance =
    t && t.estimated_hours != null && t.actual_hours != null
      ? Number(t.actual_hours) - Number(t.estimated_hours)
      : null;
  const varianceTone =
    variance === null
      ? "muted"
      : variance <= 0
        ? "success"
        : variance > Number(t?.estimated_hours ?? 0) * 0.25
          ? "warning"
          : "primary";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t?.title ?? "Task details"}
      subtitle={
        t
          ? `${t.id} · in ${t.project_name ?? "—"} · created ${formatDate(t.created_at)}`
          : ""
      }
      size="xl"
    >
      {loading && !data && (
        <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading task…
        </div>
      )}

      {error && (
        <div className="p-4 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
          <div className="font-semibold mb-1">Could not load task.</div>
          <div className="text-xs font-mono break-all">{error.message}</div>
        </div>
      )}

      {t && (
        <div className="flex flex-col gap-5">
          {/* Header chips */}
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} />
            {Array.isArray(t.tags) &&
              t.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-secondary/40 text-secondary-foreground"
                >
                  <Tag className="w-3 h-3" strokeWidth={2.4} />
                  {tag}
                </span>
              ))}
          </div>

          {/* Description */}
          {t.description && (
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                Description
              </div>
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {t.description}
              </p>
            </div>
          )}

          {/* Assignees panel */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground">
                Assignees ({assignees.length})
              </h3>
              {assignees.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  No one is currently assigned.
                </span>
              )}
            </div>

            {assignees.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                {assignees.map((a) => {
                  const isSelf = a.user_id === user?.id;
                  return (
                    <AssigneeChip
                      key={a.assignment_id}
                      assignee={a}
                      canRemove={isManager || isSelf}
                      onRemove={() => handleRemove(a.user_id)}
                      busy={busyAssigneeId === a.user_id}
                    />
                  );
                })}
              </div>
            )}

            {isManager && pickerUsers.length > 0 && (
              <div className="flex items-center gap-2 p-2 rounded-md border border-dashed border-border bg-input/20">
                <UserPlus
                  className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
                  strokeWidth={2.4}
                />
                <select
                  value={pickingUserId}
                  onChange={(e) => setPickingUserId(e.target.value)}
                  disabled={busyAssigneeId === "__adding__"}
                  className="flex-1 bg-input border border-border rounded-md px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                >
                  <option value="">Add a co-assignee…</option>
                  {pickerUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.role}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!pickingUserId || busyAssigneeId === "__adding__"}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {busyAssigneeId === "__adding__" ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <UserPlus className="w-3 h-3" strokeWidth={2.6} />
                  )}
                  Add
                </button>
              </div>
            )}

            {assigneeError && (
              <div className="mt-2 p-2 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-300">
                {assigneeError}
              </div>
            )}
          </div>

          {/* Hours panel */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <HoursStat
              label="Estimated"
              icon={Hourglass}
              value={
                t.estimated_hours != null
                  ? `${Number(t.estimated_hours)}h`
                  : null
              }
              tone="muted"
            />
            <HoursStat
              label="Actual"
              icon={Clock}
              value={
                t.actual_hours != null ? `${Number(t.actual_hours)}h` : null
              }
              tone="primary"
            />
            <HoursStat
              label="Variance"
              icon={CheckCircle2}
              value={
                variance === null
                  ? "—"
                  : `${variance > 0 ? "+" : ""}${variance.toFixed(2)}h`
              }
              tone={varianceTone}
            />
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <MetaRow icon={Folder} label="Project">
              {t.project_name ?? "—"}
              <span className="text-muted-foreground font-mono ml-1.5 text-xs">
                {t.project_id}
              </span>
            </MetaRow>
            <MetaRow icon={UserIcon} label="Lead">
              {t.assignee_name ?? (
                <span className="text-muted-foreground italic">Unassigned</span>
              )}
              {t.assignee_email && (
                <span className="text-muted-foreground ml-1.5">
                  · {t.assignee_email}
                </span>
              )}
            </MetaRow>
            <MetaRow icon={UserIcon} label="Assigned by">
              {t.assigner_name ?? "—"}
            </MetaRow>
            <MetaRow icon={Calendar} label="Due">
              {t.due_date ? formatDate(t.due_date) : "No due date"}
            </MetaRow>
            <MetaRow icon={Calendar} label="Updated">
              {timeAgo(t.updated_at)}
            </MetaRow>
            {t.completed_at && (
              <MetaRow icon={CheckCircle2} label="Completed">
                {timeAgo(t.completed_at)}
              </MetaRow>
            )}
          </div>

          {/* Assignment history */}
          {history.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <History
                  className="w-3.5 h-3.5 text-muted-foreground"
                  strokeWidth={2.4}
                />
                <h3 className="text-sm font-semibold text-foreground">
                  Assignment History ({history.length})
                </h3>
              </div>
              <div className="rounded-md border border-border px-3 max-h-56 overflow-y-auto">
                {history.map((h) => (
                  <HistoryRow key={h.id} entry={h} />
                ))}
              </div>
            </div>
          )}

          {/* Comments & Collaboration (Section 11) */}
          <CommentsSection entityType="task" entityId={t.id} />

          {/* Activity */}
          {activity.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">
                Activity
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
    </Modal>
  );
}
