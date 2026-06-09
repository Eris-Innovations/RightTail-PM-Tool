"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  CheckSquare,
  Eye,
  Pencil,
  CheckCircle2,
  RotateCcw,
  Trash2,
  X,
  Tag,
  Clock,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SearchInput from "@/components/ui/SearchInput";
import FilterChip from "@/components/ui/FilterChip";
import StatusBadge from "@/components/ui/StatusBadge";
import PriorityBadge from "@/components/ui/PriorityBadge";
import Pagination from "@/components/ui/Pagination";
import EmptyState from "@/components/ui/EmptyState";
import RowActionMenu from "@/components/ui/RowActionMenu";
import TaskFormModal from "@/components/tasks/TaskFormModal";
import TaskDetailModal from "@/components/tasks/TaskDetailModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks/useApi";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/formatters";
import { useAuth } from "@/lib/auth/AuthProvider";

const STATUSES = ["All", "To Do", "In Progress", "Done"];
const PRIORITIES = ["All", "Critical", "High", "Medium", "Low"];

const summaryStyle = {
  "To Do": "bg-muted-foreground/40",
  "In Progress": "bg-yellow-400",
  Done: "bg-green-400",
};

function useDebounced(value, delay = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

function isOverdue(t) {
  if (t.status === "Done" || !t.due_date) return false;
  return new Date(t.due_date) < new Date(new Date().toDateString());
}

export default function Tasks() {
  const { user } = useAuth();
  const canManage = user?.role === "admin" || user?.role === "manager";

  // Filters
  const [status, setStatus] = useState("All");
  const [priority, setPriority] = useState("All");
  const [assigneeId, setAssigneeId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 300);

  // Dropdown sources
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  useEffect(() => {
    api.projects().then((r) => setProjects(r.items ?? [])).catch(() => {});
    api.users().then((r) => setUsers(r.items ?? [])).catch(() => {});
  }, []);

  const queryParams = useMemo(() => {
    const params = {};
    if (status !== "All") params.status = status;
    if (priority !== "All") params.priority = priority;
    if (assigneeId === "__unassigned__") params.unassigned = "true";
    else if (assigneeId) params.assignee_id = assigneeId;
    if (projectId) params.project_id = projectId;
    if (dueFrom) params.due_from = dueFrom;
    if (dueTo) params.due_to = dueTo;
    if (debouncedQuery.trim()) params.q = debouncedQuery.trim();
    return params;
  }, [status, priority, assigneeId, projectId, dueFrom, dueTo, debouncedQuery]);

  const fetcher = useCallback(() => api.tasks(queryParams), [queryParams]);
  const { data, error, loading, refetch } = useApi(fetcher, [queryParams]);
  const items = data?.items ?? [];
  const summary = data?.summary ?? [];
  const overdueCount = data?.overdueCount ?? 0;

  const { page, setPage, totalPages, paged, start, end } = usePagination(
    items,
    10,
    JSON.stringify(queryParams)
  );

  // Action state
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [detailTargetId, setDetailTargetId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyTaskId, setBusyTaskId] = useState(null);
  const [actionError, setActionError] = useState(null);

  async function quickStatusChange(task, nextStatus) {
    setActionError(null);
    setBusyTaskId(task.id);
    try {
      await api.updateTask(task.id, { status: nextStatus });
      refetch();
    } catch (err) {
      setActionError(err.message || "Could not update task.");
    } finally {
      setBusyTaskId(null);
    }
  }

  function clearFilters() {
    setStatus("All");
    setPriority("All");
    setAssigneeId("");
    setProjectId("");
    setDueFrom("");
    setDueTo("");
    setQuery("");
  }

  const hasFilters =
    status !== "All" ||
    priority !== "All" ||
    !!assigneeId ||
    !!projectId ||
    !!dueFrom ||
    !!dueTo ||
    !!query;

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle="Browse, create, and update tasks across every project."
      >
        {canManage && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={3} />
            New Task
          </button>
        )}
      </PageHeader>

      <TaskFormModal
        open={createOpen}
        mode="create"
        onClose={() => setCreateOpen(false)}
        onSaved={() => refetch()}
      />

      <TaskFormModal
        open={!!editTarget}
        mode="edit"
        task={editTarget}
        restrictedToStatusAndHours={
          !canManage && editTarget?.assignee_id === user?.id
        }
        onClose={() => setEditTarget(null)}
        onSaved={() => refetch()}
      />

      <TaskDetailModal
        open={!!detailTargetId}
        taskId={detailTargetId}
        onClose={() => setDetailTargetId(null)}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          await api.deleteTask(deleteTarget.id);
          refetch();
        }}
        tone="danger"
        title="Delete task?"
        confirmLabel="Delete"
        message={
          <>
            Delete <span className="font-semibold">{deleteTarget?.title}</span>?
            This action cannot be undone.
          </>
        }
      />

      <div className="px-8 py-6 flex flex-col gap-5">
        {/* Search */}
        <SearchInput
          placeholder="Search by title, description, ID, or tag…"
          className="max-w-md"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        {/* Status chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">
            Status
          </span>
          {STATUSES.map((s) => (
            <FilterChip
              key={s}
              active={status === s}
              onClick={() => setStatus(s)}
            >
              {s}
            </FilterChip>
          ))}
        </div>

        {/* Priority chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wide text-muted-foreground mr-1">
            Priority
          </span>
          {PRIORITIES.map((p) => (
            <FilterChip
              key={p}
              active={priority === p}
              onClick={() => setPriority(p)}
            >
              {p}
            </FilterChip>
          ))}
        </div>

        {/* Dropdown + date filters */}
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Project
            </label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary min-w-44"
            >
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Assignee
            </label>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary min-w-44"
            >
              <option value="">Anyone</option>
              <option value="__unassigned__">Unassigned only</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Due from
            </label>
            <input
              type="date"
              value={dueFrom}
              onChange={(e) => setDueFrom(e.target.value)}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              Due to
            </label>
            <input
              type="date"
              value={dueTo}
              onChange={(e) => setDueTo(e.target.value)}
              className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            />
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-3 h-3" strokeWidth={2.6} />
              Clear filters
            </button>
          )}
        </div>

        {/* Summary */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="font-medium text-foreground">
            {items.length} task{items.length === 1 ? "" : "s"} matching
          </span>
          {summary.map((s) => (
            <span key={s.status} className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full inline-block ${
                  summaryStyle[s.status] ?? "bg-muted-foreground/40"
                }`}
              />
              {s.count} {s.status}
            </span>
          ))}
          {overdueCount > 0 && (
            <span className="flex items-center gap-1.5 text-red-300">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              {overdueCount} overdue
            </span>
          )}
        </div>

        {actionError && (
          <div className="p-3 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300 flex items-start justify-between gap-3">
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-red-300 hover:text-red-100"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" strokeWidth={2.6} />
            </button>
          </div>
        )}

        {error && (
          <div className="p-4 rounded-md border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            <div className="font-semibold mb-1">Couldn&apos;t load tasks.</div>
            <div className="text-xs font-mono break-all">{error.message}</div>
          </div>
        )}

        <div className="border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-input border-b border-border">
                  {[
                    "ID",
                    "Task",
                    "Project",
                    "Assignee",
                    "Priority",
                    "Status",
                    "Due",
                    "Hours",
                    "",
                  ].map((h, i) => (
                    <th
                      key={`${h}-${i}`}
                      className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-background">
                {loading && (
                  <tr>
                    <td
                      colSpan={9}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      Loading tasks from Neon…
                    </td>
                  </tr>
                )}
                {!loading &&
                  paged.map((t) => {
                    const overdue = isOverdue(t);
                    const isMine = t.assignee_id === user?.id;
                    const canEditThis = canManage || isMine;
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setDetailTargetId(t.id)}
                        className={`border-b border-border last:border-b-0 transition-colors cursor-pointer hover:bg-input/50 ${
                          busyTaskId === t.id ? "opacity-60" : ""
                        }`}
                      >
                        <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                          {t.id}
                        </td>
                        <td className="px-4 py-3 min-w-56">
                          <div className="text-sm font-medium text-foreground truncate max-w-xs">
                            {t.title}
                          </div>
                          {t.description && (
                            <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
                              {t.description}
                            </div>
                          )}
                          {Array.isArray(t.tags) && t.tags.length > 0 && (
                            <div className="flex items-center gap-1 mt-1 flex-wrap max-w-xs">
                              {t.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary/40 text-secondary-foreground"
                                >
                                  <Tag className="w-2.5 h-2.5" strokeWidth={2.4} />
                                  {tag}
                                </span>
                              ))}
                              {t.tags.length > 3 && (
                                <span className="text-[10px] text-muted-foreground">
                                  +{t.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                          {t.project_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          {t.assignee_name ? (
                            <span
                              className={
                                isMine ? "text-primary font-medium" : "text-foreground"
                              }
                            >
                              {t.assignee_name}
                              {isMine && " (you)"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Unassigned</span>
                          )}
                          {t.active_assignees > 1 && (
                            <span
                              className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-secondary/40 text-secondary-foreground"
                              title={`${t.active_assignees - 1} co-assignee${t.active_assignees - 1 === 1 ? "" : "s"}`}
                            >
                              +{t.active_assignees - 1}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <PriorityBadge priority={t.priority} />
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {t.due_date ? (
                            <span
                              className={
                                overdue
                                  ? "text-red-300 font-medium"
                                  : "text-muted-foreground"
                              }
                            >
                              {formatDate(t.due_date)}
                              {overdue && " · overdue"}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {t.actual_hours != null || t.estimated_hours != null ? (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" strokeWidth={2.4} />
                              {t.actual_hours != null
                                ? `${Number(t.actual_hours)}h`
                                : "0h"}
                              {t.estimated_hours != null && (
                                <span className="text-muted-foreground/60">
                                  /{Number(t.estimated_hours)}h
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                        <td
                          className="px-4 py-3 text-right"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <RowActionMenu
                            ariaLabel={`Actions for ${t.title}`}
                            items={[
                              {
                                label: "View details",
                                icon: Eye,
                                onClick: () => setDetailTargetId(t.id),
                              },
                              canEditThis && {
                                label: canManage ? "Edit" : "Update progress",
                                icon: Pencil,
                                onClick: () => setEditTarget(t),
                              },
                              canEditThis && t.status !== "Done" && {
                                label: "Mark complete",
                                icon: CheckCircle2,
                                onClick: () => quickStatusChange(t, "Done"),
                              },
                              canEditThis && t.status === "Done" && {
                                label: "Reopen task",
                                icon: RotateCcw,
                                onClick: () => quickStatusChange(t, "To Do"),
                              },
                              canManage && {
                                label: "Delete",
                                icon: Trash2,
                                tone: "danger",
                                onClick: () =>
                                  setDeleteTarget({ id: t.id, title: t.title }),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="p-0">
                      {!hasFilters ? (
                        <EmptyState
                          icon={CheckSquare}
                          title="No tasks yet"
                          description={
                            canManage
                              ? 'Click "New Task" to add the first one.'
                              : "Tasks assigned to you will appear here."
                          }
                          action={
                            canManage ? (
                              <button
                                type="button"
                                onClick={() => setCreateOpen(true)}
                                className="mt-3 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                              >
                                <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                                New Task
                              </button>
                            ) : null
                          }
                        />
                      ) : (
                        <div className="px-4 py-12 text-center">
                          <div className="text-sm text-foreground">
                            No tasks match your filters.
                          </div>
                          <button
                            type="button"
                            onClick={clearFilters}
                            className="mt-3 text-xs text-primary font-medium hover:underline"
                          >
                            Clear filters
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Pagination
          totalLabel={`Showing ${start}–${end} of ${items.length} task${items.length === 1 ? "" : "s"}`}
          page={page}
          totalPages={totalPages}
          onChange={setPage}
        />
      </div>
    </>
  );
}
