"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  RefreshCw,
  Trash2,
  ClipboardList,
  X,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import SearchInput from "@/components/ui/SearchInput";
import FilterChip from "@/components/ui/FilterChip";
import StatusBadge from "@/components/ui/StatusBadge";
import PriorityBadge from "@/components/ui/PriorityBadge";
import Pagination from "@/components/ui/Pagination";
import EmptyState from "@/components/ui/EmptyState";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import TaskFormModal from "@/components/tasks/TaskFormModal";
import TaskDetailModal from "@/components/tasks/TaskDetailModal";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks/useApi";
import { usePagination } from "@/lib/hooks/usePagination";
import { formatDate } from "@/lib/formatters";
import { useAuth } from "@/lib/auth/AuthProvider";

const filters = ["All", "To Do", "In Progress", "Done"];

const summaryStyle = {
  "To Do": "bg-muted-foreground/40",
  "In Progress": "bg-yellow-400",
  Done: "bg-green-400",
};

export default function TaskAssignments() {
  const { user } = useAuth();
  // Any signed-in user can reassign / unassign / create assignments.
  const canManage = !!user;

  const [active, setActive] = useState("All");
  const [assigneeId, setAssigneeId] = useState("All");
  const [query, setQuery] = useState("");

  const { data, error, loading, refetch } = useApi(api.assignments);
  const items = data?.items ?? [];
  const summary = data?.summary ?? [];

  // Assignee dropdown derived from the currently loaded set so we only
  // ever offer filter values that will actually return results.
  const assignees = useMemo(() => {
    const map = new Map();
    for (const a of items) {
      if (a.assignee_name) {
        map.set(a.assignee_name, true);
      }
    }
    return [...map.keys()].sort();
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((a) => {
      const statusMatch = active === "All" ? true : a.status === active;
      const assigneeMatch =
        assigneeId === "All"
          ? true
          : assigneeId === "__unassigned__"
            ? !a.assignee_name
            : a.assignee_name === assigneeId;
      const queryMatch = query
        ? `${a.title} ${a.project_name ?? ""} ${a.assignee_name ?? ""} ${a.id}`
            .toLowerCase()
            .includes(query.toLowerCase())
        : true;
      return statusMatch && assigneeMatch && queryMatch;
    });
  }, [items, active, assigneeId, query]);

  const { page, setPage, totalPages, paged, start, end } = usePagination(
    filtered,
    10,
    `${active}|${assigneeId}|${query}`
  );

  // Action state — separate dialogs for "open this task" (which surfaces
  // the assignee picker) and "unassign" (a quick destructive op).
  const [createOpen, setCreateOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busyTaskId, setBusyTaskId] = useState(null);

  async function handleRemove() {
    if (!removeTarget) return;
    setActionError(null);
    setBusyTaskId(removeTarget.id);
    try {
      await api.updateTask(removeTarget.id, { assignee_id: null });
      refetch();
    } catch (err) {
      setActionError(err.message || "Could not remove assignee.");
      throw err;
    } finally {
      setBusyTaskId(null);
    }
  }

  // Track the dropdown open state so a "Clear" button can be shown.
  useEffect(() => {
    if (assigneeId !== "All" && !assignees.includes(assigneeId) && assigneeId !== "__unassigned__") {
      setAssigneeId("All");
    }
  }, [assignees, assigneeId]);

  return (
    <>
      <PageHeader
        title="Task Assignments"
        subtitle="Assign tasks to team members, reassign, and track progress."
      >
        {canManage && (
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={3} />
            Assign Task
          </button>
        )}
      </PageHeader>

      <TaskFormModal
        open={createOpen}
        mode="create"
        onClose={() => setCreateOpen(false)}
        onSaved={() => refetch()}
      />

      <TaskDetailModal
        open={!!reassignTarget}
        taskId={reassignTarget?.id ?? null}
        onClose={() => {
          setReassignTarget(null);
          refetch();
        }}
      />

      <ConfirmDialog
        open={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        tone="danger"
        title="Remove assignment?"
        confirmLabel="Remove"
        message={
          <>
            Clear the primary assignee on{" "}
            <span className="font-semibold">{removeTarget?.title}</span>?
            Co-assignees and history remain intact.
          </>
        }
      />

      <div className="px-8 py-6 flex flex-col gap-5">
        <div className="flex items-center gap-3 flex-wrap">
          <SearchInput
            placeholder="Search assignments..."
            className="flex-1 max-w-xs"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex items-center gap-2 flex-wrap">
            {filters.map((f) => (
              <FilterChip
                key={f}
                active={active === f}
                onClick={() => setActive(f)}
              >
                {f}
              </FilterChip>
            ))}
          </div>
          <select
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
          >
            <option value="All">All assignees</option>
            <option value="__unassigned__">Unassigned only</option>
            {assignees.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
          <span className="font-medium text-foreground">
            {items.length} assignments total
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
            <div className="font-semibold mb-1">
              Couldn&apos;t load assignments.
            </div>
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
                    "Task / Project",
                    "Assigned To",
                    "Assigned By",
                    "Priority",
                    "Status",
                    "Due Date",
                    "Actions",
                  ].map((h) => (
                    <th
                      key={h}
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
                      colSpan={8}
                      className="px-4 py-10 text-center text-sm text-muted-foreground"
                    >
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading &&
                  paged.map((a) => (
                    <tr
                      key={a.id}
                      className={`border-b border-border last:border-b-0 hover:bg-input/50 transition-colors ${
                        busyTaskId === a.id ? "opacity-60" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                        {a.id}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setReassignTarget(a)}
                          className="text-left"
                        >
                          <div className="text-sm font-medium text-foreground hover:underline">
                            {a.title}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {a.project_name}
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        {a.assignee_name ? (
                          <span className="text-foreground">
                            {a.assignee_name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {a.assigner_name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <PriorityBadge priority={a.priority} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(a.due_date)}
                      </td>
                      <td className="px-4 py-3">
                        {canManage && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setReassignTarget(a)}
                              className="flex items-center gap-1 text-xs text-primary border border-secondary rounded px-2 py-1 font-medium hover:bg-secondary/50 transition-colors"
                            >
                              <RefreshCw
                                className="w-2.5 h-2.5"
                                strokeWidth={3}
                              />
                              {a.assignee_name ? "Reassign" : "Assign"}
                            </button>
                            {a.assignee_name && (
                              <button
                                type="button"
                                onClick={() =>
                                  setRemoveTarget({ id: a.id, title: a.title })
                                }
                                disabled={busyTaskId === a.id}
                                className="flex items-center gap-1 text-xs text-muted-foreground border border-border rounded px-2 py-1 font-medium hover:text-red-300 hover:border-red-500/40 transition-colors disabled:opacity-50"
                              >
                                <Trash2 className="w-2.5 h-2.5" strokeWidth={3} />
                                Remove
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-0">
                      {items.length === 0 ? (
                        <EmptyState
                          icon={ClipboardList}
                          title="No task assignments yet"
                          description={
                            canManage
                              ? 'Click "Assign Task" to assign a task to a team member.'
                              : "Assignments will appear here as soon as tasks are created."
                          }
                          action={
                            canManage ? (
                              <button
                                type="button"
                                onClick={() => setCreateOpen(true)}
                                className="mt-3 flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                              >
                                <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                                Assign Task
                              </button>
                            ) : null
                          }
                        />
                      ) : (
                        <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                          No assignments match your filters.
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
          totalLabel={`Showing ${start}–${end} of ${filtered.length} assignments`}
          page={page}
          totalPages={totalPages}
          onChange={setPage}
        />
      </div>
    </>
  );
}
