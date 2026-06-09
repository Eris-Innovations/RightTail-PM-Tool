"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Crown,
  UserPlus,
  X,
  Briefcase,
  Activity as ActivityIcon,
  Target,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import Modal from "@/components/ui/Modal";
import StatusBadge from "@/components/ui/StatusBadge";
import PriorityBadge from "@/components/ui/PriorityBadge";
import { api } from "@/lib/api";
import { formatDate, timeAgo } from "@/lib/formatters";
import { useAuth } from "@/lib/auth/AuthProvider";

const ROLE_PILL = {
  admin: "bg-purple-500/15 text-purple-300",
  manager: "bg-blue-500/15 text-blue-300",
  member: "bg-zinc-500/15 text-zinc-300",
};

function StatTile({ label, value, icon: Icon, tone = "muted" }) {
  const tones = {
    muted: "text-muted-foreground bg-input/40",
    primary: "text-primary bg-secondary/30",
    success: "text-green-300 bg-green-500/10",
    warning: "text-yellow-300 bg-yellow-500/10",
    danger: "text-red-300 bg-red-500/10",
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
      <div className="text-xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function ProgressBar({ value, tone = "primary" }) {
  const tones = {
    primary: "bg-primary",
    success: "bg-green-400",
    warning: "bg-yellow-400",
    danger: "bg-red-400",
  };
  return (
    <div className="h-1.5 rounded-full bg-input overflow-hidden">
      <div
        className={`h-full ${tones[tone]} transition-all`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

function MemberRow({ member, canManage, onRemove, onPromote, isLeader, busy }) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-md border border-border bg-input/30 ${
        isLeader ? "ring-1 ring-yellow-400/40" : ""
      }`}
    >
      <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-sm font-bold text-secondary-foreground flex-shrink-0">
        {(member.name ?? "?").slice(0, 1).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate">
            {member.name}
          </span>
          {isLeader && (
            <span
              title="Team leader"
              className="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-300"
            >
              <Crown className="w-2.5 h-2.5" strokeWidth={2.6} />
              Leader
            </span>
          )}
          <span
            className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${ROLE_PILL[member.role] ?? ROLE_PILL.member}`}
          >
            {member.role}
          </span>
          {member.department && (
            <span className="text-[10px] text-muted-foreground">
              · {member.department}
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {member.active_tasks} active · {member.completed_tasks} done
          {member.overdue_tasks > 0 && (
            <span className="ml-1.5 text-red-300">
              · {member.overdue_tasks} overdue
            </span>
          )}
          {member.added_at && (
            <> · joined {timeAgo(member.added_at)}</>
          )}
        </div>
      </div>
      {canManage && !isLeader && (
        <button
          type="button"
          onClick={onPromote}
          disabled={busy}
          title="Promote to leader"
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-yellow-300 hover:bg-yellow-500/10 transition-colors disabled:opacity-40"
        >
          <Crown className="w-3.5 h-3.5" strokeWidth={2.4} />
        </button>
      )}
      {canManage && (
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          title="Remove from team"
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-40"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
}

function WorkloadBar({ entry, peak }) {
  const pct = peak > 0 ? Math.round((entry.active_tasks / peak) * 100) : 0;
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="w-28 text-xs text-foreground truncate flex items-center gap-1">
        {entry.is_leader && (
          <Crown className="w-3 h-3 text-yellow-400 flex-shrink-0" strokeWidth={2.6} />
        )}
        {entry.name}
      </div>
      <div className="flex-1 h-2 rounded-full bg-input overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-[11px] text-muted-foreground w-12 text-right tabular-nums">
        {entry.active_tasks}
      </div>
    </div>
  );
}

export default function TeamDetailModal({ open, onClose, teamId }) {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "manager";

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  // Add-member picker
  const [pickingUserId, setPickingUserId] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  useEffect(() => {
    if (!open) return;
    api.users().then((r) => setAllUsers(r.items ?? [])).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || !teamId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .team(teamId)
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
  }, [open, teamId, reloadTick]);

  useEffect(() => {
    if (!open) {
      setData(null);
      setError(null);
      setPickingUserId("");
      setActionError(null);
    }
  }, [open]);

  async function handleAdd() {
    if (!pickingUserId) return;
    setActionError(null);
    setBusy(true);
    try {
      await api.addTeamMember(team.id, pickingUserId);
      setPickingUserId("");
      reload();
    } catch (err) {
      setActionError(err.message || "Could not add member.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(userId) {
    setActionError(null);
    setBusy(true);
    try {
      await api.removeTeamMember(team.id, userId);
      reload();
    } catch (err) {
      setActionError(err.message || "Could not remove member.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePromote(userId) {
    setActionError(null);
    setBusy(true);
    try {
      await api.setTeamLeader(team.id, userId);
      reload();
    } catch (err) {
      setActionError(err.message || "Could not promote member.");
    } finally {
      setBusy(false);
    }
  }

  const team = data?.team;
  const members = data?.members ?? [];
  const projects = data?.projects ?? [];
  const workload = data?.workload;
  const performance = data?.performance;

  const activeMemberIds = new Set(members.map((m) => m.user_id));
  const pickerUsers = allUsers.filter((u) => !activeMemberIds.has(u.id));

  const completionTone =
    !performance || performance.completion_rate < 40
      ? "danger"
      : performance.completion_rate < 70
        ? "warning"
        : "success";
  const onTimeTone =
    !performance || performance.on_time_rate < 40
      ? "danger"
      : performance.on_time_rate < 70
        ? "warning"
        : "success";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={team?.name ?? "Team"}
      subtitle={team ? `${team.id} · created ${formatDate(team.created_at)}` : ""}
      size="xl"
    >
      {loading && !data && (
        <div className="py-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading team…
        </div>
      )}

      {error && (
        <div className="p-4 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
          <div className="font-semibold mb-1">Could not load team.</div>
          <div className="text-xs font-mono break-all">{error.message}</div>
        </div>
      )}

      {team && (
        <div className="flex flex-col gap-6">
          {/* Team Overview */}
          <div className="flex flex-col gap-2">
            {team.description && (
              <p className="text-sm text-foreground whitespace-pre-wrap">
                {team.description}
              </p>
            )}
            <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Crown className="w-3 h-3 text-yellow-400" strokeWidth={2.6} />
                Leader:{" "}
                <span className="text-foreground">
                  {team.leader_name ?? (
                    <span className="italic">None assigned</span>
                  )}
                </span>
              </span>
              <span>· Updated {timeAgo(team.updated_at)}</span>
            </div>
          </div>

          {/* Performance + Workload summary tiles */}
          {performance && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile
                label="Members"
                value={members.length}
                icon={ActivityIcon}
                tone="primary"
              />
              <StatTile
                label="Active tasks"
                value={performance.total_tasks - performance.completed_tasks}
                icon={Clock}
                tone="primary"
              />
              <StatTile
                label="Completion"
                value={`${performance.completion_rate}%`}
                icon={CheckCircle2}
                tone={completionTone}
              />
              <StatTile
                label="Overdue"
                value={performance.overdue_tasks}
                icon={AlertTriangle}
                tone={performance.overdue_tasks > 0 ? "danger" : "muted"}
              />
            </div>
          )}

          {/* Team Performance */}
          {performance && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Target
                  className="w-3.5 h-3.5 text-muted-foreground"
                  strokeWidth={2.4}
                />
                <h3 className="text-sm font-semibold text-foreground">
                  Team Performance
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-md border border-border bg-input/30 p-4">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">
                      Task completion
                    </span>
                    <span className="text-foreground font-medium">
                      {performance.completion_rate}% (
                      {performance.completed_tasks}/{performance.total_tasks})
                    </span>
                  </div>
                  <ProgressBar
                    value={performance.completion_rate}
                    tone={completionTone}
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground">
                      On-time delivery
                    </span>
                    <span className="text-foreground font-medium">
                      {performance.on_time_rate}% (
                      {performance.on_time_completions}/
                      {performance.completed_tasks || 0})
                    </span>
                  </div>
                  <ProgressBar
                    value={performance.on_time_rate}
                    tone={onTimeTone}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Team Workload */}
          {workload && workload.members.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Team Workload (active tasks per member)
                </h3>
                <span className="text-[11px] text-muted-foreground">
                  Peak: {workload.peak_active_tasks}
                </span>
              </div>
              <div className="rounded-md border border-border bg-input/30 px-3 py-2">
                {workload.members.map((m) => (
                  <WorkloadBar
                    key={m.user_id}
                    entry={m}
                    peak={workload.peak_active_tasks}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Team Members */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-foreground">
                Members ({members.length})
              </h3>
            </div>
            <div className="flex flex-col gap-2">
              {members.length === 0 && (
                <div className="text-xs text-muted-foreground italic px-3 py-4 text-center border border-dashed border-border rounded-md">
                  No members yet. Add the first one below.
                </div>
              )}
              {members.map((m) => (
                <MemberRow
                  key={m.user_id}
                  member={m}
                  isLeader={m.is_leader}
                  canManage={canManage}
                  onRemove={() => handleRemove(m.user_id)}
                  onPromote={() => handlePromote(m.user_id)}
                  busy={busy}
                />
              ))}
              {canManage && pickerUsers.length > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-md border border-dashed border-border bg-input/20 mt-1">
                  <UserPlus
                    className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0"
                    strokeWidth={2.4}
                  />
                  <select
                    value={pickingUserId}
                    onChange={(e) => setPickingUserId(e.target.value)}
                    disabled={busy}
                    className="flex-1 bg-input border border-border rounded-md px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                  >
                    <option value="">Add a member…</option>
                    {pickerUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.role}
                        {u.department ? ` · ${u.department}` : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={!pickingUserId || busy}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <UserPlus className="w-3 h-3" strokeWidth={2.6} />
                    )}
                    Add
                  </button>
                </div>
              )}
              {actionError && (
                <div className="p-2 rounded-md border border-red-500/30 bg-red-500/10 text-xs text-red-300">
                  {actionError}
                </div>
              )}
            </div>
          </div>

          {/* Team Projects */}
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Briefcase
                className="w-3.5 h-3.5 text-muted-foreground"
                strokeWidth={2.4}
              />
              <h3 className="text-sm font-semibold text-foreground">
                Team Projects ({projects.length})
              </h3>
            </div>
            {projects.length === 0 ? (
              <div className="text-xs text-muted-foreground italic px-3 py-6 text-center border border-dashed border-border rounded-md">
                No projects are assigned to this team yet.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {projects.map((p) => {
                  const pct =
                    p.total_tasks > 0
                      ? Math.round((p.completed_tasks / p.total_tasks) * 100)
                      : 0;
                  return (
                    <div
                      key={p.id}
                      className={`px-3 py-2 rounded-md border border-border bg-input/30 ${
                        p.archived_at ? "opacity-60" : ""
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium text-foreground">
                          {p.name}
                        </span>
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {p.id}
                        </span>
                        <StatusBadge status={p.status} />
                        <PriorityBadge priority={p.priority} />
                        {p.archived_at && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-500/15 text-zinc-400">
                            Archived
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
                        <span>Owner: {p.owner_name ?? "—"}</span>
                        {p.end_date && <span>· Due {formatDate(p.end_date)}</span>}
                        <span className="ml-auto text-foreground font-medium">
                          {p.completed_tasks}/{p.total_tasks} ({pct}%)
                        </span>
                      </div>
                      <ProgressBar
                        value={pct}
                        tone={pct >= 80 ? "success" : pct >= 40 ? "primary" : "warning"}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
